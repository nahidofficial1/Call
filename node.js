import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { COUNTRY_FLAGS, COUNTRY_NAME_TO_CODE } from './countries.js';
import { Solver } from '@2captcha/captcha-solver';
import WebSocket from 'ws';
import io from 'socket.io-client';



// Telegram Control Panel System (Add / Run / Stop)
// ======================================================================
import TelegramBot from "node-telegram-bot-api";

// 🔐 শুধু এই ID কন্ট্রোল করতে পারবে
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const BOT_TOKEN = process.env.BOT_TOKEN;

// 🔧 ফাইল যেখানে একাউন্ট সংরক্ষণ হবে
const ACCOUNTS_FILE = "accounts.json";
if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([]));

// Helper functions
const loadAccounts = () => JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
const saveAccounts = (data) => fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));

// 🔹 Telegram Bot শুরু
const botControl = new TelegramBot(BOT_TOKEN, { polling: true });

// 🔹 মেইন কীবোর্ড
const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: "🚀 Run Bot" }, { text: "⏹ Stop Bot" }]
    ],
    resize_keyboard: true,
  },
};

// 🔹 ইনলাইন “Add Account” বাটন
const inlineMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "➕ Add Account", callback_data: "add_account" }]
    ],
  },
};

// ======================================================================
// 🟢 /start কমান্ড
// ======================================================================
botControl.onText(/\/start/, (msg) => {
  if (msg.chat.id !== ADMIN_ID)
    return botControl.sendMessage(msg.chat.id, "⛔ Access denied.");
  
  botControl.sendMessage(
    msg.chat.id,
    "👇 Welcome to your Bot Control Panel:",
    { ...mainMenu, ...inlineMenu }
  );
});

// ======================================================================
// 🟢 /add email password
// ======================================================================
botControl.onText(/\/add (.+) (.+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID)
    return botControl.sendMessage(msg.chat.id, "⛔ Access denied.");

  const chatId = msg.chat.id;
  const email = match[1];
  const password = match[2];

  const accounts = loadAccounts();
  if (accounts.find(a => a.email === email))
    return botControl.sendMessage(chatId, `⚠️ Account already exists: ${email}`);

  accounts.push({ email, password, running: false });
  saveAccounts(accounts);
  botControl.sendMessage(chatId, `✅ Account added successfully:\n📧 ${email}`);
});

// ======================================================================
// 🟢 “Run” / “Stop” বোতাম হ্যান্ডলার
// ======================================================================
botControl.on("message", (msg) => {
  if (msg.chat.id !== ADMIN_ID)
    return botControl.sendMessage(msg.chat.id, "⛔ Access denied.");

  const chatId = msg.chat.id;
  const text = msg.text;
  const accounts = loadAccounts();

  // 🚀 Run Bot
  if (text === "🚀 Run Bot") {
    if (accounts.length === 0)
      return botControl.sendMessage(chatId, "⚠️ No accounts found. Use /add first.");

    const buttons = accounts.map(acc => [{
      text: `🟢 Run: ${acc.email}`,
      callback_data: `run_${acc.email}`,
    }]);
    buttons.push([{ text: "🚀 Run All", callback_data: "run_all" }]);

    botControl.sendMessage(chatId, "👇 Choose an account to run:", {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  // ⏹ Stop Bot
  if (text === "⏹ Stop Bot") {
    const running = accounts.filter(a => a.running);
    if (running.length === 0)
      return botControl.sendMessage(chatId, "⚠️ No bots are running.");

    const buttons = running.map(acc => [{
      text: `⏹ Stop: ${acc.email}`,
      callback_data: `stop_${acc.email}`,
    }]);
    buttons.push([{ text: "🛑 Stop All", callback_data: "stop_all" }]);

    botControl.sendMessage(chatId, "👇 Choose an account to stop:", {
      reply_markup: { inline_keyboard: buttons },
    });
  }
});

// ======================================================================
// 🟢 Inline বাটনের callback handler
// ======================================================================
botControl.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  if (chatId !== ADMIN_ID)
    return botControl.sendMessage(chatId, "⛔ Access denied.");

  const data = query.data;
  const accounts = loadAccounts();

  // ➕ Add Account হেল্প
  if (data === "add_account") {
    botControl.sendMessage(chatId, "✏️ Use this command:\n`/add email password`", {
      parse_mode: "Markdown",
    });
    return;
  }

  // 🚀 Run single bot
  if (data.startsWith("run_")) {
    const email = data.replace("run_", "");
    const acc = accounts.find(a => a.email === email);
    if (!acc) return botControl.sendMessage(chatId, "❌ Account not found!");

    acc.running = true;
    saveAccounts(accounts);

    botControl.sendMessage(chatId, `🕐 Logging in with ${email}...`);

    try {
      // ✅ লগইন কল
      const session = await loginToDashboard(acc.email, acc.password);

      if (session) {
        botControl.sendMessage(chatId, `✅ ${email} logged in successfully! Monitoring started...`);
        logger.info(`✅ ${email} login completed, starting monitoring...`);

        // ✅ কল মনিটরিং শুরু
        await main(session.browser, session.page, session.cookies, acc.email);
      } else {
        botControl.sendMessage(chatId, `❌ Login failed for ${email}`);
        logger.error(`❌ ${email} login failed, monitoring aborted.`);
      }
    } catch (err) {
      botControl.sendMessage(chatId, `❌ Failed to login for ${email}\nError: ${err.message}`);
      logger.error(`❌ ${email} login error: ${err.message}`);
      acc.running = false;
      saveAccounts(accounts);
    }
  }  // ✅ ← এইটা হলো বন্ধনী “Run Single Bot” এর শেষ

  // 🚀 Run All Bots
  if (data === "run_all") {
    const notRunning = accounts.filter(a => !a.running);
    if (notRunning.length === 0) {
      return botControl.sendMessage(chatId, "⚠️ All bots are already running!");
    }

    for (const acc of notRunning) {
      acc.running = true;
      saveAccounts(accounts);
      botControl.sendMessage(chatId, `🕐 Logging in with ${acc.email}...`);

      try {
        const session = await loginToDashboard(acc.email, acc.password);
        if (session) {
          botControl.sendMessage(chatId, `✅ ${acc.email} logged in successfully!`);
          await main(session.browser, session.page, session.cookies, acc.email);
        } else {
          botControl.sendMessage(chatId, `❌ Failed to login for ${acc.email}`);
        }
      } catch (err) {
        botControl.sendMessage(chatId, `❌ Error while logging in for ${acc.email}\n${err.message}`);
        logger.error(`❌ ${acc.email} run_all error: ${err.message}`);
        acc.running = false;
      }
    }

    saveAccounts(accounts);
  }

  // ⏹ Stop single bot
  if (data.startsWith("stop_")) {
    const email = data.replace("stop_", "");
    const acc = accounts.find(a => a.email === email);
    if (!acc) return;
    acc.running = false;
    saveAccounts(accounts);

    // 🧠 এখানে চাইলে browser.close() যোগ করতে পারো
    botControl.sendMessage(chatId, `⏹ Monitoring stopped for ${email}.`);
  }

  // ⏹ Stop All Bots
  if (data === "stop_all") {
    const running = accounts.filter(a => a.running);
    for (const acc of running) {
      acc.running = false;
    }
    saveAccounts(accounts);

    // 🧠 এখানে সব browser.close() কল করা যাবে
    botControl.sendMessage(chatId, "✅ All bots stopped!");
  }
});

// ✅ এই দুই লাইন এখানে রাখো
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================================================================
// Sensitive Information (loaded from environment variables)
// ==============================================================================
const USERNAME = process.env.USERNAME || "";
const PASSWORD = process.env.PASSWORD || "";
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || "";

const CHAT_ID = process.env.CHAT_ID || "";

const REFRESH_INTERVAL_MINUTES = 30;
const AUDIO_TRANSCRIPTION_RETRIES = 1;

const CONFIG_FILE = "config.json";
const PENDING_CALLS_FILE = "pending_calls.json";
const CALL_HISTORY_FILE = "call_history.json";

let WEBSOCKET_URL = "wss://orangecarrier.com:8443/socket.io/?EIO=3&transport=websocket";
let SOCKET_TOKEN = "";
let USER_ID = "";

let websocketConnected = false;
let websocketReconnectCount = 0;
let pendingCalls = {};
let callHistory = [];
let notificationMessages = {};
let recentlyProcessed = {};

const MAIN_CHANNEL_NAME = "Main Channel";
const MAIN_CHANNEL_URL = "https://t.me/+75rmPnrS5k9hYThl";

const FRESH_NUMBERS_NAME = "Fresh Numbers";
const FRESH_NUMBERS_URL = "https://t.me/+75rmPnrS5k9hYThl";

const ADMIN_NAME = "BOT DEVELOPER";
const ADMIN_URL = "https://t.me/+75rmPnrS5k9hYThl";

// ✅ ffmpeg initialize
ffmpeg.setFfmpegPath(ffmpegPath);


// ==============================================================================
// Logger
// ==============================================================================
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => `${info.timestamp} - ${info.level.toUpperCase()}: ${info.message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot_log.txt', level: 'info' })
    ]
});

// ==============================================================================
// Helper functions
// ==============================================================================
const getCountryFlag = (countryName) => {
    const countryNameUpper = countryName.trim().toUpperCase();
    const countryCode = COUNTRY_NAME_TO_CODE[countryNameUpper];
    return COUNTRY_FLAGS[countryCode] || '🌍';
};

// ✅ Mask Number (3 digit + *** + last 4 digit)
const maskNumber = (number) => {
    const numStr = String(number).trim();
    return numStr.length > 7
        ? `${numStr.substring(0, 3)}***${numStr.substring(numStr.length - 4)}`
        : numStr;
};

const extractCountryFromTermination = (text) => {
    const parts = text.split(' ');
    const countryParts = [];
    for (const part of parts) {
        if (['MOBILE', 'FIXED'].includes(part.toUpperCase()) || /\d/.test(part)) {
            break;
        }
        countryParts.push(part);
    }
    return countryParts.length > 0 ? countryParts.join(' ') : text;
};

// ✅ Safe audio sender (parse_mode বাদ দিলাম)
const sendAudioToTelegramGroup = async (caption, filePath) => {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`;
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append('caption', caption);
    form.append('parse_mode', 'Markdown');
    form.append('audio', fs.createReadStream(filePath));
    try {
        await axios.post(url, form, { headers: form.getHeaders(), timeout: 30000 });
        logger.info("✔️ Audio file sent to Telegram successfully.");
    } catch (e) {
        logger.error(`❌ Failed to send audio file: ${e.response?.data?.description || e.message}`);
    }
};

