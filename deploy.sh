#!/bin/bash
# Deployment script for Wick3d Link Portal on Plesk

echo "🚀 Starting deployment process for Wick3d Link Portal..."

# Check if .env file exists
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found!"
  echo "Please create a .env file with required environment variables."
  echo "See .env.example for required variables."
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production
if [ $? -ne 0 ]; then
  echo "❌ Error installing dependencies!"
  exit 1
fi

# Build the application
echo "🏗️ Building application..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Error building application!"
  exit 1
fi

# Set up the database
echo "🗄️ Setting up database..."
npm run db:push
if [ $? -ne 0 ]; then
  echo "❌ Error setting up database!"
  echo "Please check your DATABASE_URL environment variable."
  exit 1
fi

# Copy Plesk-specific server to dist folder
echo "🔧 Setting up Plesk server configuration..."
cp plesk-server.js dist/
if [ $? -ne 0 ]; then
  echo "❌ Error copying Plesk server configuration!"
  exit 1
fi

# Set up PM2 if available
if command -v pm2 &> /dev/null; then
  echo "🔄 Setting up PM2 process manager..."
  pm2 delete wick3d-link-portal 2>/dev/null
  pm2 start ecosystem.config.js
  pm2 save
  
  echo "✅ PM2 configuration complete. Application is now running."
  echo "   You can monitor it with: pm2 monit"
  echo "   View logs with: pm2 logs wick3d-link-portal"
else
  echo "⚠️ PM2 not found. For production use, consider installing PM2:"
  echo "   npm install -g pm2"
  echo ""
  echo "✅ Application build complete. Start it with:"
  echo "   NODE_ENV=production node dist/plesk-server.js"
fi

echo ""
echo "✨ Deployment complete! ✨"
echo "Your Wick3d Link Portal is ready to use."
echo ""