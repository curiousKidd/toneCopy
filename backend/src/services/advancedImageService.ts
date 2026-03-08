import sharp from 'sharp';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';
import { selectiveColorService } from './selectiveColorService';
import { lutService } from './lutService';
import { portraitCorrectionService } from './portraitCorrectionService';

/**
 * 고급 이미지 처리 서비스
 * - AI 분석값을 그대로 적용 (스케일링 보정 없음)
 * - 화질 보존 최적화
 */
export class AdvancedImageService {

  /**
   * 적응형 보정 적용
   *
   * 우선순위:
   * 1. colorLUT 존재 시 → LUT 방식 (픽셀 직접 매핑, 정확도 최대)
   *    + 공간 효과(vignette, grain)는 파라미터로 추가 적용
   * 2. colorLUT 없음 → 기존 AI 파라미터 방식 (구 프로필 호환성 유지)
   */
  async applyAdaptiveCorrection(
    buffer: Buffer,
    parameters: AdjustmentParameters
  ): Promise<Buffer> {
    try {
      const metadata = await sharp(buffer).metadata();

      let resultBuffer: Buffer;

      if (parameters.colorLUT && parameters.colorLUT.length > 0) {
        // ===== LUT 방식: 픽셀 직접 매핑 (정확) =====
        logger.info('Applying color correction via LUT', {
          lutSize: parameters.colorLUT.length,
          width: metadata.width,
          height: metadata.height
        });

        resultBuffer = await lutService.applyToBuffer(buffer, parameters.colorLUT);

        // 공간 효과는 LUT 적용 후 파라미터로 처리
        resultBuffer = await this.applySpatialEffects(resultBuffer, parameters, metadata);

      } else {
        // ===== 파라미터 방식: 기존 방식 (구 프로필 fallback) =====
        logger.info('Applying color correction via parameters (legacy fallback)', {
          brightness: parameters.brightness,
          contrast: parameters.contrast,
          saturation: parameters.saturation,
          temperature: parameters.temperature
        });

        resultBuffer = await this.applyOptimizedCorrection(buffer, parameters, metadata);
      }

      // 선택적 색상 보정 (풍경 사진 전용) - LUT와 파라미터 방식 공통 적용
      if (parameters.selectiveColorIntensity && parameters.selectiveColorIntensity > 0) {
        logger.info('Applying selective color enhancement', {
          intensity: parameters.selectiveColorIntensity
        });
        resultBuffer = await selectiveColorService.applyLandscapeEnhancement(
          resultBuffer,
          parameters.selectiveColorIntensity
        );
      }

      // 인물 보정 (눈 밝기, 치아 미백) - 마지막에 적용
      const hasPortraitCorrection =
        (parameters.eyeBrightening && parameters.eyeBrightening > 0) ||
        (parameters.teethWhitening && parameters.teethWhitening > 0);

      if (hasPortraitCorrection) {
        logger.info('Applying portrait corrections', {
          eyeBrightening: parameters.eyeBrightening,
          teethWhitening: parameters.teethWhitening
        });
        resultBuffer = await portraitCorrectionService.applyPortraitCorrections(
          resultBuffer,
          parameters
        );
      }

      return resultBuffer;

    } catch (error: any) {
      logger.error('Adaptive correction failed', { error: error.message });
      throw new Error('Failed to apply adaptive correction');
    }
  }

