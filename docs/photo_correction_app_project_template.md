# 사진 자동 보정 애플리케이션 프로젝트 생성 프롬프트 템플릿

당신은 **[풀스택 시니어 아키텍트]**이자 **[AI 애플리케이션 설계 전문가]**입니다.

당신의 임무는 사용자가 제공하는 **[1. 프로젝트 요구사항]**을 바탕으로 즉시 실행 가능한 완전한 프로젝트 구조를 설계하고, **[2. 프로젝트 완전 구성 결과물]** 형식으로 제공하는 것입니다. 결과물은 GitHub에 바로 업로드하여 배포할 수 있는 수준이어야 하며, 모든 핵심 기능이 구현된 MVP(Minimum Viable Product) 코드를 포함해야 합니다.

---

## **[1. 프로젝트 요구사항]**

### 1.1 프로젝트 개요
- **프로젝트명**: [프로젝트 이름을 입력하세요]
- **핵심 목적**: [해결하려는 문제와 타겟 사용자를 명시하세요]
- **예상 사용자 규모**: [일일 사용자 수, 동시 접속자 등]

### 1.2 핵심 기능 요구사항
1. **[기능 1]**: 
   - 상세 설명: [무엇을 어떻게 처리해야 하는가]
   - 입력/출력: [사용자가 제공하는 것 / 시스템이 반환하는 것]
   - 데이터 저장 여부: [필요/불필요 및 저장 대상]

2. **[기능 2]**: 
   - 상세 설명:
   - 입력/출력:
   - 데이터 저장 여부:

*(필요한 만큼 기능을 추가하세요)*

### 1.3 기술적 제약사항
- **AI 활용**: [특정 AI 모델 지정 또는 "최적의 AI 선택" 요청]
- **플랫폼**: [웹 / 모바일 / 데스크톱 / 멀티플랫폼]
- **기술 스택 제한**: [특정 언어/프레임워크 지정 또는 "최적 선택" 요청]
- **인프라**: [클라우드 서비스, 서버리스, 온프레미스 등]

### 1.4 비즈니스 요구사항
- **수익화 전략**: [광고, 구독, 프리미엄 등]
- **확장성 요구**: [향후 추가될 기능 또는 트래픽 증가 대비]
- **예산 제약**: [무료 티어 활용, 비용 최소화 등]

### 1.5 비기능적 요구사항
- **성능**: [응답 시간, 처리 속도 기준]
- **보안**: [데이터 암호화, 인증 방식 등]
- **접근성**: [다국어 지원, 반응형 디자인 등]

---

## **[2. 프로젝트 완전 구성 결과물]**

위 **[1. 프로젝트 요구사항]**을 분석하여, 다음 형식에 맞춰 **즉시 실행 가능한 완전한 프로젝트**를 구성해 주세요.

---

### **2.1 기술 스택 선정 및 근거**

#### 선정된 기술 스택
```
Frontend: [프레임워크/라이브러리 + 버전]
Backend: [언어 + 프레임워크 + 버전]
Database: [데이터베이스 종류 + 이유]
AI/ML: [사용할 AI 모델/API + 버전]
Hosting: [배포 플랫폼 + 이유]
기타: [필요한 도구들]
```

#### 선정 근거
- **Frontend 선택 이유**: [웹/모바일 지원, 개발 속도, 에코시스템 등]
- **Backend 선택 이유**: [성능, AI 통합 용이성, 확장성 등]
- **AI 모델 선택 이유**: [정확도, 비용, API 가용성 등]
- **인프라 선택 이유**: [무료 티어, 확장성, 배포 용이성 등]

#### 비용 분석
| 항목 | 무료 티어 범위 | 예상 월 비용 (트래픽 증가 시) |
|------|---------------|----------------------------|
| AI API | [예: 월 1000건 무료] | [예: $0.002/건 × 예상 건수] |
| Hosting | [예: 무제한] | [예: $0 (정적 호스팅)] |
| Database | [예: 10GB 무료] | [예: $5/월] |
| **합계** | **$0** | **$X/월** |

---

### **2.2 시스템 아키텍처**

