# AutoPhotoFix - 프로젝트 설계 (Part 2)

## 계속...

### **2.7 Google AdSense 통합 전략**

#### 2.7.1 광고 배치 계획

```
[페이지별 광고 배치]

┌─────────────────────────────────────────┐
│         Training Page                   │
├─────────────────────────────────────────┤
│  [ Top Banner - 728x90 / 320x50 ]      │  ← 페이지 상단
│                                         │
│  [이미지 업로드 섹션]                    │
│                                         │
│  [ Sidebar Ad - 300x600 ]  (데스크톱)    │  ← 우측 사이드바
│                                         │
│  [ How It Works 섹션 ]                  │
│                                         │
│  [ Bottom Banner - 728x90 ]             │  ← 페이지 하단
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│      Correction Page                    │
├─────────────────────────────────────────┤
│  [ Top Banner ]                         │
│                                         │
│  [이미지 업로드]                         │
│                                         │
│  [처리 중...]                            │
│  ├→ [ Interstitial Ad ]                 │  ← 처리 대기 시 (3초 이상)
│                                         │
│  [결과 표시]                             │
│  ├→ [ In-Feed Ad - 336x280 ]            │  ← 결과 하단
│                                         │
│  [다운로드 버튼]                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│       Profiles Page                     │
├─────────────────────────────────────────┤
│  [ Top Banner ]                         │
│                                         │
│  [프로필 카드 1]                         │
│  [프로필 카드 2]                         │
│  [ In-Feed Ad ]                         │  ← 3개마다 삽입
│  [프로필 카드 3]                         │
│  [프로필 카드 4]                         │
│  [ In-Feed Ad ]                         │
└─────────────────────────────────────────┘
```

#### 2.7.2 구현 코드

```typescript
// frontend/src/components/ads/AdBanner.tsx
import React, { useEffect, useRef } from 'react';

interface AdBannerProps {
  slot: string;
  format?: 'auto' | 'horizontal' | 'vertical' | 'rectangle';
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({
  slot,
  format = 'auto',
  className = ''
}) => {
  const adRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    try {
      // Google AdSense 스크립트 로드 확인
      if (typeof window !== 'undefined') {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      }
    } catch (err) {
      console.error('AdSense loading error:', err);
    }
  }, []);

  // 개발 환경에서는 플레이스홀더 표시
  if (process.env.NODE_ENV === 'development') {
    return (
      <div className={`bg-gray-200 border-2 border-dashed border-gray-400 rounded-lg p-4 text-center ${className}`}>
        <p className="text-gray-600 font-mono text-sm">
          [AdSense: {slot}]
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Format: {format}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={process.env.REACT_APP_ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
};
```

```typescript
// frontend/src/components/ads/AdInterstitial.tsx
import React, { useEffect, useState } from 'react';

interface AdInterstitialProps {
  show: boolean;
  onClose: () => void;
  minDisplayTime?: number; // milliseconds
}

export const AdInterstitial: React.FC<AdInterstitialProps> = ({
  show,
  onClose,
  minDisplayTime = 5000
}) => {
  const [canClose, setCanClose] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (show) {
      setCanClose(false);
      setCountdown(Math.ceil(minDisplayTime / 1000));

      // 카운트다운
      const countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            setCanClose(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(countdownInterval);
    }
  }, [show, minDisplayTime]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full relative">
        {/* Close Button */}
        {canClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 bg-gray-800 hover:bg-gray-900 text-white rounded-full flex items-center justify-center transition-colors z-10"
            aria-label="Close ad"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {!canClose && (
          <div className="absolute top-4 right-4 w-10 h-10 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center font-bold">
            {countdown}
          </div>
        )}

        {/* Ad Content */}
        <div className="p-8">
          <p className="text-xs text-gray-500 mb-4 text-center">Advertisement</p>

          {process.env.NODE_ENV === 'development' ? (
            <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-16 text-center">
              <p className="text-gray-600 font-mono">
                [Interstitial Ad Placeholder]
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Close in {countdown} seconds
              </p>
            </div>
          ) : (
            <ins
              className="adsbygoogle"
              style={{ display: 'block' }}
              data-ad-client={process.env.REACT_APP_ADSENSE_CLIENT}
              data-ad-slot={process.env.REACT_APP_ADSENSE_INTERSTITIAL_SLOT}
              data-ad-format="auto"
              data-full-width-responsive="true"
            />
          )}
        </div>
      </div>
    </div>
  );
};
```

