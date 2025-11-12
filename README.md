# Call Monitor Bot

একটি Telegram bot যা OrangeCarrier থেকে call monitoring করে এবং notifications পাঠায়।

## Features

- ✅ Multi-account support
- ✅ Telegram control panel দিয়ে bot control
- ✅ Real-time call monitoring
- ✅ Audio recording এবং transcription
- ✅ Cloudflare bypass with 2Captcha
- ✅ WebSocket real-time updates

## Setup (Replit)

### 1. Environment Variables Setup

Secrets tab-এ যান এবং নিচের variables add করুন:

```
BOT_TOKEN=your_telegram_bot_token
ADMIN_ID=your_telegram_user_id
CHAT_ID=your_telegram_chat_or_group_id
USERNAME=your_orangecarrier_email
PASSWORD=your_orangecarrier_password
CAPTCHA_API_KEY=your_2captcha_api_key
```

### 2. Run the Bot

"Run" button click করুন অথবা:

```bash
npm start
```

### 3. Telegram Commands

Bot-এ `/start` command পাঠান। তারপর:

- **➕ Add Account**: `/add email password`
- **🚀 Run Bot**: Button click করে account select করুন
- **⏹ Stop Bot**: Running bot stop করতে

## Setup (Render)

Render-এ deploy করার জন্য, `RENDER_DEPLOY.md` file দেখুন।

**গুরুত্বপূর্ণ:** Render-এ `PUPPETEER_EXECUTABLE_PATH` environment variable set করবেন না!

## Requirements

- Node.js >= 18.0.0
- Telegram Bot Token
- OrangeCarrier Account
- (Optional) 2Captcha API Key for Cloudflare bypass

## File Structure

```
.
├── node.js              # Main bot file
├── countries.js         # Country codes and flags
├── inject.js           # Cloudflare bypass script
├── package.json        # Dependencies
├── render-build.sh     # Render build script
├── render.yaml         # Render configuration
└── RENDER_DEPLOY.md    # Render deployment guide
```

## Troubleshooting

### Error: "Browser was not found at executablePath"

এই error টি Render deployment-এ আসে যদি `PUPPETEER_EXECUTABLE_PATH` wrong path-এ set করা থাকে।

**Solution:** Render Dashboard থেকে `PUPPETEER_EXECUTABLE_PATH` environment variable মুছে দিন।

### Bot not responding

1. Check যে সব environment variables সঠিক আছে
2. Bot Token valid কিনা verify করুন
3. Console logs check করুন

## Support

Bot Developer: [Telegram](https://t.me/+75rmPnrS5k9hYThl)
