# 환경 변수 설정 가이드

## Frontend (.env)

```bash
# API Configuration
VITE_API_URL=http://localhost:4000

# Google AdSense
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_ADSENSE_TOP_BANNER_SLOT=1234567890
VITE_ADSENSE_SIDEBAR_SLOT=0987654321
VITE_ADSENSE_INTERSTITIAL_SLOT=1122334455

# Google Analytics
VITE_ANALYTICS_ID=G-XXXXXXXXXX

# Environment
VITE_ENV=development
```

## Backend (.env)

```bash
# Server
NODE_ENV=development
PORT=4000

# Database
DATABASE_URL=postgresql://autophotofix:dev_password@localhost:5432/autophotofix?schema=public

# Redis
REDIS_URL=redis://localhost:6379

# OpenAI
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your-api-secret-key-here

# Security
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=50

# Sentry (Error Tracking)
SENTRY_DSN=https://xxxxxxxxx@o123456.ingest.sentry.io/7654321

# Logging
LOG_LEVEL=info
```

## Production 환경 변수 (Vercel + Railway)

### Vercel (Frontend)

```bash
VITE_API_URL=https://api.autophotofix.com
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_ADSENSE_TOP_BANNER_SLOT=1234567890
VITE_ADSENSE_SIDEBAR_SLOT=0987654321
VITE_ADSENSE_INTERSTITIAL_SLOT=1122334455
VITE_ANALYTICS_ID=G-XXXXXXXXXX
VITE_ENV=production
```

### Railway (Backend)

```bash
NODE_ENV=production
PORT=4000

# Railway가 자동으로 제공
DATABASE_URL=${RAILWAY_PROVIDED}
REDIS_URL=${RAILWAY_PROVIDED}

# 수동 설정 필요
OPENAI_API_KEY=sk-proj-...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
JWT_SECRET=...
ALLOWED_ORIGINS=https://autophotofix.com,https://www.autophotofix.com
SENTRY_DSN=...
```

## API 키 발급 가이드

### 1. OpenAI API Key
1. https://platform.openai.com/ 접속
2. 로그인 후 "API keys" 메뉴
3. "Create new secret key" 클릭
4. 키를 안전하게 보관 (한 번만 표시됨)

### 2. Cloudinary
1. https://cloudinary.com/users/register/free 가입
2. Dashboard에서 "Cloud name", "API Key", "API Secret" 확인
3. Settings > Upload > Upload presets 설정 (optional)

### 3. Google AdSense
1. https://www.google.com/adsense/ 가입
2. 사이트 추가 및 승인 대기 (1-3일)
3. 광고 단위 생성 후 client ID와 slot ID 복사

### 4. Google Analytics
1. https://analytics.google.com/ 접속
2. 새 속성 생성 (GA4)
3. 측정 ID (G-XXXXXXXXXX) 복사

### 5. Sentry
1. https://sentry.io/signup/ 가입
2. 새 프로젝트 생성 (Node.js 선택)
3. DSN 복사

## 보안 주의사항

⚠️ **절대로 .env 파일을 Git에 커밋하지 마세요!**

```bash
# .gitignore에 추가
.env
.env.local
.env.production
.env.development
```

✅ **환경 변수 관리 Best Practices**

1. 개발 환경: `.env.development`
2. 프로덕션 환경: Vercel/Railway Dashboard에서 관리
3. 민감한 키는 환경 변수로만 관리
4. 정기적으로 키 로테이션
5. 팀 공유 시 1Password, AWS Secrets Manager 등 사용