```html
<!-- frontend/public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoPhotoFix - AI Photo Correction</title>

  <!-- Google AdSense -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
          crossorigin="anonymous"></script>

  <!-- Meta Tags for SEO -->
  <meta name="description" content="Train AI to learn your photo editing style and automatically apply it to any image">
  <meta name="keywords" content="photo editing, AI, automatic correction, image processing">

  <!-- Open Graph -->
  <meta property="og:title" content="AutoPhotoFix - AI Photo Correction">
  <meta property="og:description" content="Train AI to learn your editing style">
  <meta property="og:type" content="website">

  <link rel="icon" href="/favicon.ico">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

#### 2.7.3 광고 정책 준수 체크리스트

```markdown
✅ **필수 준수 사항**

1. 콘텐츠 정책
   - [ ] 성인 콘텐츠 필터링 (이미지 업로드 시 AI 검증)
   - [ ] 저작권 침해 콘텐츠 차단
   - [ ] 폭력적/혐오 콘텐츠 감지 및 거부

2. 사용자 경험
   - [ ] 광고와 콘텐츠 명확히 구분 (최소 150px 간격)
   - [ ] 광고 클릭 강요 금지 (기능 접근 차단 금지)
   - [ ] 실수 클릭 유도 금지 (버튼 근처 광고 배치 금지)
   - [ ] 페이지당 광고 개수 제한 (최대 3개)

3. 투명성
   - [ ] 개인정보 처리방침 페이지 작성
   - [ ] 쿠키 정책 공지
   - [ ] 광고 표시 명시 ("Advertisement" 라벨)

4. 기술 요구사항
   - [ ] HTTPS 사용
   - [ ] 모바일 반응형 광고
   - [ ] 광고 로딩 실패 시 graceful degradation
```

#### 2.7.4 예상 수익 분석

```
[가정]
- 일일 사용자: 100명 (초기) → 300명 (3개월) → 1,000명 (6개월)
- 페이지뷰당 광고 노출: 2.5개
- CTR (Click-Through Rate): 1.5%
- CPC (Cost Per Click): $0.30

[계산]
초기 (일 100명):
  - 일일 광고 노출: 100 × 2.5 × 3 (페이지) = 750 impressions
  - 일일 클릭: 750 × 1.5% = 11.25 clicks
  - 일일 수익: 11.25 × $0.30 = $3.38
  - 월 수익: $3.38 × 30 = $101

3개월 (일 300명):
  - 월 수익: $303

6개월 (일 1,000명):
  - 일일 광고 노출: 1,000 × 2.5 × 3 = 7,500 impressions
  - 일일 클릭: 112.5 clicks
  - 일일 수익: $33.75
  - 월 수익: $1,012

*실제 수익은 변동 가능. 프리미엄 구독 모델 병행 권장*
```

---

### **2.8 배포 가이드**

#### 2.8.1 환경 변수 설정

```bash
# frontend/.env.production
VITE_API_URL=https://api.autophotofix.com
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_ADSENSE_TOP_BANNER_SLOT=1234567890
VITE_ADSENSE_INTERSTITIAL_SLOT=0987654321
VITE_ANALYTICS_ID=G-XXXXXXXXXX
```

```bash
# backend/.env
NODE_ENV=production
PORT=4000

# Database
DATABASE_URL=postgresql://user:password@hostname:5432/autophotofix?schema=public

# Redis
REDIS_URL=redis://default:password@hostname:6379

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your-api-secret

# Security
JWT_SECRET=your-super-secret-key-change-this
ALLOWED_ORIGINS=https://autophotofix.com,https://www.autophotofix.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=50

# Sentry (Error Tracking)
SENTRY_DSN=https://...@sentry.io/...
```

#### 2.8.2 Vercel 배포 (Frontend)

```bash
# 1. Vercel CLI 설치
npm install -g vercel

