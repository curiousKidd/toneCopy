import sharp from 'sharp';
import { logger } from '../utils/logger';

/**
 * 선택적 색상 보정 서비스 (HSL 기반)
 * 특정 색상 범위(하늘, 물, 숲 등)만 선택적으로 보정
 *
 * 작동 원리:
 * 1. Sharp로 이미지를 raw RGB 데이터로 변환
 * 2. 각 픽셀의 RGB를 HSL로 변환
 * 3. Hue 값을 기준으로 색상 범위 판단 (하늘=파랑, 물=청록, 풀=초록)
 * 4. 해당 범위에 속하면 Saturation 증가
 * 5. HSL을 다시 RGB로 변환
 * 6. Sharp로 다시 이미지 생성
 */
export class SelectiveColorService {

  /**
   * 풍경 사진 선택적 색상 강화
   * 하늘(Blues), 물(Cyans), 숲(Greens)을 자동으로 강화
   */
  async applyLandscapeEnhancement(
    buffer: Buffer,
    intensity: number = 1.0 // 0.0 ~ 2.0
  ): Promise<Buffer> {
    const startTime = Date.now();

    try {
      // 이미지 메타데이터 가져오기
      const image = sharp(buffer);
      const metadata = await image.metadata();
      const { width, height, channels } = metadata;

      if (!width || !height || !channels) {
        throw new Error('Invalid image metadata');
      }

      // Raw RGB 데이터 추출
      const { data: rawData, info } = await image
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      logger.info('Processing selective color enhancement', {
        width,
        height,
        channels: info.channels,
        intensity,
        dataLength: rawData.length
      });

      // 픽셀별 HSL 기반 선택적 채도 증가
      const processedData = this.processPixels(rawData, width, height, intensity);

      // 다시 이미지로 변환
      const result = await sharp(processedData, {
        raw: {
          width,
          height,
          channels: 4 // RGBA
        }
      })
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();

      const processingTime = Date.now() - startTime;
      logger.info('Selective color enhancement completed', {
        processingTime,
        inputSize: buffer.length,
        outputSize: result.length
      });

      return result;

    } catch (error: any) {
      logger.error('Selective color enhancement failed', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to apply selective color enhancement: ${error.message}`);
    }
  }

  /**
   * 픽셀 데이터 처리 (HSL 기반 선택적 채도 증가)
   */
  private processPixels(
    data: Buffer,
    width: number,
    height: number,
    intensity: number
  ): Buffer {
    const pixelCount = width * height;
    const result = Buffer.from(data); // 복사본 생성

    // 각 픽셀 처리
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4; // RGBA = 4 bytes per pixel

      const r = data[offset] / 255;
      const g = data[offset + 1] / 255;
      const b = data[offset + 2] / 255;
      const a = data[offset + 3];

      // RGB -> HSL 변환
      const hsl = this.rgbToHsl(r, g, b);
      const [h, s, l] = hsl;

      // 색상 범위별 선택적 채도 증가
      let saturationBoost = 0;

      // 이미 채도가 낮은 픽셀(회색, 바위 등)은 제외
      // 원본 채도가 0.2 이상인 픽셀만 처리 (균형잡힌 필터링)
      if (s > 0.2) {
        // Blues (하늘): 220-240도 (좁은 순수 파랑 범위)
        if (h >= 220 && h <= 240 && l > 0.4 && l < 0.85) {
          saturationBoost = intensity * 0.08; // 8% 증가 (균형잡힌 강도)
        }
        // Cyans (물): 195-220도 (파랑에 가까운 청록, 범위 축소)
        else if (h >= 195 && h < 220 && l > 0.35 && l < 0.8) {
          saturationBoost = intensity * 0.10; // 10% 증가 (균형잡힌 강도)
        }
        // Greens (숲/풀): 100-135도 (초록, 범위 축소)
        else if (h >= 100 && h < 135 && l > 0.25 && l < 0.75) {
          saturationBoost = intensity * 0.08; // 8% 증가 (균형잡힌 강도)
        }
        // Yellows/Warm tones (가을 단풍): 50-70도 (범위 축소)
        else if (h >= 50 && h < 70 && l > 0.35 && l < 0.75) {
          saturationBoost = intensity * 0.06; // 6% 증가 (균형잡힌 강도)
        }
      }

      // 채도 증가 (0.0 ~ 1.0 범위 유지)
      const newS = Math.min(1.0, s + saturationBoost);

      // HSL -> RGB 변환
      const rgb = this.hslToRgb(h, newS, l);

      // 결과 저장
      result[offset] = Math.round(rgb[0] * 255);
      result[offset + 1] = Math.round(rgb[1] * 255);
      result[offset + 2] = Math.round(rgb[2] * 255);
      result[offset + 3] = a; // Alpha 유지
    }

    return result;
  }

  /**
   * RGB to HSL 변환
   * @returns [h: 0-360, s: 0-1, l: 0-1]
   */
  private rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      // Saturation
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

      // Hue
      if (max === r) {
        h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      } else if (max === g) {
        h = ((b - r) / delta + 2) / 6;
      } else {
        h = ((r - g) / delta + 4) / 6;
      }
    }

    return [h * 360, s, l];
  }

  /**
   * HSL to RGB 변환
   * @param h 0-360
   * @param s 0-1
   * @param l 0-1
   * @returns [r: 0-1, g: 0-1, b: 0-1]
   */
  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = h / 360; // Normalize to 0-1

    const hueToRgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    if (s === 0) {
      // Achromatic (gray)
      return [l, l, l];
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    const r = hueToRgb(p, q, h + 1 / 3);
    const g = hueToRgb(p, q, h);
    const b = hueToRgb(p, q, h - 1 / 3);

    return [r, g, b];
  }
}

export const selectiveColorService = new SelectiveColorService();
