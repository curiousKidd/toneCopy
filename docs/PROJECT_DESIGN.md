# AutoPhotoFix - 사진 자동 보정 애플리케이션 프로젝트 설계

## [1. 프로젝트 요구사항]

### 1.1 프로젝트 개요
- **프로젝트명**: AutoPhotoFix
- **핵심 목적**: 사용자의 사진 보정 스타일을 AI가 학습하여 자동으로 적용해주는 서비스. 포토그래퍼, SNS 인플루언서, 일반 사용자를 대상으로 일관된 사진 스타일을 자동화
- **예상 사용자 규모**: 일 100명 (초기 MVP), 월 1만명 (6개월 후), 동시 접속 20명

### 1.2 핵심 기능 요구사항

1. **보정 스타일 학습 기능 (Training Mode)**
   - 상세 설명: 원본 사진과 사용자가 직접 보정한 사진을 AI가 비교 분석하여 보정 패턴을 추출
   - 입력/출력:
     - 입력: 원본 이미지 + 보정된 이미지 (JPG/PNG, 최대 10MB)
     - 출력: 보정 파라미터 JSON (brightness, contrast, saturation, hue, sharpness, filters)
   - 데이터 저장 여부: 필요 (사용자별 보정 프로필을 데이터베이스에 저장)

2. **자동 보정 적용 기능 (Auto Correction Mode)**
   - 상세 설명: 학습된 보정 스타일을 새로운 사진에 자동으로 적용
   - 입력/출력:
     - 입력: 원본 이미지 + 보정 프로필 ID (선택적)
     - 출력: 보정된 이미지 URL + 적용된 파라미터
   - 데이터 저장 여부: 임시 저장 (처리 결과는 24시간 후 자동 삭제)

3. **보정 프로필 관리 기능**
   - 상세 설명: 여러 보정 스타일을 저장하고 관리 (예: "인물용", "풍경용", "음식용")
   - 입력/출력:
     - 입력: 프로필명, 설명
     - 출력: 프로필 목록
   - 데이터 저장 여부: 필요 (프로필 메타데이터)

### 1.3 기술적 제약사항
- **AI 활용**: GPT-4 Vision (이미지 비교 분석) + Canvas API (실시간 이미지 처리)
- **플랫폼**: 웹 기반 반응형 디자인 (데스크톱/모바일/태블릿)
- **기술 스택 제한**:
  - Frontend: React + TypeScript (빠른 개발, 풍부한 에코시스템)
  - Backend: Node.js + Express (JavaScript 통합, 비동기 처리)
  - 이미지 처리: Canvas API + Sharp (서버사이드 최적화)
- **인프라**:
  - Frontend: Vercel (무료 SSL, CDN, 자동 배포)
  - Backend: Railway (무료 티어 500시간/월)
  - Database: Supabase (PostgreSQL, 무료 500MB)
  - Storage: Cloudinary (무료 25GB)

### 1.4 비즈니스 요구사항
- **수익화 전략**:
  - Phase 1: Google AdSense (배너 광고, 인터스티셜 광고)
  - Phase 2: 프리미엄 구독 (월 $9.99, 무제한 처리, 광고 제거, 고급 필터)
- **확장성 요구**:
  - 커스텀 AI 모델 파인튜닝 (사용자 데이터 기반)
  - 배치 처리 (여러 이미지 동시 보정)
  - 모바일 앱 (React Native)
- **예산 제약**:
  - 초기 비용: $0
  - 월 운영 비용: $50 이하 (OpenAI API $30, 인프라 $20)

### 1.5 비기능적 요구사항
- **성능**:
  - 이미지 분석: 3-5초 이내
  - 이미지 보정 적용: 2초 이내
  - 페이지 로딩: 1초 이내 (First Contentful Paint)
- **보안**:
  - HTTPS 강제
  - 업로드 이미지 자동 삭제 (24시간)
  - MIME 타입 + 매직 넘버 검증
  - Rate Limiting (IP당 시간당 50건)
  - CORS 설정 (허용된 도메인만)
- **접근성**:
  - 한국어/영어 다국어 지원
  - 모바일 최적화 (Touch-friendly UI)
  - 웹 접근성 (WCAG 2.1 AA 수준)

---

## [2. 프로젝트 완전 구성 결과물]

### **2.1 기술 스택 선정 및 근거**

#### 선정된 기술 스택
```
Frontend:
  - React 18.3.1 + TypeScript 5.3
  - Vite 5.0 (빌드 도구)
  - TailwindCSS 3.4 (스타일링)
  - React Query 5.0 (서버 상태 관리)
  - Zustand 4.4 (클라이언트 상태 관리)

Backend:
  - Node.js 20 LTS
  - Express 4.18
  - TypeScript 5.3
  - Multer 1.4 (파일 업로드)
  - Sharp 0.33 (이미지 처리)

Database:
  - PostgreSQL 15 (Supabase)
  - Prisma 5.8 (ORM)

AI/ML:
  - OpenAI GPT-4 Vision API
  - Canvas API (클라이언트 사이드 이미지 처리)

Storage:
  - Cloudinary (이미지 호스팅)

Hosting:
  - Vercel (Frontend)
  - Railway (Backend)

Monitoring:
  - Sentry (에러 트래킹)
  - Google Analytics 4

Other:
  - Redis (Railway, 캐싱)
  - Jest + React Testing Library (테스트)
  - Docker + Docker Compose (로컬 개발)
```