# 2. 프로젝트 루트에서 배포
cd frontend
vercel --prod

# 3. 환경 변수 설정 (Vercel Dashboard에서)
# Settings > Environment Variables
# - VITE_API_URL
# - VITE_ADSENSE_CLIENT
# - 등...
```

```json
// frontend/vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

#### 2.8.3 Railway 배포 (Backend)

```bash
# 1. Railway CLI 설치
npm install -g @railway/cli

# 2. Railway 로그인
railway login

# 3. 새 프로젝트 생성
railway init

# 4. PostgreSQL 추가
railway add --database postgresql

# 5. Redis 추가
railway add --database redis

# 6. 환경 변수 설정
railway variables set OPENAI_API_KEY=sk-...
railway variables set CLOUDINARY_CLOUD_NAME=...
# (모든 환경 변수 설정)

# 7. 배포
cd backend
railway up
```

```json
// backend/railway.json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  },
  "healthcheck": {
    "path": "/health",
    "timeout": 10,
    "interval": 30
  }
}
```

```json
// backend/package.json (scripts)
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "migrate": "prisma migrate deploy",
    "postinstall": "prisma generate",
    "test": "jest",
    "test:watch": "jest --watch"
  }
}
```

#### 2.8.4 데이터베이스 마이그레이션

```bash
# Railway에서 DATABASE_URL 복사 후

# 로컬에서 마이그레이션 실행
DATABASE_URL="postgresql://..." npx prisma migrate deploy

# 또는 Railway CLI에서
railway run npx prisma migrate deploy

# 시드 데이터 (선택적)
railway run npx prisma db seed
```

#### 2.8.5 도메인 연결

```bash
# Vercel (Frontend)
# 1. Vercel Dashboard > Settings > Domains
# 2. 도메인 추가: autophotofix.com, www.autophotofix.com
# 3. DNS 레코드 설정:
#    A     @       76.76.21.21
#    CNAME www     cname.vercel-dns.com

# Railway (Backend)
# 1. Railway Dashboard > Settings > Networking
# 2. 커스텀 도메인 추가: api.autophotofix.com
# 3. DNS 레코드:
#    CNAME api     <your-app>.up.railway.app
```

#### 2.8.6 SSL 인증서

```
✅ Vercel: 자동 SSL 인증서 (Let's Encrypt)
✅ Railway: 자동 SSL 인증서
```

---

### **2.9 성능 최적화 전략**

#### 2.9.1 Frontend 최적화

| 최적화 항목 | 구현 방법 | 예상 효과 |
|------------|----------|----------|
| **코드 스플리팅** | React.lazy() + Suspense | 초기 번들 크기 40% 감소 |
| **이미지 압축** | browser-image-compression | 업로드 시간 70% 단축 |
| **레이지 로딩** | Intersection Observer API | 페이지 로딩 50% 빨라짐 |
| **CDN 캐싱** | Vercel Edge Network | 글로벌 응답 속도 3배 향상 |
| **Web Workers** | 이미지 처리 오프로드 | UI 블로킹 100% 제거 |
| **PWA** | Service Worker 캐싱 | 재방문 시 즉시 로딩 |

```typescript
// frontend/src/App.tsx - Code Splitting
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Loading } from './components/common/Loading';

// Lazy load pages
const HomePage = lazy(() => import('./pages/HomePage'));
const TrainingPage = lazy(() => import('./pages/TrainingPage'));
const CorrectionPage = lazy(() => import('./pages/CorrectionPage'));
const ProfilesPage = lazy(() => import('./pages/ProfilesPage'));

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/correction" element={<CorrectionPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
```

```typescript
// frontend/src/utils/imageWorker.ts
// Web Worker for image processing
export const processImageInWorker = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/imageProcessor.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.postMessage({ file });

    worker.onmessage = (e) => {
      resolve(e.data.result);
      worker.terminate();
    };

    worker.onerror = (error) => {
      reject(error);
      worker.terminate();
    };
  });
};
```

#### 2.9.2 Backend 최적화

```typescript
// backend/src/services/cacheService.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await redis.setex(key, ttl, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await redis.del(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export const cacheService = new CacheService();
```

