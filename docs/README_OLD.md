# 🎨 AutoPhotoFix - 프로젝트 설계 문서

AI 기반 사진 자동 보정 애플리케이션의 완전한 설계 및 구현 가이드

## 📋 문서 구조

이 프로젝트는 `photo_correction_app_project_template.md` 템플릿을 기반으로 설계되었습니다.

### 주요 문서

1. **PROJECT_DESIGN.md** (Part 1)
   - 프로젝트 요구사항 분석
   - 기술 스택 선정 및 근거
   - 시스템 아키텍처
   - 데이터베이스 설계
   - API 설계
   - 프로젝트 구조
   - 핵심 코드 구현 (Frontend & Backend)

2. **PROJECT_DESIGN_PART2.md** (Part 2)
   - Google AdSense 통합 전략
   - 배포 가이드 (Vercel + Railway)
   - 성능 최적화
   - 보안 체크리스트
   - 테스트 전략
   - 모니터링 및 로깅
   - 런치 체크리스트
   - 향후 확장 로드맵
   - FAQ 및 트러블슈팅

3. **setup_files/** 디렉토리
   - 모든 설정 파일
   - Docker Compose 구성
   - package.json (Frontend & Backend)
   - Prisma 스키마
   - 환경 변수 예시
   - Quick Start 스크립트

## 🚀 빠른 시작

### Option 1: 자동 설정 스크립트 사용

```bash
# 스크립트 실행 권한 부여
chmod +x setup_files/quick_start.sh

# 자동 설정 실행
./setup_files/quick_start.sh
```

### Option 2: 수동 설정

```bash
# 1. 프로젝트 클론 또는 생성
mkdir autophotofix && cd autophotofix

# 2. setup_files에서 파일 복사
cp -r setup_files/frontend ./
cp -r setup_files/backend ./
cp setup_files/docker-compose.yml ./

# 3. 의존성 설치
cd frontend && npm install
cd ../backend && npm install

# 4. 환경 변수 설정
cd backend && cp .env.example .env
cd ../frontend && cp .env.example .env
# (각 .env 파일을 편집하여 API 키 입력)

# 5. Docker 서비스 시작
docker-compose up -d

# 6. 데이터베이스 마이그레이션
cd backend && npx prisma migrate dev

# 7. 개발 서버 실행
# Terminal 1
cd frontend && npm run dev

# Terminal 2
cd backend && npm run dev
```

## 📊 프로젝트 개요

### 핵심 기능

1. **보정 스타일 학습** (Training Mode)
   - 원본 사진 + 보정된 사진 업로드
   - AI가 보정 패턴 자동 분석
   - 보정 프로필 생성 및 저장

2. **자동 보정 적용** (Auto Correction Mode)
   - 학습된 스타일을 새 사진에 적용
   - 2초 이내 처리
   - 즉시 다운로드 가능

3. **프로필 관리**
   - 여러 스타일 저장 (인물/풍경/음식 등)
   - 프로필 조회/수정/삭제
   - 사용 통계

### 기술 스택

**Frontend**
- React 18.3.1 + TypeScript
- Vite (빌드 도구)
- TailwindCSS (스타일링)
- React Query (서버 상태)
- Zustand (클라이언트 상태)

**Backend**
- Node.js 20 + Express
- TypeScript
- Prisma (ORM)
- Sharp (이미지 처리)
- Redis (캐싱)

**AI/ML**
- OpenAI GPT-4 Vision (이미지 분석)
- Canvas API (클라이언트 처리)

**Infrastructure**
- Vercel (Frontend 호스팅)
- Railway (Backend 호스팅)
- Supabase (PostgreSQL)
- Cloudinary (이미지 스토리지)

## 💰 비용 분석

| 항목 | 무료 티어 | 예상 월 비용 (월 1만 사용자) |
|------|-----------|--------------------------|
| OpenAI API | - | $30 |
| Vercel | ✅ 무제한 | $0 |
| Railway | 500시간 | $5 |
| Supabase | 500MB | $0 |
| Cloudinary | 25GB | $0 |
| **합계** | **$0** | **$35/월** |

## 📈 수익화 전략

### Phase 1: 광고 수익 (MVP)
- Google AdSense 통합
- 예상 월 수익: $100-300 (일 100-300명 기준)

### Phase 2: 프리미엄 구독
- $9.99/월
- 무제한 처리, 광고 제거, 고급 필터
- 목표 전환율: 3-5%

### Phase 3: B2B SaaS
- API 제공
- 엔터프라이즈 플랜 ($99/월)
- 화이트라벨 솔루션

## 🎯 개발 로드맵

### Phase 1: MVP (현재, 2-4주)
- ✅ 핵심 기능 2개
- ✅ 기본 UI/UX
- ✅ Google AdSense
- ✅ 배포 자동화

### Phase 2: 기능 확장 (1-3개월)
- 🔄 배치 처리
- 🔄 프리셋 시스템
- 🔄 사용자 계정
- 🔄 프리미엄 구독

### Phase 3: AI 고도화 (3-6개월)
- 🔮 커스텀 AI 모델
- 🔮 스마트 분석
- 🔮 B2B SaaS

### Phase 4: 멀티플랫폼 (6-12개월)
- 🔮 모바일 앱 (React Native)
- 🔮 데스크톱 앱 (Electron)
- 🔮 브라우저 확장

## 📚 API 문서

### 주요 Endpoints

```
POST   /api/v1/training/analyze     # 보정 스타일 분석
POST   /api/v1/correction/apply     # 자동 보정 적용
GET    /api/v1/profiles             # 프로필 목록
DELETE /api/v1/profiles/:id         # 프로필 삭제
```

자세한 API 명세는 `PROJECT_DESIGN.md` 섹션 2.4 참조

## 🔒 보안

- ✅ HTTPS 강제
- ✅ Rate Limiting (50건/시간)
- ✅ 파일 타입 검증 (MIME + Magic Number)
- ✅ 콘텐츠 안전 필터링
- ✅ 이미지 자동 삭제 (24시간)
- ✅ CORS 설정

## ⚡ 성능 목표

- 이미지 분석: **< 5초**
- 이미지 보정: **< 2초**
- 페이지 로딩: **< 1초** (FCP)
- Lighthouse 점수: **90+**

## 🧪 테스트

```bash
# Frontend 테스트
cd frontend
npm run test

# Backend 테스트
cd backend
npm run test

# E2E 테스트 (Playwright)
npm run test:e2e
```

## 📦 배포

### Frontend (Vercel)
```bash
cd frontend
vercel --prod
```

### Backend (Railway)
```bash
cd backend
railway up
```

상세한 배포 가이드는 `PROJECT_DESIGN_PART2.md` 섹션 2.8 참조

## 📞 지원

- 이슈: GitHub Issues
- 문서: `docs/` 디렉토리
- 이메일: support@autophotofix.com

## 📄 라이선스

MIT License

---

## 🎓 학습 리소스

### 추천 읽기
1. [OpenAI Vision API 문서](https://platform.openai.com/docs/guides/vision)
2. [Sharp 이미지 처리 가이드](https://sharp.pixelplumbing.com/)
3. [Prisma ORM 문서](https://www.prisma.io/docs)
4. [React Query 가이드](https://tanstack.com/query/latest)

### 참고 프로젝트
- [Photopea](https://www.photopea.com/) - 웹 기반 이미지 편집기
- [Remove.bg](https://www.remove.bg/) - AI 배경 제거
- [Cleanup.pictures](https://cleanup.pictures/) - AI 객체 제거

---

**만든 이**: Claude (Anthropic)
**버전**: 1.0.0
**마지막 업데이트**: 2026-01-07