#### 선정 근거

**Frontend 선택 이유**:
- React: 컴포넌트 재사용성, 대규모 에코시스템, 빠른 개발
- Vite: Webpack 대비 10배 빠른 HMR, 작은 번들 크기
- TailwindCSS: 빠른 UI 개발, 일관된 디자인 시스템
- React Query: 서버 데이터 캐싱, 자동 재검증, 낙관적 업데이트
- TypeScript: 타입 안정성, IDE 지원, 리팩토링 용이성

**Backend 선택 이유**:
- Node.js: 비동기 I/O 처리에 최적, Frontend와 동일 언어
- Express: 가볍고 유연한 프레임워크, 미들웨어 생태계
- Sharp: 네이티브 라이브러리로 빠른 이미지 처리 (libvips 기반)
- Prisma: 타입 안전 ORM, 자동 마이그레이션

**AI 모델 선택 이유**:
- GPT-4 Vision: 이미지 비교 분석에 탁월한 성능
- Canvas API: 브라우저 네이티브, 추가 비용 없음, 실시간 미리보기

**Database 선택 이유**:
- PostgreSQL: JSONB 지원 (보정 파라미터 저장), 확장성
- Supabase: 무료 티어, 실시간 기능, 자동 백업, Row Level Security

**인프라 선택 이유**:
- Vercel: 자동 SSL, Edge CDN, GitHub 통합, 무료 배포
- Railway: 간편한 배포, PostgreSQL + Redis 통합, 무료 500시간
- Cloudinary: 자동 이미지 최적화, CDN, 무료 25GB

#### 비용 분석

| 항목 | 무료 티어 범위 | 예상 월 비용 (월 1만 사용자) |
|------|---------------|----------------------------|
| OpenAI API (GPT-4 Vision) | N/A | $30 (5,000건 × $0.006/건) |
| Vercel (Frontend) | 무제한 대역폭 | $0 |
| Railway (Backend) | 500시간/월 | $5 (추가 시간) |
| Supabase (Database) | 500MB, 2GB 대역폭 | $0 |
| Cloudinary (Storage) | 25GB, 25GB 대역폭 | $0 |
| Sentry (Monitoring) | 5,000 에러/월 | $0 |
| **합계** | **$0 (초기)** | **$35/월** |

*주: 사용자 증가 시 Railway Pro ($20/월), Supabase Pro ($25/월) 전환 고려*

---

### **2.2 시스템 아키텍처**

#### 전체 구조도
```
                    [사용자]
                       ↓ (HTTPS)
                 [Vercel CDN]
                       ↓
            ┌──────────┴──────────┐
            │   React Frontend    │
            │  (Vite + TypeScript)│
            └──────────┬──────────┘
                       ↓ (REST API)
            ┌──────────┴──────────┐
            │  Express Backend    │
            │   (Railway)         │
            └─┬────────┬────────┬─┘
              │        │        │
              ↓        ↓        ↓
        [OpenAI]  [Supabase]  [Redis]
        [Vision]   [PostgreSQL] [Cache]
              │        │
              ↓        ↓
        [Cloudinary Storage]
```

#### 데이터 플로우

**[기능 1: 보정 스타일 학습] 처리 흐름**:
```
1. 사용자 → Frontend: 원본 이미지 + 보정된 이미지 업로드
2. Frontend → 이미지 압축 (Browser-Image-Compression, 최대 2MB)
3. Frontend → Backend: POST /api/v1/training/analyze
   Body: { original_image: File, adjusted_image: File, profile_name: string }
4. Backend → Multer: 파일 검증 (타입, 크기)
5. Backend → Sharp: 이미지 리사이즈 (최대 1024x1024, 품질 유지)
6. Backend → Cloudinary: 임시 이미지 업로드 (public_id 생성)
7. Backend → OpenAI Vision API:
   Prompt: "Compare original and adjusted images. Extract adjustment parameters
           for brightness, contrast, saturation, hue, sharpness, temperature, tint.
           Return JSON: { brightness: float, contrast: float, ... }"
8. OpenAI → Backend: JSON 응답 (보정 파라미터)
9. Backend → Prisma: CorrectionProfile 생성
   {
     user_id: uuid,
     profile_name: string,
     parameters: JSONB,
     original_image_url: string,
     adjusted_image_url: string
   }
10. Backend → Redis: 프로필 캐싱 (key: `profile:${user_id}:${profile_id}`)
11. Backend → Frontend:
    Response: {
      profile_id: uuid,
      parameters: {...},
      preview_url: string
    }
12. Frontend → 사용자: 분석 결과 표시 (파라미터 시각화)
```

**[기능 2: 자동 보정 적용] 처리 흐름**:
```
1. 사용자 → Frontend: 원본 이미지 + 프로필 선택
2. Frontend → Backend: POST /api/v1/correction/apply
   Body: { image: File, profile_id: uuid }
3. Backend → Redis: 프로필 파라미터 조회 (캐시 히트 시 즉시 반환)
4. (캐시 미스) Backend → Prisma: CorrectionProfile 조회
5. Backend → 이미지 처리 워커:
   - Sharp 사용하여 서버사이드 처리
   - 파라미터 적용:
     * brightness: modulate({ brightness: value })
     * contrast: linear(a, b)
     * saturation: modulate({ saturation: value })
     * sharpness: sharpen({ sigma: value })
6. Backend → Cloudinary: 보정된 이미지 업로드 (24시간 TTL)
7. Backend → Frontend:
   Response: {
     corrected_image_url: string,
     applied_parameters: {...},
     processing_time_ms: number
   }
8. Frontend → Canvas API: 클라이언트 사이드 미세 조정 (선택적)
9. Frontend → 사용자: 보정 결과 표시 + 다운로드 버튼
```