```typescript
// backend/src/middleware/cacheMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cacheService';

export const cacheMiddleware = (ttl: number = 3600) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // GET 요청만 캐싱
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `cache:${req.originalUrl}`;
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    // 응답을 가로채서 캐싱
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      cacheService.set(cacheKey, body, ttl);
      return originalJson(body);
    };

    next();
  };
};
```

#### 2.9.3 데이터베이스 최적화

```typescript
// backend/src/services/queueService.ts
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);

// 작업 큐 생성
export const imageProcessingQueue = new Queue('image-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});

// 워커 생성
const worker = new Worker(
  'image-processing',
  async (job) => {
    const { type, data } = job.data;

    switch (type) {
      case 'analyze':
        return await processAnalysis(data);
      case 'correct':
        return await processCorrection(data);
      case 'cleanup':
        return await cleanupExpiredImages();
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  },
  {
    connection,
    concurrency: 2 // 동시 처리 작업 수
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
```

---

### **2.10 보안 체크리스트**

#### 2.10.1 파일 업로드 보안

```typescript
// backend/src/middleware/fileValidator.ts
import multer from 'multer';
import { Request } from 'express';
import fileType from 'file-type';

// MIME 타입 화이트리스트
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

// 매직 넘버 검증
const validateFileContent = async (buffer: Buffer): Promise<boolean> => {
  const type = await fileType.fromBuffer(buffer);
  return type ? ALLOWED_MIME_TYPES.includes(type.mime) : false;
};

// Multer 설정
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 2
  },
  fileFilter: async (req: Request, file: Express.Multer.File, cb) => {
    // MIME 타입 1차 검증
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPG and PNG allowed.'));
    }

    cb(null, true);
  }
});

// 파일 콘텐츠 검증 미들웨어
export const validateFileContentMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  for (const fieldname in files) {
    for (const file of files[fieldname]) {
      const isValid = await validateFileContent(file.buffer);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FILE_CONTENT',
            message: 'File content does not match declared type'
          }
        });
      }
    }
  }

  next();
};
```

#### 2.10.2 Rate Limiting

```typescript
// backend/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// API별 Rate Limit 설정
export const trainingLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:training:'
  }),
  windowMs: 60 * 60 * 1000, // 1시간
  max: 20, // 20건
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Maximum 20 training requests per hour'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const correctionLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:correction:'
  }),
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Maximum 50 correction requests per hour'
    }
  }
});
```

#### 2.10.3 콘텐츠 안전 필터

```typescript
// backend/src/services/contentModerationService.ts
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class ContentModerationService {
  /**
   * 이미지 안전성 검사 (성인/폭력/혐오 콘텐츠)
   */
  async moderateImage(imageBase64: string): Promise<boolean> {
    try {
      const response = await openai.moderations.create({
        input: imageBase64
      });

      const flagged = response.results[0].flagged;

      if (flagged) {
        const categories = response.results[0].categories;
        console.warn('Content moderation flagged:', categories);
      }

      return !flagged; // true = 안전, false = 부적절

    } catch (error) {
      console.error('Content moderation failed:', error);
      // 에러 시 안전하게 거부
      return false;
    }
  }
}

export const contentModerationService = new ContentModerationService();
```

#### 2.10.4 보안 헤더

```typescript
// backend/src/server.ts
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
      scriptSrc: ["'self'", 'https://pagead2.googlesyndication.com'],
      connectSrc: ["'self'", 'https://api.autophotofix.com']
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true
}));
```

---

### **2.11 테스트 전략**

#### 2.11.1 단위 테스트 (Unit Tests)

