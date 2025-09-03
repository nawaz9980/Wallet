//handlers/balance.js
module.exports = (bot, db, keyboards) => {
  // 🔹 Balance command (supports both `/balance` and "💰 Balance")
  bot.onText(/^(\/balance|💰 Balance)$/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
      const [rows] = await db.query(
        "SELECT wallet_balance FROM users WHERE telegram_id = ?",
        [telegramId]
      );

      if (rows.length === 0) {
        return bot.sendMessage(
          chatId,
          "⚠️ You are not registered yet. Please use /start first."
        );
      }

      const balance = parseFloat(rows[0].wallet_balance || 0).toFixed(8);
      bot.sendMessage(chatId, `💰 Your current balance is: *${balance} TRX*`, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("❌ Balance fetch error:", error);
      bot.sendMessage(chatId, "❌ Failed to fetch your balance. Try again later.");
    }
  });
};
