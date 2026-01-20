import sharp from 'sharp';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';
import { selectiveColorService } from './selectiveColorService';

/**
 * 고급 이미지 처리 서비스
 * - 적응형 보정 (이미지 밝기 분석 기반)
 * - 화질 보존 최적화
 *
 * 참고: 얼굴 감지 기능은 Alpine Linux와의 호환성 문제로 비활성화되었습니다.
 */
export class AdvancedImageService {

  /**
   * 적응형 보정 적용
   * 이미지의 밝기를 분석하여 보정 강도를 자동 조절
   */
  async applyAdaptiveCorrection(
    buffer: Buffer,
    parameters: AdjustmentParameters
  ): Promise<Buffer> {
    try {
      const metadata = await sharp(buffer).metadata();

      // 이미지 통계 분석
      const stats = await sharp(buffer).stats();
      const avgBrightness = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;

      logger.info('Image statistics', {
        width: metadata.width,
        height: metadata.height,
        avgBrightness: avgBrightness.toFixed(2)
      });

      // 적응형 파라미터 조정
      const adaptedParams = this.adaptParameters(parameters, avgBrightness, metadata);

      logger.info('Adapted parameters', {
        original: {
          brightness: parameters.brightness,
          contrast: parameters.contrast,
          saturation: parameters.saturation
        },
        adapted: {
          brightness: adaptedParams.brightness,
          contrast: adaptedParams.contrast,
          saturation: adaptedParams.saturation
        }
      });

      // 최적화된 보정 적용 (Sharp.js)
      let resultBuffer = await this.applyOptimizedCorrection(buffer, adaptedParams, metadata);

      // 선택적 색상 보정 적용 (ImageMagick) - 풍경 사진 전용
      if (adaptedParams.selectiveColorIntensity && adaptedParams.selectiveColorIntensity > 0) {
        logger.info('Applying selective color enhancement', {
          intensity: adaptedParams.selectiveColorIntensity
        });

        resultBuffer = await selectiveColorService.applyLandscapeEnhancement(
          resultBuffer,
          adaptedParams.selectiveColorIntensity
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
   * 이미지 밝기와 특성에 따라 파라미터 적응 조정
   * 개선: AI 분석 결과를 최대한 신뢰하되, 극단적인 경우만 보정
   */
  private adaptParameters(
    params: AdjustmentParameters,
    avgBrightness: number,
    metadata: sharp.Metadata
  ): AdjustmentParameters {
    const adapted = { ...params };

    // 1. 밝기 적응 조정 - AI 분석 신뢰도 향상
    if (avgBrightness > 220) {
      // 극단적으로 밝은 이미지만 약간 조정
      if (adapted.brightness > 1.15) {
        adapted.brightness = 1.0 + (adapted.brightness - 1.0) * 0.9;
        logger.info('Very bright image - brightness slightly reduced', {
          original: params.brightness,
          adapted: adapted.brightness
        });
      }
    } else if (avgBrightness < 60) {
      // 극단적으로 어두운 이미지 - 노이즈 증폭 최소화
      if (adapted.brightness > 1.2) {
        adapted.brightness = 1.0 + (adapted.brightness - 1.0) * 0.85;
      }
      if (adapted.sharpness > 1.15) {
        adapted.sharpness = 1.0 + (adapted.sharpness - 1.0) * 0.8;
      }
      // 약간의 노이즈 제거
      adapted.denoise = Math.max(adapted.denoise || 0, 0.2);
      logger.info('Very dark image - adjustments for noise control', {
        brightness: adapted.brightness,
        sharpness: adapted.sharpness
      });
    }
    // 중간 밝기(60-220) - AI 추천값 100% 신뢰

    // 2. 극단적 채도만 제한 (자연스러운 보정 유지)
    // validateParameters에서 이미 1.4로 제한되므로 추가 제한 불필요

    // 3. 극단적 선명도만 제한
    // validateParameters에서 이미 1.5로 제한되므로 추가 제한 불필요

    // 4. Clarity는 AI 분석 그대로 신뢰 (validateParameters에서 1.3 제한)

    return adapted;
  }

  /**
   * 최적화된 순서로 보정 적용
   * 화질 저하를 최소화하는 순서
   */
  private async applyOptimizedCorrection(
    buffer: Buffer,
    parameters: AdjustmentParameters,
    metadata: sharp.Metadata
  ): Promise<Buffer> {
    let pipeline = sharp(buffer);

    // ===== STAGE 1: 톤 조정 (먼저 수행) =====

    // 1.1 노출 조정
    if (parameters.exposure && parameters.exposure !== 0) {
      const expMultiplier = Math.pow(2, parameters.exposure * 0.8); // 80%로 완화
      pipeline = pipeline.linear(expMultiplier, 0);
    }

    // 1.2 톤 커브 (Shadows, Highlights)
    if (parameters.shadows || parameters.highlights) {
      const shadowsAdj = (parameters.shadows || 0) / 150; // 더 부드럽게
      const highlightsAdj = (parameters.highlights || 0) / 150;

      if (shadowsAdj !== 0 || highlightsAdj !== 0) {
        const mult = 1.0 + highlightsAdj * 0.2;
        const add = shadowsAdj * 20;
        pipeline = pipeline.linear(mult, add);
      }
    }

    // ===== STAGE 2: 색상 조정 =====

    // 2.1 기본 색상 (Brightness, Saturation, Hue)
    const modulateOpts: any = {};
    if (parameters.brightness !== 1.0) modulateOpts.brightness = parameters.brightness;
    if (parameters.saturation !== 1.0) modulateOpts.saturation = parameters.saturation;
    if (parameters.hue !== 0) modulateOpts.hue = parameters.hue;

    if (Object.keys(modulateOpts).length > 0) {
      pipeline = pipeline.modulate(modulateOpts);
    }

    // 2.2 Vibrance (자연스러운 채도)
    if (parameters.vibrance && parameters.vibrance > 1.0) {
      const vibranceBoost = (parameters.vibrance - 1.0) * 0.2; // 약하게
      pipeline = pipeline.modulate({
        saturation: 1.0 + vibranceBoost
      });
    }

    // 2.3 대비 (AI 추천값 그대로 적용)
    if (parameters.contrast !== 1.0) {
      const a = parameters.contrast;
      const b = (1 - parameters.contrast) * 128;
      pipeline = pipeline.linear(a, b);
    }

    // 2.4 색온도 & 틴트
    if (parameters.temperature !== 0 || parameters.tint !== 0) {
      const tempFactor = parameters.temperature / 150; // 더 부드럽게
      const tintFactor = parameters.tint / 150;

      const rMultiplier = 1 + tempFactor * 0.2;
      const gMultiplier = 1 - Math.abs(tintFactor) * 0.15;
      const bMultiplier = 1 - tempFactor * 0.2 + tintFactor * 0.15;

      pipeline = pipeline.recomb([
        [rMultiplier, 0, 0],
        [0, gMultiplier, 0],
        [0, 0, bMultiplier]
      ]);
    }

    // ===== STAGE 3: 노이즈 제거 (디테일 처리 전) =====

    if (parameters.denoise && parameters.denoise > 0) {
      const strength = Math.ceil(parameters.denoise * 3); // 약하게
      pipeline = pipeline.median(Math.min(strength, 5));
    }

    // ===== STAGE 4: 디테일 강화 (마지막) =====

    // 4.1 Clarity (중간톤 대비) - AI 분석 결과 신뢰
    if (parameters.clarity && parameters.clarity > 1.0) {
      const clarityStrength = (parameters.clarity - 1.0) * 0.7; // 자연스러운 범위
      if (clarityStrength > 0.03) {
        pipeline = pipeline.sharpen({
          sigma: 2.0,
          m1: 0.5 + clarityStrength * 0.8,
          m2: 0.5 + clarityStrength * 0.8
        });
      }
    }

    // 4.2 선명도 (AI 추천값 그대로 적용)
    if (parameters.sharpness > 1.0) {
      const sigma = (parameters.sharpness - 1.0) * 0.8;
      pipeline = pipeline.sharpen({ sigma: Math.min(sigma, 2.0) });
    }

    // 4.3 Dehaze (안개 제거) - 자연스러운 강도로 적용
    if (parameters.dehaze && parameters.dehaze > 0) {
      const dehazeStrength = parameters.dehaze * 0.6; // 과도한 적용 방지
      pipeline = pipeline
        .modulate({ saturation: 1.0 + dehazeStrength * 0.2 })
        .linear(1.0 + dehazeStrength * 0.15, 0);
    }

    // 4.4 풍경 선명도 (landscapeClarity) - 필요시에만 사용
    if (parameters.landscapeClarity && parameters.landscapeClarity > 0) {
      const landscapeSharpness = parameters.landscapeClarity * 0.6;
      pipeline = pipeline.sharpen({ sigma: Math.min(landscapeSharpness, 1.5) });
    }

    // ===== STAGE 4.5: 풍경/자연 보정 (색상 채널 조작 제거) =====
    // 주의: recomb()은 전체 이미지에 영향을 주어 청록색 색상 오염(color cast)을 발생시킴
    // 따라서 색상 채널 조작 대신 Saturation, Clarity, Dehaze로 생동감 확보

    // 4.5.1 하늘 강조 → Saturation으로 대체 (이미 적용됨)
    // 4.5.2 초목 강조 → Saturation으로 대체 (이미 적용됨)
    // 4.5.3 물 강조 → Saturation으로 대체 (이미 적용됨)

    // 4.5.4 자연스러운 채도 부스트 (Natural Saturation) - 강화
    if (parameters.naturalSaturation && parameters.naturalSaturation > 0) {
      const naturalBoost = parameters.naturalSaturation * 0.5; // 0.3 → 0.5 (67% 증가)
      // Vibrance와 유사하지만 더 선택적
      pipeline = pipeline.modulate({
        saturation: 1.0 + naturalBoost
      });
    }

    // 4.5.5 다이나믹 레인지 확장 (Dynamic Range) - 강화
    if (parameters.dynamicRange && parameters.dynamicRange > 0) {
      const drStrength = parameters.dynamicRange * 0.6; // 0.4 → 0.6 (50% 증가)
      // HDR 효과: 섀도우 밝게, 하이라이트 어둡게
      const mult = 1.0 + drStrength * 0.2; // 0.15 → 0.2
      const add = drStrength * 8; // 5 → 8
      pipeline = pipeline.linear(mult, add);
    }

    // 4.5.6 원근감 강조 (Atmospheric Perspective) - 강화
    if (parameters.atmosphericPerspective && parameters.atmosphericPerspective > 0) {
      const perspectiveStrength = parameters.atmosphericPerspective * 0.35; // 0.2 → 0.35 (75% 증가)
      // 약간의 대비 증가로 깊이감 표현
      const contrastBoost = 1.0 + perspectiveStrength;
      pipeline = pipeline.linear(contrastBoost, (1 - contrastBoost) * 128);
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

    // ===== 최종 출력 (최고 품질) =====

    if (metadata.format === 'png') {
      return await pipeline
        .png({ compressionLevel: 6, quality: 100 })
        .toBuffer();
    }

    return await pipeline
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' }) // 95로 살짝 낮춤 (100은 파일 크기만 증가)
      .toBuffer();
  }

  /**
   * 색감 그레이딩 적용
   */
  private applyColorGrading(pipeline: sharp.Sharp, style: string): sharp.Sharp {
    switch (style.toLowerCase()) {
      case 'warm_vintage':
        return pipeline.modulate({
          saturation: 0.85
        }).recomb([
          [1.15, 0.05, 0],
          [0, 1.0, 0],
          [0, 0, 0.85]
        ]);

      case 'cool_modern':
        return pipeline.modulate({
          saturation: 1.05
        }).recomb([
          [0.95, 0, 0],
          [0, 1.0, 0.02],
          [0, 0, 1.05]
        ]);

      case 'cinematic':
        return pipeline.modulate({
          saturation: 0.95,
          brightness: 0.98
        }).recomb([
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