```typescript
// backend/tests/unit/aiService.test.ts
import { aiService } from '../../src/services/aiService';

describe('AIService', () => {
  describe('analyzeImageAdjustments', () => {
    it('should detect brightness increase', async () => {
      const originalBase64 = 'data:image/jpeg;base64,...';
      const brighterBase64 = 'data:image/jpeg;base64,...';

      const result = await aiService.analyzeImageAdjustments(
        originalBase64,
        brighterBase64
      );

      expect(result.brightness).toBeGreaterThan(1.0);
      expect(result.brightness).toBeLessThanOrEqual(2.0);
    });

    it('should handle API errors gracefully', async () => {
      const invalidBase64 = 'invalid';

      await expect(
        aiService.analyzeImageAdjustments(invalidBase64, invalidBase64)
      ).rejects.toThrow();
    });
  });

  describe('validateParameters', () => {
    it('should clamp out-of-range values', () => {
      const params = {
        brightness: 5.0, // 범위 초과
        contrast: -1.0,  // 음수
        saturation: 1.0,
        hue: 0,
        sharpness: 1.0,
        temperature: 0,
        tint: 0,
        filters: []
      };

      const validated = (aiService as any).validateParameters(params);

      expect(validated.brightness).toBe(2.0);
      expect(validated.contrast).toBe(0.5);
    });
  });
});
```

#### 2.11.2 통합 테스트 (Integration Tests)

```typescript
// backend/tests/integration/training.test.ts
import request from 'supertest';
import app from '../../src/server';
import { prisma } from '../../src/models';

describe('POST /api/v1/training/analyze', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should analyze images and return profile', async () => {
    const response = await request(app)
      .post('/api/v1/training/analyze')
      .field('profile_name', 'Test Profile')
      .attach('original_image', 'tests/fixtures/original.jpg')
      .attach('adjusted_image', 'tests/fixtures/adjusted.jpg');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('profile_id');
    expect(response.body.data).toHaveProperty('detected_adjustments');
    expect(response.body.data.confidence_score).toBeGreaterThan(0);
  });

  it('should reject invalid file types', async () => {
    const response = await request(app)
      .post('/api/v1/training/analyze')
      .field('profile_name', 'Test')
      .attach('original_image', 'tests/fixtures/invalid.txt')
      .attach('adjusted_image', 'tests/fixtures/original.jpg');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('should enforce rate limiting', async () => {
    // 21번 요청 (제한: 20/hour)
    for (let i = 0; i < 21; i++) {
      const response = await request(app)
        .post('/api/v1/training/analyze')
        .field('profile_name', `Test ${i}`)
        .attach('original_image', 'tests/fixtures/original.jpg')
        .attach('adjusted_image', 'tests/fixtures/adjusted.jpg');

      if (i < 20) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(429);
      }
    }
  });
});
```

#### 2.11.3 E2E 테스트 (End-to-End)

```typescript
// frontend/tests/e2e/training.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Training Flow', () => {
  test('should complete full training workflow', async ({ page }) => {
    // 1. 페이지 접속
    await page.goto('/training');

    // 2. 제목 확인
    await expect(page.locator('h1')).toContainText('Train Your Style');

    // 3. 이미지 업로드
    const originalInput = page.locator('input[type="file"]').first();
    await originalInput.setInputFiles('tests/fixtures/original.jpg');

    const adjustedInput = page.locator('input[type="file"]').nth(1);
    await adjustedInput.setInputFiles('tests/fixtures/adjusted.jpg');

    // 4. 프로필명 입력
    await page.fill('input[placeholder*="Portrait"]', 'E2E Test Profile');

    // 5. 분석 버튼 클릭
    await page.click('button:has-text("Analyze")');

    // 6. 로딩 상태 확인
    await expect(page.locator('text=Analyzing')).toBeVisible();

    // 7. 결과 페이지로 리다이렉트 (최대 10초 대기)
    await page.waitForURL('**/profiles', { timeout: 10000 });

    // 8. 성공 메시지 확인
    await expect(page.locator('text=Profile created successfully')).toBeVisible();

    // 9. 새 프로필 확인
    await expect(page.locator('text=E2E Test Profile')).toBeVisible();
  });
});
```

---

### **2.12 모니터링 및 로깅**

#### 2.12.1 Sentry 통합

```typescript
// backend/src/utils/sentry.ts
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export const initSentry = () => {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    integrations: [
      new ProfilingIntegration()
    ],
    tracesSampleRate: 0.1, // 10% 트랜잭션 추적
    profilesSampleRate: 0.1
  });
};

// backend/src/middleware/errorHandler.ts
import * as Sentry from '@sentry/node';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Sentry에 에러 보고
  Sentry.captureException(err, {
    tags: {
      endpoint: req.path,
      method: req.method
    },
    user: {
      id: req.session?.userId || req.ip
    }
  });

  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An error occurred'
        : err.message
    }
  });
};
```

