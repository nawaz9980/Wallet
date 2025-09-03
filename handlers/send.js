// 📌 handlers/send.js
const axios = require("axios");
const qs = require("qs");

// Keep a memory lock to prevent double payouts
const confirmedTx = new Set();

module.exports = (bot, db) => {
 bot.onText(/^(\/withdraw|💸 Withdraw)$/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
      // 1) Get user_id + balance
      const [users] = await db.query(
        "SELECT id, wallet_balance FROM users WHERE telegram_id = ? LIMIT 1",
        [telegramId]
      );
      if (users.length === 0) {
        return bot.sendMessage(chatId, "❌ Please register first with /start.");
      }

      const userId = users[0].id;
      const balance = parseFloat(users[0].wallet_balance);

      // 2) Get linked wallet email
      const [walletRows] = await db.query(
        "SELECT wallet_email FROM wallet WHERE user_id = ? LIMIT 1",
        [userId]
      );
      if (walletRows.length === 0 || !walletRows[0].wallet_email) {
        return bot.sendMessage(
          chatId,
          "⚠️ You don’t have a withdrawal wallet set yet.\n\n👉 Please set your wallet email using: `/wallet @@FiewinGamesRobot`"
        );
      }

      const walletEmail = walletRows[0].wallet_email;

      // 3) Ask for amount
      await bot.sendMessage(
        chatId,
        `💰 Enter amount to withdraw (min 0.001 TRX)\n\n🔐 Destination: \`${walletEmail}\``,
        { parse_mode: "Markdown" }
      );

      // Safer one-time listener
      const onReply = async (reply) => {
        if (reply.chat.id !== chatId || reply.from.id !== telegramId) return;
        bot.removeListener("message", onReply);

        const amount = parseFloat((reply.text || "").trim());
        if (!Number.isFinite(amount) || amount < 0.001) {
          return bot.sendMessage(chatId, "❌ Invalid amount. Minimum is 0.001 TRX.");
        }

        if (balance < amount) {
          return bot.sendMessage(
            chatId,
            `❌ Insufficient balance.\nYour balance: *${balance.toFixed(8)} TRX*`,
            { parse_mode: "Markdown" }
          );
        }

        // 4) Confirm before sending
        await bot.sendMessage(
          chatId,
          `✅ Ready to send *${amount.toFixed(8)} TRX* to \`${walletEmail}\`?\n\nPress Confirm to proceed.`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Confirm",
                    callback_data: `confirm_send:${telegramId}:${amount.toFixed(8)}`,
                  },
                  { text: "❌ Cancel", callback_data: `cancel_send:${telegramId}` },
                ],
              ],
            },
          }
        );
      };

      bot.on("message", onReply);
    } catch (error) {
      console.error("❌ /send error:", error);
      bot.sendMessage(chatId, "❌ Something went wrong. Try again later.");
    }
  });

  // 5) Handle confirmation buttons
  bot.on("callback_query", async (query) => {
    try {
      const chatId = query.message?.chat?.id;
      if (!chatId || !query.data) return;

      const [action, tgIdStr, amtStr] = query.data.split(":");
      const fromId = query.from.id.toString();

      if (!tgIdStr || fromId !== tgIdStr) {
        return bot.answerCallbackQuery(query.id, { text: "Not authorized.", show_alert: true });
      }

      if (action === "cancel_send") {
        await bot.answerCallbackQuery(query.id, { text: "Cancelled." });
        return bot.editMessageText("❌ Withdrawal cancelled.", {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
      }

      if (action !== "confirm_send") return;

      const amount = parseFloat(amtStr);
      if (!Number.isFinite(amount) || amount < 0.001) {
        return bot.answerCallbackQuery(query.id, { text: "Invalid amount.", show_alert: true });
      }

      const lockKey = `${tgIdStr}:${amount}`;
      if (confirmedTx.has(lockKey)) {
        return bot.answerCallbackQuery(query.id, { text: "Already processed.", show_alert: true });
      }
      confirmedTx.add(lockKey);

      // ⏳ Edit message immediately to disable multiple clicks
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: chatId,
        message_id: query.message.message_id,
      });

      // 🔄 Re-validate user + wallet
      const [userRows] = await db.query(
        "SELECT id, wallet_balance FROM users WHERE telegram_id = ? LIMIT 1",
        [tgIdStr]
      );
      if (userRows.length === 0) {
        return bot.answerCallbackQuery(query.id, { text: "User not found.", show_alert: true });
      }

      const userId = userRows[0].id;
      const balance = parseFloat(userRows[0].wallet_balance);
      if (balance < amount) {
        return bot.editMessageText(
          `❌ Insufficient balance.\nYour balance: *${balance.toFixed(8)} TRX*`,
          { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" }
        );
      }

      const [walletRows] = await db.query(
        "SELECT wallet_email FROM wallet WHERE user_id = ? LIMIT 1",
        [userId]
      );
      if (walletRows.length === 0 || !walletRows[0].wallet_email) {
        return bot.editMessageText(
          "⚠️ You don’t have a withdrawal wallet set yet.\n\n👉 Please set your wallet email using: `/wallet your@email.com`",
          { chat_id: chatId, message_id: query.message.message_id }
        );
      }

      const walletEmail = walletRows[0].wallet_email;

      // 6) Call FaucetPay API
      try {
        const apiKey = process.env.FAUCETPAY_API_KEY;
        if (!apiKey) {
          return bot.editMessageText("❌ Server misconfigured: missing FAUCETPAY_API_KEY.", {
            chat_id: chatId,
            message_id: query.message.message_id,
          });
        }

        const satoshis = Math.floor(amount * 1e8);
        const body = qs.stringify({
          api_key: apiKey,
          amount: satoshis,
          to: walletEmail,
          currency: "TRX",
        });

        const resp = await axios.post("https://faucetpay.io/api/v1/send", body, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 15000,
        });

        const data = resp.data || {};
        if (data.status === 200) {
          // Deduct balance
          await db.query(
            "UPDATE users SET wallet_balance = wallet_balance - ? WHERE telegram_id = ?",
            [amount, tgIdStr]
          );

          const txid = data.payout_id || data.transactionId || "N/A";

          await bot.answerCallbackQuery(query.id, { text: "Sent ✅" });
          await bot.editMessageText(
            `✅ Successfully sent *${amount.toFixed(8)} TRX* to \`${walletEmail}\`\n🆔 TxID: \`${txid}\``,
            { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" }
          );

          // 📢 Send log to channel
          const LOG_CHANNEL = process.env.PAYMENT_LOG_CHANNEL_ID;
          if (LOG_CHANNEL) {
            bot.sendMessage(
              LOG_CHANNEL,
              `📤 *Payment Sent!*\n\n👤 User: [${query.from.first_name}](tg://user?id=${tgIdStr})\n💰 Amount: *${amount.toFixed(8)} TRX*\n📧 Wallet: \`${walletEmail}\`\n🆔 TxID: \`${txid}\``,
              {
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🤖 Open Bot", url: `https://t.me/FiewinGamesRobot` }],
                  ],
                },
              }
            );
          }
        } else {
          return bot.editMessageText(
            `❌ FaucetPay Error: ${data.message || "Unknown error"}`,
            { chat_id: chatId, message_id: query.message.message_id }
          );
        }
      } catch (apiErr) {
        console.error("FaucetPay API Error:", apiErr.response?.data || apiErr.message);
        return bot.editMessageText(
          "❌ Failed to process withdrawal. Please try again later.",
          { chat_id: chatId, message_id: query.message.message_id }
        );
      }
    } catch (err) {
      console.error("❌ send callback error:", err);
    }
  });
};