  /**
   * LUT 방식 후 공간적 효과만 추가 적용
   * (색상 변환은 LUT가 처리했으므로 위치 기반 효과만)
   */
  private async applySpatialEffects(
    buffer: Buffer,
    parameters: AdjustmentParameters,
    metadata: sharp.Metadata
  ): Promise<Buffer> {
    let pipeline = sharp(buffer);
    let hasEffect = false;

    if (parameters.skinSmoothing && parameters.skinSmoothing > 0) {
      pipeline = pipeline.blur(Math.min(parameters.skinSmoothing * 1.2, 1.2));
      hasEffect = true;
    }

    if (parameters.sharpness && parameters.sharpness > 1.0) {
      pipeline = pipeline.sharpen({ sigma: Math.min(parameters.sharpness - 1.0, 3.0) });
      hasEffect = true;
    }

    if (parameters.denoise && parameters.denoise > 0) {
      pipeline = pipeline.median(Math.min(Math.ceil(parameters.denoise * 3), 5));
      hasEffect = true;
    }

    let result: Buffer;

    if (hasEffect) {
      result = await pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
    } else {
      result = buffer;
    }

    // Vignette
    if (parameters.vignette && parameters.vignette !== 0) {
      const meta = await sharp(result).metadata();
      result = await (await this.applyVignette(sharp(result), parameters.vignette, meta))
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();
    }

    // Grain
    if (parameters.grain && parameters.grain > 0) {
      const meta = await sharp(result).metadata();
      result = await (await this.applyGrain(sharp(result), parameters.grain, meta))
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();
    }

    return result;
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

    // 2.4 색온도 & 틴트
    // scale 0.5: temperature=50일 때 R채널 *1.25, B채널 *0.75 (자연스러운 웜 시프트)
    if (parameters.temperature !== 0 || parameters.tint !== 0) {
      const tempFactor = parameters.temperature / 100;
      const tintFactor = parameters.tint / 100;

      const rMultiplier = 1 + tempFactor * 0.5;
      const gMultiplier = 1 - Math.abs(tintFactor) * 0.3;
      const bMultiplier = 1 - tempFactor * 0.5 + tintFactor * 0.3;

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

    // ===== STAGE 3.5: 피부 보정 =====
    // 전체 이미지에 약한 blur 적용 (피부결 부드럽게)
    if (parameters.skinSmoothing && parameters.skinSmoothing > 0) {
      const blurSigma = Math.min(parameters.skinSmoothing * 1.2, 1.2);
      pipeline = pipeline.blur(blurSigma);
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

    // ===== STAGE 6: 비네팅 =====
    if (parameters.vignette && parameters.vignette !== 0) {
      pipeline = await this.applyVignette(pipeline, parameters.vignette, metadata);
    }

    // ===== STAGE 7: 필름 그레인 =====
    if (parameters.grain && parameters.grain > 0) {
      pipeline = await this.applyGrain(pipeline, parameters.grain, metadata);
    }

    // ===== 최종 출력 =====

    if (metadata.format === 'png') {
      return await pipeline
        .withMetadata()
        .png({ compressionLevel: 6, quality: 100 })
        .toBuffer();
    }

    return await pipeline
      .withMetadata()
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }

  /**
   * 비네팅 효과 적용 (SVG 방사형 그라디언트 composite)
   * strength > 0: 어두운 비네팅 (일반적), < 0: 밝은 비네팅 (역광 효과)
   */
  private async applyVignette(
    pipeline: sharp.Sharp,
    strength: number,
    metadata: sharp.Metadata
  ): Promise<sharp.Sharp> {
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    const opacity = Math.min(Math.abs(strength) * 0.8, 0.8).toFixed(2);
    const color = strength > 0 ? 'black' : 'white';

    // 중심 30%는 투명, 외곽으로 갈수록 색상 강화
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="vg" cx="50%" cy="50%" r="65%">
          <stop offset="30%" stop-color="${color}" stop-opacity="0"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="${opacity}"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#vg)"/>
    </svg>`;

    return pipeline.composite([{
      input: Buffer.from(svg),
      blend: 'over'
    }]);
  }

  /**
   * 필름 그레인 효과 적용 (RGBA 노이즈 버퍼 overlay)
   * strength: 0.0~1.0 → 노이즈 강도와 불투명도 제어
   */
  private async applyGrain(
    pipeline: sharp.Sharp,
    strength: number,
    metadata: sharp.Metadata
  ): Promise<sharp.Sharp> {
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    const pixelCount = width * height;

    // 그레인 강도: 진폭(±amplitude 범위 노이즈)과 투명도
    const amplitude = Math.round(strength * 80);  // 최대 80 진폭
    const alpha = Math.round(strength * 70);       // 최대 70/255 투명도

    const noiseData = Buffer.allocUnsafe(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      const noise = Math.max(0, Math.min(255, 128 + Math.round((Math.random() - 0.5) * amplitude * 2)));
      noiseData[offset]     = noise;
      noiseData[offset + 1] = noise;
      noiseData[offset + 2] = noise;
      noiseData[offset + 3] = alpha;
    }

    const noiseBuffer = await sharp(noiseData, {
      raw: { width, height, channels: 4 }
    }).png().toBuffer();

    return pipeline.composite([{
      input: noiseBuffer,
      blend: 'overlay'
    }]);
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