#### 2.12.2 Winston Logger

```typescript
// backend/src/utils/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'autophotofix-backend'
  },
  transports: [
    // 파일 로그
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    })
  ]
});

// 개발 환경에서는 콘솔 출력
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}
```

---

### **2.13 런치 체크리스트**

#### MVP 출시 전 필수 사항

```markdown
## 기능 (Features)
- [ ] 이미지 학습 기능 완전 동작
- [ ] 자동 보정 적용 기능 완전 동작
- [ ] 프로필 관리 (생성/조회/삭제)
- [ ] 이미지 다운로드

## 성능 (Performance)
- [ ] 이미지 분석 5초 이내
- [ ] 이미지 보정 2초 이내
- [ ] 페이지 로딩 1초 이내 (FCP)
- [ ] Lighthouse 점수 90+ (Performance)

## 보안 (Security)
- [ ] HTTPS 강제
- [ ] Rate Limiting 적용
- [ ] 파일 타입 검증 (MIME + Magic Number)
- [ ] 콘텐츠 안전 필터링
- [ ] CORS 설정
- [ ] Helmet 보안 헤더

## UI/UX
- [ ] 모바일 반응형 테스트 (iOS/Android)
- [ ] 태블릿 최적화
- [ ] 로딩 상태 표시
- [ ] 에러 메시지 사용자 친화적
- [ ] 접근성 (WCAG 2.1 AA)

## 수익화 (Monetization)
- [ ] Google AdSense 승인
- [ ] 광고 배치 (3개 이상 페이지)
- [ ] 광고 정책 준수 확인
- [ ] 개인정보 처리방침 페이지
- [ ] 쿠키 정책 공지

## 분석 (Analytics)
- [ ] Google Analytics 4 설치
- [ ] 전환 이벤트 설정 (분석 완료, 보정 완료)
- [ ] Sentry 에러 트래킹
- [ ] 사용자 피드백 수집 채널

## 법적 (Legal)
- [ ] 이용약관 작성
- [ ] 개인정보 처리방침
- [ ] 저작권 고지
- [ ] GDPR 준수 (EU 사용자 대상 시)

## SEO
- [ ] 메타 태그 (title, description)
- [ ] Open Graph 태그
- [ ] robots.txt
- [ ] sitemap.xml
- [ ] Google Search Console 등록

## 배포 (Deployment)
- [ ] Frontend Vercel 배포
- [ ] Backend Railway 배포
- [ ] 데이터베이스 마이그레이션
- [ ] 환경 변수 설정
- [ ] 도메인 연결 및 SSL
- [ ] CDN 캐싱 확인
```

#### 출시 후 모니터링 (첫 주)

```markdown
- [ ] 매일 에러 로그 확인 (Sentry)
- [ ] API 응답 시간 추적 (평균 < 500ms)
- [ ] 데이터베이스 쿼리 성능
- [ ] OpenAI API 비용 모니터링
- [ ] 광고 수익 추적 (AdSense)
- [ ] 사용자 피드백 수집 및 대응
- [ ] 서버 리소스 사용률 (CPU/Memory)
- [ ] Redis 캐시 히트율 (> 80%)
```

---

### **2.14 향후 확장 로드맵**

#### Phase 1: MVP (현재)
**목표**: 핵심 기능 검증, 초기 사용자 확보

- ✅ 기본 보정 학습 및 적용
- ✅ Google AdSense 통합
- ✅ 프로필 관리

**성공 지표**:
- 일일 활성 사용자 100명
- 월 광고 수익 $100+
- 사용자 만족도 4.0/5.0

---

#### Phase 2: 기능 확장 (1-3개월)
**목표**: 사용자 경험 개선, 수익 다각화

**신규 기능**:
1. **배치 처리**
   - 여러 이미지 동시 업로드 (최대 20장)
   - ZIP 파일 다운로드
   - 진행률 표시

