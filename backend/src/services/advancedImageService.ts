import sharp from 'sharp';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';
import { selectiveColorService } from './selectiveColorService';

/**
 * 고급 이미지 처리 서비스
 * - AI 분석값을 그대로 적용 (스케일링 보정 없음)
 * - 화질 보존 최적화
 */
export class AdvancedImageService {

  /**
   * 적응형 보정 적용
   * AI 파라미터를 그대로 적용
   */
  async applyAdaptiveCorrection(
    buffer: Buffer,
    parameters: AdjustmentParameters
  ): Promise<Buffer> {
    try {
      const metadata = await sharp(buffer).metadata();

      const stats = await sharp(buffer).stats();
      const avgBrightness = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;

      logger.info('Image statistics', {
        width: metadata.width,
        height: metadata.height,
        avgBrightness: avgBrightness.toFixed(2)
      });

      logger.info('Applying parameters (no scaling)', {
        brightness: parameters.brightness,
        contrast: parameters.contrast,
        saturation: parameters.saturation,
        temperature: parameters.temperature,
        selectiveColorIntensity: parameters.selectiveColorIntensity
      });

      // AI 파라미터 그대로 적용
      let resultBuffer = await this.applyOptimizedCorrection(buffer, parameters, metadata);

      // 선택적 색상 보정 적용 (ImageMagick) - 풍경 사진 전용
      if (parameters.selectiveColorIntensity && parameters.selectiveColorIntensity > 0) {
        logger.info('Applying selective color enhancement', {
          intensity: parameters.selectiveColorIntensity
        });

        resultBuffer = await selectiveColorService.applyLandscapeEnhancement(
          resultBuffer,
          parameters.selectiveColorIntensity
        );
      }

      return resultBuffer;

    } catch (error: any) {
      logger.error('Adaptive correction failed', {
        error: error.message
      });
      throw new Error('Failed to apply adaptive correction');
    }
  }

