require('dotenv').config();
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { saveLead } = require('./sheets');
const { notifyTelegram } = require('./notify');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// Lưu trạng thái hội thoại theo senderId
const sessions = new Map();

function getSession(senderId) {
  if (!sessions.has(senderId)) {
    sessions.set(senderId, { step: 'start' });
  }
  return sessions.get(senderId);
}

async function sendText(recipientId, text) {
  await axios.post(
    'https://graph.facebook.com/v19.0/me/messages',
    {
      recipient: { id: recipientId },
      message: { text }
    },
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  );
}

async function sendQuickReplies(recipientId, text, replies) {
  await axios.post(
    'https://graph.facebook.com/v19.0/me/messages',
    {
      recipient: { id: recipientId },
      message: {
        text,
        quick_replies: replies.map(r => ({
          content_type: 'text',
          title: r.title,
          payload: r.payload
        }))
      }
    },
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  );
}

async function getFbName(senderId) {
  try {
    const res = await axios.get(`https://graph.facebook.com/${senderId}`, {
      params: { fields: 'first_name,last_name', access_token: PAGE_ACCESS_TOKEN }
    });
    return `${res.data.first_name} ${res.data.last_name}`.trim();
  } catch {
    return 'Khách';
  }
}

async function askGemini(userText) {
  const prompt = `Bạn là tư vấn viên du học Đức chuyên nghiệp, thân thiện.
Trả lời ngắn gọn, rõ ràng, không hứa suông, tạo cảm giác tin tưởng.
Nếu thiếu thông tin thì hỏi lại thông minh.

Câu hỏi của khách: ${userText}`;

  const result = await model.generateContent(prompt);
  return (await result.response).text();
}

async function handleMessage(event) {
  const senderId = event.sender.id;
  const session = getSession(senderId);

  let userText = '';

  if (event.postback) {
    userText = event.postback.payload;
  } else if (event.message?.quick_reply) {
    userText = event.message.quick_reply.payload;
  } else if (event.message?.text) {
    userText = event.message.text.trim();
  } else {
    return;
  }

  const INTERESTS = {
    INTEREST_AUSBILDUNG: 'Ausbildung (Đào tạo nghề)',
    INTEREST_UNIVERSITY: 'Du học Đại học',
    INTEREST_LANGUAGE: 'Học tiếng Đức'
  };

  switch (session.step) {
    case 'start':
      await sendQuickReplies(
        senderId,
        'Chào bạn! Mình là trợ lý tư vấn du học Đức 🇩🇪\nBạn đang quan tâm đến hướng nào?',
        [
          { title: '🎓 Ausbildung', payload: 'INTEREST_AUSBILDUNG' },
          { title: '🏫 Du học Đại học', payload: 'INTEREST_UNIVERSITY' },
          { title: '📚 Học tiếng Đức', payload: 'INTEREST_LANGUAGE' }
        ]
      );
      session.step = 'interest';
      break;

    case 'interest':
      if (INTERESTS[userText]) {
        session.interest = INTERESTS[userText];
        await sendText(senderId, `Bạn cho mình biết tên của bạn là gì nhé? 😊`);
        session.step = 'name';
      } else {
        const reply = await askGemini(userText);
        await sendText(senderId, reply);
        await sendQuickReplies(
          senderId,
          'Bạn đang quan tâm đến hướng nào?',
          [
            { title: '🎓 Ausbildung', payload: 'INTEREST_AUSBILDUNG' },
            { title: '🏫 Du học Đại học', payload: 'INTEREST_UNIVERSITY' },
            { title: '📚 Học tiếng Đức', payload: 'INTEREST_LANGUAGE' }
          ]
        );
      }
      break;

    case 'name':
      if (userText.length >= 2 && !INTERESTS[userText]) {
        session.name = userText;
        await sendText(senderId, `${session.name} hiện đang học lớp mấy hoặc đã tốt nghiệp chưa? 📖`);
        session.step = 'level';
      } else {
        const reply = await askGemini(userText);
        await sendText(senderId, reply);
        await sendText(senderId, 'Bạn cho mình biết tên của bạn là gì nhé? 😊');
      }
      break;

    case 'level':
      session.level = userText;
      await sendText(senderId, 'Bạn dự định muốn sang Đức vào khoảng năm nào? 📅');
      session.step = 'timeline';
      break;

    case 'timeline':
      session.timeline = userText;
      await sendText(
        senderId,
        `Cảm ơn ${session.name}! Để tư vấn viên liên hệ tư vấn chi tiết hơn, bạn cho mình xin số điện thoại nhé 📱`
      );
      session.step = 'phone';
      break;

    case 'phone': {
      const cleaned = userText.replace(/\s|-/g, '');
      const isPhone = /^(\+84|0)[0-9]{8,10}$/.test(cleaned);

      if (isPhone) {
        session.phone = cleaned;
        session.fbName = await getFbName(senderId);
        session.fbId = senderId;
        session.timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

        await saveLead(session);
        await notifyTelegram(session);

        await sendText(
          senderId,
          `Cảm ơn ${session.name}! Tư vấn viên sẽ liên hệ với bạn sớm nhất có thể 🙏\n\nNếu có thêm câu hỏi cứ nhắn mình nhé!`
        );
        session.step = 'done';
      } else {
        await sendText(senderId, 'Số điện thoại chưa đúng định dạng, bạn nhập lại giúp mình nhé (VD: 0912345678) 📱');
      }
      break;
    }

    case 'done': {
      const reply = await askGemini(userText);
      await sendText(senderId, reply);
      break;
    }
  }
}

module.exports = { handleMessage };