2. **프리셋 시스템**
   - 카테고리별 프로필 (인물/풍경/음식/야경)
   - 커뮤니티 프로필 공유
   - 인기 프로필 랭킹

3. **사용자 계정**
   - 이메일/소셜 로그인
   - 프로필 클라우드 동기화
   - 사용 통계 대시보드

4. **고급 편집**
   - 파라미터 수동 조정
   - Before/After 슬라이더
   - 실시간 미리보기

**기술 개선**:
- WebSocket 실시간 처리 상태
- 이미지 처리 속도 50% 향상 (GPU 가속)
- PWA 지원 (오프라인 모드)

**수익화**:
- 프리미엄 구독 출시 ($9.99/월)
  - 무제한 처리
  - 광고 제거
  - 배치 처리 우선순위
  - 고급 필터 (빈티지, 시네마틱 등)

**목표 지표**:
- 일일 활성 사용자 1,000명
- 유료 전환율 3%
- 월 수익 $500 (광고 + 구독)

---

#### Phase 3: AI 고도화 (3-6개월)
**목표**: 차별화된 AI 기술, 브랜드 확립

**신규 기능**:
1. **커스텀 AI 모델**
   - 사용자 데이터로 모델 파인튜닝
   - 개인화된 스타일 추천
   - 얼굴 인식 기반 인물 보정

2. **스마트 분석**
   - 이미지 장면 인식 (인물/풍경/음식 자동 분류)
   - 최적 보정 자동 추천
   - 노이즈/흔들림 자동 감지 및 복구

3. **크리에이터 도구**
   - API 제공 (개발자용)
   - Lightroom/Photoshop 플러그인
   - 일괄 워터마크 삽입

**기술 개선**:
- 자체 AI 모델 (OpenAI 비용 절감)
- CDN 엣지 컴퓨팅 (지역별 처리)
- 멀티테넌시 아키텍처

**비즈니스**:
- B2B SaaS 모델 (에이전시/스튜디오)
- 화이트라벨 솔루션
- 엔터프라이즈 플랜 ($99/월)

**목표 지표**:
- 일일 활성 사용자 10,000명
- 유료 전환율 5%
- 월 수익 $3,000+
- B2B 고객 5개 이상

---

#### Phase 4: 멀티플랫폼 (6-12개월)
**목표**: 플랫폼 확장, 시장 지배력

**신규 플랫폼**:
1. **모바일 앱**
   - React Native (iOS/Android)
   - 카메라 직접 촬영 후 즉시 보정
   - AR 프리뷰 (실시간 보정 미리보기)

2. **데스크톱 앱**
   - Electron (Windows/macOS)
   - 로컬 처리 (인터넷 불필요)
   - RAW 파일 지원

3. **브라우저 확장**
   - Chrome/Firefox Extension
   - 웹 이미지 우클릭 → 즉시 보정

**통합**:
- Dropbox/Google Drive 연동
- Instagram 직접 업로드
- Slack/Discord 봇

**목표 지표**:
- 총 사용자 100,000명
- 모바일 앱 다운로드 10,000+
- 월 수익 $10,000+

---

### **2.15 FAQ 및 트러블슈팅**

#### 자주 묻는 질문

**Q1: 왜 OpenAI API 대신 오픈소스 모델을 사용하지 않나요?**
A: 초기 MVP에서는 개발 속도와 정확도를 우선시했습니다. GPT-4 Vision은 별도 학습 없이 바로 사용 가능하며, 이미지 비교 정확도가 높습니다. Phase 3에서 자체 모델로 전환 예정입니다.

**Q2: 사용자가 업로드한 이미지는 얼마나 보관되나요?**
A: 24시간 후 자동 삭제됩니다. 다만 보정 프로필의 참조 이미지(썸네일)는 사용자가 삭제할 때까지 유지됩니다.

**Q3: GDPR 준수는 어떻게 하나요?**
A: 사용자 동의 없이 데이터를 수집하지 않으며, 요청 시 모든 데이터를 삭제합니다. 쿠키 정책 및 개인정보 처리방침 페이지를 제공합니다.

**Q4: 광고 없이 사용할 수 있나요?**
A: Phase 2에서 프리미엄 구독($9.99/월)을 출시하면 광고 없이 사용 가능합니다.

