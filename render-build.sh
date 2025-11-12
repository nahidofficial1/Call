#!/usr/bin/env bash
# Render build script for Puppeteer Bot
set -e

echo "📦 Installing Node.js dependencies..."
npm ci --omit=dev

echo "✅ Dependencies installed successfully!"
echo "🚀 Puppeteer will download and use its bundled Chromium automatically"
echo "⚠️  IMPORTANT: Remove PUPPETEER_EXECUTABLE_PATH from environment variables!"
