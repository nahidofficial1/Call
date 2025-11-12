# Render Deployment Guide

## সমস্যা সমাধান (Problem Solution)

আপনার error ছিল:
```
Browser was not found at the configured executablePath (/usr/bin/chromium)
```

### কেন এই Error হচ্ছিল?

Render-এ আপনি `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` environment variable set করেছিলেন, কিন্তু সেই path-এ Chromium installed নেই।

### সমাধান (Solution)

**পদক্ষেপ ১: Environment Variable মুছে ফেলুন**

Render Dashboard-এ যান এবং **`PUPPETEER_EXECUTABLE_PATH` environment variable টি মুছে দিন বা comment out করুন।**

Puppeteer automatically তার নিজের bundled Chromium download করে ব্যবহার করবে।

**পদক্ষেপ ২: প্রয়োজনীয় Environment Variables**

নিচের environment variables গুলো Render-এ set করুন:

```bash
BOT_TOKEN=your_telegram_bot_token
ADMIN_ID=your_telegram_user_id
CHAT_ID=your_telegram_chat_id
USERNAME=your_orangecarrier_email
PASSWORD=your_orangecarrier_password
CAPTCHA_API_KEY=your_2captcha_api_key (optional)
```

**⚠️ গুরুত্বপূর্ণ:** `PUPPETEER_EXECUTABLE_PATH` variable টি একদম set করবেন না!

**পদক্ষেপ ৩: Deploy করুন**

Files upload করার পর Render automatically build এবং deploy করবে।

---

## Deployment Steps

### 1. Create New Web Service on Render

1. Go to https://render.com
2. Click "New" → "Web Service"
3. Connect your GitHub/GitLab repository
4. Configure the service:
   - **Name:** call-monitor-bot
   - **Environment:** Node
   - **Region:** Oregon (or your preferred region)
   - **Branch:** main
   - **Build Command:** `chmod +x render-build.sh && ./render-build.sh`
   - **Start Command:** `npm start`

### 2. Set Environment Variables

In Render Dashboard → Environment:

| Key | Value | Required |
|-----|-------|----------|
| `BOT_TOKEN` | Your Telegram Bot Token | ✅ Yes |
| `ADMIN_ID` | Your Telegram User ID | ✅ Yes |
| `CHAT_ID` | Telegram Chat/Channel ID | ✅ Yes |
| `USERNAME` | OrangeCarrier Email | ✅ Yes |
| `PASSWORD` | OrangeCarrier Password | ✅ Yes |
| `CAPTCHA_API_KEY` | 2Captcha API Key | ⚠️ Optional |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | `false` | ✅ Yes |

**❌ DO NOT SET:** `PUPPETEER_EXECUTABLE_PATH`

### 3. Deploy

Click "Create Web Service" and wait for deployment to complete.

---

## Alternative: Using render.yaml (Recommended)

Upload the `render.yaml` file to your repository root. Render will automatically detect and use it.

Then just add your secrets in the Render Dashboard.

---

## Troubleshooting

### Error: "Browser was not found"

**Solution:** Remove `PUPPETEER_EXECUTABLE_PATH` from environment variables.

### Error: "Failed to launch the browser process"

**Solution:** Make sure these flags are in the code:
- `--no-sandbox`
- `--disable-setuid-sandbox`
- `--disable-dev-shm-usage`

(These are already in your code)

### Memory Issues

Render's free tier has limited memory. If you face issues:
1. Use `--single-process` flag (already in code)
2. Upgrade to a paid plan with more memory

---

## বাংলায় সংক্ষিপ্ত নির্দেশনা

1. **Render Dashboard থেকে `PUPPETEER_EXECUTABLE_PATH` মুছে দিন**
2. বাকি environment variables ঠিক আছে কিনা check করুন
3. Re-deploy করুন
4. ✅ কাজ হবে!

---

## Support

যদি কোনো সমস্যা হয়, bot developer এর সাথে যোগাযোগ করুন।