  /**
   * 최적화된 순서로 보정 적용
   * 화질 저하를 최소화하는 순서
   * AI 분석값 100% 그대로 적용 (스케일링 없음)
   */
  private async applyOptimizedCorrection(
    buffer: Buffer,
    parameters: AdjustmentParameters,
    metadata: sharp.Metadata
  ): Promise<Buffer> {
    let pipeline = sharp(buffer);

    // ===== STAGE 1: 노출 & 톤 커브 =====

    // 1.1 노출 조정
    if (parameters.exposure && parameters.exposure !== 0) {
      const expMultiplier = Math.pow(2, parameters.exposure);
      pipeline = pipeline.linear(expMultiplier, 0);
    }

    // 1.2 톤 커브 (Shadows, Highlights, Whites, Blacks)
    if (parameters.shadows || parameters.highlights || parameters.whites || parameters.blacks) {
      const shadowsAdj  = (parameters.shadows     || 0) / 100;
      const highlightsAdj = (parameters.highlights || 0) / 100;
      const whitesAdj   = (parameters.whites       || 0) / 100;
      const blacksAdj   = (parameters.blacks       || 0) / 100;

      const mult = 1.0 + (highlightsAdj + whitesAdj) * 0.5;
      const add  = (shadowsAdj + blacksAdj) * 50;
      if (mult !== 1.0 || add !== 0) {
        pipeline = pipeline.linear(mult, add);
      }
    }

    // ===== STAGE 2: 색상 조정 =====

    // 2.1 기본 색상 (Brightness, Saturation, Hue)
    const modulateOpts: any = {};
    if (parameters.brightness !== 1.0) modulateOpts.brightness = parameters.brightness;
    if (parameters.saturation !== 1.0) modulateOpts.saturation = parameters.saturation;
    if (parameters.hue !== 0)          modulateOpts.hue = parameters.hue;

    if (Object.keys(modulateOpts).length > 0) {
      pipeline = pipeline.modulate(modulateOpts);
    }

    // 2.2 Vibrance (자연스러운 채도) - AI 값 그대로
    if (parameters.vibrance && parameters.vibrance > 1.0) {
      const vibranceBoost = parameters.vibrance - 1.0;
      pipeline = pipeline.modulate({ saturation: 1.0 + vibranceBoost });
    }

    // 2.3 대비
    if (parameters.contrast !== 1.0) {
      const a = parameters.contrast;
      const b = (1 - parameters.contrast) * 128;
      pipeline = pipeline.linear(a, b);
    }

    // 2.4 색온도 & 틴트 - AI 값 그대로
    if (parameters.temperature !== 0 || parameters.tint !== 0) {
      const tempFactor = parameters.temperature / 100;
      const tintFactor = parameters.tint / 100;

      const rMultiplier = 1 + tempFactor;
      const gMultiplier = 1 - Math.abs(tintFactor) * 0.5;
      const bMultiplier = 1 - tempFactor + tintFactor;

      pipeline = pipeline.recomb([
        [rMultiplier, 0, 0],
        [0, gMultiplier, 0],
        [0, 0, bMultiplier]
      ]);
    }

    // ===== STAGE 3: 노이즈 제거 =====

    if (parameters.denoise && parameters.denoise > 0) {
      const strength = Math.ceil(parameters.denoise * 3);
      pipeline = pipeline.median(Math.min(strength, 5));
    }

    // ===== STAGE 4: 디테일 강화 =====

    // 4.1 Clarity (중간톤 대비) - AI 값 그대로
    if (parameters.clarity && parameters.clarity > 1.0) {
      const clarityStrength = parameters.clarity - 1.0;
      if (clarityStrength > 0.03) {
        pipeline = pipeline.sharpen({
          sigma: 2.5,
          m1: clarityStrength,
          m2: clarityStrength
        });
      }
    }

    // 4.2 선명도 - AI 값 그대로
    if (parameters.sharpness > 1.0) {
      const sigma = parameters.sharpness - 1.0;
      pipeline = pipeline.sharpen({ sigma: Math.min(sigma, 3.0) });
    }

    // 4.3 Dehaze (안개 제거) - AI 값 그대로
    if (parameters.dehaze && parameters.dehaze > 0) {
      pipeline = pipeline
        .modulate({ saturation: 1.0 + parameters.dehaze })
        .linear(1.0 + parameters.dehaze, 0);
    }

    // 4.4 풍경 선명도 (landscapeClarity) - AI 값 그대로
    if (parameters.landscapeClarity && parameters.landscapeClarity > 0) {
      pipeline = pipeline.sharpen({ sigma: Math.min(parameters.landscapeClarity, 3.0) });
    }

    // ===== STAGE 5: 효과 & 필터 =====

    // 5.1 Color Grading
    if (parameters.colorGrading && parameters.colorGrading !== 'none') {
      pipeline = this.applyColorGrading(pipeline, parameters.colorGrading);
    }

    // 5.2 기타 필터
    for (const filter of parameters.filters) {
      pipeline = this.applyFilter(pipeline, filter);
    }

    // ===== 최종 출력 =====

    if (metadata.format === 'png') {
      return await pipeline
        .png({ compressionLevel: 6, quality: 100 })
        .toBuffer();
    }

    return await pipeline
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }

  /**
   * 색감 그레이딩 적용
   */
  private applyColorGrading(pipeline: sharp.Sharp, style: string): sharp.Sharp {
    switch (style.toLowerCase()) {
      case 'warm_vintage':
        return pipeline.modulate({ saturation: 0.85 }).recomb([
          [1.15, 0.05, 0],
          [0, 1.0, 0],
          [0, 0, 0.85]
        ]);

      case 'cool_modern':
        return pipeline.modulate({ saturation: 1.05 }).recomb([
          [0.95, 0, 0],
          [0, 1.0, 0.02],
          [0, 0, 1.05]
        ]);

      case 'cinematic':
        return pipeline.modulate({ saturation: 0.95, brightness: 0.98 }).recomb([
          [1.05, 0.02, 0],
          [0.02, 1.0, 0.02],
          [0, 0.02, 0.97]
        ]);

      default:
        return pipeline;
    }
  }

  /**
   * 필터 적용
   */
  private applyFilter(pipeline: sharp.Sharp, filter: string): sharp.Sharp {
    switch (filter.toLowerCase()) {
      case 'denoise':
        return pipeline.median(2);

      case 'soft_focus':
        return pipeline.blur(1);

      case 'skin_smoothing':
        return pipeline.blur(0.8);

      case 'hdr':
        return pipeline.linear(1.2, -10).modulate({ saturation: 0.95 });

      case 'glow':
        return pipeline.blur(0.3).linear(1.05, 3);

      default:
        logger.warn(`Unknown filter: ${filter}`);
        return pipeline;
    }
  }
}

export const advancedImageService = new AdvancedImageService();
