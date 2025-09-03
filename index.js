// 📌 index.js
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const db = require("./db");
const keyboards = require("./handlers/keyboard.js");
const fs = require("fs");
const path = require("path");

// 🚀 Create bot instance
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ✅ Auto-load handlers from /handlers
const handlersPath = path.join(__dirname, "handlers");
fs.readdirSync(handlersPath).forEach((file) => {
  if (file.endsWith(".js")) {
    const handler = require(path.join(handlersPath, file));
    if (typeof handler === "function") {
      handler(bot, db, keyboards); // no middleware wrappers
      console.log(`✅ Loaded handler: ${file}`);
    }
  }
});

console.log("🤖 Bot is running...");