#### 전체 구조도
```
[사용자] 
    ↓ (HTTPS)
[Frontend (웹/모바일)]
    ↓ (REST API / WebSocket)
[Backend API Server]
    ↓                    ↓
[AI Service]      [Database]
    ↓
[파일 스토리지]
```

#### 데이터 플로우
**[기능 1] 처리 흐름**:
```
1. 사용자 → Frontend: [입력 데이터]
2. Frontend → Backend: POST /api/[endpoint] + [데이터]
3. Backend → AI Service: [AI 모델 호출]
4. AI Service → Backend: [분석 결과]
5. Backend → Database: [결과 저장 여부]
6. Backend → Frontend: [응답 데이터]
7. Frontend → 사용자: [UI 표시]
```

**[기능 2] 처리 흐름**:
```
(위와 동일한 형식으로 작성)
```

---

### **2.3 데이터베이스 설계**

#### ERD (Entity-Relationship Diagram)
```
[테이블 1: users]
- id (PK, UUID)
- created_at (timestamp)
- preferences (JSON)

[테이블 2: analysis_results]
- id (PK, UUID)
- user_id (FK)
- original_image_url (text)
- adjusted_params (JSON)
- created_at (timestamp)

[관계]
users 1 ─── N analysis_results
```

#### 스키마 정의 (SQL)
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    preferences JSONB
);

CREATE TABLE analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    original_image_url TEXT NOT NULL,
    adjusted_params JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_created (user_id, created_at DESC)
);
```

---

### **2.4 API 설계**

#### Endpoint 명세

**1. [기능 1] API**
```
POST /api/v1/analyze
Content-Type: multipart/form-data

Request Body:
{
    "original_image": File,
    "adjusted_image": File
}

Response (200 OK):
{
    "analysis_id": "uuid",
    "detected_adjustments": {
        "brightness": 1.2,
        "contrast": 1.1,
        "saturation": 0.95,
        "filters": ["sharpen", "denoise"]
    },
    "confidence_score": 0.92
}

Error Responses:
- 400: Invalid image format
- 413: File too large (max 10MB)
- 429: Rate limit exceeded
- 500: AI service unavailable
```

**2. [기능 2] API**
```
POST /api/v1/apply-correction
Content-Type: multipart/form-data

Request Body:
{
    "image": File,
    "analysis_id": "uuid" (optional)
}

Response (200 OK):
{
    "corrected_image_url": "https://...",
    "applied_adjustments": {...},
    "processing_time_ms": 1250
}
```

*(모든 주요 API를 동일한 형식으로 작성)*

---

### **2.5 완전한 프로젝트 구조**

```
project-root/
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   └── manifest.json          # PWA 설정
│   ├── src/
│   │   ├── components/
│   │   │   ├── ImageUploader.tsx   # 이미지 업로드 UI
│   │   │   ├── ComparisonView.tsx  # 전/후 비교 UI
│   │   │   └── DownloadButton.tsx  # 결과 다운로드
│   │   ├── pages/
│   │   │   ├── TrainingPage.tsx    # 첫 번째 페이지
│   │   │   └── CorrectionPage.tsx  # 두 번째 페이지
│   │   ├── services/
│   │   │   └── api.ts              # API 호출 로직
│   │   ├── hooks/
│   │   │   └── useImageProcessing.ts
│   │   ├── utils/
│   │   │   └── imageCompression.ts
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── package.json
│   └── tsconfig.json
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   └── imageController.ts
│   │   ├── services/
│   │   │   ├── aiService.ts        # AI 모델 통합
│   │   │   └── storageService.ts   # 파일 저장 로직
│   │   ├── models/
│   │   │   └── analysisModel.ts
│   │   ├── middleware/
│   │   │   ├── rateLimiter.ts
│   │   │   ├── errorHandler.ts
│   │   │   └── fileValidator.ts
│   │   ├── routes/
│   │   │   └── api.ts
│   │   ├── config/
│   │   │   ├── database.ts
│   │   │   └── ai.ts
│   │   └── server.ts
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   ├── package.json
│   └── tsconfig.json
│
├── ai-model/                       # (필요 시) 커스텀 모델
│   ├── training/
│   ├── inference/
│   └── requirements.txt
│
├── infrastructure/
│   ├── docker-compose.yml
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   └── nginx.conf
│
├── docs/
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── ARCHITECTURE.md
│
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD 파이프라인
│
├── .env.example
├── .gitignore
├── README.md
└── LICENSE
```

---

### **2.6 핵심 코드 구현**

#### 2.6.1 Frontend - 이미지 업로드 컴포넌트
```typescript
// frontend/src/components/ImageUploader.tsx
import React, { useState } from 'react';
import { uploadImages } from '../services/api';

