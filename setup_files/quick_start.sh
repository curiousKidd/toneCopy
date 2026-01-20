#!/bin/bash

# AutoPhotoFix Quick Start Script
# This script sets up the entire project in one command

set -e  # Exit on error

echo "🎨 AutoPhotoFix - Quick Start Setup"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 20+${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}❌ Node.js version must be 20 or higher (current: $(node -v))${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Create project structure
echo "📁 Creating project structure..."

mkdir -p autophotofix/{frontend,backend,infrastructure}
cd autophotofix

echo -e "${GREEN}✅ Project structure created${NC}"
echo ""

# Setup Frontend
echo "⚛️  Setting up Frontend..."

cd frontend
cat > package.json << 'EOF'
{
  "name": "autophotofix-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.22.0",
    "@tanstack/react-query": "^5.20.0",
    "axios": "^1.6.7",
    "zustand": "^4.5.0",
    "browser-image-compression": "^2.0.2",
    "react-dropzone": "^14.2.3"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "vite": "^5.1.0"
  }
}
EOF

mkdir -p src public
cat > .env.example << 'EOF'
VITE_API_URL=http://localhost:4000
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_ANALYTICS_ID=G-XXXXXXXXXX
EOF

echo -e "${GREEN}✅ Frontend setup complete${NC}"
cd ..

# Setup Backend
echo "🚀 Setting up Backend..."

cd backend
cat > package.json << 'EOF'
{
  "name": "autophotofix-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node-dev --respawn src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "@prisma/client": "^5.8.1",
    "openai": "^4.26.0",
    "sharp": "^0.33.2",
    "ioredis": "^5.3.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "dotenv": "^16.4.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.16",
    "typescript": "^5.3.3",
    "ts-node-dev": "^2.0.0",
    "prisma": "^5.8.1"
  }
}
EOF

mkdir -p src prisma
cat > .env.example << 'EOF'
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://autophotofix:password@localhost:5432/autophotofix
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-proj-...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
EOF

echo -e "${GREEN}✅ Backend setup complete${NC}"
cd ..

# Create docker-compose.yml
echo "🐳 Creating Docker Compose configuration..."

cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: autophotofix
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: autophotofix
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
EOF

echo -e "${GREEN}✅ Docker Compose created${NC}"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."

echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "Installing backend dependencies..."
cd backend
npm install
cd ..

echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d

echo -e "${GREEN}✅ Docker services started${NC}"
echo ""

# Wait for services
echo "⏳ Waiting for database to be ready..."
sleep 5

# Setup database
echo "💾 Setting up database..."
cd backend
npx prisma migrate dev --name init
npx prisma generate
cd ..

echo -e "${GREEN}✅ Database setup complete${NC}"
echo ""

# Final instructions
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ Setup Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Configure environment variables:"
echo "   cd backend && cp .env.example .env"
echo "   cd frontend && cp .env.example .env"
echo "   (Edit both .env files with your API keys)"
echo ""
echo "2. Start development servers:"
echo "   Terminal 1: cd frontend && npm run dev"
echo "   Terminal 2: cd backend && npm run dev"
echo ""
echo "3. Open your browser:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:4000"
echo ""
echo "📚 Documentation:"
echo "   - PROJECT_DESIGN.md - Complete architecture"
echo "   - PROJECT_DESIGN_PART2.md - Deployment & config"
echo ""
echo -e "${GREEN}Happy coding! 🎨${NC}"