// Add these imports near file top (one-time)
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteerExtra.use(StealthPlugin());

// ==============================================================================
// Configuration and Data Management Functions
// ==============================================================================
const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      SOCKET_TOKEN = config.socket_token || "";
      USER_ID = config.user_id || "";
      WEBSOCKET_URL = config.websocket_url || WEBSOCKET_URL;
      logger.info("✅ Configuration loaded successfully");
      if (SOCKET_TOKEN) logger.info(`🔑 Token loaded: ${SOCKET_TOKEN.substring(0, 20)}...`);
      if (USER_ID) logger.info(`👤 User ID loaded: ${USER_ID}`);
    } else {
      const defaultConfig = {
        websocket_url: WEBSOCKET_URL,
        socket_token: SOCKET_TOKEN,
        user_id: USER_ID
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
      logger.info("📝 Default configuration file created");
    }
  } catch (e) {
    logger.error(`❌ Error loading configuration: ${e.message}`);
  }
};

const saveConfig = () => {
  try {
    const config = {
      websocket_url: WEBSOCKET_URL,
      socket_token: SOCKET_TOKEN,
      user_id: USER_ID
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    logger.info("✅ Configuration saved successfully");
  } catch (e) {
    logger.error(`❌ Error saving configuration: ${e.message}`);
  }
};

// ==============================================================================
// 🔑 Automatic WebSocket Token Collection Functions
// ==============================================================================

/**
 * Save WebSocket tokens for a specific account
 * Stores tokens in accounts.json per-account
 */
const saveAccountTokens = (email, tokens) => {
  try {
    const accounts = loadAccounts();
    const account = accounts.find(acc => acc.email === email);
    
    if (account) {
      account.socket_token = tokens.socket_token || "";
      account.user_id = tokens.user_id || "";
      account.tokens_updated_at = new Date().toISOString();
      saveAccounts(accounts);
      logger.info(`✅ WebSocket tokens saved for account: ${email}`);
      logger.info(`🔑 Token: ${tokens.socket_token?.substring(0, 20)}...`);
      logger.info(`👤 User ID: ${tokens.user_id}`);
    } else {
      logger.warn(`⚠️ Account not found: ${email}`);
    }
  } catch (e) {
    logger.error(`❌ Error saving account tokens: ${e.message}`);
  }
};

/**
 * Get WebSocket tokens for a specific account
 * Returns tokens from accounts.json or falls back to config.json
 */
const getAccountTokens = (email) => {
  try {
    const accounts = loadAccounts();
    const account = accounts.find(acc => acc.email === email);
    
    if (account && account.socket_token && account.user_id) {
      logger.info(`✅ Using account-specific tokens for: ${email}`);
      return {
        socket_token: account.socket_token,
        user_id: account.user_id
      };
    }
    
    // Fallback to global config
    if (SOCKET_TOKEN && USER_ID) {
      logger.info(`⚠️ Using global config tokens (fallback)`);
      return {
        socket_token: SOCKET_TOKEN,
        user_id: USER_ID
      };
    }
    
    logger.warn(`⚠️ No tokens found for account: ${email}`);
    return null;
  } catch (e) {
    logger.error(`❌ Error getting account tokens: ${e.message}`);
    return null;
  }
};

/**
 * Setup WebSocket token capture - simplified version
 * Just waits and lets the page extract method handle it
 */
const setupWebSocketTokenCapture = async (page, email) => {
  try {
    logger.info("🔍 Waiting for page to fully load WebSocket connections...");
    
    // Wait for page to be ready and WebSocket to connect
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try to extract from page multiple times
    for (let i = 0; i < 3; i++) {
      logger.info(`🔍 Token extraction attempt ${i + 1}/3...`);
      
      const tokens = await extractTokensFromPage(page);
      if (tokens && tokens.socket_token && tokens.user_id) {
        logger.info("✅ Tokens successfully extracted!");
        saveAccountTokens(email, tokens);
        
        // Update global variables
        SOCKET_TOKEN = tokens.socket_token;
        USER_ID = tokens.user_id;
        
        return tokens;
      }
      
      // Wait before retry
      if (i < 2) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    logger.warn("⚠️ Could not extract tokens after 3 attempts");
    return null;
    
  } catch (e) {
    logger.error(`❌ Error during token capture: ${e.message}`);
    return null;
  }
};

/**
 * Extract tokens from page context as fallback
 * Checks if tokens are available in page JavaScript and active WebSocket connections
 */
const extractTokensFromPage = async (page) => {
  try {
    logger.info("🔍 Attempting to extract tokens from page context and active WebSocket...");
    
    const tokens = await page.evaluate(() => {
      const results = {
        socket_token: null,
        user_id: null
      };
      
      // Method 1: Check window object
      if (window.socket_token) results.socket_token = window.socket_token;
      if (window.user_id) results.user_id = window.user_id;
      
      // Method 2: Check for active socket.io connections
      if (window.io && window.io.sockets) {
        for (let socket of window.io.sockets) {
          try {
            // Check socket URL for tokens
            if (socket && socket.io && socket.io.uri) {
              const url = socket.io.uri;
              const tokenMatch = url.match(/token=([^&]+)/);
              const userMatch = url.match(/user=([^&]+)/);
              
              if (tokenMatch && tokenMatch[1]) {
                results.socket_token = decodeURIComponent(tokenMatch[1]);
              }
              if (userMatch && userMatch[1]) {
                results.user_id = userMatch[1];
              }
            }
            
            // Check socket query params
            if (socket.io && socket.io.opts && socket.io.opts.query) {
              if (socket.io.opts.query.token) {
                results.socket_token = socket.io.opts.query.token;
              }
              if (socket.io.opts.query.user) {
                results.user_id = socket.io.opts.query.user;
              }
            }
          } catch (e) {
            // Continue to next socket
          }
        }
      }
      
      // Method 3: Check global variables that might contain auth data
      if (window.Laravel && window.Laravel.authToken) {
        results.socket_token = window.Laravel.authToken;
      }
      if (window.Laravel && window.Laravel.userId) {
        results.user_id = window.Laravel.userId;
      }
      
      // Method 4: Try to find from page scripts
      try {
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
          const content = script.textContent || script.innerHTML;
          
          // Look for token patterns in inline scripts
          const tokenPattern = /token["\s:=]+["']([^"']+)["']/i;
          const userPattern = /user[_id]*["\s:=]+["']([^"']+)["']/i;
          
          const tokenMatch = content.match(tokenPattern);
          const userMatch = content.match(userPattern);
          
          if (tokenMatch && tokenMatch[1] && !results.socket_token) {
            results.socket_token = tokenMatch[1];
          }
          if (userMatch && userMatch[1] && !results.user_id) {
            results.user_id = userMatch[1];
          }
        }
      } catch (e) {
        // Continue
      }
      
      return results;
    });
    
    if (tokens.socket_token && tokens.user_id) {
      logger.info("✅ Tokens extracted from page context!");
      logger.info(`🔑 Token: ${tokens.socket_token.substring(0, 30)}...`);
      logger.info(`👤 User ID: ${tokens.user_id}`);
      return tokens;
    }
    
    logger.warn("⚠️ Could not extract tokens from page context");
    return null;
  } catch (e) {
    logger.error(`❌ Error extracting tokens from page: ${e.message}`);
    return null;
  }
};

const loadData = () => {
  try {
    if (fs.existsSync(PENDING_CALLS_FILE)) {
      pendingCalls = JSON.parse(fs.readFileSync(PENDING_CALLS_FILE, 'utf8'));
      logger.info(`✅ Loaded ${Object.keys(pendingCalls).length} pending calls`);
    }
    if (fs.existsSync(CALL_HISTORY_FILE)) {
      callHistory = JSON.parse(fs.readFileSync(CALL_HISTORY_FILE, 'utf8'));
      logger.info(`✅ Loaded ${callHistory.length} call history records`);
    }
  } catch (e) {
    logger.error(`❌ Error loading data: ${e.message}`);
  }
};

const saveData = () => {
  try {
    fs.writeFileSync(PENDING_CALLS_FILE, JSON.stringify(pendingCalls, null, 2));
    fs.writeFileSync(CALL_HISTORY_FILE, JSON.stringify(callHistory, null, 2));
    logger.info("✅ Data saved successfully");
  } catch (e) {
    logger.error(`❌ Error saving data: ${e.message}`);
  }
};

const checkWebSocketConfig = () => {
  if (!SOCKET_TOKEN) {
    logger.warn("⚠️ WebSocket token not set!");
    return false;
  }
  if (!USER_ID) {
    logger.warn("⚠️ WebSocket user ID not set!");
    return false;
  }
  return true;
};

// ==============================================================================
// Call Detection and Processing Functions
// ==============================================================================
const sendCallDetectedNotification = async (phoneNumber, cli, termination) => {
  try {
    const maskedNumber = phoneNumber.length > 7 
      ? `${phoneNumber.substring(0, 3)}***${phoneNumber.substring(phoneNumber.length - 4)}`
      : phoneNumber;

    const message = 
`☎️ *NEW CALL DETECTED*

📞 *Number:* \`${maskedNumber}\`
📱 *CLI:* \`${cli}\`
🌍 *Route:* ${termination || 'N/A'}
⏳ *Status:* Waiting for call to end...

_Audio recording will be sent when call completes_`;

    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown"
    });

    logger.info(`✅ Call detection notification sent: ${phoneNumber}`);
    return response.data.result.message_id;
  } catch (e) {
    logger.error(`❌ Error sending notification: ${e.message}`);
    return null;
  }
};

