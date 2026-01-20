import sharp from 'sharp';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';

export class ImageService {
  /**
   * 이미지 리사이즈 및 최적화
   */
  async optimizeImage(
    buffer: Buffer,
    maxWidth = 2560,
    maxHeight = 2560,
    quality = 95
  ): Promise<Buffer> {
    try {
      const metadata = await sharp(buffer).metadata();

      // 원본이 이미 작으면 리사이즈하지 않음
      if ((metadata.width || 0) <= maxWidth && (metadata.height || 0) <= maxHeight) {
        return await sharp(buffer)
          .jpeg({ quality, progressive: true, mozjpeg: true })
          .toBuffer();
      }

      return await sharp(buffer)
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: sharp.kernel.lanczos3
        })
        .jpeg({ quality, progressive: true, mozjpeg: true })
        .toBuffer();
    } catch (error: any) {
      logger.error('Image optimization failed', { error: error.message });
      throw new Error('Failed to optimize image');
    }
  }

  /**
   * 보정 파라미터를 이미지에 적용
   */
  async applyAdjustments(
    buffer: Buffer,
    parameters: AdjustmentParameters
  ): Promise<Buffer> {
    try {
      const metadata = await sharp(buffer).metadata();
      let pipeline = sharp(buffer);

      logger.info('Applying adjustments', { parameters });

      // 1. EXPOSURE (노출) - 먼저 적용
      if (parameters.exposure && parameters.exposure !== 0) {
        const expMultiplier = Math.pow(2, parameters.exposure);
        pipeline = pipeline.linear(expMultiplier, 0);
      }

      // 2. BRIGHTNESS, SATURATION, HUE (기본 색상 조정)
      const modulateOpts: any = {};
      if (parameters.brightness !== 1.0) modulateOpts.brightness = parameters.brightness;
      if (parameters.saturation !== 1.0) modulateOpts.saturation = parameters.saturation;
      if (parameters.hue !== 0) modulateOpts.hue = parameters.hue;

      if (Object.keys(modulateOpts).length > 0) {
        pipeline = pipeline.modulate(modulateOpts);
      }

      // 3. VIBRANCE (자연스러운 채도 증가)
      if (parameters.vibrance && parameters.vibrance !== 1.0) {
        // Vibrance는 낮은 채도 색상만 증가 (간접 구현)
        const vibranceBoost = (parameters.vibrance - 1.0) * 0.3;
        if (vibranceBoost !== 0) {
          pipeline = pipeline.modulate({
            saturation: 1.0 + vibranceBoost
          });
        }
      }

      // 4. CONTRAST (대비)
      if (parameters.contrast !== 1.0) {
        const a = parameters.contrast;
        const b = (1 - parameters.contrast) * 128;
        pipeline = pipeline.linear(a, b);
      }

      // 5. CLARITY (중간톤 대비 강화)
      if (parameters.clarity && parameters.clarity > 0) {
        const sigma = 5 - (parameters.clarity * 2);
        pipeline = pipeline.unflatten().convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8 + parameters.clarity * 3, -1, -1, -1, -1]
        });
      }

      // 6. SHADOWS & HIGHLIGHTS (톤 커브 조정)
      if (parameters.shadows || parameters.highlights || parameters.whites || parameters.blacks) {
        pipeline = await this.applyToneCurve(pipeline, parameters);
      }

      // 7. TEMPERATURE & TINT (색온도)
      if (parameters.temperature !== 0 || parameters.tint !== 0) {
        pipeline = this.applyColorTemperature(
          pipeline,
          parameters.temperature,
          parameters.tint
        );
      }

      // 8. DENOISE (노이즈 제거)
      if (parameters.denoise && parameters.denoise > 0) {
        const strength = Math.ceil(parameters.denoise * 5);
        pipeline = pipeline.median(strength);
      }

      // 9. SHARPNESS (선명도)
      if (parameters.sharpness > 1.0) {
        const sigma = (parameters.sharpness - 1.0) * 1.5;
        pipeline = pipeline.sharpen({ sigma });
      }

      // 10. DEHAZE (안개 제거 - 대비 및 채도 증가로 구현)
      if (parameters.dehaze && parameters.dehaze > 0) {
        pipeline = pipeline.modulate({
          saturation: 1.0 + parameters.dehaze * 0.3
        }).linear(1.0 + parameters.dehaze * 0.2, 0);
      }

      // 11. VIGNETTE (비네팅)
      if (parameters.vignette && parameters.vignette !== 0) {
        pipeline = await this.applyVignette(pipeline, parameters.vignette, metadata);
      }

      // 12. SKIN SMOOTHING (피부 보정)
      if (parameters.skinSmoothing && parameters.skinSmoothing > 0) {
        const blurSigma = parameters.skinSmoothing * 3;
        pipeline = pipeline.blur(blurSigma);
      }

      // 13. GRAIN (필름 그레인)
      if (parameters.grain && parameters.grain > 0) {
        // 노이즈 추가로 필름 그레인 효과
        const grainAmount = Math.floor(parameters.grain * 20);
        if (grainAmount > 0) {
          // Sharp에서 직접 노이즈 추가는 어려우므로 로그만 남김
          logger.info('Grain effect requested but not fully implemented', { grain: parameters.grain });
        }
      }

      // 14. COLOR GRADING (색감 그레이딩)
      if (parameters.colorGrading && parameters.colorGrading !== 'none') {
        pipeline = this.applyColorGrading(pipeline, parameters.colorGrading);
      }

      // 15. FILTERS (기타 필터)
      for (const filter of parameters.filters) {
        pipeline = this.applyFilter(pipeline, filter);
      }

      // 원본 포맷이 PNG면 PNG로, 아니면 최고 품질 JPEG로
      if (metadata.format === 'png') {
        return await pipeline
          .png({ compressionLevel: 6, quality: 100 })
          .toBuffer();
      }

      // JPEG는 최고 품질로 저장
      return await pipeline
        .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
        .toBuffer();

    } catch (error: any) {
      logger.error('Image adjustment failed', {
        error: error.message,
        parameters
      });
      throw new Error('Failed to apply adjustments');
    }
  }

  /**
   * 색온도 및 틴트 적용
   */
  private applyColorTemperature(
    pipeline: sharp.Sharp,
    temperature: number,
    tint: number
  ): sharp.Sharp {
    const tempFactor = temperature / 100;
    const tintFactor = tint / 100;

    const rMultiplier = 1 + tempFactor * 0.3;
    const gMultiplier = 1 - Math.abs(tintFactor) * 0.2;
    const bMultiplier = 1 - tempFactor * 0.3 + tintFactor * 0.2;

    return pipeline.recomb([
      [rMultiplier, 0, 0],
      [0, gMultiplier, 0],
      [0, 0, bMultiplier]
    ]);
  }

  /**
   * 톤 커브 적용 (Shadows, Highlights, Whites, Blacks)
   */
  private async applyToneCurve(
    pipeline: sharp.Sharp,
    parameters: AdjustmentParameters
  ): Promise<sharp.Sharp> {
    // 간단한 톤 커브 조정 (gamma 및 linear 변환 조합)
    const shadowsAdj = (parameters.shadows || 0) / 100;
    const highlightsAdj = (parameters.highlights || 0) / 100;

    if (shadowsAdj !== 0 || highlightsAdj !== 0) {
      // Shadows는 어두운 영역 밝게, Highlights는 밝은 영역 조정
      const mult = 1.0 + highlightsAdj * 0.3;
      const add = shadowsAdj * 30;
      pipeline = pipeline.linear(mult, add);
    }

    return pipeline;
  }

  /**
   * 비네팅 효과 적용
   */
  private async applyVignette(
    pipeline: sharp.Sharp,
    strength: number,
    metadata: sharp.Metadata
  ): Promise<sharp.Sharp> {
    // 비네팅은 composite를 사용해 구현 가능하지만 복잡함
    // 간단한 구현: 가장자리를 어둡게 또는 밝게
    logger.info('Vignette effect requested', { strength });
    // 현재는 로그만 - 실제 구현은 복잡한 composite 필요
    return pipeline;
  }

  /**
   * 색감 그레이딩 적용
   */
  private applyColorGrading(pipeline: sharp.Sharp, style: string): sharp.Sharp {
    switch (style.toLowerCase()) {
      case 'warm_vintage':
        return pipeline.modulate({
          saturation: 0.8
        }).recomb([
          [1.2, 0.1, 0],
          [0, 1.0, 0],
          [0, 0, 0.8]
        ]);

      case 'cool_modern':
        return pipeline.modulate({
          saturation: 1.1
        }).recomb([
          [0.9, 0, 0],
          [0, 1.0, 0.05],
          [0, 0, 1.1]
        ]);

      case 'cinematic':
        return pipeline.modulate({
          saturation: 0.9,
          brightness: 0.95
        }).recomb([
          [1.1, 0.05, 0],
          [0.05, 1.0, 0.05],
          [0, 0.05, 0.95]
        ]);

      default:
        logger.warn(`Unknown color grading style: ${style}`);
        return pipeline;
    }
  }

  /**
   * 필터 적용
   */
  private applyFilter(pipeline: sharp.Sharp, filter: string): sharp.Sharp {
    switch (filter.toLowerCase()) {
      case 'denoise':
        return pipeline.median(3);

      case 'blur':
      case 'soft_focus':
        return pipeline.blur(2);

      case 'skin_smoothing':
        return pipeline.blur(1.5);

      case 'hdr':
        // HDR 효과 - 대비 증가 및 채도 약간 감소
        return pipeline.linear(1.3, -15).modulate({ saturation: 0.9 });

      case 'glow':
        // Glow 효과 - 약간의 블러와 밝기 증가
        return pipeline.blur(0.5).linear(1.1, 5);

      case 'vignette':
        // 로그만 - 실제 구현은 복잡
        logger.info('Vignette filter applied via filters array');
        return pipeline;

      default:
        logger.warn(`Unknown filter: ${filter}`);
        return pipeline;
    }
  }

  /**
   * 이미지 메타데이터 추출
   */
  async getMetadata(buffer: Buffer) {
    try {
      return await sharp(buffer).metadata();
    } catch (error: any) {
      logger.error('Failed to extract metadata', { error: error.message });
      throw new Error('Failed to read image metadata');
    }
  }

  /**
   * Base64로 인코딩
   */
  async toBase64(buffer: Buffer): Promise<string> {
    return buffer.toString('base64');
  }
}

export const imageService = new ImageService();