**[기능 3: 프로필 관리] 처리 흐름**:
```
1. 사용자 → Frontend: 프로필 목록 요청
2. Frontend → Backend: GET /api/v1/profiles
3. Backend → Redis: 목록 캐시 조회
4. (캐시 미스) Backend → Prisma: CorrectionProfile.findMany()
5. Backend → Frontend: Array<ProfileSummary>
6. 사용자 → 프로필 삭제/수정:
   DELETE /api/v1/profiles/:id
   PATCH /api/v1/profiles/:id
```

#### 비동기 처리 전략
```
[큐 시스템 - BullMQ + Redis]

Queue: image-processing
Workers: 2개 (동시 처리)

Job Types:
1. analyze-adjustment (우선순위: 높음)
2. apply-correction (우선순위: 보통)
3. cleanup-expired (우선순위: 낮음, 매 1시간 실행)

Flow:
Request → API → Job 생성 → Redis Queue → Worker → DB 업데이트 → WebSocket 알림
```

---

### **2.3 데이터베이스 설계**

#### ERD (Entity-Relationship Diagram)
```
┌─────────────────────┐
│      users          │
├─────────────────────┤
│ id (PK, UUID)       │◄────┐
│ email (unique)      │     │
│ created_at          │     │
│ preferences (JSONB) │     │
│ subscription_tier   │     │
└─────────────────────┘     │
                            │ 1:N
                            │
                   ┌────────┴────────────────┐
                   │  correction_profiles    │
                   ├─────────────────────────┤
                   │ id (PK, UUID)           │
                   │ user_id (FK)            │
                   │ profile_name            │
                   │ parameters (JSONB)      │◄────┐
                   │ original_image_url      │     │
                   │ adjusted_image_url      │     │
                   │ created_at              │     │
                   │ updated_at              │     │
                   └─────────────────────────┘     │
                                                   │ 1:N
                                                   │
                                          ┌────────┴────────────────┐
                                          │   correction_history    │
                                          ├─────────────────────────┤
                                          │ id (PK, UUID)           │
                                          │ profile_id (FK)         │
                                          │ original_image_url      │
                                          │ corrected_image_url     │
                                          │ processing_time_ms      │
                                          │ created_at              │
                                          └─────────────────────────┘
```

#### 스키마 정의 (Prisma Schema)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                String              @id @default(uuid())
  email             String?             @unique
  createdAt         DateTime            @default(now()) @map("created_at")
  preferences       Json?               @db.JsonB
  subscriptionTier  SubscriptionTier    @default(FREE) @map("subscription_tier")

  profiles          CorrectionProfile[]

  @@map("users")
}

enum SubscriptionTier {
  FREE
  PREMIUM
}

model CorrectionProfile {
  id                 String              @id @default(uuid())
  userId             String              @map("user_id")
  profileName        String              @map("profile_name")
  parameters         Json                @db.JsonB
  originalImageUrl   String              @map("original_image_url")
  adjustedImageUrl   String              @map("adjusted_image_url")
  createdAt          DateTime            @default(now()) @map("created_at")
  updatedAt          DateTime            @updatedAt @map("updated_at")

  user               User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  history            CorrectionHistory[]

  @@index([userId, createdAt(sort: Desc)])
  @@map("correction_profiles")
}

model CorrectionHistory {
  id                 String              @id @default(uuid())
  profileId          String              @map("profile_id")
  originalImageUrl   String              @map("original_image_url")
  correctedImageUrl  String              @map("corrected_image_url")
  processingTimeMs   Int                 @map("processing_time_ms")
  createdAt          DateTime            @default(now()) @map("created_at")

  profile            CorrectionProfile   @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId, createdAt(sort: Desc)])
  @@map("correction_history")
}

// 세션 저장 (선택적, JWT 대신 사용 시)
model Session {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  token     String   @unique
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([token])
  @@index([userId])
  @@map("sessions")
}
```

#### 인덱스 전략
```sql
-- 성능 최적화 인덱스
CREATE INDEX idx_profiles_user_created ON correction_profiles(user_id, created_at DESC);
CREATE INDEX idx_history_profile_created ON correction_history(profile_id, created_at DESC);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- JSONB 인덱스 (파라미터 검색 최적화)
CREATE INDEX idx_profiles_parameters ON correction_profiles USING GIN (parameters);
```

---

### **2.4 API 설계**

#### Base URL
```
Development: http://localhost:4000/api/v1
Production: https://api.autophotofix.com/api/v1
```

#### 공통 응답 형식
```typescript
// 성공 응답
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-01-07T10:30:00Z"
}

// 에러 응답
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid image format",
    "details": { ... }
  },
  "timestamp": "2026-01-07T10:30:00Z"
}
```

#### Endpoint 명세

---

**1. 보정 스타일 분석 API**

```http
POST /api/v1/training/analyze
Content-Type: multipart/form-data
Authorization: Bearer {token} (선택적)