interface ImageUploaderProps {
  onAnalysisComplete: (result: any) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onAnalysisComplete }) => {
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [adjustedImage, setAdjustedImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!originalImage || !adjustedImage) return;
    
    setLoading(true);
    try {
      const result = await uploadImages(originalImage, adjustedImage);
      onAnalysisComplete(result);
    } catch (error) {
      console.error('Analysis failed:', error);
      // 에러 처리 UI
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="uploader-container">
      <input type="file" accept="image/*" onChange={(e) => setOriginalImage(e.target.files?.[0] || null)} />
      <input type="file" accept="image/*" onChange={(e) => setAdjustedImage(e.target.files?.[0] || null)} />
      <button onClick={handleSubmit} disabled={loading || !originalImage || !adjustedImage}>
        {loading ? 'Analyzing...' : 'Analyze'}
      </button>
    </div>
  );
};
```

#### 2.6.2 Backend - AI 분석 서비스
```typescript
// backend/src/services/aiService.ts
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function analyzeImageAdjustments(
  originalImageBase64: string,
  adjustedImageBase64: string
): Promise<AdjustmentParams> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Compare these images and identify the adjustments made (brightness, contrast, saturation, filters). Return JSON format." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${originalImageBase64}` } },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${adjustedImageBase64}` } }
        ]
      }
    ],
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0].message.content);
}

export async function applyAdjustments(
  imageBase64: string,
  params: AdjustmentParams
): Promise<string> {
  // OpenAI DALL-E API를 사용하거나, 
  // Python 기반 PIL/OpenCV 마이크로서비스 호출
  // 또는 클라이언트 사이드 Canvas API 사용
  
  // 예시: 클라이언트 사이드 처리를 위해 파라미터만 반환
  return JSON.stringify(params);
}
```

#### 2.6.3 Backend - API 컨트롤러
```typescript
// backend/src/controllers/imageController.ts
import { Request, Response } from 'express';
import { analyzeImageAdjustments } from '../services/aiService';
import { saveAnalysisResult } from '../models/analysisModel';

export async function analyzeImages(req: Request, res: Response) {
  try {
    const { originalImage, adjustedImage } = req.files as any;
    
    // 이미지를 base64로 변환
    const originalBase64 = originalImage[0].buffer.toString('base64');
    const adjustedBase64 = adjustedImage[0].buffer.toString('base64');
    
    // AI 분석
    const adjustments = await analyzeImageAdjustments(originalBase64, adjustedBase64);
    
    // 결과 저장
    const analysisId = await saveAnalysisResult({
      userId: req.session?.userId,
      adjustments
    });
    
    res.json({
      analysis_id: analysisId,
      detected_adjustments: adjustments,
      confidence_score: 0.92
    });
  } catch (error) {
    res.status(500).json({ error: 'Analysis failed' });
  }
}
```

#### 2.6.4 Docker Compose 설정
```yaml
# infrastructure/docker-compose.yml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: ../infrastructure/Dockerfile.frontend
    ports:
      - "3000:80"
    environment:
      - REACT_APP_API_URL=http://backend:4000

  backend:
    build:
      context: ./backend
      dockerfile: ../infrastructure/Dockerfile.backend
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/photoapp
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=photoapp
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

### **2.7 Google AdSense 통합 전략**

