import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * 단계별 모델 배정 (OpenAI + Claude 혼합)
 *
 * - Stage 1 (전역 색상/톤):   gpt-4o (OpenAI)
 *     파라미터 20개의 복잡한 JSON 구조화에 강점
 *     response_format: json_object 지원으로 안정적 출력
 *
 * - Stage 2 (인물 보정):       claude-opus-4-6 (Anthropic)
 *     피부톤·질감·눈·치아 미세 시각 변화 감지에 Claude가 우수
 *     세밀한 인물 분석은 Claude Opus의 핵심 강점
 *
 * - Stage 3 (배경/풍경):       claude-opus-4-6 (Anthropic)
 *     하늘·물 선택적 색상 변화 감지에 Claude Opus 최적
 *     selectiveColorIntensity 과소 추정 방지
 *
 * - 단일 모드 fallback:        gpt-4o (OpenAI)
 */
const MODELS = {
  globalTone:       'gpt-4o',          // OpenAI: 복잡한 JSON 구조화, response_format 안정성
  portraitRetouch:  'claude-opus-4-6', // Claude Opus: 피부톤·눈·치아 미세 시각 분석
  landscapeRetouch: 'claude-opus-4-6', // Claude Opus: 자연/풍경 선택적 색상 감지
  fallback:         'gpt-4o'
} as const;

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
            content: `You are a precise photo editing analyst. Your job is to ACCURATELY MEASURE the exact difference between two images and return parameter values that faithfully reproduce those changes.

                     CRITICAL PRINCIPLES:
                     1. MEASURE ACCURATELY: Report the real magnitude of changes. If the edit is dramatic, report dramatic values.
                     2. DO NOT UNDERESTIMATE: Many analysts report values too close to 1.0. If the edited image looks clearly different, use values that reflect that.
                     3. CLONE EXACTLY: Your goal is to reproduce the user's edit perfectly, not to be conservative.
                     4. USE FULL RANGE: Don't be afraid of values like 1.4, 1.5, 1.6 if the edit warrants it.

                     PARAMETERS:
                     - brightness: float (0.5-2.0, 1.0=unchanged). Strong brightening = 1.3-1.6
                     - contrast: float (0.5-2.0). Strong contrast = 1.3-1.6
                     - saturation: float (0.0-2.0). Vivid colors = 1.3-1.8
                     - vibrance: float (0.5-2.0). Natural color pop
                     - hue: integer (-180 to 180)
                     - temperature: integer (-100 to 100, negative=cooler/blue, positive=warmer/yellow). Strong warm shift = 20-50
                     - tint: integer (-100 to 100)
                     - exposure: float (-2.0 to 2.0). Strong exposure increase = 0.5-1.5

                     DETAIL:
                     - sharpness: float (0.0-3.0). Clear sharpening = 1.3-2.0
                     - clarity: float (0.0-2.0). Midtone contrast. Visible clarity = 1.2-1.8
                     - dehaze: float (0.0-2.0). Haze removal
                     - grain: float (0.0-1.0)

                     TONE CURVE:
                     - highlights: integer (-100 to 100). Crushed highlights = -30 to -60
                     - shadows: integer (-100 to 100). Lifted shadows = +20 to +50
                     - whites: integer (-100 to 100)
                     - blacks: integer (-100 to 100). Deep blacks = -20 to -50

                     PORTRAIT (if person present):
                     - skinSmoothing: float (0.0-1.0)
                     - blemishRemoval: boolean
                     - eyeBrightening: float (0.0-1.0)
                     - teethWhitening: float (0.0-1.0)
                     - faceSlimming: float (0.0-0.5)
                     - bodyRetouching: boolean
                     - makeupEnhancement: boolean

                     LANDSCAPE SELECTIVE COLOR:
                     - selectiveColorIntensity: float (0.0-2.0)
                       * Sky clearly bluer, water more vivid → 0.8-1.5
                       * Strong selective enhancement → 1.3-2.0
                     - landscapeClarity: float (0.0-2.0) if distant details are sharper

                     DEPRECATED (always 0):
                     - skyEnhancement, foliageEnhancement, waterEnhancement, naturalSaturation, dynamicRange, atmosphericPerspective

                     EFFECTS:
                     - vignette: float (-1.0 to 1.0)
                     - denoise: float (0.0-1.0)
                     - colorGrading: "warm_vintage" | "cool_modern" | "cinematic" | "none"
                     - filters: string[]

                     METHODOLOGY:
                     1. Compare brightness/exposure: Is edited clearly brighter? → brightness 1.2-1.5
                     2. Compare contrast: Are shadows darker, highlights brighter? → contrast 1.2-1.5, blacks -20 to -50
                     3. Compare color saturation: More vivid? → saturation 1.3-1.7
                     4. Compare color temperature: Warmer/cooler? → temperature ±10-50
                     5. Compare sharpness/clarity: Crisper? → sharpness/clarity 1.2-1.8
                     6. Compare sky/water specifically: Selectively enhanced? → selectiveColorIntensity 0.8-1.5

                     Report the ACTUAL magnitude. If the edited image looks significantly different, the values should be significantly different from 1.0.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Compare the ORIGINAL and EDITED images carefully. Measure the ACTUAL magnitude of all edits.

IMPORTANT: Do NOT underestimate changes. If the edited image looks clearly brighter, more contrasty, or more saturated, report values that reflect that strength (e.g., brightness 1.3-1.5, contrast 1.3-1.6, saturation 1.4-1.8).

Analyze:
1. Overall brightness/exposure - how much brighter or darker?
2. Contrast - are the darks darker and lights lighter?
3. Color saturation - how much more vivid are the colors?
4. Color temperature - warmer or cooler shift?
5. Sharpness and clarity - how much crisper?
6. Sky/water/vegetation - selectively enhanced?
7. Tone curve - shadows lifted or crushed? Highlights pulled down?

First image = ORIGINAL, second image = EDITED.`
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
        return {
          brightness: { min: 0.7, max: 2.0 },
          contrast: { min: 0.7, max: 1.8 },
          saturation: { min: 0.5, max: 1.8 },
          sharpness: { min: 0.5, max: 2.0 },
          dehaze: { min: 0.0, max: 1.0 },
          clarity: { min: 0.0, max: 1.5 },
          selectiveColorIntensity: { min: 0.0, max: 1.5 }
        };

      case ImageType.LOW_KEY:
        return {
          brightness: { min: 0.5, max: 1.8 },
          contrast: { min: 0.6, max: 1.8 },
          saturation: { min: 0.5, max: 1.8 },
          sharpness: { min: 0.5, max: 2.0 },
          dehaze: { min: 0.0, max: 1.5 },
          clarity: { min: 0.0, max: 2.0 },
          selectiveColorIntensity: { min: 0.0, max: 1.5 }
        };

      case ImageType.HIGH_KEY:
        return {
          brightness: { min: 0.5, max: 1.5 },
          contrast: { min: 0.5, max: 1.6 },
          saturation: { min: 0.5, max: 1.8 },
          sharpness: { min: 0.5, max: 2.0 },
          dehaze: { min: 0.0, max: 1.0 },
          clarity: { min: 0.0, max: 1.8 },
          selectiveColorIntensity: { min: 0.0, max: 1.5 }
        };

      case ImageType.FOGGY:
        return {
          brightness: { min: 0.6, max: 1.6 },
          contrast: { min: 0.7, max: 1.8 },
          saturation: { min: 0.6, max: 1.9 },
          sharpness: { min: 0.5, max: 2.0 },
          dehaze: { min: 0.0, max: 2.0 },
          clarity: { min: 0.0, max: 2.0 },
          selectiveColorIntensity: { min: 0.0, max: 1.8 }
        };

      case ImageType.HIGH_CONTRAST:
        return {
          brightness: { min: 0.5, max: 1.8 },
          contrast: { min: 0.4, max: 1.8 },
          saturation: { min: 0.5, max: 1.8 },
          sharpness: { min: 0.5, max: 2.0 },
          dehaze: { min: 0.0, max: 1.5 },
          clarity: { min: 0.0, max: 2.0 },
          selectiveColorIntensity: { min: 0.0, max: 1.8 }
        };

      case ImageType.NORMAL:
      default:
        return {
          brightness: { min: 0.5, max: 1.8 },
          contrast: { min: 0.5, max: 1.8 },
          saturation: { min: 0.4, max: 1.9 },
          sharpness: { min: 0.5, max: 2.5 },
          dehaze: { min: 0.0, max: 2.0 },
          clarity: { min: 0.0, max: 2.0 },
          selectiveColorIntensity: { min: 0.0, max: 2.0 }
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

      // 선택적 색상 강화 (풍경 핵심 파라미터)
      selectiveColorIntensity: avgNumber(p => p.selectiveColorIntensity),

      // 효과 & 필터
      vignette: avgNumber(p => p.vignette),
      denoise: avgNumber(p => p.denoise),
      colorGrading: mostCommonGrading,
      filters: commonFilters
    };
  }

  /**
   * 단계별 파이프라인 분석
   * 1단계: 전역 색상/톤 분석
   * 2단계: 인물 보정 분석 (portrait 특화)
   * 3단계: 배경/풍경 보정 분석 (landscape 특화)
   */
  async analyzeImageAdjustmentsPipelined(
    originalImageBase64: string,
    adjustedImageBase64: string
  ): Promise<AdjustmentParameters> {
    const startTime = Date.now();

    const originalBuffer = Buffer.from(originalImageBase64, 'base64');
    const imageStats = await this.analyzeImageStats(originalBuffer);
    const imageType = this.detectImageType(imageStats);
    const dynamicLimits = this.getDynamicLimits(imageType, imageStats);

    logger.info('Pipeline analysis started', { imageType, imageStats });

    // 3단계 병렬 실행 (독립적인 분석)
    const [globalResult, portraitResult, landscapeResult] = await Promise.all([
      this.analyzeGlobalTone(originalImageBase64, adjustedImageBase64),
      this.analyzePortraitRetouching(originalImageBase64, adjustedImageBase64),
      this.analyzeLandscapeRetouching(originalImageBase64, adjustedImageBase64)
    ]);

    logger.info('Pipeline stages completed', {
      globalResult,
      portraitResult,
      landscapeResult,
      duration: Date.now() - startTime
    });

    // 세 단계 결과 합성
    const merged = this.mergePipelineResults(globalResult, portraitResult, landscapeResult);

    // 검증 및 범위 제한 적용
    const validated = this.validateParametersWithLimits(merged, dynamicLimits);

    logger.info('Pipeline analysis completed', {
      duration: Date.now() - startTime,
      result: validated
    });

    return validated;
  }

  /**
   * Stage 1: 전역 색상 및 톤 분석
   * brightness, contrast, saturation, vibrance, hue, temperature, tint, exposure,
   * sharpness, clarity, dehaze, grain, highlights, shadows, whites, blacks,
   * vignette, denoise, colorGrading, filters
   */
  private async analyzeGlobalTone(
    originalImageBase64: string,
    adjustedImageBase64: string
  ): Promise<Partial<AdjustmentParameters>> {
    // gpt-4o (OpenAI): 복잡한 JSON 구조화, response_format으로 안정적 출력
    const systemPrompt = `You are a professional photo retouching analyst. Your job is to PRECISELY MEASURE the editing differences between two photos.

STEP 1 - COMPARE: Look at the ORIGINAL and EDITED image side by side.
STEP 2 - MEASURE: For each parameter, estimate the EXACT numeric difference. Do NOT round to safe values.
STEP 3 - CHECK OVEREXPOSURE: If edited image has blown-out whites/sky → use highlights/whites NEGATIVE values to recover.
STEP 4 - REPORT: Output only parameters that actually changed.

CRITICAL RULES:
- If the edited image is CLEARLY brighter → brightness 1.2-1.4 (AVOID exceeding 1.4 - causes overexposure)
- If colors are VIVID/PUNCHY → saturation 1.4-1.8 (not 1.1)
- If contrast is STRONG → contrast 1.3-1.5 (AVOID exceeding 1.5 - too harsh)
- If sky/water is DEEP BLUE → DO NOT rely on global saturation alone, that's handled by selective color
- BALANCE brightness with shadows/highlights - if brighter overall, lift shadows (+) and recover highlights (-)
- NEVER report 1.0 for a parameter that visibly changed
- NEVER underestimate. Match what you actually see.

OVEREXPOSURE PREVENTION:
- If edited sky/bright areas look washed out or blown → highlights should be NEGATIVE (-20 to -60)
- If edited has stronger deep blacks → blacks should be NEGATIVE (-20 to -50)
- If edited overall brighter → prefer lifting shadows (+20 to +50) over increasing brightness

PARAMETERS (only report changed ones):
- brightness: float (0.5-2.0). Safe range 1.1-1.4. Default=1.0
- contrast: float (0.5-2.0). Safe range 1.1-1.5. Default=1.0
- saturation: float (0.0-2.0). Default=1.0
- vibrance: float (0.5-2.0). Default=1.0
- hue: integer (-180 to 180). Default=0
- temperature: integer (-100 to 100, positive=warmer/yellow, negative=cooler/blue). Default=0
- tint: integer (-100 to 100). Default=0
- exposure: float (-2.0 to 2.0). Prefer shadows/highlights over exposure. Default=0
- highlights: integer (-100 to 100). Recover bright areas with NEGATIVE values. Default=0
- shadows: integer (-100 to 100). Lifted shadows=+20 to +60. Default=0
- whites: integer (-100 to 100). Default=0
- blacks: integer (-100 to 100). Crushed blacks=-20 to -60. Default=0
- sharpness: float (0.0-3.0). Visible sharpening=1.3-2.5. Default=1.0
- clarity: float (0.0-2.0). Visible clarity=1.2-1.8. Default=1.0
- dehaze: float (0.0-2.0). Default=0
- grain: float (0.0-1.0). Default=0
- vignette: float (-1.0 to 1.0). Default=0
- denoise: float (0.0-1.0). Default=0
- colorGrading: "warm_vintage"|"cool_modern"|"cinematic"|"none"
- filters: string[]

Return valid JSON object with ONLY the parameters that changed from their defaults.`;

    const userText = `STEP 1: Compare these two images carefully - look at overall brightness, color richness, contrast, sharpness.
STEP 2: Identify every visible difference in global tone and color (ignore portrait skin/face details and sky/water selective color changes).
STEP 3: Report exact numeric values for each changed parameter. Be bold - if it looks strongly edited, report a strong value.

Return JSON with only changed global tone/color parameters.`;

    const rawJson = await this.callOpenAI(
      MODELS.globalTone,
      systemPrompt,
      originalImageBase64,
      adjustedImageBase64,
      userText,
      800
    );

    return JSON.parse(rawJson) as Partial<AdjustmentParameters>;
  }

  /**
   * Stage 2: 인물/피부 보정 분석
   * skinSmoothing, blemishRemoval, eyeBrightening, teethWhitening, faceSlimming,
   * bodyRetouching, makeupEnhancement
   */
  private async analyzePortraitRetouching(
    originalImageBase64: string,
    adjustedImageBase64: string
  ): Promise<Partial<AdjustmentParameters>> {
    // claude-opus-4-6 (Anthropic): 피부톤·질감·눈/치아 미세 시각 변화 감지 최적
    const systemPrompt = `You are a professional portrait retouching analyst with expertise in skin, facial features, and body editing detection.

STEP 1 - CHECK: Is there a person/face in these images? If NO face visible → return {"noPortrait": true} immediately.
STEP 2 - COMPARE: Examine face, skin texture, eyes, teeth, and body shape between ORIGINAL and EDITED.
STEP 3 - MEASURE: Quantify each retouching change precisely.

PARAMETERS (only report changed ones):
- skinSmoothing: float (0.0-1.0)
  * Zoom into skin area and compare pore/texture visibility
  * 0.0=identical texture, 0.3=slightly smoother, 0.6=clearly smoothed, 0.8+=heavy airbrush effect
- blemishRemoval: boolean
  * true if any spots, acne, or skin blemishes were removed
- eyeBrightening: float (0.0-1.0)
  * Compare eye whites brightness and iris clarity
  * 0.3=subtle, 0.6=noticeable, 0.9=dramatic
- teethWhitening: float (0.0-1.0)
  * Only report if teeth are visible. Compare whiteness level.
- faceSlimming: float (0.0-0.5)
  * Compare facial width/jaw shape. Report only if clearly reshaped.
- bodyRetouching: boolean
  * true if body proportions or shape were altered
- makeupEnhancement: boolean
  * true if lip color, eye makeup, blush etc. were added or enhanced

If no face is visible in the image, return {"noPortrait": true}.
Return valid JSON with only changed parameters.`;

    const userText = `STEP 1: Is there a face/person visible? If not → {"noPortrait": true}
STEP 2: Compare skin texture, eye clarity, teeth, and body shape between the two images.
STEP 3: Report exact values for any portrait retouching changes you detect.

Return JSON with only the portrait parameters that changed. If no person, return {"noPortrait": true}.`;

    const rawJson = await this.callClaude(
      MODELS.portraitRetouch,
      systemPrompt,
      originalImageBase64,
      adjustedImageBase64,
      userText,
      400
    );

    const result = JSON.parse(rawJson) as any;
    if (result.noPortrait) return {};
    return result as Partial<AdjustmentParameters>;
  }

  /**
   * Stage 3: 배경/풍경 보정 분석
   * selectiveColorIntensity, landscapeClarity, 풍경 관련 파라미터
   */
  private async analyzeLandscapeRetouching(
    originalImageBase64: string,
    adjustedImageBase64: string
  ): Promise<Partial<AdjustmentParameters>> {
    // claude-opus-4-6 (Anthropic): 자연/풍경 색상 감지 최고 성능
    const systemPrompt = `You are a professional landscape photo retouching analyst specializing in natural scene color enhancement detection.

STEP 1 - IDENTIFY: What natural elements are present? (sky, water/ocean/river, mountains, trees/forest, rocks, fields)
         If NO natural landscape elements → return {"noLandscape": true} immediately.

STEP 2 - COMPARE SKY INTENSITY:
  * Look at the sky in BOTH images. Is the edited sky NOTICEABLY BLUER or more vibrant?
  * CRITICAL: Compare sky color change vs person/clothing/rocks color change
  * If sky is MUCH BLUER but person's clothes stayed the same color → that's SELECTIVE color (high value needed)
  * How intense is the sky enhancement?
    - Pale/washed sky → deep vivid blue = 1.2-1.8 (COMMON for landscape edits)
    - Subtle blue boost = 0.5-0.9
    - Dramatic deep cobalt blue sky = 1.8-2.0
  * IMPORTANT: Do NOT underestimate. If the sky looks CLEARLY bluer, report 1.0+

STEP 3 - COMPARE WATER/OCEAN:
  * Is water significantly more vivid, deeper blue/teal/turquoise in edited?
  * If both sky AND water are much bluer → strong selective color (1.2-1.8)
  * Is there more reflection detail or surface texture?

STEP 4 - TEST SELECTIVITY:
  * Compare non-landscape elements: person's clothing, skin tone, rocks
  * If sky/water MUCH BLUER but other elements UNCHANGED → selectiveColorIntensity = 1.2-1.8
  * If ALL colors in entire image boosted equally → selectiveColorIntensity = 0 (that's global saturation)

STEP 5 - COMPARE SHARPNESS:
  * Are distant mountains, treelines, or terrain edges NOTICEABLY crisper in the edited image?
  * Compare foreground rocks/ground texture too.
  * Clear sharpness increase = 1.0-1.5

PARAMETERS:
- selectiveColorIntensity: float (0.0-2.0)
  * DEFAULT ASSUMPTION: Most landscape edits have strong selective color (1.0-1.8 range)
  * Sky clearly bluer than original but clothes/skin same = 1.0-1.5
  * Sky DRAMATICALLY deeper blue = 1.5-2.0
  * Subtle sky tint = 0.5-0.9
  * ALL colors boosted equally (global saturation) = 0
  * No visible sky/water color change = 0
  * DO NOT report values below 1.0 unless the sky enhancement is truly subtle

- landscapeClarity: float (0.0-2.0)
  * Distant elements clearly crisper = 1.0-1.5
  * Dramatic sharpness increase = 1.5-2.0
  * Subtle sharpening = 0.5-0.9
  * No sharpness change = 0

Return valid JSON with only the parameters that changed (omit if 0).`;

    const userText = `STEP 1: Identify natural elements (sky, water, mountains, trees, rocks).
STEP 2: Compare sky color intensity - is it bluer? How much? Is it SELECTIVE (only sky/water changed) or global?
STEP 3: Compare water/ocean - deeper, more vivid blue?
STEP 4: Compare landscape sharpness - are distant elements crisper?
STEP 5: Report selectiveColorIntensity and landscapeClarity based on your observations.

If no natural landscape elements present, return {"noLandscape": true}.
Return JSON with landscape parameters only.`;

    const rawJson = await this.callClaude(
      MODELS.landscapeRetouch,
      systemPrompt,
      originalImageBase64,
      adjustedImageBase64,
      userText,
      600
    );

    const result = JSON.parse(rawJson) as any;
    if (result.noLandscape) return {};
    return result as Partial<AdjustmentParameters>;
  }

  /**
   * 3단계 파이프라인 결과를 합성
   * Global 결과를 기반으로 Portrait/Landscape 결과를 오버레이
   */
  private mergePipelineResults(
    global: Partial<AdjustmentParameters>,
    portrait: Partial<AdjustmentParameters>,
    landscape: Partial<AdjustmentParameters>
  ): AdjustmentParameters {
    // Global이 기본값이 되고, portrait/landscape 특화 파라미터로 오버라이드
    const merged: AdjustmentParameters = {
      // Global 기반 (필수 필드)
      brightness: (global.brightness as number) ?? 1.0,
      contrast: (global.contrast as number) ?? 1.0,
      saturation: (global.saturation as number) ?? 1.0,
      hue: (global.hue as number) ?? 0,
      temperature: (global.temperature as number) ?? 0,
      tint: (global.tint as number) ?? 0,
      sharpness: (global.sharpness as number) ?? 1.0,
      filters: Array.isArray(global.filters) ? global.filters : [],

      // Optional global 파라미터
      vibrance: global.vibrance,
      exposure: global.exposure,
      clarity: global.clarity,
      dehaze: global.dehaze,
      grain: global.grain,
      highlights: global.highlights,
      shadows: global.shadows,
      whites: global.whites,
      blacks: global.blacks,
      vignette: global.vignette,
      denoise: global.denoise,
      colorGrading: global.colorGrading,

      // Portrait 특화 파라미터 (Stage 2에서만 담당)
      skinSmoothing: portrait.skinSmoothing,
      blemishRemoval: portrait.blemishRemoval,
      eyeBrightening: portrait.eyeBrightening,
      teethWhitening: portrait.teethWhitening,
      faceSlimming: portrait.faceSlimming,
      bodyRetouching: portrait.bodyRetouching,
      makeupEnhancement: portrait.makeupEnhancement,

      // Landscape 특화 파라미터 (Stage 3에서만 담당)
      selectiveColorIntensity: landscape.selectiveColorIntensity,
      landscapeClarity: landscape.landscapeClarity,

      // Deprecated 필드 (항상 0)
      skyEnhancement: 0,
      foliageEnhancement: 0,
      waterEnhancement: 0,
      naturalSaturation: 0,
      dynamicRange: 0,
      atmosphericPerspective: 0
    };

    logger.info('Pipeline results merged', {
      globalKeys: Object.keys(global).filter(k => (global as any)[k] !== undefined),
      portraitKeys: Object.keys(portrait).filter(k => (portrait as any)[k] !== undefined),
      landscapeKeys: Object.keys(landscape).filter(k => (landscape as any)[k] !== undefined)
    });

    return merged;
  }

  /**
   * OpenAI 모델 호출 헬퍼
   * - 이미지 두 장을 base64로 전송
   * - response_format: json_object으로 안정적 JSON 반환
   */
  private async callOpenAI(
    model: string,
    systemPrompt: string,
    originalImageBase64: string,
    adjustedImageBase64: string,
    userText: string,
    maxTokens: number
  ): Promise<string> {
    const response = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.1, // 일관성 확보: 동일 이미지 → 항상 같은 파라미터
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'ORIGINAL IMAGE:' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${originalImageBase64}`, detail: 'high' } },
            { type: 'text', text: 'EDITED IMAGE:' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${adjustedImageBase64}`, detail: 'high' } },
            { type: 'text', text: userText }
          ]
        }
      ]
    });

    return response.choices[0].message.content || '{}';
  }

  /**
   * Claude 모델 호출 헬퍼
   * - 이미지 두 장을 base64로 전송
   * - JSON 블록 추출 후 반환
   */
  private async callClaude(
    model: string,
    systemPrompt: string,
    originalImageBase64: string,
    adjustedImageBase64: string,
    userText: string,
    maxTokens: number
  ): Promise<string> {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.1, // 일관성 확보: 동일 이미지 → 항상 같은 파라미터
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'ORIGINAL IMAGE:' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: originalImageBase64
              }
            },
            { type: 'text', text: 'EDITED IMAGE:' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: adjustedImageBase64
              }
            },
            { type: 'text', text: userText }
          ]
        }
      ]
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    // JSON 블록 추출 (```json ... ``` 또는 { ... } 패턴)
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();

    const brace = text.match(/\{[\s\S]*\}/);
    if (brace) return brace[0];

    throw new Error(`No JSON found in Claude response (model=${model}): ${text.slice(0, 200)}`);
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
