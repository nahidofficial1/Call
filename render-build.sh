#!/usr/bin/env bash
# Render build script for Puppeteer Bot
set -e

echo "📦 Installing Node.js dependencies..."
npm ci

echo "🌐 Installing Chrome for Puppeteer..."
npx puppeteer browsers install chrome

echo "✅ Build completed successfully!"
echo "📁 Chrome installed in: .cache/puppeteer/"
