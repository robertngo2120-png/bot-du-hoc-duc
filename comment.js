require('dotenv').config();
const axios = require('axios');

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.FB_PAGE_ID;

const PUBLIC_REPLY = 'Cảm ơn anh/chị đã quan tâm! Bên em vừa nhắn tin để tư vấn chi tiết hơn cho mình ạ';
const MESSENGER_OPENER = 'Chào anh/chị! Em thấy anh/chị vừa quan tâm đến chương trình du học nghề Đức của ICOEuro.\n\nAnh/chị muốn tìm hiểu thêm điều gì ạ?';

// Tránh reply trùng cùng 1 comment
const replied = new Set();

async function handleComment(data) {
  try {
    const commentId = data.comment_id || data.value?.comment_id;
    const commenterId = data.sender_id || data.value?.sender_id;
    const verb = data.verb || data.value?.verb;
    const item = data.item || data.value?.item;

    // Chỉ xử lý comment mới, bỏ qua edit/delete và reply
    if (verb !== 'add' || item !== 'comment') return;

    // Bỏ qua comment của chính page
    if (!commenterId || commenterId.toString() === PAGE_ID?.toString()) return;

    // Bỏ qua nếu đã reply rồi
    if (replied.has(commentId)) return;
    replied.add(commentId);

    // Giới hạn Set để tránh memory leak
    if (replied.size > 1000) {
      const first = replied.values().next().value;
      replied.delete(first);
    }

    console.log(`New comment: ${commentId} from ${commenterId}`);

    // Reply công khai vào comment
    await replyComment(commentId);

    // Gửi Messenger mở đầu cuộc tư vấn
    await sendMessenger(commenterId);

  } catch (err) {
    console.error('handleComment error:', err?.response?.data || err.message);
  }
}

async function replyComment(commentId) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${commentId}/comments`,
    { message: PUBLIC_REPLY },
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  );
}

async function sendMessenger(userId) {
  await axios.post(
    'https://graph.facebook.com/v19.0/me/messages',
    {
      recipient: { id: userId },
      message: { text: MESSENGER_OPENER }
    },
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  );
}

module.exports = { handleComment };