Request Body:
{
  "original_image": File,        # JPG/PNG, 최대 10MB
  "adjusted_image": File,        # JPG/PNG, 최대 10MB
  "profile_name": "Portrait Style"  # 1-50자
}

Response (200 OK):
{
  "success": true,
  "data": {
    "profile_id": "550e8400-e29b-41d4-a716-446655440000",
    "profile_name": "Portrait Style",
    "detected_adjustments": {
      "brightness": 1.15,
      "contrast": 1.08,
      "saturation": 0.95,
      "hue": 5,
      "sharpness": 1.2,
      "temperature": 100,
      "tint": -10,
      "filters": ["denoise", "skin_smoothing"]
    },
    "confidence_score": 0.92,
    "analysis_time_ms": 3250,
    "preview_url": "https://res.cloudinary.com/.../preview.jpg"
  }
}

Error Responses:
400 Bad Request:
{
  "success": false,
  "error": {
    "code": "INVALID_FILE_FORMAT",
    "message": "Only JPG and PNG formats are supported",
    "details": { "supported_formats": ["image/jpeg", "image/png"] }
  }
}

413 Payload Too Large:
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File size exceeds 10MB limit",
    "details": { "max_size_bytes": 10485760 }
  }
}

429 Too Many Requests:
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Maximum 50 requests per hour",
    "details": {
      "retry_after_seconds": 1800,
      "limit": 50,
      "remaining": 0
    }
  }
}

503 Service Unavailable:
{
  "error": {
    "code": "AI_SERVICE_UNAVAILABLE",
    "message": "OpenAI API is temporarily unavailable",
    "details": { "retry_after_seconds": 60 }
  }
}
```

---

**2. 자동 보정 적용 API**

```http
POST /api/v1/correction/apply
Content-Type: multipart/form-data
Authorization: Bearer {token} (선택적)

Request Body:
{
  "image": File,                  # JPG/PNG, 최대 10MB
  "profile_id": "uuid" (optional) # 프로필 ID (없으면 최근 프로필 사용)
}

Response (200 OK):
{
  "success": true,
  "data": {
    "correction_id": "660e8400-e29b-41d4-a716-446655440001",
    "corrected_image_url": "https://res.cloudinary.com/.../corrected.jpg",
    "applied_adjustments": {
      "brightness": 1.15,
      "contrast": 1.08,
      ...
    },
    "processing_time_ms": 1250,
    "download_url": "https://api.autophotofix.com/download/660e8400...",
    "expires_at": "2026-01-08T10:30:00Z"  # 24시간 후
  }
}

Error Responses:
404 Not Found:
{
  "error": {
    "code": "PROFILE_NOT_FOUND",
    "message": "Correction profile not found"
  }
}
```

---

**3. 프로필 목록 조회 API**

```http
GET /api/v1/profiles
Authorization: Bearer {token}

Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 10, max: 50)
  - sort: "created_at" | "name" (default: "created_at")
  - order: "asc" | "desc" (default: "desc")

