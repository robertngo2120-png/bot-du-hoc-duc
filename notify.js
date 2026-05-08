const TelegramBot = require('node-telegram-bot-api');

const tgBot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
const OWNER_ID = Number(process.env.OWNER_ID);

function field(label, value) {
  const missing = !value || value === 'Chưa xác định';
  return `${missing ? '⚠️' : '✅'} ${label}: ${missing ? 'Chưa rõ' : value}`;
}

async function notifyTelegram(lead) {
  const msg =
    `🔔 LEAD MỚI — MESSENGER\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📱 SĐT: ${lead.phone}\n` +
    `${field('Tên', lead.name)}\n` +
    `${field('Tỉnh/TP', lead.location)}\n` +
    `${field('Đối tượng', lead.relationship)}\n` +
    `${field('Năm sinh', lead.birthYear)}\n` +
    `${field('Quan tâm', lead.interest)}\n` +
    `${field('Trình độ', lead.level)}\n` +
    `${field('Timeline', lead.timeline)}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🕐 ${lead.timestamp}\n` +
    `🔗 https://m.me/${lead.fbId}`;

  await tgBot.sendMessage(OWNER_ID, msg);
}

module.exports = { notifyTelegram };
