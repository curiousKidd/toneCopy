import sharp from 'sharp';
import { logger } from '../utils/logger';
import { lutService } from './lutService';
import type { AdjustmentParameters } from '../types';

/**
 * 정확도 측정 서비스
 *
 * 측정 지표:
 * - MAE (Mean Absolute Error): 픽셀 평균 절대 오차 (0~255, 낮을수록 좋음)
 * - PSNR (Peak Signal-to-Noise Ratio): dB 단위, 높을수록 좋음 (>30dB = 좋음)
 * - Delta-E (CIE76): 인지적 색차, 낮을수록 좋음 (<2 = 인간이 구분 불가)
 */
export class AccuracyService {

  /**
   * 원본/보정 이미지 쌍으로 프로필의 LUT 정확도 측정
   *
   * 프로세스:
   * 1. 원본 이미지에 프로필 LUT 적용
   * 2. LUT 결과물과 실제 보정 이미지 픽셀 비교
   * 3. MAE, PSNR, Delta-E 계산
   */
  async measureAccuracy(
    originalBuffer: Buffer,
    targetAdjustedBuffer: Buffer,
    parameters: AdjustmentParameters
  ): Promise<AccuracyReport> {
    const startTime = Date.now();

    const SAMPLE_SIZE = 256; // 256×256으로 샘플링 (속도 vs 정확도 균형)

    // 세 이미지를 동일 크기로 리사이즈 후 raw 추출
    const [origData, targetData] = await Promise.all([
      sharp(originalBuffer)
        .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer(),
      sharp(targetAdjustedBuffer)
        .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer()
    ]);

    // LUT 적용 결과 생성
    let lutAppliedData: Buffer;
    if (parameters.colorLUT && parameters.colorLUT.length > 0) {
      // 원본 이미지에 LUT 적용
      const lutResultBuffer = await lutService.applyToBuffer(originalBuffer, parameters.colorLUT);
      lutAppliedData = await sharp(lutResultBuffer)
        .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer();
    } else {
      // LUT 없으면 원본을 그대로 사용 (정확도 0%와 비교)
      lutAppliedData = origData;
    }

    const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;

    // ===== MAE 계산 =====
    let totalAbsError = 0;
    for (let i = 0; i < pixelCount * 3; i++) {
      totalAbsError += Math.abs(lutAppliedData[i] - targetData[i]);
    }
    const mae = totalAbsError / (pixelCount * 3);

    // ===== PSNR 계산 =====
    let mse = 0;
    for (let i = 0; i < pixelCount * 3; i++) {
      const diff = lutAppliedData[i] - targetData[i];
      mse += diff * diff;
    }
    mse /= (pixelCount * 3);
    const psnr = mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);

    // ===== Delta-E 계산 (CIE76, sRGB→Lab 근사) =====
    let totalDeltaE = 0;
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 3;
      const lab1 = this.rgbToLab(lutAppliedData[offset], lutAppliedData[offset + 1], lutAppliedData[offset + 2]);
      const lab2 = this.rgbToLab(targetData[offset], targetData[offset + 1], targetData[offset + 2]);
      const dL = lab1[0] - lab2[0];
      const da = lab1[1] - lab2[1];
      const db = lab1[2] - lab2[2];
      totalDeltaE += Math.sqrt(dL * dL + da * da + db * db);
    }
    const meanDeltaE = totalDeltaE / pixelCount;

    // ===== 개선도 계산 (원본 vs 타겟 오차 대비 LUT 적용 후 오차) =====
    let origTotalAbsError = 0;
    for (let i = 0; i < pixelCount * 3; i++) {
      origTotalAbsError += Math.abs(origData[i] - targetData[i]);
    }
    const origMae = origTotalAbsError / (pixelCount * 3);
    const improvementPercent = origMae > 0 ? ((origMae - mae) / origMae) * 100 : 0;

    const processingTime = Date.now() - startTime;

    const report: AccuracyReport = {
      mae: parseFloat(mae.toFixed(2)),
      psnr: psnr === Infinity ? 999 : parseFloat(psnr.toFixed(2)),
      mean_delta_e: parseFloat(meanDeltaE.toFixed(3)),
      improvement_percent: parseFloat(improvementPercent.toFixed(1)),
      baseline_mae: parseFloat(origMae.toFixed(2)),
      quality_grade: this.gradeQuality(psnr, meanDeltaE),
      sample_size: SAMPLE_SIZE,
      has_lut: !!(parameters.colorLUT && parameters.colorLUT.length > 0),
      processing_time_ms: processingTime
    };

    logger.info('Accuracy measurement complete', report);
    return report;
  }

  /**
   * 품질 등급 계산
   * PSNR > 40dB AND Delta-E < 2 → A (인간이 구분 불가 수준)
   * PSNR > 30dB AND Delta-E < 5 → B (매우 좋음)
   * PSNR > 25dB AND Delta-E < 10 → C (좋음)
   * PSNR > 20dB → D (보통)
   * 그 외 → F (나쁨)
   */
  private gradeQuality(psnr: number, deltaE: number): string {
    if (psnr >= 40 && deltaE < 2) return 'A';
    if (psnr >= 30 && deltaE < 5) return 'B';
    if (psnr >= 25 && deltaE < 10) return 'C';
    if (psnr >= 20) return 'D';
    return 'F';
  }

  /**
   * sRGB → CIE Lab 변환 (D65 백색점 기준)
   */
  private rgbToLab(r: number, g: number, b: number): [number, number, number] {
    // sRGB → linear RGB
    const linearize = (c: number) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };

    const lr = linearize(r);
    const lg = linearize(g);
    const lb = linearize(b);

    // linear RGB → XYZ (D65)
    const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
    const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750) / 1.00000;
    const z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) / 1.08883;

    // XYZ → Lab
    const f = (t: number) =>
      t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + (16 / 116);

    const L = (116 * f(y)) - 16;
    const a = 500 * (f(x) - f(y));
    const bVal = 200 * (f(y) - f(z));

    return [L, a, bVal];
  }
}

export interface AccuracyReport {
  mae: number;               // Mean Absolute Error (0~255)
  psnr: number;              // Peak Signal-to-Noise Ratio (dB)
  mean_delta_e: number;      // 평균 색차 (인지적 색상 차이)
  improvement_percent: number; // 원본 대비 개선율 (%)
  baseline_mae: number;      // 보정 전 MAE (비교용)
  quality_grade: string;     // A~F 등급
  sample_size: number;       // 측정에 사용된 이미지 크기
  has_lut: boolean;          // LUT 존재 여부
  processing_time_ms: number;
}

export const accuracyService = new AccuracyService();
