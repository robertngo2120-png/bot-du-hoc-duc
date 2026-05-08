const TelegramBot = require('node-telegram-bot-api');

const tgBot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
const OWNER_ID = Number(process.env.OWNER_ID);

function field(label, value) {
  const missing = !value || value === 'Chưa xác định';
  return `${missing ? '⚠️' : '✅'} ${label}: ${missing ? 'Chưa rõ' : value}`;
}

async function notifyTelegram(lead) {
  const currentYear = new Date().getFullYear();
  const ageInfo = lead.birthYear && lead.birthYear !== 'Chưa xác định'
    ? `${lead.birthYear} (${currentYear - Number(lead.birthYear)} tuổi)`
    : 'Chưa rõ';

  const eligible = lead.age && lead.age !== 'Chưa xác định'
    ? (Number(lead.age) >= 18 && Number(lead.age) <= 30 ? '✅ Đủ điều kiện' : '⚠️ Cần xem lại')
    : '';

  const msg =
    `🔔 LEAD MỚI — MESSENGER\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📱 SĐT: ${lead.phone}\n` +
    `${field('Tên', lead.name)}\n` +
    `${field('Tỉnh/TP', lead.location)}\n` +
    `${field('Đối tượng', lead.relationship)}\n` +
    `${field('Năm sinh', ageInfo)} ${eligible}\n` +
    `${field('Quan tâm', lead.interest)}\n` +
    `${field('Trình độ', lead.level)}\n` +
    `${field('Timeline', lead.timeline)}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🕐 ${lead.timestamp}\n` +
    `🔗 https://m.me/${lead.fbId}`;

  await tgBot.sendMessage(OWNER_ID, msg);
}

module.exports = { notifyTelegram };