const deleteNotificationMessage = async (callKey) => {
  try {
    if (notificationMessages[callKey]) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
        chat_id: CHAT_ID,
        message_id: notificationMessages[callKey]
      });
      logger.info(`✅ Notification message deleted: ${callKey}`);
      delete notificationMessages[callKey];
    }
  } catch (e) {
    logger.error(`❌ Error deleting notification: ${e.message}`);
  }
};

const checkCallEnded = async (uuid, cookies) => {
  try {
    const headers = {
      Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };

    const response = await axios.get('https://www.orangecarrier.com/live/calls', {
      headers,
      timeout: 15000
    });

    if (response.status !== 200) {
      logger.warn(`⚠️ Error fetching live calls: HTTP ${response.status}`);
      return false;
    }

    const $ = cheerio.load(response.data);
    
    const liveCalls = $('tbody#LiveCalls tr');
    for (let i = 0; i < liveCalls.length; i++) {
      const rowId = $(liveCalls[i]).attr('id');
      if (rowId === uuid) {
        logger.info(`✅ Call still live (UUID: ${uuid})`);
        return false;
      }
    }

    const lastActivity = $('tbody.lastdata tr');
    for (let i = 0; i < lastActivity.length; i++) {
      const playButtons = $(lastActivity[i]).find('button[onclick]');
      for (let j = 0; j < playButtons.length; j++) {
        const onclick = $(playButtons[j]).attr('onclick');
        if (onclick && onclick.includes(uuid)) {
          logger.info(`✅ Call ended and found in history (UUID: ${uuid})`);
          return true;
        }
      }
    }

    logger.info(`🔍 Call not found in live or history, assuming ended (UUID: ${uuid})`);
    return true;
  } catch (e) {
    logger.error(`❌ Error checking call status: ${e.message}`);
    return false;
  }
};

