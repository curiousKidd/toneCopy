import OpenAI from 'openai';
import sharp from 'sharp';
import { logger } from '../utils/logger';
import type { StyleProfile, StyleCharacteristics } from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * AI 스타일 프로필 서비스
 *
 * 기존 방식과의 차이:
 * - 기존: AI가 파라미터 수치를 추측 (brightness: 1.2 같은 숫자)
 * - 신규: AI가 보정 의도와 원칙을 학습 ("따뜻한 피부톤, 리프트된 그림자" 같은 의미론적 이해)
 *
 * 여러 이미지 쌍을 종합 분석하여 패턴을 추출 → 한 장짜리 분석보다 훨씬 정확한 스타일 이해
 */
export class StyleProfileService {

  /**
   * 여러 원본/보정본 쌍을 종합 분석하여 StyleProfile 생성
   *
   * @param originalBase64Array  원본 이미지 Base64 배열
   * @param adjustedBase64Array  보정본 이미지 Base64 배열
   * @returns StyleProfile       의미론적 스타일 프로필
   */
  async generateProfile(
    originalBase64Array: string[],
    adjustedBase64Array: string[]
  ): Promise<StyleProfile> {
    if (originalBase64Array.length !== adjustedBase64Array.length) {
      throw new Error('원본/보정본 이미지 수가 일치하지 않습니다');
    }

    // GPT-4o에 전달할 이미지 컨텐츠 구성
    // 각 쌍을 "원본 → 보정본" 순서로 배치하여 AI가 변화를 파악하게 함
    const imageContents: OpenAI.Chat.ChatCompletionContentPart[] = [];

    for (let i = 0; i < originalBase64Array.length; i++) {
      imageContents.push({
        type: 'text',
        text: `=== 이미지 쌍 ${i + 1} ===\n[원본]`
      });
      imageContents.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${originalBase64Array[i]}`,
          detail: 'high'
        }
      });
      imageContents.push({
        type: 'text',
        text: `[보정 후]`
      });
      imageContents.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${adjustedBase64Array[i]}`,
          detail: 'high'
        }
      });
    }

    imageContents.push({
      type: 'text',
      text: STYLE_ANALYSIS_PROMPT
    });

    logger.info('스타일 프로필 분석 시작', { pairCount: originalBase64Array.length });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: imageContents
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI 스타일 분석 응답이 비어있습니다');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      logger.error('스타일 분석 JSON 파싱 실패', { content });
      throw new Error('AI 스타일 분석 결과 파싱 실패');
    }

    const profile = this.buildProfileFromResponse(parsed);

    logger.info('스타일 프로필 생성 완료', {
      mood: profile.characteristics.overallMood,
      description: profile.description.slice(0, 80)
    });

    return profile;
  }

  /**
   * 썸네일 생성 (few-shot 참조용, 저해상도)
   * 실제 보정 시 AI에게 예시로 보여주기 위한 200px 이미지
   */
  async generateThumbnail(imageBuffer: Buffer): Promise<string> {
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    return thumbnailBuffer.toString('base64');
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private buildProfileFromResponse(data: any): StyleProfile {
    const chars = data.characteristics || {};

    const characteristics: StyleCharacteristics = {
      overallMood:        this.sanitizeString(chars.overallMood,        'neutral'),
      brightnessApproach: this.sanitizeString(chars.brightnessApproach, 'natural'),
      contrastLevel:      this.sanitizeString(chars.contrastLevel,      'medium'),
      saturationStyle:    this.sanitizeString(chars.saturationStyle,    'natural'),
      shadowTreatment:    this.sanitizeString(chars.shadowTreatment,    'natural'),
      highlightTreatment: this.sanitizeString(chars.highlightTreatment, 'preserved'),
      skinToneApproach:   this.sanitizeString(chars.skinToneApproach,   'natural'),
      colorGradingStyle:  this.sanitizeString(chars.colorGradingStyle,  'none'),
      sharpnessPreference:this.sanitizeString(chars.sharpnessPreference,'natural'),
      technicalNotes:     this.sanitizeString(data.technicalNotes,      ''),
      adaptationRules:    Array.isArray(data.adaptationRules) ? data.adaptationRules : []
    };

    return {
      description: this.sanitizeString(data.description, '스타일 분석 완료'),
      characteristics,
      generatedAt: new Date().toISOString()
    };
  }

  private sanitizeString(value: any, fallback: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return fallback;
  }
}

// ─────────────────────────────────────────────
// 프롬프트
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 전문 사진 편집 스타일 분석가입니다.
사용자가 제공한 원본/보정본 이미지 쌍들을 분석하여, 이 사람의 보정 철학과 스타일 원칙을 파악합니다.

중요: 단순히 "밝기가 올라갔다" 같은 수치적 변화를 나열하는 것이 아니라,
"이 사람은 어떤 미적 의도를 가지고 보정하는가"를 이해해야 합니다.

항상 JSON 형식으로만 응답합니다.`;

const STYLE_ANALYSIS_PROMPT = `위 이미지 쌍들을 보고, 이 사람의 사진 보정 스타일을 분석해주세요.

다음 JSON 구조로 응답하세요:
{
  "description": "이 사람의 보정 스타일을 1-2문장으로 자연스럽게 설명 (예: '따뜻한 피부톤을 강조하고 그림자를 부드럽게 리프트하는 시네마틱 스타일')",
  "characteristics": {
    "overallMood": "warm | cool | neutral | cinematic | vintage | modern 중 하나",
    "brightnessApproach": "bright | dark | natural 중 하나",
    "contrastLevel": "high | medium | low 중 하나",
    "saturationStyle": "vivid | muted | natural | selective 중 하나",
    "shadowTreatment": "lifted | crushed | natural 중 하나 (lifted=그림자 밝게, crushed=어둡게)",
    "highlightTreatment": "preserved | blown | natural | rolled_off 중 하나",
    "skinToneApproach": "warm | cool | natural | enhanced | not_applicable 중 하나",
    "colorGradingStyle": "film | digital | vintage | modern | none 중 하나",
    "sharpnessPreference": "crisp | soft | natural 중 하나"
  },
  "technicalNotes": "구체적으로 관찰된 보정 패턴 (예: '피부 채도를 낮추고 하늘은 깊게 강조, 전체적으로 약한 필름 그레인 추가')",
  "adaptationRules": [
    "어두운 사진의 경우 노출을 더 적극적으로 올릴 것",
    "인물이 있으면 피부톤 보호를 최우선으로 할 것",
    "풍경 사진은 하늘과 녹음의 채도를 선택적으로 강화할 것"
    // 관찰된 패턴 기반으로 3-5개 규칙 생성
  ]
}

여러 쌍에서 공통적으로 보이는 패턴에 집중하세요.`;

export const styleProfileService = new StyleProfileService();
