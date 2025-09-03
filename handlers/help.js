// 📌 handlers/help.js
module.exports = (bot) => {
  // 🔹 Help command (supports both `/help` and "ℹ️ Help")
  bot.onText(/^(\/help|ℹ️ Help)$/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const helpText = "🤖 *Help Menu*\n\nChoose an option below:";

      await bot.sendMessage(chatId, helpText, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🤖 Official Bot", url: "https://t.me/FiewinGamesRobot" }],
            [{ text: "💰 Payment Channel", url: "https://t.me/fiewin_payments" }],
            [{ text: "❓ Support", url: "https://t.me/AdbeastSupport" }]
          ]
        }
      });
    } catch (error) {
      console.error("❌ Help command error:", error);
      bot.sendMessage(chatId, "❌ Failed to load help menu. Try again later.");
    }
  });
};
