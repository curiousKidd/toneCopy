import OpenAI from 'openai';
import sharp from 'sharp';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * AI 응답 검증 결과
 */
interface ValidationResult {
  valid: boolean;
  confidence: number;
  warnings: string[];
  params: AdjustmentParameters;
  useDefaults?: boolean;
  reason?: string;
}

/**
 * 이미지 통계 정보
 */
interface ImageStats {
  avgBrightness: number;
  avgSaturation: number;
  isDark: boolean;      // avgBrightness < 80
  isBright: boolean;    // avgBrightness > 180
  isLowSat: boolean;    // avgSaturation < 0.2
  isHighSat: boolean;   // avgSaturation > 0.6
  histogram: {
    shadows: number;    // 0-85 범위 비율
    midtones: number;   // 86-170 범위 비율
    highlights: number; // 171-255 범위 비율
  };
  dynamicRange: number; // 표준편차 기반 (0-100)
}

/**
 * 이미지 유형
 */
enum ImageType {
  NORMAL = 'normal',           // 일반 이미지
  NIGHT = 'night',             // 밤/저조도 사진
  HIGH_KEY = 'high_key',       // 하이키 (밝고 부드러운)
  LOW_KEY = 'low_key',         // 로우키 (어둡고 드라마틱)
  FOGGY = 'foggy',             // 안개/흐림
  HIGH_CONTRAST = 'high_contrast' // 고대비
}

/**
 * 동적 파라미터 상한선
 */
interface DynamicLimits {
  brightness: { min: number; max: number };
  contrast: { min: number; max: number };
  saturation: { min: number; max: number };
  sharpness: { min: number; max: number };
  dehaze: { min: number; max: number };
  clarity: { min: number; max: number };
  selectiveColorIntensity: { min: number; max: number };
}

