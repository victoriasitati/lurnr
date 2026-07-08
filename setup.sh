#!/bin/bash

# Lurnr Backend Setup Script
# This script helps you set up the Lurnr backend for the first time

set -e

echo "🚀 Lurnr Backend Setup"
echo "====================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install it from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Dependencies installed!"
echo ""

# Check for .env file
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cat > .env << 'EOF'
# Groq API Configuration
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here

# Alternative: Ollama Configuration (uncomment to use local Ollama instead)
# LLM_PROVIDER=ollama
# OLLAMA_ENDPOINT=http://localhost:11434/api/generate

# Server Configuration
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000,http://localhost:8000,*

# Session Tracking
SESSION_LOG_PATH=./data/sessions.json
EOF
    
    echo ""
    echo "📝 .env file created. Please follow these steps:"
    echo ""
    echo "   1. Get a Groq API key from https://groq.com"
    echo "   2. Open .env file and replace GROQ_API_KEY value"
    echo "   3. Save the file"
    echo "   4. Run: npm start"
    echo ""
else
    echo "✅ .env file already exists"
    echo ""
    echo "To start the backend, run:"
    echo "   npm start"
    echo ""
fi

echo "📚 For detailed setup instructions, see README.md"
echo ""
