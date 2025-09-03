// 📌 handlers/start.js
const { mainMenu } = require("../keyboard.js");

module.exports = (bot, db, keyboards) => {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || "friend";

    bot.sendMessage(chatId, `👋 Welcome, ${firstName}! Glad to have you here.`, {
      reply_markup: mainMenu,
    });
  });
};