#### 2.7.1 광고 배치 계획
```
[페이지 1: Training Page]
- 상단 배너 (728x90 or 320x50 모바일)
- 사이드바 광고 (300x600, 데스크톱 전용)

[페이지 2: Correction Page]
- 처리 대기 중 인터스티셜 광고
- 결과 다운로드 전 보상형 광고 (선택적)
```

#### 2.7.2 구현 코드
```typescript
// frontend/src/components/AdBanner.tsx
import React, { useEffect } from 'react';

export const AdBanner: React.FC = () => {
  useEffect(() => {
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (err) {
      console.error('Ad loading error:', err);
    }
  }, []);

  return (
    <ins className="adsbygoogle"
         style={{ display: 'block' }}
         data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
         data-ad-slot="XXXXXXXXXX"
         data-ad-format="auto"
         data-full-width-responsive="true">
    </ins>
  );
};
```

#### 2.7.3 광고 정책 준수 사항
- ✅ 이미지 처리 완료 후에만 결과 제공 (광고 클릭 강요 금지)
- ✅ 광고와 기능 버튼 명확히 구분 (최소 150px 간격)
- ✅ 성인/저작권 침해 콘텐츠 필터링
- ✅ 개인정보 처리방침 페이지 필수

---

### **2.8 배포 가이드**

#### 2.8.1 Vercel (Frontend) + Railway (Backend) 배포

**Frontend 배포 (Vercel)**:
```bash
cd frontend
npm run build
vercel --prod
```

**Backend 배포 (Railway)**:
```bash
# railway.json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

#### 2.8.2 환경 변수 설정
```bash
# Frontend (.env.production)
REACT_APP_API_URL=https://api.yourdomain.com
REACT_APP_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX

# Backend (.env)
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
ALLOWED_ORIGINS=https://yourdomain.com
RATE_LIMIT_MAX=100
```

#### 2.8.3 도메인 및 SSL 설정
1. Vercel 자동 SSL 인증서 (Frontend)
2. Railway 자동 HTTPS (Backend)
3. 커스텀 도메인 연결 (선택적)

---

### **2.9 성능 최적화 전략**

| 최적화 항목 | 구현 방법 | 예상 효과 |
|------------|----------|----------|
| 이미지 압축 | Client-side: Browser-Image-Compression 라이브러리 | 업로드 시간 70% 단축 |
| CDN 캐싱 | Vercel Edge Network | 글로벌 응답 속도 50% 향상 |
| API 응답 캐싱 | Redis (분석 결과 1시간 캐싱) | 중복 요청 100% 제거 |
| Progressive Loading | 이미지 미리보기 → 점진적 로딩 | 체감 속도 2배 향상 |
| Web Worker | 이미지 처리를 별도 스레드에서 | UI 블로킹 방지 |

---

### **2.10 보안 체크리스트**

- [ ] **파일 업로드 검증**
  - 파일 타입 검증 (MIME type + 매직 넘버)
  - 파일 크기 제한 (10MB)
  - 악성 코드 스캔 (ClamAV 또는 VirusTotal API)

- [ ] **API 보안**
  - Rate Limiting (IP당 시간당 100건)
  - CORS 설정 (허용된 도메인만)
  - API Key 인증 (선택적)

- [ ] **데이터 보호**
  - 업로드된 이미지 자동 삭제 (24시간 후)
  - HTTPS 강제
  - 개인정보 비식별화

---

### **2.11 테스트 전략**

#### 단위 테스트
```typescript
// backend/tests/unit/aiService.test.ts
import { analyzeImageAdjustments } from '../../src/services/aiService';

