#!/usr/bin/env bash
# Render build script for Puppeteer
set -e

echo "📦 Installing dependencies..."
npm install

echo "✅ Dependencies installed successfully!"
echo "🌐 Puppeteer will use Render's Chromium"