const processCompletedCall = async (callData, cookies, page) => {
  const { phoneNumber, cli, uuid, termination } = callData;
  const callKey = `${phoneNumber}_${cli}_${uuid}`;

  try {
    if (callHistory.find(h => h.call_key === callKey)) {
      logger.info(`ℹ️ Call already processed: ${phoneNumber} - ${cli}`);
      return;
    }

    const actualDuration = await getCallDuration(uuid, cookies);

    const callRecord = {
      call_key: callKey,
      number: phoneNumber,
      cli: cli,
      uuid: uuid,
      termination_name: termination,
      duration: actualDuration,
      timestamp: new Date().toISOString(),
      completed: true
    };
    callHistory.push(callRecord);

    if (pendingCalls[callKey]) {
      delete pendingCalls[callKey];
    }

    if (recentlyProcessed[callKey]) {
      delete recentlyProcessed[callKey];
    }

    saveData();

    logger.info(`✅ Processing completed call: ${phoneNumber} - ${cli} - Duration: ${actualDuration}s`);

    if (uuid) {
      logger.info(`🎵 Attempting to send audio for ${phoneNumber}, UUID: ${uuid}`);
      const audioUrl = `https://www.orangecarrier.com/live/calls/sound?did=${phoneNumber}&uuid=${uuid}`;
      
      await processCallWorker({
        country: termination || 'Unknown',
        number: phoneNumber,
        cliNumber: cli,
        audioUrl: audioUrl,
        duration: `${actualDuration}s`,
        otp: 'N/A'
      }, cookies, page);

      await deleteNotificationMessage(callKey);
      logger.info(`✅ Audio sent and notification deleted: ${callKey}`);
    } else {
      logger.warn(`❌ No UUID for ${phoneNumber}`);
    }
  } catch (e) {
    logger.error(`❌ Error processing completed call: ${e.message}`);
  }
};

const getCallDuration = async (uuid, cookies) => {
  try {
    const headers = {
      Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };

    const response = await axios.get(`https://www.orangecarrier.com/live/calls/history?uuid=${uuid}`, {
      headers,
      timeout: 15000
    });

    if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
      const duration = response.data[0].billsec || 0;
      logger.info(`📊 Call duration: ${duration} seconds`);
      return duration;
    }
  } catch (e) {
    logger.error(`❌ Error getting call duration: ${e.message}`);
  }
  return 0;
};

const processNewCall = async (callData) => {
  const phoneNumber = callData.cid_num;
  const uuid = callData.uuid;
  const cli = callData.initial_dest;
  const termination = callData.termination;

  if (!phoneNumber || !uuid || !cli) {
    logger.warn(`❌ Incomplete call data: ${JSON.stringify(callData)}`);
    return;
  }

  const callKey = `${phoneNumber}_${cli}_${uuid}`;

  if (callHistory.find(h => h.call_key === callKey)) {
    logger.info(`ℹ️ Call already completed and processed: ${phoneNumber} - ${cli}`);
    return;
  }

  if (pendingCalls[callKey]) {
    logger.debug(`ℹ️ Call already in pending list: ${phoneNumber} - ${cli}`);
    return;
  }

  const currentTime = Date.now();
  if (recentlyProcessed[callKey]) {
    if (currentTime - recentlyProcessed[callKey] < 30000) {
      logger.debug(`ℹ️ Recently processed call, ignoring: ${phoneNumber} - ${cli}`);
      return;
    } else {
      delete recentlyProcessed[callKey];
    }
  }

  const messageId = await sendCallDetectedNotification(phoneNumber, cli, termination);

  if (messageId) {
    notificationMessages[callKey] = messageId;
    recentlyProcessed[callKey] = currentTime;

    pendingCalls[callKey] = {
      call_key: callKey,
      phoneNumber: phoneNumber,
      cli: cli,
      uuid: uuid,
      termination: termination,
      detected_at: new Date().toISOString(),
      completion_checked: 0,
      notification_sent: true,
      notification_message_id: messageId
    };

    saveData();
    logger.info(`🎯 New call detected (pending): ${phoneNumber} - ${cli} - ${uuid}`);
    logger.info(`🕐 Detection time: ${new Date().toTimeString()}`);
  } else {
    logger.error(`❌ Notification not sent, call will not be processed: ${phoneNumber}`);
  }
};

