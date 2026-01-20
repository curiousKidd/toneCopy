# toneCopy - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Install Dependencies

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install

# Install backend dependencies
cd ../backend && npm install
cd ..
```

### Step 2: Setup Environment Variables

#### Backend Environment
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and add your credentials:
- `OPENAI_API_KEY`: Get from https://platform.openai.com/api-keys
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Get from https://cloudinary.com

#### Frontend Environment
```bash
cd ../frontend
cp .env.example .env
```

The default values should work for local development.

### Step 3: Start Database Services

```bash
# From project root
npm run docker:up
```

This starts PostgreSQL and Redis in Docker containers.

### Step 4: Run Database Migrations

```bash
npm run migrate
```

### Step 5: Start Development Servers

```bash
npm run dev
```

This will start:
- Frontend: http://localhost:5173
- Backend: http://localhost:4000

## 🎯 Test the Application

1. Visit http://localhost:5173
2. Click "Train Your Style"
3. Upload an original image and an edited version
4. Enter a profile name
5. Click "Analyze & Create Profile"
6. Navigate to "Profiles" to see your saved style
7. Go to "Correct" to apply your style to new images

## 📝 Important Notes

### Minimum Requirements
- **OpenAI API Key**: Required for AI analysis
- **Cloudinary Account**: Required for image storage (free tier available)
- **Docker**: Required for PostgreSQL and Redis

### Cost Estimates (Free Tier)
- OpenAI: $5 free credit (new accounts)
- Cloudinary: 25GB storage, 25GB bandwidth/month
- Vercel: Unlimited bandwidth (for deployment)
- Railway: 500 hours/month (for deployment)

### Troubleshooting

**"Cannot connect to database"**
- Ensure Docker is running: `docker ps`
- Check if PostgreSQL container is up: `npm run docker:logs`

**"OpenAI API error"**
- Verify your API key is correct in `backend/.env`
- Check your OpenAI account has credits

**"Cloudinary upload failed"**
- Verify your Cloudinary credentials in `backend/.env`
- Ensure your Cloudinary account is active

**Port already in use**
- Frontend (5173): Change in `frontend/vite.config.ts`
- Backend (4000): Change `PORT` in `backend/.env`

## 🛠️ Development Commands

```bash
# Start both servers
npm run dev

# Start backend only
npm run dev:backend

# Start frontend only
npm run dev:frontend

# Build for production
npm run build

# Run database migrations
npm run migrate

# View Docker logs
npm run docker:logs

# Stop Docker services
npm run docker:down
```

## 📚 Next Steps

- Read `README.md` for full documentation
- See `PROJECT_DESIGN.md` for architecture details
- Check `PROJECT_DESIGN_PART2.md` for deployment guide

## 💡 Tips

1. **Development Mode**: Both frontend and backend support hot reload
2. **Database GUI**: Use Prisma Studio to view/edit data: `cd backend && npx prisma studio`
3. **API Testing**: Backend health check at http://localhost:4000/health

---

Need help? Check the full documentation or create an issue on GitHub.