Response (200 OK):
{
  "success": true,
  "data": {
    "profiles": [
      {
        "id": "550e8400-...",
        "profile_name": "Portrait Style",
        "created_at": "2026-01-05T10:30:00Z",
        "usage_count": 23,
        "preview_image_url": "https://..."
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 10,
      "total_pages": 5
    }
  }
}
```

---

**4. 프로필 삭제 API**

```http
DELETE /api/v1/profiles/:profile_id
Authorization: Bearer {token}

Response (200 OK):
{
  "success": true,
  "data": {
    "message": "Profile deleted successfully"
  }
}
```

---

**5. 프로필 수정 API**

```http
PATCH /api/v1/profiles/:profile_id
Content-Type: application/json
Authorization: Bearer {token}

Request Body:
{
  "profile_name": "New Portrait Style"
}

Response (200 OK):
{
  "success": true,
  "data": {
    "id": "550e8400-...",
    "profile_name": "New Portrait Style",
    "updated_at": "2026-01-07T10:30:00Z"
  }
}
```

---

**6. 이미지 다운로드 API**

```http
GET /api/v1/download/:correction_id

Response (200 OK):
Content-Type: image/jpeg
Content-Disposition: attachment; filename="corrected_image.jpg"

[Binary Image Data]
```

---

#### Rate Limiting 정책

| 사용자 유형 | 시간당 제한 | 일일 제한 | 파일 크기 제한 |
|------------|-----------|---------|-------------|
| 익명 (IP 기반) | 10건 | 50건 | 5MB |
| 무료 사용자 | 50건 | 200건 | 10MB |
| 프리미엄 사용자 | 무제한 | 무제한 | 20MB |

---

### **2.5 완전한 프로젝트 구조**

```
autophotofix/
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   ├── manifest.json                # PWA 설정
│   │   ├── robots.txt
│   │   ├── favicon.ico
│   │   └── images/
│   │       ├── logo.svg
│   │       └── placeholder.png
│   │
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Loading.tsx
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   └── Modal.tsx
│   │   │   ├── ads/
│   │   │   │   ├── AdBanner.tsx         # Google AdSense 배너
│   │   │   │   └── AdInterstitial.tsx   # 전면 광고
│   │   │   ├── image/
│   │   │   │   ├── ImageUploader.tsx    # 드래그앤드롭 업로드
│   │   │   │   ├── ImageComparer.tsx    # 전/후 비교 슬라이더
│   │   │   │   ├── ImagePreview.tsx     # 미리보기
│   │   │   │   └── DownloadButton.tsx   # 다운로드
│   │   │   └── profile/
│   │   │       ├── ProfileCard.tsx      # 프로필 카드
│   │   │       ├── ProfileList.tsx      # 프로필 목록
│   │   │       └── ProfileSelector.tsx  # 프로필 선택
│   │   │
│   │   ├── pages/
│   │   │   ├── HomePage.tsx             # 랜딩 페이지
│   │   │   ├── TrainingPage.tsx         # 학습 페이지
│   │   │   ├── CorrectionPage.tsx       # 보정 페이지
│   │   │   ├── ProfilesPage.tsx         # 프로필 관리
│   │   │   └── NotFoundPage.tsx
│   │   │
│   │   ├── services/
│   │   │   ├── api.ts                   # Axios 인스턴스
│   │   │   ├── trainingApi.ts           # 학습 API
│   │   │   ├── correctionApi.ts         # 보정 API
│   │   │   └── profileApi.ts            # 프로필 API
│   │   │
│   │   ├── hooks/
│   │   │   ├── useImageUpload.ts        # 이미지 업로드 훅
│   │   │   ├── useImageProcessing.ts    # 이미지 처리 훅
│   │   │   ├── useProfiles.ts           # 프로필 관리 훅
│   │   │   └── useLocalStorage.ts       # 로컬 스토리지
│   │   │
│   │   ├── utils/
│   │   │   ├── imageCompression.ts      # 이미지 압축
│   │   │   ├── imageValidation.ts       # 파일 검증
│   │   │   ├── canvasProcessor.ts       # Canvas API 처리
│   │   │   └── formatters.ts            # 데이터 포맷팅
│   │   │
│   │   ├── store/
│   │   │   └── useAppStore.ts           # Zustand 스토어
│   │   │
│   │   ├── types/
│   │   │   ├── api.ts                   # API 타입
│   │   │   ├── image.ts                 # 이미지 타입
│   │   │   └── profile.ts               # 프로필 타입
│   │   │
│   │   ├── styles/
│   │   │   └── globals.css              # Tailwind 기본 스타일
│   │   │
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── .env.example
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── trainingController.ts    # 학습 API 컨트롤러
│   │   │   ├── correctionController.ts  # 보정 API 컨트롤러
│   │   │   └── profileController.ts     # 프로필 API 컨트롤러
│   │   │
│   │   ├── services/
│   │   │   ├── aiService.ts             # OpenAI Vision 통합
│   │   │   ├── imageService.ts          # Sharp 이미지 처리
│   │   │   ├── storageService.ts        # Cloudinary 통합
│   │   │   ├── cacheService.ts          # Redis 캐싱
│   │   │   └── queueService.ts          # BullMQ 작업 큐
│   │   │
│   │   ├── models/
│   │   │   └── index.ts                 # Prisma Client
│   │   │
│   │   ├── middleware/
│   │   │   ├── rateLimiter.ts           # Rate Limiting
│   │   │   ├── errorHandler.ts          # 에러 핸들링
│   │   │   ├── fileValidator.ts         # 파일 검증
│   │   │   ├── cors.ts                  # CORS 설정
│   │   │   └── auth.ts                  # JWT 인증 (선택적)
│   │   │
│   │   ├── routes/
│   │   │   ├── trainingRoutes.ts
│   │   │   ├── correctionRoutes.ts
│   │   │   ├── profileRoutes.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── config/
│   │   │   ├── database.ts              # Prisma 설정
│   │   │   ├── redis.ts                 # Redis 설정
│   │   │   ├── cloudinary.ts            # Cloudinary 설정
│   │   │   └── openai.ts                # OpenAI 설정
│   │   │
│   │   ├── utils/
│   │   │   ├── logger.ts                # Winston 로거
│   │   │   ├── validators.ts            # 입력 검증
│   │   │   └── errors.ts                # 커스텀 에러
│   │   │
│   │   ├── workers/
│   │   │   └── imageWorker.ts           # BullMQ 워커
│   │   │
│   │   ├── types/
│   │   │   ├── express.d.ts             # Express 확장 타입
│   │   │   └── index.ts
│   │   │
│   │   └── server.ts                    # Express 서버 진입점
│   │
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts                      # 시드 데이터
│   │
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── aiService.test.ts
│   │   │   ├── imageService.test.ts
│   │   │   └── validators.test.ts
│   │   ├── integration/
│   │   │   ├── training.test.ts
│   │   │   └── correction.test.ts
│   │   └── fixtures/
│   │       ├── original.jpg
│   │       └── adjusted.jpg
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js
│   └── .env.example
│
├── infrastructure/
│   ├── docker-compose.yml               # 로컬 개발 환경
│   ├── docker-compose.prod.yml          # 프로덕션 환경
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   ├── nginx.conf                       # Nginx 리버스 프록시
│   └── scripts/
│       ├── setup.sh                     # 초기 설정
│       ├── migrate.sh                   # DB 마이그레이션
│       └── seed.sh                      # 시드 데이터
│
├── docs/
│   ├── API.md                           # API 문서
│   ├── DEPLOYMENT.md                    # 배포 가이드
│   ├── ARCHITECTURE.md                  # 아키텍처 문서
│   ├── CONTRIBUTING.md                  # 기여 가이드
│   └── images/                          # 문서 이미지
│       ├── architecture-diagram.png
│       └── data-flow.png
│
├── .github/
│   ├── workflows/
│   │   ├── frontend-deploy.yml          # Vercel 자동 배포
│   │   ├── backend-deploy.yml           # Railway 자동 배포
│   │   ├── test.yml                     # CI 테스트
│   │   └── codeql.yml                   # 보안 스캔
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md
│       └── feature_request.md
│
├── .env.example
├── .gitignore
├── README.md
├── LICENSE
└── package.json                         # Root workspace
```

---

### **2.6 핵심 코드 구현**

#### 2.6.1 Frontend - 이미지 업로더 컴포넌트

```typescript
// frontend/src/components/image/ImageUploader.tsx
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import imageCompression from 'browser-image-compression';
import { validateImage } from '../../utils/imageValidation';
import { ImageFile, UploadError } from '../../types/image';

interface ImageUploaderProps {
  onUpload: (file: File) => void;
  maxSize?: number; // MB
  label: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUpload,
  maxSize = 10,
  label
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];

    // 파일 검증
    const validation = validateImage(file, maxSize);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    try {
      setCompressing(true);
      setError(null);

      // 이미지 압축 (2MB 이하로)
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/jpeg'
      });

      // 미리보기 생성
      const previewUrl = URL.createObjectURL(compressedFile);
      setPreview(previewUrl);

      onUpload(compressedFile);
    } catch (err) {
      setError('Failed to process image');
      console.error(err);
    } finally {
      setCompressing(false);
    }
  }, [maxSize, onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    maxFiles: 1,
    multiple: false
  });

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>

      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${compressing ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input {...getInputProps()} />

        {preview ? (
          <div className="space-y-4">
            <img
              src={preview}
              alt="Preview"
              className="max-h-64 mx-auto rounded-lg shadow-md"
            />
            <p className="text-sm text-gray-500">
              Click or drag to replace
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-gray-600">
              {isDragActive
                ? 'Drop the image here'
                : 'Drag & drop an image, or click to select'}
            </p>
            <p className="text-xs text-gray-500">
              JPG or PNG, up to {maxSize}MB
            </p>
          </div>
        )}

        {compressing && (
          <div className="mt-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-sm text-gray-500 mt-2">Compressing image...</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
};
```

#### 2.6.2 Frontend - 이미지 비교 컴포넌트

```typescript
// frontend/src/components/image/ImageComparer.tsx
import React, { useState, useRef, useEffect } from 'react';

interface ImageComparerProps {
  originalUrl: string;
  correctedUrl: string;
  className?: string;
}

export const ImageComparer: React.FC<ImageComparerProps> = ({
  originalUrl,
  correctedUrl,
  className = ''
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = (x / rect.width) * 100;

    setSliderPosition(Math.max(0, Math.min(100, percentage)));
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) handleMove(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && e.touches[0]) {
      handleMove(e.touches[0].clientX);
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden select-none ${className}`}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onMouseUp={handleMouseUp}
      onTouchEnd={handleMouseUp}
    >
      {/* Original Image (Right side) */}
      <div className="absolute inset-0">
        <img
          src={originalUrl}
          alt="Original"
          className="w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded-md text-sm">
          Original
        </div>
      </div>

      {/* Corrected Image (Left side, clipped) */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <img
          src={correctedUrl}
          alt="Corrected"
          className="w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute top-4 left-4 bg-blue-500 bg-opacity-90 text-white px-3 py-1 rounded-md text-sm">
          Corrected
        </div>
      </div>

      {/* Slider */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-10"
        style={{ left: `${sliderPosition}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center">
          <svg
            className="w-6 h-6 text-gray-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 9l4-4 4 4m0 6l-4 4-4-4"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
```

#### 2.6.3 Frontend - Training Page

```typescript
// frontend/src/pages/TrainingPage.tsx
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ImageUploader } from '../components/image/ImageUploader';
import { AdBanner } from '../components/ads/AdBanner';
import { analyzeImages } from '../services/trainingApi';
import { useNavigate } from 'react-router-dom';
import type { AnalysisResult } from '../types/api';

export const TrainingPage: React.FC = () => {
  const navigate = useNavigate();
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [adjustedImage, setAdjustedImage] = useState<File | null>(null);
  const [profileName, setProfileName] = useState('');

  const analyzeMutation = useMutation({
    mutationFn: analyzeImages,
    onSuccess: (data: AnalysisResult) => {
      navigate('/profiles', {
        state: {
          newProfile: data,
          message: 'Profile created successfully!'
        }
      });
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Analysis failed');
    }
  });

  const handleSubmit = () => {
    if (!originalImage || !adjustedImage || !profileName) {
      alert('Please upload both images and enter a profile name');
      return;
    }

    analyzeMutation.mutate({
      originalImage,
      adjustedImage,
      profileName
    });
  };

  const canSubmit = originalImage && adjustedImage && profileName.trim();
  const isLoading = analyzeMutation.isPending;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Train Your Style
        </h1>
        <p className="text-lg text-gray-600">
          Upload an original and edited photo to teach our AI your editing style
        </p>
      </div>

      {/* Ad Banner */}
      <div className="mb-8">
        <AdBanner slot="training-top-banner" format="horizontal" />
      </div>

      {/* Upload Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <ImageUploader
          label="1. Original Image"
          onUpload={setOriginalImage}
        />

        <ImageUploader
          label="2. Edited Image (your style)"
          onUpload={setAdjustedImage}
        />
      </div>

      {/* Profile Name Input */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          3. Name Your Style Profile
        </label>
        <input
          type="text"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="e.g., Portrait Style, Sunset Vibes"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          maxLength={50}
        />
        <p className="mt-1 text-sm text-gray-500">
          {profileName.length}/50 characters
        </p>
      </div>

      {/* Submit Button */}
      <div className="flex justify-center">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isLoading}
          className={`
            px-8 py-4 rounded-lg font-semibold text-lg transition-all
            ${canSubmit && !isLoading
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Analyzing... (this may take 3-5 seconds)
            </span>
          ) : (
            'Analyze & Create Profile'
          )}
        </button>
      </div>

      {/* How It Works */}
      <div className="mt-16 bg-gray-50 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
              <span className="text-blue-600 font-bold text-xl">1</span>
            </div>
            <h3 className="font-semibold mb-2">Upload Photos</h3>
            <p className="text-gray-600 text-sm">
              Provide an original photo and your edited version
            </p>
          </div>

          <div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
              <span className="text-blue-600 font-bold text-xl">2</span>
            </div>
            <h3 className="font-semibold mb-2">AI Analysis</h3>
            <p className="text-gray-600 text-sm">
              Our AI compares the images and learns your editing parameters
            </p>
          </div>

          <div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
              <span className="text-blue-600 font-bold text-xl">3</span>
            </div>
            <h3 className="font-semibold mb-2">Save Profile</h3>
            <p className="text-gray-600 text-sm">
              Your style is saved and ready to apply to any photo
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
```

#### 2.6.4 Backend - AI Service

```typescript
// backend/src/services/aiService.ts
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert photo editor analyzer. Compare two images and identify
                     the exact editing adjustments made. Return ONLY a JSON object with these fields:
                     - brightness: float (0.5 to 2.0, where 1.0 is unchanged)
                     - contrast: float (0.5 to 2.0)
                     - saturation: float (0.0 to 2.0)
                     - hue: integer (-180 to 180)
                     - sharpness: float (0.0 to 3.0)
                     - temperature: integer (-100 to 100, blue to yellow)
                     - tint: integer (-100 to 100, green to magenta)
                     - filters: array of strings (e.g., ["denoise", "skin_smoothing", "vignette"])

                     Be precise and only include filters that are clearly visible.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze the differences between these original and edited images. Identify all adjustments made."
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${originalImageBase64}` }
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${adjustedImageBase64}` }
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3, // 일관성을 위해 낮은 온도
        max_tokens: 500
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const parameters = JSON.parse(content) as AdjustmentParameters;

      // 파라미터 검증 및 정규화
      const validated = this.validateParameters(parameters);

      const processingTime = Date.now() - startTime;
      logger.info('AI analysis completed', {
        processingTime,
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
   * 파라미터 검증 및 정규화
   */
  private validateParameters(params: any): AdjustmentParameters {
    return {
      brightness: this.clamp(params.brightness || 1.0, 0.5, 2.0),
      contrast: this.clamp(params.contrast || 1.0, 0.5, 2.0),
      saturation: this.clamp(params.saturation || 1.0, 0.0, 2.0),
      hue: Math.round(this.clamp(params.hue || 0, -180, 180)),
      sharpness: this.clamp(params.sharpness || 1.0, 0.0, 3.0),
      temperature: Math.round(this.clamp(params.temperature || 0, -100, 100)),
      tint: Math.round(this.clamp(params.tint || 0, -100, 100)),
      filters: Array.isArray(params.filters)
        ? params.filters.filter((f: any) => typeof f === 'string')
        : []
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 신뢰도 점수 계산 (실제 구현에서는 더 정교한 로직 필요)
   */
  calculateConfidenceScore(params: AdjustmentParameters): number {
    // 파라미터가 기본값(1.0 또는 0)에서 얼마나 벗어났는지 측정
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

    // 편차가 클수록 신뢰도 높음 (명확한 변화)
    // 0.6 ~ 0.95 범위로 정규화
    return Math.min(0.95, 0.6 + avgDeviation * 0.7);
  }
}

export const aiService = new AIService();
```

#### 2.6.5 Backend - Image Service

```typescript
// backend/src/services/imageService.ts
import sharp from 'sharp';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';

export class ImageService {
  /**
   * 이미지 리사이즈 및 최적화
   */
  async optimizeImage(
    buffer: Buffer,
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 85
  ): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality, progressive: true })
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
      let pipeline = sharp(buffer);

      // Brightness & Contrast (modulate)
      pipeline = pipeline.modulate({
        brightness: parameters.brightness,
        saturation: parameters.saturation
      });

      // Contrast (linear transformation)
      if (parameters.contrast !== 1.0) {
        const a = parameters.contrast;
        const b = (1 - parameters.contrast) * 128;
        pipeline = pipeline.linear(a, b);
      }

      // Hue rotation
      if (parameters.hue !== 0) {
        pipeline = pipeline.modulate({
          hue: parameters.hue
        });
      }

      // Sharpness
      if (parameters.sharpness > 1.0) {
        const sigma = (parameters.sharpness - 1.0) * 1.5;
        pipeline = pipeline.sharpen({ sigma });
      }

      // Temperature & Tint (실제로는 색상 매트릭스 변환 필요)
      if (parameters.temperature !== 0 || parameters.tint !== 0) {
        pipeline = this.applyColorTemperature(
          pipeline,
          parameters.temperature,
          parameters.tint
        );
      }

      // Filters
      for (const filter of parameters.filters) {
        pipeline = this.applyFilter(pipeline, filter);
      }

      return await pipeline
        .jpeg({ quality: 90, progressive: true })
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
   * 색온도 및 틴트 적용 (간소화된 버전)
   */
  private applyColorTemperature(
    pipeline: sharp.Sharp,
    temperature: number,
    tint: number
  ): sharp.Sharp {
    // 색온도: 음수는 파란색, 양수는 노란색
    // 틴트: 음수는 초록색, 양수는 마젠타

    const tempFactor = temperature / 100;
    const tintFactor = tint / 100;

    // RGB 채널별 조정 (간단한 선형 변환)
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
   * 필터 적용
   */
  private applyFilter(pipeline: sharp.Sharp, filter: string): sharp.Sharp {
    switch (filter) {
      case 'denoise':
        return pipeline.median(3);

      case 'vignette':
        // Vignette는 복잡하므로 간단한 버전만
        return pipeline.composite([{
          input: Buffer.from(
            '<svg><rect width="100%" height="100%" fill="black" opacity="0.3"/></svg>'
          ),
          blend: 'multiply'
        }]);

      case 'blur':
        return pipeline.blur(2);

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
```

#### 2.6.6 Backend - Training Controller

```typescript
// backend/src/controllers/trainingController.ts
import { Request, Response, NextFunction } from 'express';
import { aiService } from '../services/aiService';
import { imageService } from '../services/imageService';
import { storageService } from '../services/storageService';
import { cacheService } from '../services/cacheService';
import { prisma } from '../models';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';

export class TrainingController {
  /**
   * POST /api/v1/training/analyze
   * 원본 및 보정 이미지 분석
   */
  async analyze(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    try {
      // 파일 검증
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.original_image || !files?.adjusted_image) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FILES',
            message: 'Both original and adjusted images are required'
          }
        });
      }

      const originalFile = files.original_image[0];
      const adjustedFile = files.adjusted_image[0];
      const profileName = req.body.profile_name?.trim();

      if (!profileName || profileName.length > 50) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROFILE_NAME',
            message: 'Profile name must be 1-50 characters'
          }
        });
      }

      // 사용자 ID (세션 또는 익명 ID)
      const userId = req.session?.userId || req.ip;

      // 이미지 최적화
      const [originalOptimized, adjustedOptimized] = await Promise.all([
        imageService.optimizeImage(originalFile.buffer),
        imageService.optimizeImage(adjustedFile.buffer)
      ]);

      // Cloudinary 업로드 (24시간 TTL)
      const [originalUrl, adjustedUrl] = await Promise.all([
        storageService.upload(originalOptimized, {
          folder: 'training/originals',
          expiresIn: 86400 // 24시간
        }),
        storageService.upload(adjustedOptimized, {
          folder: 'training/adjusted',
          expiresIn: 86400
        })
      ]);

      // Base64 인코딩 (AI 분석용)
      const [originalBase64, adjustedBase64] = await Promise.all([
        imageService.toBase64(originalOptimized),
        imageService.toBase64(adjustedOptimized)
      ]);

      // AI 분석
      const parameters = await aiService.analyzeImageAdjustments(
        originalBase64,
        adjustedBase64
      );

      // 신뢰도 점수 계산
      const confidenceScore = aiService.calculateConfidenceScore(parameters);

      // 데이터베이스 저장
      const profile = await prisma.correctionProfile.create({
        data: {
          userId: userId as string,
          profileName,
          parameters: parameters as any,
          originalImageUrl: originalUrl,
          adjustedImageUrl: adjustedUrl
        }
      });

      // Redis 캐싱
      await cacheService.set(
        `profile:${userId}:${profile.id}`,
        parameters,
        3600 // 1시간
      );

      const processingTime = Date.now() - startTime;

      logger.info('Training analysis completed', {
        profileId: profile.id,
        userId,
        processingTime
      });

      return res.status(200).json({
        success: true,
        data: {
          profile_id: profile.id,
          profile_name: profileName,
          detected_adjustments: parameters,
          confidence_score: confidenceScore,
          analysis_time_ms: processingTime,
          preview_url: adjustedUrl
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Training analysis failed', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }
}

export const trainingController = new TrainingController();
```

#### 2.6.7 Backend - Server Setup

```typescript
// backend/src/server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { trainingRoutes } from './routes/trainingRoutes';
import { correctionRoutes } from './routes/correctionRoutes';
import { profileRoutes } from './routes/profileRoutes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 4000;

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    }
  }
});

app.use('/api', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/v1/training', trainingRoutes);
app.use('/api/v1/correction', correctionRoutes);
app.use('/api/v1/profiles', profileRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found'
    }
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
```

---

**(계속됩니다 - Part 2로...)**