// ==============================================================================
// WebSocket Connection and Monitoring
// ==============================================================================
const connectWebSocket = (cookies, page) => {
  return new Promise((resolve, reject) => {
    if (!checkWebSocketConfig()) {
      logger.error("❌ WebSocket configuration incomplete. Please update config.json");
      resolve(null);
      return;
    }

    try {
      // socket.io v2 connection with proper configuration
      const baseUrl = 'https://orangecarrier.com:8443';
      
      logger.info(`🚀 Connecting to WebSocket (Socket.IO v2)...`);
      logger.info(`👤 User ID: ${USER_ID}`);
      logger.info(`🔑 Token (first 20 chars): ${SOCKET_TOKEN.substring(0, 20)}...`);

      const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

      const socket = io(baseUrl, {
        // Allow both polling and websocket for v2 handshake
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        query: {
          token: SOCKET_TOKEN,
          user: USER_ID
        },
        transportOptions: {
          polling: {
            extraHeaders: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Origin': 'https://www.orangecarrier.com',
              'Cookie': cookieString
            }
          },
          websocket: {
            extraHeaders: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Origin': 'https://www.orangecarrier.com',
              'Cookie': cookieString
            }
          }
        }
      });

      socket.on('connect', () => {
        logger.info('✅ WebSocket connected successfully!');
        logger.info(`🔗 Socket ID: ${socket.id}`);
        logger.info(`🔗 Connected: ${socket.connected}`);
        websocketConnected = true;
        websocketReconnectCount++;
      });

      socket.on('call', async (data) => {
        try {
          if (data && data.calls && data.calls.calls) {
            const allCalls = data.calls.calls;
            
            // Only log when there are actual calls
            if (allCalls.length > 0) {
              logger.info(`📞 Processing ${allCalls.length} call group(s)`);
            }
            
            for (const callArray of allCalls) {
              if (Array.isArray(callArray)) {
                for (const callData of callArray) {
                  if (callData && typeof callData === 'object') {
                    logger.info(`📞 Processing call: ${callData.cid_num} -> ${callData.initial_dest}`);
                    await processNewCall(callData);
                  }
                }
              }
            }
          }
        } catch (e) {
          logger.error(`❌ Error processing call event: ${e.message}`);
        }
      });

      socket.on('disconnect', () => {
        logger.warn('❌ WebSocket disconnected');
        websocketConnected = false;
      });

      socket.on('error', (error) => {
        logger.error(`❌ WebSocket error: ${JSON.stringify(error) || error?.toString() || 'Unknown error'}`);
        logger.error(`❌ WebSocket error details: ${error?.message || error?.code || 'No details'}`);
        websocketConnected = false;
      });

      socket.on('connect_error', (error) => {
        logger.error(`❌ WebSocket connection error: ${error?.message || error?.toString() || JSON.stringify(error)}`);
        logger.error(`❌ Connection error type: ${error?.type}, code: ${error?.code}`);
        logger.error(`❌ Connection error description: ${error?.description}`);
        websocketConnected = false;
      });

      resolve(socket);
    } catch (e) {
      logger.error(`❌ WebSocket connection failed: ${e.message}`);
      resolve(null);
    }
  });
};

