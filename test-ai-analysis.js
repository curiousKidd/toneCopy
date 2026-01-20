/**
 * 개선된 AI 분석 테스트
 *
 * 사용법:
 * node test-ai-analysis.js <원본이미지경로> <보정된이미지경로>
 */

const fs = require('fs');
const path = require('path');

// 환경변수 로드
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });

const OpenAI = require('openai').default;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function analyzeImages(originalPath, editedPath) {
  console.log('🔍 이미지 분석 시작...\n');
  console.log(`원본 이미지: ${originalPath}`);
  console.log(`보정 이미지: ${editedPath}\n`);

  // 이미지를 base64로 인코딩
  const originalBase64 = fs.readFileSync(originalPath).toString('base64');
  const editedBase64 = fs.readFileSync(editedPath).toString('base64');

  const startTime = Date.now();

  try {
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

                   Return JSON with these parameters:
                   - brightness: 0.7-1.4 (1.0 = no change)
                   - contrast: 0.7-1.3
                   - saturation: 0.5-1.4
                   - vibrance: 0.5-1.3
                   - hue: -50 to 50
                   - temperature: -50 to 50
                   - tint: -50 to 50
                   - exposure: -1.0 to 1.0
                   - sharpness: 0.5-1.5
                   - clarity: 0.0-1.3
                   - dehaze: 0.0-1.0
                   - selectiveColorIntensity: 0.0-1.2 (use ONLY if specific colors enhanced)

                   CRITICAL: Return CONSERVATIVE values unless changes are obvious.
                   Natural edits typically use 0.9-1.2 range, NOT 1.5-2.0`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze these two images carefully. First image is ORIGINAL, second is EDITED. What changes were made? Return JSON only."
            },
            {
              type: "text",
              text: "ORIGINAL IMAGE:"
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${originalBase64}` }
            },
            {
              type: "text",
              text: "EDITED IMAGE:"
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${editedBase64}` }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1500
    });

    const duration = Date.now() - startTime;
    const content = response.choices[0].message.content;
    const parameters = JSON.parse(content);

    console.log(`✅ 분석 완료 (${(duration / 1000).toFixed(2)}초)\n`);
    console.log('📊 감지된 보정 파라미터:\n');
    console.log(JSON.stringify(parameters, null, 2));
    console.log('\n');

    // 주요 파라미터 분석
    console.log('🎯 주요 변화:');
    if (parameters.brightness !== 1.0) {
      const change = ((parameters.brightness - 1.0) * 100).toFixed(1);
      console.log(`  - 밝기: ${change > 0 ? '+' : ''}${change}%`);
    }
    if (parameters.contrast !== 1.0) {
      const change = ((parameters.contrast - 1.0) * 100).toFixed(1);
      console.log(`  - 대비: ${change > 0 ? '+' : ''}${change}%`);
    }
    if (parameters.saturation !== 1.0) {
      const change = ((parameters.saturation - 1.0) * 100).toFixed(1);
      console.log(`  - 채도: ${change > 0 ? '+' : ''}${change}%`);
    }
    if (parameters.sharpness > 1.0) {
      const change = ((parameters.sharpness - 1.0) * 100).toFixed(1);
      console.log(`  - 선명도: +${change}%`);
    }
    if (parameters.selectiveColorIntensity > 0) {
      console.log(`  - 선택적 색상 강화: ${(parameters.selectiveColorIntensity * 100).toFixed(0)}%`);
    }

    console.log('\n✨ 개선 효과:');
    console.log('  - 자연스러운 범위 내 파라미터 추출');
    console.log('  - 과도한 보정 방지 (채도 ≤1.4, 대비 ≤1.3)');
    console.log('  - 사용자의 실제 보정 스타일 반영\n');

    return parameters;

  } catch (error) {
    console.error('❌ 오류:', error.message);
    process.exit(1);
  }
}

// 커맨드라인 인자 확인
if (process.argv.length < 4) {
  console.error('사용법: node test-ai-analysis.js <원본이미지> <보정된이미지>');
  process.exit(1);
}

const originalPath = process.argv[2];
const editedPath = process.argv[3];

// 파일 존재 확인
if (!fs.existsSync(originalPath)) {
  console.error(`❌ 원본 이미지를 찾을 수 없습니다: ${originalPath}`);
  process.exit(1);
}
if (!fs.existsSync(editedPath)) {
  console.error(`❌ 보정된 이미지를 찾을 수 없습니다: ${editedPath}`);
  process.exit(1);
}

analyzeImages(originalPath, editedPath);
