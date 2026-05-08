const TelegramBot = require('node-telegram-bot-api');

const tgBot = new TelegramBot(process.env.BOT_TOKEN);
const OWNER_ID = Number(process.env.OWNER_ID);

async function notifyTelegram(session) {
  const msg =
    `🔥 LEAD MỚI — MESSENGER\n\n` +
    `👤 Tên: ${session.name}\n` +
    `📱 SĐT: ${session.phone}\n` +
    `🎯 Quan tâm: ${session.interest}\n` +
    `📚 Trình độ: ${session.level}\n` +
    `📅 Timeline: ${session.timeline}\n` +
    `🕐 Thời gian: ${session.timestamp}\n` +
    `🔗 Facebook: https://m.me/${session.fbId}`;

  await tgBot.sendMessage(OWNER_ID, msg);
}

module.exports = { notifyTelegram };