**Q5: 상업적 용도로 사용해도 되나요?**
A: 무료 플랜은 개인 용도만 가능하며, 상업적 사용은 프리미엄 또는 엔터프라이즈 플랜이 필요합니다.

---

#### 트러블슈팅

**문제: OpenAI API 응답이 느림 (> 10초)**
```
원인: 이미지 크기가 너무 큼
해결:
1. 프론트엔드에서 이미지 압축 강화 (최대 1MB)
2. 백엔드에서 리사이즈 (최대 1024x1024)
3. OpenAI API 타임아웃 설정 (10초)
```

**문제: Cloudinary 업로드 실패**
```
원인: 무료 티어 대역폭 초과
해결:
1. Redis 캐싱으로 중복 업로드 방지
2. 이미지 만료 시간 단축 (24시간 → 12시간)
3. Pro 플랜 업그레이드 고려
```

**문제: Railway 서버 다운**
```
원인: 메모리 부족 (무료 티어 512MB)
해결:
1. 이미지 처리 워커를 별도 프로세스로 분리
2. BullMQ로 작업 큐 관리
3. 메모리 누수 확인 (Sharp 인스턴스 정리)
```

**문제: Rate Limiting이 작동하지 않음**
```
원인: Redis 연결 실패
해결:
1. Redis 연결 상태 확인 (redis-cli PING)
2. 환경 변수 REDIS_URL 확인
3. Fallback으로 express-rate-limit 기본 메모리 스토어 사용
```

---

### **2.16 README.md (GitHub용)**

```markdown
# 🎨 AutoPhotoFix

> Train AI to learn your photo editing style and automatically apply it to any image.

[![Live Demo](https://img.shields.io/badge/demo-live-green)](https://autophotofix.com)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](.github/CONTRIBUTING.md)

![AutoPhotoFix Demo](docs/images/demo.gif)

## ✨ Features

- 🤖 **AI Style Learning**: Upload before/after photos to teach AI your editing style
- ⚡ **Auto Correction**: Apply learned style to new photos instantly
- 💾 **Profile Management**: Save multiple editing profiles for different scenarios
- 📱 **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- 🔒 **Privacy First**: Images auto-delete after 24 hours

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- OpenAI API Key

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/autophotofix.git
cd autophotofix

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
cd backend
npx prisma migrate dev

# Start development servers
npm run dev
```

Frontend: http://localhost:3000
Backend: http://localhost:4000

## 📚 Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Contributing](docs/CONTRIBUTING.md)

## 🛠️ Tech Stack

**Frontend**: React 18, TypeScript, TailwindCSS, Vite
**Backend**: Node.js, Express, Prisma, Sharp
**AI**: OpenAI GPT-4 Vision
**Database**: PostgreSQL, Redis
**Hosting**: Vercel (Frontend), Railway (Backend)

## 📊 Performance

- ⚡ Image analysis: < 5 seconds
- 🎯 Correction apply: < 2 seconds
- 📈 Lighthouse score: 95+

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](docs/CONTRIBUTING.md) first.

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

- OpenAI for GPT-4 Vision API
- [Sharp](https://sharp.pixelplumbing.com/) for image processing
- All contributors and supporters

---

Made with ❤️ by [Your Name]
```

---

## 결론

이 프로젝트 설계 문서는 **AutoPhotoFix**의 완전한 구현 가이드를 제공합니다.

### 핵심 강점

1. **즉시 실행 가능**: 모든 코드와 설정이 포함되어 바로 구현 가능
2. **비용 효율적**: 무료 티어 최대 활용, 월 $35 이하 운영
3. **확장 가능**: Phase 1부터 Phase 4까지 명확한 로드맵
4. **프로덕션 준비**: 보안, 성능, 모니터링 모두 고려
5. **수익화 전략**: AdSense + 구독 모델

### 다음 단계

1. 환경 설정 및 의존성 설치
2. OpenAI API 키 발급
3. Cloudinary 계정 생성
4. 로컬 개발 환경 구축
5. MVP 기능 구현
6. 테스트 및 배포

**예상 개발 기간**: 2-4주 (1명 풀타임 기준)
