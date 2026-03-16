import OpenAI from 'openai';
import sharp from 'sharp';
import { logger } from '../utils/logger';
import type { AdjustmentParameters, StyleProfile } from '../types';
import { histogramMatchingService, ColorTransferProfile, SegmentedTransferProfile } from './histogramMatchingService';
import { advancedImageService } from './advancedImageService';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * AI 적응형 보정 서비스
 *
 * 핵심 차이:
 * - 기존: 저장된 변환값(LUT)을 새 사진에 그대로 복사
 * - 신규: AI가 새 사진의 특성을 파악하고, 학습된 스타일 원칙을 이 사진에 맞게 적용
 *
 * 처리 순서:
 * 1. 새 사진 특성 분석 (노출/색온도/주제/조명 환경)
 * 2. StyleProfile + 사진 특성 → AI가 이 사진에 최적화된 파라미터 생성
 * 3. 히스토그램 매칭으로 색상 정확도 보완 (선택적)
 * 4. 기존 spatial effects 파이프라인으로 마무리
 */
export class AdaptiveCorrectionService {

  /**
   * StyleProfile을 사용하여 새 이미지에 적응형 보정 적용
   *
   * @param imageBuffer         보정할 원본 이미지 버퍼
   * @param styleProfile        학습된 스타일 프로필
   * @param transferProfile     글로벌 히스토그램 전송 프로필 (폴백용, 선택적)
   * @param referenceBase64     참조 썸네일 Base64 (few-shot용, 선택적)
   * @param segmentedProfile    HSL 세그먼트별 전송 프로필 (우선 사용, 선택적)
   */
  async applyAdaptiveStyle(
    imageBuffer: Buffer,
    styleProfile: StyleProfile,
    transferProfile?: ColorTransferProfile | null,
    referenceBase64?: string[],
    segmentedProfile?: SegmentedTransferProfile | null
  ): Promise<Buffer> {
    const startTime = Date.now();

    // Step 1: 새 사진을 Base64로 변환 (AI 분석용)
    const imageBase64 = await this.toBase64(imageBuffer);
    const metadata = await sharp(imageBuffer).metadata();

    logger.info('적응형 보정 시작', {
      width: metadata.width,
      height: metadata.height,
      styleMode: styleProfile.characteristics.overallMood,
      mode: segmentedProfile ? 'segmented' : (transferProfile ? 'global' : 'spatial_only')
    });

    // Step 2: AI가 이 사진에 맞는 파라미터 생성
    const adaptedParams = await this.generateAdaptedParameters(
      imageBase64,
      styleProfile,
      referenceBase64 || []
    );

    // Step 3: 색상 전송 적용
    // 우선순위: HSL 세그먼트 프로필 > 글로벌 히스토그램 매칭 > 없음
    let workingBuffer = imageBuffer;
    const hasColorTransfer = !!(segmentedProfile || transferProfile);

    if (segmentedProfile) {
      // HSL 세그먼트별 보정: 하늘/바다/숲/피부 각각 독립 LUT 적용
      try {
        workingBuffer = await histogramMatchingService.applySegmentedTransferProfile(
          imageBuffer,
          segmentedProfile
        );
        logger.info('HSL 세그먼트 보정 적용 완료');
      } catch (err: any) {
        logger.warn('세그먼트 보정 실패, 글로벌 매칭으로 폴백', { error: err.message });
        if (transferProfile) {
          try {
            workingBuffer = await histogramMatchingService.applyTransferProfile(imageBuffer, transferProfile);
          } catch (e2: any) {
            logger.warn('글로벌 매칭도 실패, 원본으로 진행', { error: e2.message });
            workingBuffer = imageBuffer;
          }
        }
      }
    } else if (transferProfile) {
      // 글로벌 히스토그램 매칭 (폴백)
      try {
        workingBuffer = await histogramMatchingService.applyTransferProfile(imageBuffer, transferProfile);
        logger.info('글로벌 히스토그램 매칭 적용 완료');
      } catch (err: any) {
        logger.warn('히스토그램 매칭 실패, 원본으로 진행', { error: err.message });
        workingBuffer = imageBuffer;
      }
    }

    // Step 4: spatial effects만 적용
    // 색상 전송이 색상(밝기/채도/색온도)을 이미 처리했으므로,
    // AI 파라미터 중 색상 관련 값은 neutral로 고정하고 공간 효과만 적용
    const spatialOnlyParams: AdjustmentParameters = hasColorTransfer
      ? this.toSpatialOnlyParams(adaptedParams)
      : { ...adaptedParams, colorLUT: undefined };

    const result = await advancedImageService.applyAdaptiveCorrection(
      workingBuffer,
      spatialOnlyParams
    );

    const elapsedMs = Date.now() - startTime;
    logger.info('적응형 보정 완료', { elapsedMs });

    return result;
  }