const monitorPendingCalls = async (cookies, page) => {
  logger.info('🔍 Starting pending calls monitoring...');
  
  while (true) {
    try {
      const pendingCallKeys = Object.keys(pendingCalls);
      
      if (pendingCallKeys.length > 0) {
        logger.info(`🔍 Checking ${pendingCallKeys.length} pending call(s)...`);

        for (const callKey of pendingCallKeys) {
          const callData = pendingCalls[callKey];
          
          if (!callData || !callData.uuid) {
            logger.warn(`❌ Pending call missing UUID: ${callKey}`);
            continue;
          }

          const detectedAt = new Date(callData.detected_at);
          const pendingSeconds = (Date.now() - detectedAt.getTime()) / 1000;
          logger.info(`⏰ Call pending for: ${pendingSeconds.toFixed(1)} seconds`);

          if (pendingSeconds < 10) {
            logger.info(`🕐 Call very new, waiting: ${callData.phoneNumber}`);
            continue;
          }

          logger.info(`🔍 Checking if call ended: ${callData.phoneNumber} - UUID: ${callData.uuid}`);
          const callEnded = await checkCallEnded(callData.uuid, cookies);

          if (callEnded) {
            logger.info(`🚀 Call ended, processing immediately: ${callData.phoneNumber}`);
            await processCompletedCall({
              phoneNumber: callData.phoneNumber,
              cli: callData.cli,
              uuid: callData.uuid,
              termination: callData.termination
            }, cookies, page);
            logger.info(`✅ Call fully processed: ${callData.phoneNumber}`);
          } else {
            pendingCalls[callKey].completion_checked++;
            const checkCount = pendingCalls[callKey].completion_checked;
            logger.info(`⏳ Call still ongoing: ${callData.phoneNumber} - Check: ${checkCount}`);

            if (checkCount > 90) {
              logger.warn(`⏰ Call timeout: ${callData.phoneNumber}, removing from pending`);
              await deleteNotificationMessage(callKey);
              delete pendingCalls[callKey];
            }
          }
        }

        saveData();
      }

      await new Promise(r => setTimeout(r, 8000));
    } catch (e) {
      logger.error(`❌ Error monitoring pending calls: ${e.message}`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
};

// ==============================================================================
// Login system with Cloudflare Bypass (Desktop-only, Puppeteer-compatible)
// ==============================================================================
const loginToDashboard = async (
  email = USERNAME,
  password = PASSWORD,
  { headless = true, maxRetries = 2 } = {}
) => {
  let browser = null;
  let attempt = 0;
  const solver = CAPTCHA_API_KEY ? new Solver(CAPTCHA_API_KEY) : null;

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  while (attempt < maxRetries) {
    try {
      // 🧩 Launch browser (desktop optimized, Replit & Render compatible)
      let chromePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      
      // Try to find system Chromium first (for Replit)
      if (!chromePath) {
        try {
          const { execSync } = require('child_process');
          const paths = [
            'which chromium-browser',
            'which chromium',
            'which google-chrome',
            'which google-chrome-stable'
          ];
          
          for (const cmd of paths) {
            try {
              const result = execSync(cmd, { encoding: 'utf8' }).trim();
              if (result && result.length > 0) {
                chromePath = result;
                logger.info(`🔧 Using system browser: ${chromePath}`);
                break;
              }
            } catch (e) {
              continue;
            }
          }
          
          if (!chromePath) {
            logger.info('🔧 Using Puppeteer bundled Chrome');
          }
        } catch (e) {
          logger.info('🔧 Using Puppeteer bundled Chrome');
        }
      }
      
      browser = await puppeteerExtra.launch({
        headless: 'new',
        defaultViewport: null,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          "--single-process",
          "--no-zygote"
        ],
        executablePath: chromePath || undefined,
      });

      const page = await browser.newPage();

      // 🖥️ Desktop User-Agent only (no mobile)
      const desktopUA =
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
      await page.setUserAgent(desktopUA);
      await page.setViewport({ width: 1280, height: 800 });
      logger.info('💻 Using desktop User-Agent and viewport.');

      // 🕵️‍♂️ Reduce automation traces
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        try { window.navigator.chrome = { runtime: {} }; } catch (e) {}
      });

      // 🌐 Cloudflare bypass handler
      let captchaSolverPromise = null;
      if (solver && fs.existsSync('./inject.js')) {
        const preloadFile = fs.readFileSync('./inject.js', 'utf8');
        await page.evaluateOnNewDocument(preloadFile);

        captchaSolverPromise = new Promise((resolve) => {
          let solved = false;
          const consoleHandler = async (msg) => {
            try {
              const txt = msg.text ? msg.text() : '';
              if (!txt) return;

              if (txt.includes('intercepted-params:')) {
                let params = null;
                try { params = JSON.parse(txt.replace('intercepted-params:', '')); } catch {}
                if (!params) return;

                logger.info('🔒 Cloudflare challenge detected! Solving with 2captcha...');
                try {
                  const res = await solver.cloudflareTurnstile({
                    pageurl: params.pageurl,
                    sitekey: params.sitekey,
                    data: params.data,
                    pagedata: params.pagedata,
                    action: params.action,
                    userAgent: params.userAgent
                  });

                  logger.info('✅ Token solved, injecting...');
                  await page.evaluate((token) => {
                    try {
                      if (window.cfOriginalCallback) window.cfOriginalCallback(token);
                      if (window.captchaPromiseResolve) window.captchaPromiseResolve(token);
                    } catch {}
                  }, res.data);

                  solved = true;
                  await sleep(3000);
                  await Promise.race([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null),
                    page.reload({ waitUntil: 'networkidle2' }).catch(() => null),
                  ]);

                  if (consoleHandler) page.off('console', consoleHandler);
                  resolve(true);
                } catch (err) {
                  logger.error('❌ Cloudflare solving failed: ' + err.message);
                  if (consoleHandler) page.off('console', consoleHandler);
                  resolve(false);
                }
              }
            } catch {}
          };

          page.on('console', consoleHandler);

          setTimeout(() => {
            if (!solved) {
              try { page.off('console', consoleHandler); } catch {}
              logger.info('ℹ️ No Cloudflare challenge within 20s, continuing...');
              resolve(true);
            }
          }, 20000);
        });
      }

      // 🌍 Go to login page
      logger.info('🌐 Opening login page...');
      await page.goto('https://www.orangecarrier.com/login', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // Wait for Cloudflare bypass
      if (captchaSolverPromise) {
        logger.info('⏳ Waiting for Cloudflare bypass...');
        await captchaSolverPromise;
        await sleep(2000);
      } else {
        await sleep(2000);
      }
      
      // Additional check for Cloudflare challenge
      const pageContent = await page.content();
      if (pageContent.includes('Checking your browser') || pageContent.includes('cf-browser-verification')) {
        logger.warn('⚠️ Cloudflare challenge detected, waiting longer...');
        await sleep(5000);
      }

      // ✏️ Fill credentials
      const emailField = await page.$('input[type="email"], input[name*=email i], input[id*=email i]');
      const passField = await page.$('input[type="password"]');

      if (!emailField || !passField) throw new Error('Login fields not found!');

      logger.info('✅ Filling credentials...');
      await emailField.click({ clickCount: 3 }).catch(() => {});
      await emailField.type(email, { delay: 80 });
      await passField.click({ clickCount: 3 }).catch(() => {});
      await passField.type(password, { delay: 80 });

      // 🔘 Click login
      const loginBtn = await page.$('button[type=submit], input[type=submit], button.login, button.sign-in');
      if (loginBtn) {
        logger.info('👉 Clicking login button...');
        await Promise.all([
          loginBtn.click().catch(() => {}),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => null),
        ]);
      } else {
        logger.warn('⚠️ Login button not found — submitting form manually.');
        await page.evaluate(() => {
          const f = document.querySelector('form');
          if (f) f.submit();
        });
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => null);
      }
      
      // Wait for potential redirects after login
      await sleep(2000);

      // ✅ Verify login success (with better detection)
      await sleep(3000); // Increased wait time for page load
      const currentUrl = page.url();
      const html = await page.content().catch(() => '');
      
      // Multiple verification checks
      const isLoggedIn = 
        currentUrl.includes('orangecarrier.com') && 
        !currentUrl.includes('/login') &&
        (
          html.toLowerCase().includes('dashboard') || 
          html.includes('live/calls') ||
          html.includes('Log Out') ||
          html.includes('logout') ||
          currentUrl.includes('/dashboard') ||
          currentUrl.includes('/live')
        );
      
      if (!isLoggedIn) {
        const debugFile = `debug_login_${Date.now()}.html`;
        fs.writeFileSync(debugFile, html);
        logger.error(`❌ Login verification failed. URL: ${currentUrl}`);
        logger.error(`📁 Debug HTML saved to: ${debugFile}`);
        
        // Check for common error messages
        if (html.includes('Invalid credentials') || html.includes('incorrect')) {
          throw new Error('Invalid email or password!');
        } else if (html.includes('cloudflare') || html.includes('challenge')) {
          throw new Error('Cloudflare challenge not solved!');
        } else {
          throw new Error('Dashboard not detected after login!');
        }
      }

      logger.info('🎉 Login successful — navigating to live/calls');
      await page.goto('https://www.orangecarrier.com/live/calls', { waitUntil: 'networkidle2' }).catch(() => null);

      await sleep(2000);
      
      // Close any popup/modal that might be blocking
      logger.info('🔍 Checking for popups/modals...');
      try {
        const closeButtons = await page.$$('button.close, button[data-dismiss="modal"], .modal button.btn-secondary, button[class*="close"]');
        if (closeButtons.length > 0) {
          logger.info(`🔘 Found ${closeButtons.length} close button(s), clicking...`);
          for (const btn of closeButtons) {
            await btn.click().catch(() => {});
          }
          await sleep(500);
        }
        
        // Also try to find and close modal by evaluating buttons with text
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          buttons.forEach(btn => {
            const text = btn.innerText.trim();
            if (text === 'Close' || text === '×' || text === 'Next') {
              try {
                btn.click();
              } catch(e) {}
            }
          });
        });
        await sleep(500);
      } catch (e) {
        logger.warn(`⚠️ Could not close modals: ${e.message}`);
      }
      
      // 🔑 Attempt automatic WebSocket token collection
      logger.info('🔍 Attempting automatic WebSocket token collection...');
      try {
        // Setup CDP-based token capture
        const tokenPromise = setupWebSocketTokenCapture(page, email);
        
        // Wait a bit for WebSocket to connect
        await sleep(3000);
        
        // Also try to extract from page context as fallback
        const pageTokens = await extractTokensFromPage(page);
        
        // Wait for CDP capture to complete
        const cdpTokens = await tokenPromise;
        
        // Use whichever method succeeded
        const capturedTokens = cdpTokens || pageTokens;
        
        if (capturedTokens && capturedTokens.socket_token && capturedTokens.user_id) {
          logger.info('✅ WebSocket tokens automatically collected!');
          saveAccountTokens(email, capturedTokens);
          
          // Update global variables
          SOCKET_TOKEN = capturedTokens.socket_token;
          USER_ID = capturedTokens.user_id;
        } else {
          logger.warn('⚠️ Automatic token collection failed - manual configuration may be required');
          logger.info('💡 You can manually set tokens in config.json or they will be extracted from account settings');
        }
      } catch (tokenError) {
        logger.error(`❌ Error during token collection: ${tokenError.message}`);
        logger.info('⚠️ Continuing without automatic tokens - fallback to manual config');
      }
      
      const cookies = await page.cookies();
      return { browser, page, cookies };

    } catch (err) {
      attempt++;
      logger.error(`❌ Login attempt ${attempt} failed: ${err.message}`);
      if (browser) await browser.close().catch(() => {});
      if (attempt >= maxRetries) {
        logger.error('🚫 Max login attempts reached.');
        return null;
      }
      logger.info('🔄 Retrying in 2s...');
      await sleep(2000);
    }
  }
  return null;
};

