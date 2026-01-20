# AutoPhotoFix - 설정 파일 모음

이 디렉토리에는 프로젝트 설정에 필요한 모든 구성 파일이 포함되어 있습니다.

## 파일 구조

```
setup_files/
├── README_SETUP.md              (이 파일)
├── docker-compose.yml           (로컬 개발 환경)
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── .env.example
│   └── vercel.json
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── prisma/
│   │   └── schema.prisma
│   └── railway.json
└── infrastructure/
    ├── nginx.conf
    ├── Dockerfile.frontend
    ├── Dockerfile.backend
    └── scripts/
        ├── setup.sh
        └── deploy.sh
```

## 사용 방법

### 1. 프로젝트 초기화

```bash
# 프로젝트 루트 생성
mkdir autophotofix
cd autophotofix

# 프론트엔드/백엔드 디렉토리 복사
cp -r setup_files/frontend ./
cp -r setup_files/backend ./
cp -r setup_files/infrastructure ./
```

### 2. 의존성 설치

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

### 3. 환경 변수 설정

```bash
# Frontend
cd frontend
cp .env.example .env
# .env 파일 편집

# Backend
cd ../backend
cp .env.example .env
# .env 파일 편집
```

### 4. 데이터베이스 설정

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

### 5. 개발 서버 실행

```bash
# Frontend (터미널 1)
cd frontend
npm run dev

# Backend (터미널 2)
cd backend
npm run dev
```

## 다음 파일들을 생성했습니다

각 파일의 상세 내용은 해당 파일을 참조하세요.