  /**
   * AI가 사진의 특성을 분석하고 StyleProfile에 맞는 보정 파라미터 생성
   */
  private async generateAdaptedParameters(
    imageBase64: string,
    styleProfile: StyleProfile,
    referenceBase64: string[]
  ): Promise<AdjustmentParameters> {

    // 이미지 컨텐츠 구성
    const imageContents: OpenAI.Chat.ChatCompletionContentPart[] = [];

    // 1. few-shot 참조 예시 (있을 경우)
    if (referenceBase64.length > 0) {
      // referenceBase64는 [원본1, 보정1, 원본2, 보정2 ...] 순서
      const refPairCount = Math.floor(referenceBase64.length / 2);
      const pairLimit = Math.min(refPairCount, 2); // 최대 2쌍만 사용 (토큰 절약)

      imageContents.push({
        type: 'text',
        text: '=== 참조 스타일 예시 (이 사람이 선호하는 보정 방식) ==='
      });

      for (let i = 0; i < pairLimit; i++) {
        imageContents.push({ type: 'text', text: `[참조 원본 ${i + 1}]` });
        imageContents.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${referenceBase64[i * 2]}`, detail: 'low' }
        });
        imageContents.push({ type: 'text', text: `[참조 보정 후 ${i + 1}]` });
        imageContents.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${referenceBase64[i * 2 + 1]}`, detail: 'low' }
        });
      }
    }

    // 2. 보정 대상 사진
    imageContents.push({
      type: 'text',
      text: '=== 보정 대상 사진 ==='
    });
    imageContents.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'high' }
    });

    // 3. 스타일 프로필 + 파라미터 요청
    imageContents.push({
      type: 'text',
      text: this.buildParameterPrompt(styleProfile)
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: ADAPTIVE_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: imageContents
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('AI 파라미터 생성 응답이 비어있습니다');

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      logger.error('파라미터 JSON 파싱 실패', { content: content.slice(0, 200) });
      return this.getDefaultParameters();
    }

    return this.parseAndValidateParameters(parsed);
  }

  /**
   * StyleProfile을 기반으로 파라미터 생성 요청 프롬프트 구성
   */
  private buildParameterPrompt(styleProfile: StyleProfile): string {
    const c = styleProfile.characteristics;

    return `
이 사람의 보정 스타일:
- 전체 분위기: ${c.overallMood}
- 밝기: ${c.brightnessApproach}
- 대비: ${c.contrastLevel}
- 채도: ${c.saturationStyle}
- 그림자 처리: ${c.shadowTreatment}
- 하이라이트: ${c.highlightTreatment}
- 피부톤: ${c.skinToneApproach}
- 색감 그레이딩: ${c.colorGradingStyle}
- 선명도: ${c.sharpnessPreference}

스타일 설명: ${styleProfile.description}

기술 노트: ${c.technicalNotes}

적응 규칙:
${c.adaptationRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---
위 "보정 대상 사진"을 분석하고, 이 스타일로 보정하기 위한 파라미터를 생성하세요.
중요: 이 사진의 현재 상태(밝기, 색온도, 내용)를 고려하여 파라미터를 조정하세요.
예를 들어 이미 밝은 사진에는 brightness를 크게 올리지 말고, 어두운 사진에는 더 올리세요.

다음 JSON으로 응답:
{
  "photo_analysis": "이 사진의 현재 상태 간단 설명 (밝기, 색온도, 주제)",
  "adaptation_notes": "스타일을 이 사진에 어떻게 적용할지 설명",
  "parameters": {
    "brightness": 1.0,
    "contrast": 1.0,
    "saturation": 1.0,
    "vibrance": 1.0,
    "hue": 0,
    "temperature": 0,
    "tint": 0,
    "exposure": 0.0,
    "sharpness": 1.0,
    "clarity": 1.0,
    "highlights": 0,
    "shadows": 0,
    "whites": 0,
    "blacks": 0,
    "vignette": 0.0,
    "grain": 0.0,
    "dehaze": 0.0,
    "skinSmoothing": 0.0,
    "eyeBrightening": 0.0,
    "teethWhitening": 0.0,
    "selectiveColorIntensity": 0.0,
    "colorGrading": "none",
    "filters": []
  }
}

중요: 색상/색온도/채도/밝기 파라미터(brightness, contrast, saturation, temperature, tint, highlights, shadows 등)는
모두 기본값(1.0 또는 0)으로 설정하세요. 색상 보정은 히스토그램 매칭이 이미 처리합니다.

당신이 결정해야 할 것은 공간적 효과(texture, clarity, vignette, grain)와
인물/풍경 특화 보정(skinSmoothing, eyeBrightening, dehaze)뿐입니다.

파라미터 범위:
- brightness, contrast, saturation, vibrance: 반드시 1.0으로 설정
- temperature, tint, exposure, highlights, shadows, whites, blacks: 반드시 0으로 설정
- sharpness, clarity: 0.8~1.5 (1.0=변화없음, 풍경이면 1.1~1.3)
- dehaze: 0.0~0.3 (안개/헤이즈가 있을 때만)
- grain: 0.0~0.2 (필름 느낌이 스타일에 있을 때만)
- vignette: -0.3~0.3 (0=없음)
- skinSmoothing, eyeBrightening, teethWhitening: 0.0~0.5 (인물 있을 때만)
- selectiveColorIntensity: 0.0 (히스토그램 매칭과 충돌하므로 항상 0)
- colorGrading: 항상 "none"
- filters: 빈 배열 또는 ["denoise"] 만 허용`;
  }

  /**
   * AI 응답 파라미터 파싱 및 유효성 검사
   */
  private parseAndValidateParameters(data: any): AdjustmentParameters {
    const p = data.parameters || data;

    if (data.photo_analysis) {
      logger.info('AI 사진 분석', { analysis: data.photo_analysis });
    }
    if (data.adaptation_notes) {
      logger.info('AI 적응 노트', { notes: data.adaptation_notes });
    }

    return {
      brightness:              this.clamp(p.brightness ?? 1.0, 0.5, 2.0),
      contrast:                this.clamp(p.contrast ?? 1.0, 0.5, 2.0),
      saturation:              this.clamp(p.saturation ?? 1.0, 0.5, 2.0),
      vibrance:                this.clamp(p.vibrance ?? 1.0, 0.5, 2.0),
      hue:                     this.clamp(p.hue ?? 0, -180, 180),
      temperature:             this.clamp(p.temperature ?? 0, -100, 100),
      tint:                    this.clamp(p.tint ?? 0, -100, 100),
      exposure:                this.clamp(p.exposure ?? 0.0, -2.0, 2.0),
      sharpness:               this.clamp(p.sharpness ?? 1.0, 0.5, 3.0),
      clarity:                 this.clamp(p.clarity ?? 1.0, 0.5, 2.0),
      highlights:              this.clamp(p.highlights ?? 0, -100, 100),
      shadows:                 this.clamp(p.shadows ?? 0, -100, 100),
      whites:                  this.clamp(p.whites ?? 0, -100, 100),
      blacks:                  this.clamp(p.blacks ?? 0, -100, 100),
      vignette:                this.clamp(p.vignette ?? 0.0, -1.0, 1.0),
      grain:                   this.clamp(p.grain ?? 0.0, 0.0, 1.0),
      dehaze:                  this.clamp(p.dehaze ?? 0.0, 0.0, 1.0),
      skinSmoothing:           this.clamp(p.skinSmoothing ?? 0.0, 0.0, 1.0),
      eyeBrightening:          this.clamp(p.eyeBrightening ?? 0.0, 0.0, 1.0),
      teethWhitening:          this.clamp(p.teethWhitening ?? 0.0, 0.0, 1.0),
      selectiveColorIntensity: this.clamp(p.selectiveColorIntensity ?? 0.0, 0.0, 2.0),
      colorGrading:            typeof p.colorGrading === 'string' ? p.colorGrading : 'none',
      filters:                 Array.isArray(p.filters) ? p.filters : []
    };
  }

  /**
   * 히스토그램 매칭 후 사용할 파라미터:
   * 색상/톤 관련 값은 neutral로 고정, spatial effects만 유지
   * (이중 색상 보정으로 인한 과보정 방지)
   */
  private toSpatialOnlyParams(params: AdjustmentParameters): AdjustmentParameters {
    return {
      // 색상/톤 → neutral (히스토그램 매칭이 처리)
      brightness:  1.0,
      contrast:    1.0,
      saturation:  1.0,
      vibrance:    1.0,
      hue:         0,
      temperature: 0,
      tint:        0,
      exposure:    0,
      highlights:  0,
      shadows:     0,
      whites:      0,
      blacks:      0,
      colorGrading: 'none',
      colorLUT:    undefined,
      // spatial effects만 원래 값 유지
      sharpness:               params.sharpness,
      clarity:                 params.clarity,
      dehaze:                  params.dehaze,
      grain:                   params.grain,
      vignette:                params.vignette,
      denoise:                 params.denoise,
      skinSmoothing:           params.skinSmoothing,
      eyeBrightening:          params.eyeBrightening,
      teethWhitening:          params.teethWhitening,
      selectiveColorIntensity: 0, // 색상 계열이므로 비활성화
      filters:                 params.filters.filter(f => f === 'denoise' || f === 'soft_focus')
    };
  }

  private clamp(value: number, min: number, max: number): number {
    const n = Number(value);
    if (isNaN(n)) return (min + max) / 2;
    return Math.max(min, Math.min(max, n));
  }

  private getDefaultParameters(): AdjustmentParameters {
    return {
      brightness: 1.0, contrast: 1.0, saturation: 1.0,
      hue: 0, temperature: 0, tint: 0, sharpness: 1.0, filters: []
    };
  }

  private async toBase64(buffer: Buffer): Promise<string> {
    // 분석용: 1000px로 리사이즈 (고해상도 이미지 토큰 절약)
    const resized = await sharp(buffer)
      .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return resized.toString('base64');
  }
}

const ADAPTIVE_SYSTEM_PROMPT = `당신은 전문 사진 편집자입니다.
사용자가 정의한 보정 스타일을 학습하고, 새로운 사진에 그 스타일을 지능적으로 적용합니다.

핵심 원칙:
1. 스타일을 "기계적으로 복사"하지 않고, 각 사진의 특성에 맞게 "지능적으로 해석"하세요
2. 이미 밝은 사진은 덜 밝게, 어두운 사진은 더 적극적으로 보정
3. 피부가 있는 사진은 피부톤을 최우선으로 보호
4. 과보정 금지: 자연스러운 결과를 위해 보수적으로 접근
5. 항상 JSON 형식으로만 응답`;

export const adaptiveCorrectionService = new AdaptiveCorrectionService();