// ==============================================================================
// Process Call Worker (WAV → MP3 Convert & Send to Telegram)
// ==============================================================================
const processCallWorker = async (callData, cookies, page) => {
    const { country, number, cliNumber, audioUrl, duration = 'Unknown', otp = 'N/A' } = callData;

    try {
        const fileName = `call_${Date.now()}_${cliNumber}.wav`;
        const filePath = path.join(__dirname, fileName);

        const headers = {
            Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
            "User-Agent": "Mozilla/5.0",
        };

        // --- Download audio (WAV) ---
        const response = await axios.get(audioUrl, {
            headers,
            responseType: "arraybuffer",
            timeout: 30000,
        });

        fs.writeFileSync(filePath, Buffer.from(response.data), "binary");
        logger.info(`🎧 Audio file downloaded (WAV): ${fileName}`);
        const filePathMp3 = filePath.replace(".wav", ".mp3");

        // --- WAV → MP3 Convert ---
        await new Promise((resolve, reject) => {
            logger.info("✂️ Trimming audio to maximum 14 seconds...");
            ffmpeg(filePath)
                .audioCodec("libmp3lame")
                .toFormat("mp3")
                .duration(14) // ⏱️ সর্বোচ্চ 14 সেকেন্ড পর্যন্ত অডিও রাখবে
                .on("end", () => {
                    logger.info(`🔄 Converted to MP3 (max 14s): ${path.basename(filePathMp3)}`);
                    resolve();
                })
                .on("error", (err) => {
                    logger.error(`❌ FFmpeg conversion error: ${err.message}`);
                    reject(err);
                })
                .save(filePathMp3);
        });

        // ✅ Custom Caption Format
        const caption = 
`✅ *NEW ${getCountryFlag(country)} ${country.toUpperCase()} CALL RECEIVED 🤖*
━━━━━━━━━━━━━━━━━━━
⏰ *Time:* ${new Date().toLocaleString('en-US', { hour12: true })}
${getCountryFlag(country)} *Country:* ${country.toUpperCase()}
📞 *Number:* ${number}
━━━━━━━━━━━━━━━━━━━`;

        // ✅ Send to Telegram (no buttons)
        await sendAudioToTelegramGroup(caption, filePathMp3);

        // --- Clean up ---
        fs.unlinkSync(filePath);
        fs.unlinkSync(filePathMp3);
        logger.info("🗑️ Temporary files deleted.");
    } catch (e) {
        logger.error(`❌ Error processing call for ${cliNumber}: ${e.message}`);
    }
};