export class AIService {
  /**
   * 원본 이미지와 보정된 이미지를 비교하여 보정 파라미터 추출
   */
  async analyzeImageAdjustments(
    originalImageBase64: string,
    adjustedImageBase64: string
  ): Promise<AdjustmentParameters> {
    const startTime = Date.now();

    try {
      // 1. 원본 이미지 통계 분석 (검증에 사용)
      const originalBuffer = Buffer.from(originalImageBase64, 'base64');
      const imageStats = await this.analyzeImageStats(originalBuffer);

      logger.info('Original image statistics', imageStats);

      // 2. AI 분석 실행
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a professional photo analysis expert who objectively measures editing changes.
                     Your ONLY job is to accurately detect what edits were made - DO NOT impose your own style preferences.

                     CRITICAL PRINCIPLES:
                     1. MEASURE, DON'T JUDGE: Report actual differences, not what you think looks good
                     2. SUBTLE CHANGES MATTER: Even 5-10% differences are significant
                     3. NATURAL OVER DRAMATIC: Most users prefer subtle, realistic edits
                     4. PRESERVE INTENTION: Detect the user's style, don't override it
                     5. BE PRECISE: Quantify exact differences between original and edited images

                     BASIC COLOR ADJUSTMENTS:
                     - brightness: float (0.5 to 2.0, where 1.0 is unchanged)
                     - contrast: float (0.5 to 2.0)
                     - saturation: float (0.0 to 2.0)
                     - vibrance: float (0.0 to 2.0)
                     - hue: integer (-180 to 180)
                     - temperature: integer (-100 to 100, blue to yellow shift)
                     - tint: integer (-100 to 100, green to magenta shift)
                     - exposure: float (-2.0 to 2.0)

                     DETAIL & SHARPNESS:
                     - sharpness: float (0.0 to 3.0)
                     - clarity: float (0.0 to 2.0, midtone contrast)
                     - dehaze: float (0.0 to 2.0)
                     - grain: float (0.0 to 1.0, film grain amount)

                     TONE CURVE (0-255 range):
                     - highlights: integer (-100 to 100)
                     - shadows: integer (-100 to 100)
                     - whites: integer (-100 to 100)
                     - blacks: integer (-100 to 100)

                     PORTRAIT/SKIN RETOUCHING (if person detected):
                     - skinSmoothing: float (0.0 to 1.0, subtle to heavy)
                     - blemishRemoval: boolean (true if spots/acne removed)
                     - eyeBrightening: float (0.0 to 1.0)
                     - teethWhitening: float (0.0 to 1.0)
                     - faceSlimming: float (0.0 to 0.5, facial reshaping)
                     - bodyRetouching: boolean (true if body shape adjusted)
                     - makeupEnhancement: boolean (true if makeup enhanced)

                     LANDSCAPE/NATURE RETOUCHING (if landscape/nature detected):
                     Measure actual color and tone changes in sky, water, vegetation:
                     - saturation: Measure overall color intensity change (typically 1.0-1.3)
                     - clarity: Measure midtone contrast enhancement (typically 1.0-1.3)
                     - dehaze: Measure atmospheric clarity improvement (typically 0.0-1.0)
                     - contrast: Measure overall tonal range expansion (typically 1.0-1.2)
                     - sharpness: Measure edge definition increase (typically 1.0-1.3)
                     - landscapeClarity: Use ONLY if distant objects are noticeably crisper
                     - vibrance: Measure natural color pop without oversaturation

                     SELECTIVE COLOR ENHANCEMENT (HSL-based):
                     - selectiveColorIntensity: float (0.0 to 2.0) - Use ONLY if specific colors are enhanced
                       * Compare sky, water, vegetation colors between images
                       * 0.0 = no selective enhancement (colors changed uniformly)
                       * 0.3-0.7 = subtle selective boost (natural look)
                       * 0.8-1.2 = moderate selective boost (enhanced but realistic)
                       * 1.3-1.5 = strong selective boost (vivid but not oversaturated)
                       * 1.6-2.0 = dramatic boost (Instagram style - use rarely)

                     HOW TO DETECT:
                     - If sky is bluer BUT skin tones unchanged → selectiveColorIntensity > 0
                     - If ALL colors boosted equally → just increase saturation, keep selectiveColorIntensity = 0
                     - If water/vegetation enhanced BUT overall image natural → 0.5-1.0

                     This targets specific hue ranges (blues, cyans, greens) WITHOUT affecting skin tones.
                     Use conservatively - most natural edits need 0.3-0.8, not 1.3-1.7!

                     DEPRECATED (causes color cast):
                     - skyEnhancement: ALWAYS set to 0
                     - foliageEnhancement: ALWAYS set to 0
                     - waterEnhancement: ALWAYS set to 0
                     - naturalSaturation: ALWAYS set to 0
                     - dynamicRange: ALWAYS set to 0
                     - atmosphericPerspective: ALWAYS set to 0

                     EFFECTS & FILTERS:
                     - vignette: float (-1.0 to 1.0, negative=lighten, positive=darken edges)
                     - denoise: float (0.0 to 1.0, noise reduction)
                     - colorGrading: string (e.g., "warm_vintage", "cool_modern", "cinematic", "none")
                     - filters: array of strings (additional effects like ["hdr", "bokeh", "glow", "soft_focus"])

                     ANALYSIS METHODOLOGY:

                     STEP 1 - MEASURE GLOBAL CHANGES:
                     - Overall brightness: Is the edited image lighter/darker? By how much?
                     - Overall contrast: Are blacks darker and whites brighter?
                     - Overall saturation: Are ALL colors more vivid, or just specific ones?
                     - Color temperature: Is it warmer (yellow) or cooler (blue)?

                     STEP 2 - MEASURE SELECTIVE CHANGES:
                     - FOR PORTRAITS: Skin smoothing? Eye/teeth brightening? Facial reshaping?
                     - FOR LANDSCAPES: Sky bluer? Water more cyan? Grass greener? BUT other colors natural?
                     - FOR MIXED: Both portrait AND landscape techniques applied?

                     STEP 3 - MEASURE DETAIL CHANGES:
                     - Sharpness: Are edges crisper?
                     - Clarity: Are midtones more defined?
                     - Dehaze: Is distant atmosphere clearer?
                     - Noise: Is grain reduced?

                     STEP 4 - DETERMINE IMAGE TYPE:
                     - PORTRAIT: Person is main subject (face visible and prominent)
                     - LANDSCAPE: Scenery, sky, water, mountains, nature
                     - MIXED: Both people and scenery are important

                     CRITICAL: Return CONSERVATIVE values unless changes are obvious.
                     - If unsure, use values closer to 1.0 (no change)
                     - Natural edits typically use 0.9-1.2 range, NOT 1.5-2.0
                     - Only use extreme values (>1.3) if changes are unmistakably dramatic

                     Your goal: Clone the user's editing style EXACTLY, not improve upon it.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `CRITICAL INSTRUCTIONS:
1. Compare these two images VERY CAREFULLY - even tiny differences matter
2. Look for SUBTLE changes in brightness, contrast, saturation, and color tone
3. Even if changes seem small (5-10%), YOU MUST DETECT AND REPORT THEM
4. Pay special attention to:
   - Overall brightness/exposure changes
   - Color saturation and vibrance
   - Warm/cool color temperature shifts
   - Contrast and clarity adjustments
   - Skin smoothing or texture changes
   - Any sharpening or softening
5. DO NOT return default values (1.0, 0) unless the images are TRULY identical
6. If you see ANY visual difference, quantify it precisely

First image is ORIGINAL, second image is EDITED. Analyze what editing was done.`
              },
              {
                type: "text",
                text: "ORIGINAL IMAGE (before editing):"
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${originalImageBase64}` }
              },
              {
                type: "text",
                text: "EDITED IMAGE (after editing - this is what you need to analyze):"
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${adjustedImageBase64}` }
              },
              {
                type: "text",
                text: "Now analyze: What changes were made from ORIGINAL to EDITED? Return the adjustment parameters as JSON."
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,  // 더 일관성 있고 정확한 분석을 위해 낮춤
        max_tokens: 1500
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const parameters = JSON.parse(content) as AdjustmentParameters;

      // AI의 원본 응답 로깅
      logger.info('Raw AI response (before validation)', {
        raw: parameters
      });

      // 3. AI 응답 검증 (새로운 검증 시스템)
      const validationResult = await this.validateAIResponse(parameters, imageStats);

      logger.info('AI response validation result', {
        valid: validationResult.valid,
        confidence: validationResult.confidence.toFixed(2),
        warnings: validationResult.warnings,
        useDefaults: validationResult.useDefaults
      });

      // 4. 신뢰도가 너무 낮으면 경고 및 폴백
      if (validationResult.useDefaults) {
        logger.warn('AI response rejected - using conservative defaults', {
          reason: validationResult.reason
        });
      }

      // 5. 최종 파라미터 범위 제한 (동적 상한선 적용)
      const imageType = this.detectImageType(imageStats);
      const dynamicLimits = this.getDynamicLimits(imageType, imageStats);
      const validated = this.validateParametersWithLimits(validationResult.params, dynamicLimits);

      const processingTime = Date.now() - startTime;
      logger.info('AI analysis completed (after validation)', {
        processingTime,
        confidence: validationResult.confidence.toFixed(2),
        imageType,
        parameters: validated
      });

      return validated;

    } catch (error: any) {
      logger.error('AI analysis failed', {
        error: error.message,
        duration: Date.now() - startTime
      });

      if (error.code === 'insufficient_quota') {
        throw new Error('AI service quota exceeded. Please try again later.');
      }

      throw new Error(`AI analysis failed: ${error.message}`);
    }
  }

  /**
   * 파라미터 검증 및 정규화 (동적 상한선 사용)
   */
  private validateParametersWithLimits(params: any, limits: DynamicLimits): AdjustmentParameters {
    return {
      // 기본 색상 조정 - 동적 범위 적용
      brightness: this.clamp(params.brightness || 1.0, limits.brightness.min, limits.brightness.max),
      contrast: this.clamp(params.contrast || 1.0, limits.contrast.min, limits.contrast.max),
      saturation: this.clamp(params.saturation || 1.0, limits.saturation.min, limits.saturation.max),
      vibrance: params.vibrance !== undefined ? this.clamp(params.vibrance, 0.5, 1.3) : undefined,
      hue: Math.round(this.clamp(params.hue || 0, -50, 50)),
      temperature: Math.round(this.clamp(params.temperature || 0, -50, 50)),
      tint: Math.round(this.clamp(params.tint || 0, -50, 50)),
      exposure: params.exposure !== undefined ? this.clamp(params.exposure, -1.0, 1.0) : undefined,

      // 디테일 & 선명도 - 동적 범위 적용
      sharpness: this.clamp(params.sharpness || 1.0, limits.sharpness.min, limits.sharpness.max),
      clarity: params.clarity !== undefined ? this.clamp(params.clarity, limits.clarity.min, limits.clarity.max) : undefined,
      dehaze: params.dehaze !== undefined ? this.clamp(params.dehaze, limits.dehaze.min, limits.dehaze.max) : undefined,
      grain: params.grain !== undefined ? this.clamp(params.grain, 0.0, 0.5) : undefined,

      // 톤 커브
      highlights: params.highlights !== undefined ? Math.round(this.clamp(params.highlights, -100, 100)) : undefined,
      shadows: params.shadows !== undefined ? Math.round(this.clamp(params.shadows, -100, 100)) : undefined,
      whites: params.whites !== undefined ? Math.round(this.clamp(params.whites, -100, 100)) : undefined,
      blacks: params.blacks !== undefined ? Math.round(this.clamp(params.blacks, -100, 100)) : undefined,

      // 인물/피부 보정
      skinSmoothing: params.skinSmoothing !== undefined ? this.clamp(params.skinSmoothing, 0.0, 1.0) : undefined,
      blemishRemoval: typeof params.blemishRemoval === 'boolean' ? params.blemishRemoval : undefined,
      eyeBrightening: params.eyeBrightening !== undefined ? this.clamp(params.eyeBrightening, 0.0, 1.0) : undefined,
      teethWhitening: params.teethWhitening !== undefined ? this.clamp(params.teethWhitening, 0.0, 1.0) : undefined,
      faceSlimming: params.faceSlimming !== undefined ? this.clamp(params.faceSlimming, 0.0, 0.5) : undefined,
      bodyRetouching: typeof params.bodyRetouching === 'boolean' ? params.bodyRetouching : undefined,
      makeupEnhancement: typeof params.makeupEnhancement === 'boolean' ? params.makeupEnhancement : undefined,

      // 풍경/자연 보정
      skyEnhancement: params.skyEnhancement !== undefined ? this.clamp(params.skyEnhancement, 0.0, 1.0) : undefined,
      foliageEnhancement: params.foliageEnhancement !== undefined ? this.clamp(params.foliageEnhancement, 0.0, 1.0) : undefined,
      waterEnhancement: params.waterEnhancement !== undefined ? this.clamp(params.waterEnhancement, 0.0, 1.0) : undefined,
      landscapeClarity: params.landscapeClarity !== undefined ? this.clamp(params.landscapeClarity, 0.0, 2.0) : undefined,
      naturalSaturation: params.naturalSaturation !== undefined ? this.clamp(params.naturalSaturation, 0.0, 1.0) : undefined,
      dynamicRange: params.dynamicRange !== undefined ? this.clamp(params.dynamicRange, 0.0, 1.0) : undefined,
      atmosphericPerspective: params.atmosphericPerspective !== undefined ? this.clamp(params.atmosphericPerspective, 0.0, 1.0) : undefined,

      // 선택적 색상 강화 - 동적 범위 적용
      selectiveColorIntensity: params.selectiveColorIntensity !== undefined ?
        this.clamp(params.selectiveColorIntensity, limits.selectiveColorIntensity.min, limits.selectiveColorIntensity.max) : undefined,

      // 효과 & 필터
      vignette: params.vignette !== undefined ? this.clamp(params.vignette, -1.0, 1.0) : undefined,
      denoise: params.denoise !== undefined ? this.clamp(params.denoise, 0.0, 1.0) : undefined,
      colorGrading: typeof params.colorGrading === 'string' ? params.colorGrading : undefined,
      filters: Array.isArray(params.filters)
        ? params.filters.filter((f: any) => typeof f === 'string')
        : []
    };
  }

  /**
   * 파라미터 검증 및 정규화 (레거시 - 기본 상한선 사용)
   * @deprecated Use validateParametersWithLimits instead
   */
  private validateParameters(params: any): AdjustmentParameters {
    // 기본 상한선으로 폴백
    const defaultLimits: DynamicLimits = {
      brightness: { min: 0.7, max: 1.35 },
      contrast: { min: 0.7, max: 1.25 },
      saturation: { min: 0.6, max: 1.35 },
      sharpness: { min: 0.5, max: 1.5 },
      dehaze: { min: 0.0, max: 1.0 },
      clarity: { min: 0.0, max: 1.3 },
      selectiveColorIntensity: { min: 0.0, max: 1.2 }
    };
    return this.validateParametersWithLimits(params, defaultLimits);
  }

  /**
   * 파라미터 검증 및 정규화 (구버전 - 삭제 예정)
   * @deprecated
   */
  private validateParametersOld(params: any): AdjustmentParameters {
    // 자연스러운 보정을 위한 더 엄격한 상한선
    return {
      // 기본 색상 조정 - 균형잡힌 범위 (보정 효과 유지하면서 과도함 방지)
      brightness: this.clamp(params.brightness || 1.0, 0.7, 1.35),
      contrast: this.clamp(params.contrast || 1.0, 0.7, 1.25),
      saturation: this.clamp(params.saturation || 1.0, 0.6, 1.35),
      vibrance: params.vibrance !== undefined ? this.clamp(params.vibrance, 0.5, 1.3) : undefined,
      hue: Math.round(this.clamp(params.hue || 0, -50, 50)),
      temperature: Math.round(this.clamp(params.temperature || 0, -50, 50)),
      tint: Math.round(this.clamp(params.tint || 0, -50, 50)),
      exposure: params.exposure !== undefined ? this.clamp(params.exposure, -1.0, 1.0) : undefined,

      // 디테일 & 선명도 - 과도한 처리 방지
      sharpness: this.clamp(params.sharpness || 1.0, 0.5, 1.5),
      clarity: params.clarity !== undefined ? this.clamp(params.clarity, 0.0, 1.3) : undefined,
      dehaze: params.dehaze !== undefined ? this.clamp(params.dehaze, 0.0, 1.0) : undefined,
      grain: params.grain !== undefined ? this.clamp(params.grain, 0.0, 0.5) : undefined,

      // 톤 커브
      highlights: params.highlights !== undefined ? Math.round(this.clamp(params.highlights, -100, 100)) : undefined,
      shadows: params.shadows !== undefined ? Math.round(this.clamp(params.shadows, -100, 100)) : undefined,
      whites: params.whites !== undefined ? Math.round(this.clamp(params.whites, -100, 100)) : undefined,
      blacks: params.blacks !== undefined ? Math.round(this.clamp(params.blacks, -100, 100)) : undefined,

      // 인물/피부 보정
      skinSmoothing: params.skinSmoothing !== undefined ? this.clamp(params.skinSmoothing, 0.0, 1.0) : undefined,
      blemishRemoval: typeof params.blemishRemoval === 'boolean' ? params.blemishRemoval : undefined,
      eyeBrightening: params.eyeBrightening !== undefined ? this.clamp(params.eyeBrightening, 0.0, 1.0) : undefined,
      teethWhitening: params.teethWhitening !== undefined ? this.clamp(params.teethWhitening, 0.0, 1.0) : undefined,
      faceSlimming: params.faceSlimming !== undefined ? this.clamp(params.faceSlimming, 0.0, 0.5) : undefined,
      bodyRetouching: typeof params.bodyRetouching === 'boolean' ? params.bodyRetouching : undefined,
      makeupEnhancement: typeof params.makeupEnhancement === 'boolean' ? params.makeupEnhancement : undefined,

      // 풍경/자연 보정
      skyEnhancement: params.skyEnhancement !== undefined ? this.clamp(params.skyEnhancement, 0.0, 1.0) : undefined,
      foliageEnhancement: params.foliageEnhancement !== undefined ? this.clamp(params.foliageEnhancement, 0.0, 1.0) : undefined,
      waterEnhancement: params.waterEnhancement !== undefined ? this.clamp(params.waterEnhancement, 0.0, 1.0) : undefined,
      landscapeClarity: params.landscapeClarity !== undefined ? this.clamp(params.landscapeClarity, 0.0, 2.0) : undefined,
      naturalSaturation: params.naturalSaturation !== undefined ? this.clamp(params.naturalSaturation, 0.0, 1.0) : undefined,
      dynamicRange: params.dynamicRange !== undefined ? this.clamp(params.dynamicRange, 0.0, 1.0) : undefined,
      atmosphericPerspective: params.atmosphericPerspective !== undefined ? this.clamp(params.atmosphericPerspective, 0.0, 1.0) : undefined,

      // 선택적 색상 강화 (ImageMagick) - 자연스러운 범위로 제한
      selectiveColorIntensity: params.selectiveColorIntensity !== undefined ? this.clamp(params.selectiveColorIntensity, 0.0, 1.2) : undefined,

      // 효과 & 필터
      vignette: params.vignette !== undefined ? this.clamp(params.vignette, -1.0, 1.0) : undefined,
      denoise: params.denoise !== undefined ? this.clamp(params.denoise, 0.0, 1.0) : undefined,
      colorGrading: typeof params.colorGrading === 'string' ? params.colorGrading : undefined,
      filters: Array.isArray(params.filters)
        ? params.filters.filter((f: any) => typeof f === 'string')
        : []
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 이미지 통계 분석
   */
  private async analyzeImageStats(imageBuffer: Buffer): Promise<ImageStats> {
    const stats = await sharp(imageBuffer).stats();

    // RGB 평균 밝기
    const avgBrightness = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;

    // 표준편차 기반 동적 범위 계산 (0-100)
    const avgStdDev = (stats.channels[0].stdev + stats.channels[1].stdev + stats.channels[2].stdev) / 3;
    const dynamicRange = Math.min(100, (avgStdDev / 255) * 200); // 0-100 범위로 정규화

    // 성능 최적화: 이미지를 축소하여 채도 및 히스토그램 계산
    const { data, info } = await sharp(imageBuffer)
      .resize(200, 200, { fit: 'inside' })  // 최대 200x200으로 축소
      .raw()
      .toBuffer({ resolveWithObject: true });

    // HSL 기반 채도 계산 + 히스토그램
    let totalSaturation = 0;
    let pixelCount = 0;
    const channels = info.channels || 3;

    let shadowPixels = 0;    // 0-85
    let midtonePixels = 0;   // 86-170
    let highlightPixels = 0; // 171-255

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;

      // 밝기 히스토그램
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (brightness <= 85) shadowPixels++;
      else if (brightness <= 170) midtonePixels++;
      else highlightPixels++;

      // 채도 계산
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;

      let s = 0;
      if (max !== min) {
        s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
      }

      totalSaturation += s;
      pixelCount++;
    }

    const avgSaturation = totalSaturation / pixelCount;

    return {
      avgBrightness,
      avgSaturation,
      isDark: avgBrightness < 80,
      isBright: avgBrightness > 180,
      isLowSat: avgSaturation < 0.2,
      isHighSat: avgSaturation > 0.6,
      histogram: {
        shadows: shadowPixels / pixelCount,
        midtones: midtonePixels / pixelCount,
        highlights: highlightPixels / pixelCount
      },
      dynamicRange
    };
  }

  /**
   * 이미지 타입 감지
   */
  private detectImageType(stats: ImageStats): ImageType {
    const { avgBrightness, avgSaturation, histogram, dynamicRange } = stats;

    // 1. 밤/저조도 사진 (어둡고 그림자 많음)
    if (avgBrightness < 60 && histogram.shadows > 0.6) {
      return ImageType.NIGHT;
    }

    // 2. 로우키 (어둡지만 대비 높음)
    if (avgBrightness < 90 && dynamicRange > 40 && histogram.shadows > 0.5) {
      return ImageType.LOW_KEY;
    }

    // 3. 하이키 (밝고 부드러움)
    if (avgBrightness > 180 && histogram.highlights > 0.6 && dynamicRange < 35) {
      return ImageType.HIGH_KEY;
    }

    // 4. 안개/흐림 (밝기 중간, 채도 낮음, 동적 범위 낮음)
    if (avgSaturation < 0.25 && dynamicRange < 30 && avgBrightness > 100 && avgBrightness < 200) {
      return ImageType.FOGGY;
    }

    // 5. 고대비 (동적 범위 높음)
    if (dynamicRange > 60) {
      return ImageType.HIGH_CONTRAST;
    }

    // 6. 일반 이미지
    return ImageType.NORMAL;
  }

  /**
   * 동적 파라미터 상한선 계산
   */
  private getDynamicLimits(imageType: ImageType, stats: ImageStats): DynamicLimits {
    switch (imageType) {
      case ImageType.NIGHT:
        // 밤 사진: 밝기 크게 증가 가능, 노이즈 주의
        return {
          brightness: { min: 0.8, max: 1.8 },  // 더 넓은 범위
          contrast: { min: 0.8, max: 1.4 },
          saturation: { min: 0.7, max: 1.4 },  // 채도도 더 증가 가능
          sharpness: { min: 0.5, max: 1.3 },   // 노이즈 증폭 방지
          dehaze: { min: 0.0, max: 0.5 },      // 밤에는 dehaze 제한
          clarity: { min: 0.0, max: 1.0 },     // 노이즈 증폭 방지
          selectiveColorIntensity: { min: 0.0, max: 1.0 } // 보수적
        };

      case ImageType.LOW_KEY:
        // 로우키: 대비 유지, 밝기 신중하게
        return {
          brightness: { min: 0.7, max: 1.4 },
          contrast: { min: 0.8, max: 1.5 },    // 대비 강화 허용
          saturation: { min: 0.7, max: 1.35 },
          sharpness: { min: 0.6, max: 1.6 },
          dehaze: { min: 0.0, max: 0.8 },
          clarity: { min: 0.0, max: 1.4 },     // 드라마틱 효과
          selectiveColorIntensity: { min: 0.0, max: 1.1 }
        };

      case ImageType.HIGH_KEY:
        // 하이키: 밝기 감소 가능, 부드러움 유지
        return {
          brightness: { min: 0.6, max: 1.15 }, // 더 어둡게 가능
          contrast: { min: 0.7, max: 1.15 },   // 부드러움 유지
          saturation: { min: 0.7, max: 1.25 }, // 과포화 방지
          sharpness: { min: 0.5, max: 1.3 },   // 부드러움 유지
          dehaze: { min: 0.0, max: 0.5 },      // 제한적
          clarity: { min: 0.0, max: 1.0 },     // 부드러움 유지
          selectiveColorIntensity: { min: 0.0, max: 0.9 }
        };

      case ImageType.FOGGY:
        // 안개: Dehaze 크게 증가 가능, 채도 증가 필요
        return {
          brightness: { min: 0.7, max: 1.3 },
          contrast: { min: 0.8, max: 1.4 },
          saturation: { min: 0.8, max: 1.5 },  // 채도 복원
          sharpness: { min: 0.6, max: 1.6 },
          dehaze: { min: 0.0, max: 2.0 },      // 크게 증가 가능!
          clarity: { min: 0.0, max: 1.6 },     // 선명도 복원
          selectiveColorIntensity: { min: 0.0, max: 1.3 }
        };

      case ImageType.HIGH_CONTRAST:
        // 고대비: 대비 줄이기 가능, 섀도우/하이라이트 조정
        return {
          brightness: { min: 0.7, max: 1.3 },
          contrast: { min: 0.6, max: 1.2 },    // 대비 줄이기 허용
          saturation: { min: 0.7, max: 1.3 },
          sharpness: { min: 0.6, max: 1.5 },
          dehaze: { min: 0.0, max: 1.0 },
          clarity: { min: 0.0, max: 1.3 },
          selectiveColorIntensity: { min: 0.0, max: 1.2 }
        };

      case ImageType.NORMAL:
      default:
        // 일반 이미지: 기본 범위 (보수적)
        return {
          brightness: { min: 0.7, max: 1.35 },
          contrast: { min: 0.7, max: 1.25 },
          saturation: { min: 0.6, max: 1.35 },
          sharpness: { min: 0.5, max: 1.5 },
          dehaze: { min: 0.0, max: 1.0 },
          clarity: { min: 0.0, max: 1.3 },
          selectiveColorIntensity: { min: 0.0, max: 1.2 }
        };
    }
  }

  /**
   * AI 응답 검증 시스템
   * - 범위 체크 (동적 상한선 적용)
   * - 일관성 체크 (이미지 특성 vs 파라미터)
   * - 신뢰도 점수 계산
   */
  private async validateAIResponse(
    params: AdjustmentParameters,
    imageStats: ImageStats
  ): Promise<ValidationResult> {
    const warnings: string[] = [];
    let confidence = 1.0;

    // 0. 이미지 타입 감지 및 동적 상한선 계산
    const imageType = this.detectImageType(imageStats);
    const dynamicLimits = this.getDynamicLimits(imageType, imageStats);

    logger.info('Image type detected', {
      type: imageType,
      avgBrightness: imageStats.avgBrightness.toFixed(1),
      dynamicRange: imageStats.dynamicRange.toFixed(1),
      histogram: {
        shadows: (imageStats.histogram.shadows * 100).toFixed(1) + '%',
        midtones: (imageStats.histogram.midtones * 100).toFixed(1) + '%',
        highlights: (imageStats.histogram.highlights * 100).toFixed(1) + '%'
      }
    });

    // 1. 범위 체크 (동적 상한선 사용)
    const rangeIssues = this.checkParameterRanges(params, dynamicLimits);
    if (rangeIssues.length > 0) {
      warnings.push(...rangeIssues);
      confidence -= 0.15 * rangeIssues.length;
    }

    // 2. 일관성 체크 (이미지 특성과 파라미터가 논리적으로 맞는지)
    const consistencyIssues = this.checkConsistency(params, imageStats);
    if (consistencyIssues.length > 0) {
      warnings.push(...consistencyIssues);
      confidence -= 0.2 * consistencyIssues.length;
    }

    // 3. 파라미터 품질 점수 계산
    const qualityScore = this.calculateParameterQuality(params);
    confidence *= qualityScore;

    // 4. 신뢰도가 너무 낮으면 보수적 기본값 사용
    const CONFIDENCE_THRESHOLD = 0.5;
    if (confidence < CONFIDENCE_THRESHOLD) {
      return {
        valid: false,
        confidence,
        warnings,
        params: this.getConservativeDefaults(imageStats),
        useDefaults: true,
        reason: `Confidence too low (${confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`
      };
    }

    // 5. 경고가 있지만 사용 가능한 경우 - 일부 파라미터 조정
    if (warnings.length > 0) {
      const adjustedParams = this.adjustSuspiciousParameters(params, warnings, imageStats);
      return {
        valid: true,
        confidence,
        warnings,
        params: adjustedParams
      };
    }

    // 6. 완벽한 경우
    return {
      valid: true,
      confidence,
      warnings: [],
      params
    };
  }

  /**
   * 파라미터 범위 체크 (동적 상한선 적용)
   */
  private checkParameterRanges(params: AdjustmentParameters, limits: DynamicLimits): string[] {
    const issues: string[] = [];

    // 동적 상한선 기반 범위 체크
    if (params.brightness && (params.brightness < limits.brightness.min || params.brightness > limits.brightness.max)) {
      issues.push(`Brightness out of range: ${params.brightness} (allowed: ${limits.brightness.min}-${limits.brightness.max})`);
    }
    if (params.contrast && (params.contrast < limits.contrast.min || params.contrast > limits.contrast.max)) {
      issues.push(`Contrast out of range: ${params.contrast} (allowed: ${limits.contrast.min}-${limits.contrast.max})`);
    }
    if (params.saturation && (params.saturation < limits.saturation.min || params.saturation > limits.saturation.max)) {
      issues.push(`Saturation out of range: ${params.saturation} (allowed: ${limits.saturation.min}-${limits.saturation.max})`);
    }
    if (params.sharpness && (params.sharpness < limits.sharpness.min || params.sharpness > limits.sharpness.max)) {
      issues.push(`Sharpness out of range: ${params.sharpness} (allowed: ${limits.sharpness.min}-${limits.sharpness.max})`);
    }
    if (params.dehaze && (params.dehaze < limits.dehaze.min || params.dehaze > limits.dehaze.max)) {
      issues.push(`Dehaze out of range: ${params.dehaze} (allowed: ${limits.dehaze.min}-${limits.dehaze.max})`);
    }
    if (params.clarity && (params.clarity < limits.clarity.min || params.clarity > limits.clarity.max)) {
      issues.push(`Clarity out of range: ${params.clarity} (allowed: ${limits.clarity.min}-${limits.clarity.max})`);
    }
    if (params.selectiveColorIntensity && (params.selectiveColorIntensity < limits.selectiveColorIntensity.min || params.selectiveColorIntensity > limits.selectiveColorIntensity.max)) {
      issues.push(`SelectiveColorIntensity out of range: ${params.selectiveColorIntensity} (allowed: ${limits.selectiveColorIntensity.min}-${limits.selectiveColorIntensity.max})`);
    }

    // 고정 범위 체크
    if (params.temperature && Math.abs(params.temperature) > 100) {
      issues.push(`Temperature too extreme: ${params.temperature}`);
    }
    if (params.tint && Math.abs(params.tint) > 100) {
      issues.push(`Tint too extreme: ${params.tint}`);
    }

    return issues;
  }

  /**
   * 일관성 체크 (이미지 특성 vs 파라미터)
   */
  private checkConsistency(params: AdjustmentParameters, stats: ImageStats): string[] {
    const issues: string[] = [];

    // 1. 밝은 이미지에 brightness > 1.3은 의심스러움
    if (stats.isBright && params.brightness > 1.3) {
      issues.push(`Bright image (${stats.avgBrightness.toFixed(0)}) but brightness=${params.brightness} - suspicious`);
    }

    // 2. 어두운 이미지에 brightness < 0.9는 의심스러움
    if (stats.isDark && params.brightness < 0.9) {
      issues.push(`Dark image (${stats.avgBrightness.toFixed(0)}) but brightness=${params.brightness} - suspicious`);
    }

    // 3. 이미 채도가 높은 이미지에 saturation > 1.3은 과포화 위험
    if (stats.isHighSat && params.saturation > 1.3) {
      issues.push(`High saturation image but saturation=${params.saturation} - oversaturation risk`);
    }

    // 4. 채도가 낮은 이미지에 saturation < 0.8은 흑백처럼 보일 수 있음
    if (stats.isLowSat && params.saturation < 0.8) {
      issues.push(`Low saturation image but saturation=${params.saturation} - may look grayscale`);
    }

    // 5. 선택적 색상 강화가 1.5 이상이면 과도함 (청록색 왜곡 위험)
    if (params.selectiveColorIntensity && params.selectiveColorIntensity > 1.5) {
      issues.push(`SelectiveColorIntensity=${params.selectiveColorIntensity} - cyan color cast risk`);
    }

    // 6. 대비가 너무 높으면 (>1.4) 디테일 손실
    if (params.contrast > 1.4) {
      issues.push(`Contrast=${params.contrast} - detail loss risk`);
    }

    return issues;
  }

  /**
   * 파라미터 품질 점수 계산 (0.0 ~ 1.0)
   */
  private calculateParameterQuality(params: AdjustmentParameters): number {
    let score = 1.0;

    // 1. 기본값(1.0)과의 편차가 클수록 점수 감소
    const deviations = [
      Math.abs(params.brightness - 1.0),
      Math.abs(params.contrast - 1.0),
      Math.abs(params.saturation - 1.0),
      Math.abs(params.sharpness - 1.0)
    ];

    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;

    // 평균 편차가 0.5 이상이면 극단적 보정
    if (avgDeviation > 0.5) {
      score *= 0.7;
    } else if (avgDeviation > 0.3) {
      score *= 0.85;
    }

    // 2. 모든 파라미터가 기본값(1.0 또는 0)이면 "변화 없음" - 의심스러움
    const allDefaults =
      Math.abs(params.brightness - 1.0) < 0.01 &&
      Math.abs(params.contrast - 1.0) < 0.01 &&
      Math.abs(params.saturation - 1.0) < 0.01 &&
      Math.abs(params.sharpness - 1.0) < 0.01 &&
      Math.abs(params.hue) < 1 &&
      Math.abs(params.temperature) < 1;

    if (allDefaults) {
      score *= 0.5; // AI가 변화를 감지하지 못했을 가능성
    }

    // 3. 선택적 색상이 너무 높으면 감점
    if (params.selectiveColorIntensity && params.selectiveColorIntensity > 1.3) {
      score *= 0.8;
    }

    return Math.max(0.1, score); // 최소 0.1
  }

  /**
   * 보수적 기본값 생성 (신뢰도가 낮을 때 폴백)
   */
  private getConservativeDefaults(stats: ImageStats): AdjustmentParameters {
    return {
      // 이미지 특성에 따라 약간만 조정
      brightness: stats.isDark ? 1.1 : stats.isBright ? 0.95 : 1.0,
      contrast: 1.05,  // 아주 약간만 대비 증가
      saturation: stats.isLowSat ? 1.1 : 1.05,
      vibrance: 1.05,
      hue: 0,
      temperature: 0,
      tint: 0,
      exposure: undefined,

      sharpness: 1.1,  // 약간의 선명도만
      clarity: undefined,
      dehaze: undefined,
      grain: undefined,

      highlights: undefined,
      shadows: undefined,
      whites: undefined,
      blacks: undefined,

      skinSmoothing: undefined,
      blemishRemoval: undefined,
      eyeBrightening: undefined,
      teethWhitening: undefined,
      faceSlimming: undefined,
      bodyRetouching: undefined,
      makeupEnhancement: undefined,

      skyEnhancement: undefined,
      foliageEnhancement: undefined,
      waterEnhancement: undefined,
      landscapeClarity: undefined,
      naturalSaturation: undefined,
      dynamicRange: undefined,
      atmosphericPerspective: undefined,

      selectiveColorIntensity: undefined,  // 보수적으로 사용 안 함

      vignette: undefined,
      denoise: undefined,
      colorGrading: undefined,
      filters: []
    };
  }

  /**
   * 의심스러운 파라미터 조정
   */
  private adjustSuspiciousParameters(
    params: AdjustmentParameters,
    warnings: string[],
    stats: ImageStats
  ): AdjustmentParameters {
    const adjusted = { ...params };

    // 경고 내용 분석하여 파라미터 조정
    warnings.forEach(warning => {
      if (warning.includes('brightness') && warning.includes('suspicious')) {
        // 밝기 조정이 의심스러우면 보수적으로 변경
        if (stats.isBright && adjusted.brightness > 1.2) {
          adjusted.brightness = 1.0 + (adjusted.brightness - 1.0) * 0.5;
          logger.info('Adjusted suspicious brightness', {
            original: params.brightness,
            adjusted: adjusted.brightness
          });
        }
      }

      if (warning.includes('saturation') && warning.includes('oversaturation')) {
        // 과포화 위험이 있으면 채도 감소
        adjusted.saturation = Math.min(adjusted.saturation, 1.25);
        logger.info('Reduced saturation to prevent oversaturation', {
          original: params.saturation,
          adjusted: adjusted.saturation
        });
      }

      if (warning.includes('SelectiveColorIntensity') && warning.includes('cyan')) {
        // 청록색 왜곡 위험이 있으면 강도 감소
        if (adjusted.selectiveColorIntensity) {
          adjusted.selectiveColorIntensity = Math.min(adjusted.selectiveColorIntensity, 1.2);
          logger.info('Reduced selectiveColorIntensity to prevent cyan cast', {
            original: params.selectiveColorIntensity,
            adjusted: adjusted.selectiveColorIntensity
          });
        }
      }

      if (warning.includes('Contrast') && warning.includes('detail loss')) {
        // 대비가 너무 높으면 감소
        adjusted.contrast = Math.min(adjusted.contrast, 1.25);
        logger.info('Reduced contrast to prevent detail loss', {
          original: params.contrast,
          adjusted: adjusted.contrast
        });
      }
    });

    return adjusted;
  }

  /**
   * 여러 분석 결과를 집계하여 평균 파라미터 계산
   */
  aggregateParameters(allParameters: AdjustmentParameters[]): AdjustmentParameters {
    if (allParameters.length === 0) {
      throw new Error('No parameters to aggregate');
    }

    if (allParameters.length === 1) {
      return allParameters[0];
    }

    const count = allParameters.length;

    // 숫자 파라미터 평균 계산 헬퍼 함수
    const avgNumber = (getter: (p: AdjustmentParameters) => number | undefined, defaultVal: number = 0) => {
      const values = allParameters.map(getter).filter((v): v is number => v !== undefined);
      return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : undefined;
    };

    // Boolean 파라미터 - 50% 이상 true면 true
    const majorityBool = (getter: (p: AdjustmentParameters) => boolean | undefined) => {
      const values = allParameters.map(getter).filter((v): v is boolean => v !== undefined);
      const trueCount = values.filter(v => v).length;
      return values.length > 0 && trueCount >= values.length * 0.5 ? true : undefined;
    };

    // 필터는 50% 이상 등장한 것만 포함
    const filterCounts = new Map<string, number>();
    allParameters.forEach(p => {
      p.filters.forEach(filter => {
        filterCounts.set(filter, (filterCounts.get(filter) || 0) + 1);
      });
    });

    const commonFilters = Array.from(filterCounts.entries())
      .filter(([_, cnt]) => cnt >= allParameters.length * 0.5)
      .map(([filter, _]) => filter);

    // colorGrading - 가장 많이 등장한 것 사용
    const gradingCounts = new Map<string, number>();
    allParameters.forEach(p => {
      if (p.colorGrading) {
        gradingCounts.set(p.colorGrading, (gradingCounts.get(p.colorGrading) || 0) + 1);
      }
    });
    const mostCommonGrading = Array.from(gradingCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    logger.info('Aggregated parameters from multiple image pairs', {
      pairCount: count
    });

    return {
      // 기본 색상 조정
      brightness: avgNumber(p => p.brightness, 1.0)!,
      contrast: avgNumber(p => p.contrast, 1.0)!,
      saturation: avgNumber(p => p.saturation, 1.0)!,
      vibrance: avgNumber(p => p.vibrance),
      hue: Math.round(avgNumber(p => p.hue, 0)!),
      temperature: Math.round(avgNumber(p => p.temperature, 0)!),
      tint: Math.round(avgNumber(p => p.tint, 0)!),
      exposure: avgNumber(p => p.exposure),

      // 디테일 & 선명도
      sharpness: avgNumber(p => p.sharpness, 1.0)!,
      clarity: avgNumber(p => p.clarity),
      dehaze: avgNumber(p => p.dehaze),
      grain: avgNumber(p => p.grain),

      // 톤 커브
      highlights: avgNumber(p => p.highlights) !== undefined ? Math.round(avgNumber(p => p.highlights)!) : undefined,
      shadows: avgNumber(p => p.shadows) !== undefined ? Math.round(avgNumber(p => p.shadows)!) : undefined,
      whites: avgNumber(p => p.whites) !== undefined ? Math.round(avgNumber(p => p.whites)!) : undefined,
      blacks: avgNumber(p => p.blacks) !== undefined ? Math.round(avgNumber(p => p.blacks)!) : undefined,

      // 인물/피부 보정
      skinSmoothing: avgNumber(p => p.skinSmoothing),
      blemishRemoval: majorityBool(p => p.blemishRemoval),
      eyeBrightening: avgNumber(p => p.eyeBrightening),
      teethWhitening: avgNumber(p => p.teethWhitening),
      faceSlimming: avgNumber(p => p.faceSlimming),
      bodyRetouching: majorityBool(p => p.bodyRetouching),
      makeupEnhancement: majorityBool(p => p.makeupEnhancement),

      // 풍경/자연 보정
      skyEnhancement: avgNumber(p => p.skyEnhancement),
      foliageEnhancement: avgNumber(p => p.foliageEnhancement),
      waterEnhancement: avgNumber(p => p.waterEnhancement),
      landscapeClarity: avgNumber(p => p.landscapeClarity),
      naturalSaturation: avgNumber(p => p.naturalSaturation),
      dynamicRange: avgNumber(p => p.dynamicRange),
      atmosphericPerspective: avgNumber(p => p.atmosphericPerspective),

      // 효과 & 필터
      vignette: avgNumber(p => p.vignette),
      denoise: avgNumber(p => p.denoise),
      colorGrading: mostCommonGrading,
      filters: commonFilters
    };
  }

  /**
   * 신뢰도 점수 계산
   */
  calculateConfidenceScore(params: AdjustmentParameters): number {
    const deviations = [
      Math.abs(params.brightness - 1.0),
      Math.abs(params.contrast - 1.0),
      Math.abs(params.saturation - 1.0),
      Math.abs(params.hue) / 180,
      Math.abs(params.sharpness - 1.0) / 2,
      Math.abs(params.temperature) / 100,
      Math.abs(params.tint) / 100
    ];

    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    return Math.min(0.95, 0.6 + avgDeviation * 0.7);
  }
}

export const aiService = new AIService();
