# 🎨 toneCopy - AI Photo Correction

> Train AI to learn your photo editing style and automatically apply it to any image.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)

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
- Cloudinary Account (for image storage)

### Installation

1. **Clone and setup**
```bash
cd toneCopy
npm run install:all
```

2. **Setup environment variables**
```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your API URL
```

3. **Start Docker services (PostgreSQL + Redis)**
```bash
npm run docker:up
```

4. **Run database migrations**
```bash
npm run migrate
```

5. **Start development servers**
```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000

## 📚 Project Structure

```
toneCopy/
├── frontend/               # React + Vite frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   ├── utils/         # Utility functions
│   │   └── types/         # TypeScript types
│   └── package.json
│
├── backend/               # Express + TypeScript backend
│   ├── src/
│   │   ├── controllers/   # Route controllers
│   │   ├── services/      # Business logic
│   │   ├── middleware/    # Express middleware
│   │   ├── routes/        # API routes
│   │   └── models/        # Prisma client
│   ├── prisma/           # Database schema
│   └── package.json
│
├── docker-compose.yml    # Docker services
└── package.json          # Root package
```

## 🛠️ Tech Stack

**Frontend**
- React 18 + TypeScript
- Vite (Build tool)
- TailwindCSS (Styling)
- React Query (Server state)
- Axios (HTTP client)

**Backend**
- Node.js 20 + Express
- TypeScript
- Prisma (ORM)
- Sharp (Image processing)
- Redis (Caching)

**AI/ML**
- OpenAI GPT-4 Vision API

**Infrastructure**
- PostgreSQL (Database)
- Redis (Cache)
- Cloudinary (Image storage)

## 🎯 Core Features

### 1. Training Mode
Upload an original and edited photo to train AI on your editing style:
```
POST /api/v1/training/analyze
- Analyzes differences between images
- Extracts adjustment parameters
- Creates reusable profile
```

### 2. Auto Correction
Apply saved profiles to new photos:
```
POST /api/v1/correction/apply
- Applies learned adjustments
- Processes in < 2 seconds
- Returns downloadable result
```

### 3. Profile Management
Manage your saved editing styles:
```
GET    /api/v1/profiles     # List profiles
GET    /api/v1/profiles/:id # Get profile details
DELETE /api/v1/profiles/:id # Delete profile
PATCH  /api/v1/profiles/:id # Update profile
```

## 📊 Performance

- ⚡ Image analysis: < 5 seconds
- 🎯 Correction apply: < 2 seconds
- 📈 Page loading: < 1 second (FCP)

## 🔒 Security

- ✅ HTTPS enforced
- ✅ Rate limiting (50 requests/hour)
- ✅ File type validation
- ✅ CORS configuration
- ✅ Automatic image deletion (24h)

## 🧪 Testing

```bash
# Backend tests
cd backend
npm run test

# Frontend tests
cd frontend
npm run test
```

## 📦 Deployment

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

See `PROJECT_DESIGN_PART2.md` for detailed deployment instructions.

## 🌟 Environment Variables

### Backend (.env)
```bash
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/tonecopy
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-proj-...
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

### Frontend (.env)
```bash
VITE_API_URL=http://localhost:4000/api/v1
```

## 💡 Development Tips

### Hot Reload
Both frontend and backend support hot reload in development mode:
```bash
npm run dev  # Starts both servers with hot reload
```

### Database Management
```bash
# Create migration
cd backend
npx prisma migrate dev --name migration_name

# Open Prisma Studio
npx prisma studio
```

### Docker Commands
```bash
npm run docker:up      # Start services
npm run docker:down    # Stop services
npm run docker:logs    # View logs
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For issues and questions:
- GitHub Issues: Create an issue in this repository
- Documentation: See `PROJECT_DESIGN.md` and `PROJECT_DESIGN_PART2.md`

## 🎓 Learning Resources

- [OpenAI Vision API](https://platform.openai.com/docs/guides/vision)
- [Sharp Image Processing](https://sharp.pixelplumbing.com/)
- [Prisma ORM](https://www.prisma.io/docs)
- [React Query](https://tanstack.com/query/latest)

---

**Built with ❤️ using Claude Code**
**Version**: 1.0.0
**Last Updated**: 2026-01-07