describe('AI Service', () => {
  it('should detect brightness adjustment', async () => {
    const result = await analyzeImageAdjustments(mockOriginal, mockAdjusted);
    expect(result.brightness).toBeGreaterThan(1.0);
  });
});
```

#### 통합 테스트
```typescript
// backend/tests/integration/api.test.ts
describe('POST /api/v1/analyze', () => {
  it('should return analysis result', async () => {
    const response = await request(app)
      .post('/api/v1/analyze')
      .attach('original_image', 'test/fixtures/original.jpg')
      .attach('adjusted_image', 'test/fixtures/adjusted.jpg');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('analysis_id');
  });
});
```

---

### **2.12 런치 체크리스트**

#### MVP 출시 전 필수 사항
- [ ] 핵심 기능 2개 완전 동작
- [ ] 모바일 반응형 테스트 완료
- [ ] 에러 처리 및 사용자 피드백 구현
- [ ] Google AdSense 승인 및 광고 노출 확인
- [ ] 개인정보 처리방침 페이지 작성
- [ ] Google Analytics 설치
- [ ] 로딩 시간 3초 이하 확인

#### 출시 후 모니터링
- [ ] 에러 로그 모니터링 (Sentry)
- [ ] API 응답 시간 추적
- [ ] 광고 수익 추적
- [ ] 사용자 피드백 수집

---

### **2.13 향후 확장 로드맵**

**Phase 1 (MVP)**: 
- ✅ 기본 보정 학습 및 적용

**Phase 2 (1-3개월)**:
- 🔄 여러 스타일 프리셋 저장 (인물/풍경/음식 등)
- 🔄 배치 처리 (여러 이미지 동시 보정)
- 🔄 사용자 계정 시스템

**Phase 3 (3-6개월)**:
- 🔮 AI 모델 파인튜닝 (사용자 데이터 기반)
- 🔮 프리미엄 구독 모델
- 🔮 모바일 앱 (React Native)

---

## **추가 요청사항**

위 템플릿을 사용하여 프로젝트를 생성할 때, 다음 사항을 추가로 요청할 수 있습니다:

1. **"특정 섹션만 상세히"**: 예) "2.6 핵심 코드 구현 부분을 모든 파일에 대해 완전히 작성해 주세요"
2. **"README.md 생성"**: GitHub 저장소용 완전한 README 파일
3. **"환경 설정 스크립트"**: 한 번에 모든 의존성을 설치하는 setup.sh 파일
4. **"데모 데이터"**: 테스트용 샘플 이미지 및 시나리오

---

## **사용 예시**

### 예시 1: 사진 자동 보정 애플리케이션

#### [1. 프로젝트 요구사항]

**1.1 프로젝트 개요**
- **프로젝트명**: AutoPhotoFix
- **핵심 목적**: 사용자의 사진 보정 스타일을 AI가 학습하여 자동으로 적용해주는 서비스
- **예상 사용자 규모**: 일 100명 (초기), 월 1만명 (6개월 후)

**1.2 핵심 기능 요구사항**
1. **보정 스타일 학습 기능**: 
   - 상세 설명: 원본 사진과 사용자가 직접 보정한 사진을 비교 분석
   - 입력/출력: 2장의 이미지 입력 → 보정 파라미터 JSON 반환
   - 데이터 저장 여부: 필요 (사용자별 보정 프로필 저장)

2. **자동 보정 적용 기능**: 
   - 상세 설명: 저장된 보정 스타일을 새로운 사진에 적용
   - 입력/출력: 원본 이미지 입력 → 보정된 이미지 반환
   - 데이터 저장 여부: 불필요 (즉시 다운로드)

**1.3 기술적 제약사항**
- **AI 활용**: 최적의 AI 선택 (비용 효율적이고 정확한 것)
- **플랫폼**: 웹 + 모바일 반응형
- **기술 스택 제한**: 최적 선택
- **인프라**: 무료 티어 최대 활용

**1.4 비즈니스 요구사항**
- **수익화 전략**: Google AdSense 광고
- **확장성 요구**: 향후 프리미엄 구독 모델 고려
- **예산 제약**: 초기 비용 $0, 월 $50 이하

**1.5 비기능적 요구사항**
- **성능**: 이미지 처리 5초 이내
- **보안**: 업로드된 이미지 24시간 후 자동 삭제
- **접근성**: 한국어/영어 지원, 모바일 최적화

---

**이 템플릿의 강점**:
✅ 즉시 실행 가능한 완전한 코드 제공  
✅ 비용 분석 및 수익화 전략 포함  
✅ 보안, 성능, 테스트 전략 사전 고려  
✅ 배포부터 모니터링까지 전체 라이프사이클 커버  
✅ 확장 가능한 아키텍처 설계
