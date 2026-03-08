import sharp from 'sharp';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';

/**
 * 인물 보정 서비스
 *
 * 현재 구현: 영역 기반 휴리스틱 방식
 * - 눈 밝기 향상: 상단 40~65% 영역의 밝은 픽셀 선택적 밝기 증가
 * - 치아 미백: 중간 55~75% 영역의 흰색에 가까운 픽셀 미백
 * - 피부 보정: 전역 적용 (advancedImageService에서 처리)
 *
 * 주의: 실제 얼굴 감지를 위해서는 face-api.js 또는 OpenCV 통합 필요
 */
export class PortraitCorrectionService {

  /**
   * 인물 보정 파라미터 적용
   * advancedImageService의 LUT/파라미터 처리 이후 호출
   */
  async applyPortraitCorrections(
    buffer: Buffer,
    parameters: AdjustmentParameters
  ): Promise<Buffer> {
    let result = buffer;

    if (parameters.eyeBrightening && parameters.eyeBrightening > 0) {
      result = await this.applyEyeBrightening(result, parameters.eyeBrightening);
    }

    if (parameters.teethWhitening && parameters.teethWhitening > 0) {
      result = await this.applyTeethWhitening(result, parameters.teethWhitening);
    }

    return result;
  }

  /**
   * 눈 밝기 향상
   * 얼굴의 눈 영역(이미지 높이의 35~65% 구간)에서
   * 중간 밝기 이상의 픽셀을 선택적으로 밝게 처리
   *
   * @param strength 0.0~1.0
   */
  private async applyEyeBrightening(buffer: Buffer, strength: number): Promise<Buffer> {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width!;
    const height = metadata.height!;

    const { data: rawData } = await sharp(buffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const outputData = Buffer.from(rawData);

    // 눈 영역 휴리스틱: 이미지 상단 35% ~ 65% 행 (세로 중심 기준)
    const eyeStartRow = Math.floor(height * 0.35);
    const eyeEndRow = Math.floor(height * 0.65);
    // 가로: 중앙 20% ~ 80% (측면 배경 제외)
    const eyeStartCol = Math.floor(width * 0.20);
    const eyeEndCol = Math.floor(width * 0.80);

    const brighteningFactor = 1 + strength * 0.3; // 최대 30% 밝기 증가

    for (let row = eyeStartRow; row < eyeEndRow; row++) {
      for (let col = eyeStartCol; col < eyeEndCol; col++) {
        const offset = (row * width + col) * 3;
        const r = rawData[offset];
        const g = rawData[offset + 1];
        const b = rawData[offset + 2];
        const brightness = (r + g + b) / 3;

        // 중간 밝기 이상의 픽셀만 밝히기 (어두운 동공 영역은 제외)
        if (brightness > 80 && brightness < 240) {
          const edgeWeight = this.getEdgeWeight(row, col, eyeStartRow, eyeEndRow, eyeStartCol, eyeEndCol);
          const factor = 1 + (brighteningFactor - 1) * edgeWeight;

          outputData[offset]     = Math.min(255, Math.round(r * factor));
          outputData[offset + 1] = Math.min(255, Math.round(g * factor));
          outputData[offset + 2] = Math.min(255, Math.round(b * factor));
        }
      }
    }

    return sharp(outputData, { raw: { width, height, channels: 3 } })
      .withMetadata()
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }

  /**
   * 치아 미백
   * 얼굴 하단 영역(이미지 높이의 55~80% 구간)에서
   * 흰색에 가까운 픽셀을 더 하얗게 처리
   *
   * @param strength 0.0~1.0
   */
  private async applyTeethWhitening(buffer: Buffer, strength: number): Promise<Buffer> {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width!;
    const height = metadata.height!;

    const { data: rawData } = await sharp(buffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const outputData = Buffer.from(rawData);

    // 치아 영역 휴리스틱: 이미지 하단 55% ~ 80% 행
    const teethStartRow = Math.floor(height * 0.55);
    const teethEndRow = Math.floor(height * 0.80);
    // 가로: 중앙 30% ~ 70%
    const teethStartCol = Math.floor(width * 0.30);
    const teethEndCol = Math.floor(width * 0.70);

    const whiteningStrength = strength * 0.25; // 최대 25% 채도 감소 + 밝기 증가

    for (let row = teethStartRow; row < teethEndRow; row++) {
      for (let col = teethStartCol; col < teethEndCol; col++) {
        const offset = (row * width + col) * 3;
        const r = rawData[offset];
        const g = rawData[offset + 1];
        const b = rawData[offset + 2];
        const brightness = (r + g + b) / 3;

        // 밝은 픽셀(치아 후보)만 처리: 180~250 범위
        if (brightness > 180 && brightness < 250) {
          const edgeWeight = this.getEdgeWeight(row, col, teethStartRow, teethEndRow, teethStartCol, teethEndCol);
          // 채도 감소 (회색에 가깝게) + 밝기 증가
          const whitenedR = Math.min(255, Math.round(r + (255 - r) * whiteningStrength * edgeWeight));
          const whitenedG = Math.min(255, Math.round(g + (255 - g) * whiteningStrength * edgeWeight));
          const whitenedB = Math.min(255, Math.round(b + (255 - b) * whiteningStrength * edgeWeight));

          outputData[offset]     = whitenedR;
          outputData[offset + 1] = whitenedG;
          outputData[offset + 2] = whitenedB;
        }
      }
    }

    return sharp(outputData, { raw: { width, height, channels: 3 } })
      .withMetadata()
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }

  /**
   * 영역 경계에서 부드러운 페이드 처리 (엣지 아티팩트 방지)
   * 경계에서 0, 중앙에서 1.0인 가중치
   */
  private getEdgeWeight(
    row: number, col: number,
    startRow: number, endRow: number,
    startCol: number, endCol: number
  ): number {
    const fadeSize = 10; // 페이드 픽셀 수
    const rowFade = Math.min(
      (row - startRow) / fadeSize,
      (endRow - row) / fadeSize,
      1.0
    );
    const colFade = Math.min(
      (col - startCol) / fadeSize,
      (endCol - col) / fadeSize,
      1.0
    );
    return Math.min(rowFade, colFade);
  }
}

export const portraitCorrectionService = new PortraitCorrectionService();