// ==============================================================================
// ✅ MAIN FUNCTION (Final Stable Version with Cheerio Parsing)
// Works with latest Cloudflare-bypassed pages & delayed Play buttons
// ==============================================================================
const main = async (browser, page, cookies, email = null) => {
  try {
    const processedCalls = new Set();
    logger.info("🚀 Monitoring started...");

    // Load configuration and data
    loadConfig();
    loadData();
    
    // 🔑 Load account-specific WebSocket tokens if email provided
    if (email) {
      logger.info(`🔍 Loading WebSocket tokens for account: ${email}`);
      const accountTokens = getAccountTokens(email);
      
      if (accountTokens && accountTokens.socket_token && accountTokens.user_id) {
        // Use account-specific tokens
        SOCKET_TOKEN = accountTokens.socket_token;
        USER_ID = accountTokens.user_id;
        logger.info(`✅ Using account-specific tokens for: ${email}`);
        logger.info(`🔑 Token: ${SOCKET_TOKEN.substring(0, 20)}...`);
        logger.info(`👤 User ID: ${USER_ID}`);
      } else {
        logger.warn(`⚠️ No account-specific tokens found for: ${email}`);
        logger.info(`💡 Will use global config or attempt auto-collection`);
      }
    }

    // 🟩 Monitor network requests & failures
    page.on("requestfailed", (req) => {
      logger.warn(`🚫 Request failed: ${req.url()} (${req.failure()?.errorText || "unknown"})`);
    });

    // 🕒 Auto refresh every X minutes
    setInterval(async () => {
      logger.info(`🕒 Refreshing after ${REFRESH_INTERVAL_MINUTES} minutes...`);
      try {
        await page.reload({ waitUntil: "networkidle2" });
        logger.info("✅ Page refreshed successfully.");
      } catch (e) {
        logger.error(`🔴 Page refresh failed: ${e.message}`);
      }
    }, REFRESH_INTERVAL_MINUTES * 60 * 1000);

    // 🧠 Wait for live call data readiness
    try {
      logger.info("⏳ Waiting for /live/calls API response...");
      await page.waitForResponse(res => res.url().includes('/live/calls') && res.status() === 200, { timeout: 20000 });
      await new Promise(r => setTimeout(r, 1000));
    } catch {
      logger.warn("⚠️ /live/calls response not seen within 20s; continuing anyway...");
    }

    // 🔌 Connect to WebSocket for real-time call detection
    logger.info("🔌 Initializing WebSocket connection...");
    const socket = await connectWebSocket(cookies, page);
    
    if (socket) {
      logger.info("✅ WebSocket initialized successfully");
    } else {
      logger.warn("⚠️ WebSocket not available - Please update config.json with socket_token and user_id");
      logger.warn("📝 Get these values from browser DevTools Network tab on orangecarrier.com");
    }

    // 🔍 Start pending calls monitoring in background
    logger.info("🔍 Starting pending calls monitor...");
    monitorPendingCalls(cookies, page).catch(err => {
      logger.error(`❌ Pending calls monitor crashed: ${err.message}`);
    });

    // 🔁 Infinite Monitoring Loop
    while (true) {
      try {
        if (page.isClosed()) {
          logger.error("🔴 Page closed — exiting main loop.");
          break;
        }

        // 🕒 Wait a bit for table or Play button with detached frame protection
        let dataReady = false;
        for (let i = 0; i < 10; i++) {
          try {
            if (page.isClosed()) break;
            const exists = await page.evaluate(() => {
              const btn = document.querySelector('button[onclick*="Play"], a[onclick*="Play"], .play-btn');
              const table = document.querySelector('#LiveCalls, .card table, table');
              return !!(btn || table);
            });
            if (exists) { dataReady = true; break; }
          } catch (frameErr) {
            logger.warn(`⚠️ Frame check error: ${frameErr.message}`);
            break;
          }
          await new Promise(r => setTimeout(r, 1000));
        }

        if (!dataReady) logger.warn('⚠️ No Play button or table after 10s — continuing...');

        // Check if page is still valid before proceeding
        if (page.isClosed()) {
          logger.error("🔴 Page closed during check — exiting main loop.");
          break;
        }

        // 🧩 Extract call list using Cheerio (HTML-based) with frame protection
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        let pageHtml = '';
        try {
          if (page.isClosed()) {
            logger.error("🔴 Page closed before content extraction");
            break;
          }
          pageHtml = await page.content();
        } catch (contentErr) {
          logger.error(`❌ Failed to get page content: ${contentErr.message}`);
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        
        const $ = cheerio.load(pageHtml);
        const foundCalls = [];

        $('#LiveCalls tr, #last-activity tbody.lastdata tr, .card table tbody tr').each((i, row) => {
          const cols = $(row).find('td');
          if (cols.length < 3) return;

          const did = $(cols[0]).text().trim();
          const cli = $(cols[1]).text().trim();
          const duration = $(cols[2]).text().trim();
          const revenue = $(cols[3]).text().trim();

          const btn = $(row).find("button[onclick*='Play'], a[onclick*='Play']");
          if (btn.length) {
            const onclickAttr = btn.attr('onclick');
            const matches = onclickAttr.match(/Play\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]/);
            if (matches) {
              const [, cliFromClick, uuid] = matches;
              foundCalls.push({ cli, did, duration, revenue, uuid, onclick: onclickAttr });
            }
          }
        });

        // ⚙️ Process detected calls
        if (foundCalls.length > 0) {
          logger.info(`📞 ${foundCalls.length} live call(s) detected!`);
        }
        for (const call of foundCalls) {
          const id = `${call.cli}_${call.uuid}`;
          if (processedCalls.has(id)) continue;
          processedCalls.add(id);

          logger.info(`📞 Active Call => CLI: ${call.cli}, DID: ${call.did}, UUID: ${call.uuid}`);

          // 📱 Telegram notification
          const msg = `☎️ *LIVE CALL DETECTED!*\n\n📱 CLI: \`${call.cli}\`\n📞 DID: \`${call.did}\`\n⏱ Duration: ${call.duration}\n💰 Revenue: ${call.revenue}`;
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: msg,
            parse_mode: "Markdown"
          }).catch(e => logger.error(`❌ Telegram error: ${e.message}`));
        }

        // ⏱ Delay before next scan
        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        logger.error(`🔴 Monitoring loop error: ${err.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }

  } catch (e) {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: `⚠️ Bot crashed!\nError: ${e.message}`
    }).catch(() => {});
    logger.error(`🔴 Browser crashed: ${e.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      logger.info("🛑 Browser closed. Stopping bot.");
    }
  }
};

// ==============================================================================
// 🟢 Keep Alive Server (Render/VPS/Replit সব হোস্টিং এ কাজ করবে)
// ==============================================================================
import http from "http";

const port = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || ""; // Your deployed app URL (optional)

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    status: "✅ Bot is alive!",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  }));
}).listen(port, () => console.log(`🌍 Keep-alive server running on port ${port}`));

// Keep-alive ping (শুধুমাত্র Render এর জন্য - VPS এর জন্য প্রয়োজন নেই)
if (APP_URL) {
  setInterval(() => {
    fetch(APP_URL).catch(() => {});
  }, 5 * 60 * 1000);
  console.log(`🔄 Keep-alive ping enabled for: ${APP_URL}`);
} else {
  console.log("ℹ️ Keep-alive ping disabled (set APP_URL to enable)");
}

// ==============================================================================
// 🚀 Auto-start monitoring for accounts marked as "running: true"
// ==============================================================================
(async () => {
    const accounts = loadAccounts();
    const runningAccounts = accounts.filter(a => a.running);
    
    if (runningAccounts.length > 0) {
        logger.info(`🤖 Auto-starting ${runningAccounts.length} account(s)...`);
        
        for (const acc of runningAccounts) {
            try {
                logger.info(`🕐 Auto-login: ${acc.email}...`);
                const session = await loginToDashboard(acc.email, acc.password);
                
                if (session) {
                    logger.info(`✅ ${acc.email} logged in successfully! Monitoring started...`);
                    // Start monitoring (don't await - let it run in background)
                    main(session.browser, session.page, session.cookies, acc.email).catch(err => {
                        logger.error(`❌ Monitoring error for ${acc.email}: ${err.message}`);
                        acc.running = false;
                        saveAccounts(accounts);
                    });
                } else {
                    logger.error(`❌ Auto-login failed for ${acc.email}`);
                    acc.running = false;
                    saveAccounts(accounts);
                }
            } catch (err) {
                logger.error(`❌ Auto-start error for ${acc.email}: ${err.message}`);
                acc.running = false;
                saveAccounts(accounts);
            }
        }
    } else {
        logger.info("ℹ️ No accounts configured for auto-start. Use Telegram bot to add accounts.");
    }
})();