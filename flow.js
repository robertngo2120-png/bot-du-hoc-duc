require('dotenv').config();
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { saveLead } = require('./sheets');
const { notifyTelegram } = require('./notify');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const sessions = new Map();

// Kiến thức về công ty — đưa vào mọi prompt Gemini
const COMPANY_KNOWLEDGE = `
Bạn là trợ lý tư vấn của ICOEuro — đơn vị tư vấn du học nghề Đức (Ausbildung) uy tín tại Việt Nam.

== ĐỐI TƯỢNG TUYỂN SINH ==
- Nam, nữ: 18 - 30 tuổi
- Sức khỏe tốt, không mắc bệnh truyền nhiễm (HIV, Viêm gan B...)
- Không có tiền án tiền sự, không có người thân bất hợp pháp tại châu Âu
- Tốt nghiệp THPT trở lên, học lực và hạnh kiểm 3 năm THPT từ mức Khá trở lên
- Có khả năng học ngoại ngữ, đạt B1 tiếng Đức tại Việt Nam trước khi đi

== NGÀNH NGHỀ ĐÀO TẠO ==
Kỹ thuật: Cơ khí, Công nghệ ô tô, Điện - Điện tử, Vận hành máy CNC, Xây dựng, CNTT
Dịch vụ: Nhà hàng, Khách sạn, Đầu bếp, Chế biến thực phẩm, Bán hàng, Làm đẹp/Kosmetik, Hướng dẫn máy trò chơi
Y tế - Chăm sóc sức khỏe: Điều dưỡng đa khoa, Trợ lý điều dưỡng, Trợ lý nha khoa

== QUYỀN LỢI HỌC VIÊN ==
✅ Miễn 100% học phí trong suốt quá trình học tại Đức
✅ Lương trợ cấp thực tập: 1.000 - 1.400 EUR/tháng
✅ Làm thêm trên 1.000h/năm với lương 9-15 EUR/h
✅ Tự do đi lại 29 nước EU
✅ Vé tàu toàn nước Đức + một số nước châu Âu chỉ 49 EUR/tháng
✅ Bằng chuyên ngành + bằng tiếng Đức có giá trị toàn thế giới
✅ Cam kết có việc làm tại Đức, lương khởi điểm từ 3.000 EUR/tháng sau thuế
✅ Về Việt Nam làm việc: lương tối thiểu 30 triệu đồng/tháng
✅ Định cư sau 2 năm, nhập quốc tịch sau 5 năm làm việc liên tục

== LỘ TRÌNH ==
Giai đoạn 1 (8-10 tháng): Học và thi đạt chứng chỉ tiếng Đức B1 tại Việt Nam
Giai đoạn 2 (4-6 tháng): Hoàn thiện thủ tục xin visa
Giai đoạn 3 (4 tháng): Học tiếng Đức B2 tại Đức
Giai đoạn 4 (2,5-3,5 năm): Học nghề lý thuyết (miễn phí) + thực tập có lương tại doanh nghiệp
Giai đoạn 5: Đi làm chính thức 3.000 EUR/tháng, định cư và nhập quốc tịch

== NGUYÊN TẮC TƯ VẤN ==
VỀ CHI PHÍ: KHÔNG đề cập chi phí cụ thể của công ty — chuyên gia sale sẽ tư vấn trực tiếp. Chỉ nhấn mạnh học tại Đức miễn phí 100% + có lương.
VỀ TIẾNG ĐỨC: Nếu khách chưa có B1 → giới thiệu SƠ BỘ rằng công ty có lộ trình đào tạo tiếng từ đầu, KHÔNG đi sâu chi tiết.
PHONG CÁCH: Thân thiện tự nhiên như người bạn, ngắn gọn, súc tích, tạo cảm giác tin tưởng, dùng tiếng Việt tự nhiên, emoji nhẹ nhàng.
`;

function getSession(senderId) {
  if (!sessions.has(senderId)) {
    sessions.set(senderId, { step: 'start', history: [] });
  }
  return sessions.get(senderId);
}

async function sendText(recipientId, text) {
  await axios.post(
    'https://graph.facebook.com/v19.0/me/messages',
    { recipient: { id: recipientId }, message: { text } },
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

async function askGemini(userText, session, extraInstruction = '') {
  // Tóm tắt context hiện tại của session
  const sessionContext = session.name || session.interest || session.level
    ? `THÔNG TIN KHÁCH ĐÃ BIẾT:
- Tên: ${session.name || 'chưa biết'}
- Quan tâm: ${session.interest || 'chưa biết'}
- Trình độ: ${session.level || 'chưa biết'}
- Timeline: ${session.timeline || 'chưa biết'}`
    : '';

  const prompt = `${COMPANY_KNOWLEDGE}

${sessionContext}

${extraInstruction}

Tin nhắn của khách: "${userText}"

Hãy trả lời tự nhiên, phù hợp với ngữ cảnh. Không lặp lại thông tin khách đã biết.`;

  const result = await model.generateContent(prompt);
  return (await result.response).text();
}

// Câu chốt xin SĐT — tự nhiên, không xin xỏ
async function buildPhoneClosing(session) {
  const prompt = `${COMPANY_KNOWLEDGE}

THÔNG TIN KHÁCH:
- Tên: ${session.name}
- Quan tâm: ${session.interest}
- Trình độ: ${session.level}
- Timeline muốn đi: ${session.timeline}

Nhiệm vụ: Viết 1 tin nhắn ngắn để xin số điện thoại của khách một cách TỰ NHIÊN, NHẸ NHÀNG.
- Không dùng từ "xin", không懇 cầu
- Tạo cảm giác đây là bước tiếp theo hữu ích cho KHÁCH, không phải cho mình
- Khách cảm thấy thoải mái và muốn để lại SĐT
- Tối đa 3 câu`;

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
    INTEREST_AUSBILDUNG: 'Ausbildung (Du học nghề)',
    INTEREST_UNIVERSITY: 'Du học Đại học',
    INTEREST_LANGUAGE: 'Học tiếng Đức'
  };

  switch (session.step) {
    case 'start':
      await sendQuickReplies(
        senderId,
        'Chào bạn! Mình là trợ lý tư vấn du học Đức của ICOEuro 🇩🇪\nBạn đang quan tâm đến hướng nào?',
        [
          { title: '🎓 Du học nghề', payload: 'INTEREST_AUSBILDUNG' },
          { title: '🏫 Du học Đại học', payload: 'INTEREST_UNIVERSITY' },
          { title: '📚 Học tiếng Đức', payload: 'INTEREST_LANGUAGE' }
        ]
      );
      session.step = 'interest';
      break;

    case 'interest': {
      const textLower = userText.toLowerCase();
      let detectedInterest = null;

      if (INTERESTS[userText]) {
        detectedInterest = INTERESTS[userText];
      } else if (textLower.includes('ausbildung') || textLower.includes('nghề')) {
        detectedInterest = INTERESTS['INTEREST_AUSBILDUNG'];
      } else if (textLower.includes('đại học') || textLower.includes('university')) {
        detectedInterest = INTERESTS['INTEREST_UNIVERSITY'];
      } else if (textLower.includes('tiếng') || textLower.includes('ngôn ngữ')) {
        detectedInterest = INTERESTS['INTEREST_LANGUAGE'];
      }

      if (detectedInterest) {
        session.interest = detectedInterest;
        await sendText(senderId, 'Bạn cho mình biết tên của bạn để tiện xưng hô nhé 😊');
        session.step = 'name';
      } else {
        // Khách hỏi gì đó khác — Gemini trả lời rồi hỏi lại
        const reply = await askGemini(userText, session,
          'Trả lời câu hỏi của khách ngắn gọn, sau đó dẫn dắt nhẹ nhàng để hỏi khách quan tâm hướng nào: Du học nghề, Đại học hay Học tiếng Đức.'
        );
        await sendText(senderId, reply);
        await sendQuickReplies(
          senderId,
          'Bạn đang quan tâm đến hướng nào?',
          [
            { title: '🎓 Du học nghề', payload: 'INTEREST_AUSBILDUNG' },
            { title: '🏫 Du học Đại học', payload: 'INTEREST_UNIVERSITY' },
            { title: '📚 Học tiếng Đức', payload: 'INTEREST_LANGUAGE' }
          ]
        );
      }
      break;
    }

    case 'name':
      if (userText.length >= 2 && !INTERESTS[userText]) {
        session.name = userText;
        // Gemini tạo câu hỏi về trình độ tự nhiên hơn
        const reply = await askGemini('', session,
          `Khách vừa cho biết tên là "${userText}". Hãy chào tên khách và hỏi về trình độ học vấn hiện tại (đang học hay đã tốt nghiệp, cấp độ nào) một cách tự nhiên. Tối đa 2 câu.`
        );
        await sendText(senderId, reply);
        session.step = 'level';
      } else {
        const reply = await askGemini(userText, session,
          'Trả lời ngắn, sau đó hỏi lại tên của khách.'
        );
        await sendText(senderId, reply);
      }
      break;

    case 'level':
      session.level = userText;
      // Gemini tạo câu hỏi về timeline tự nhiên
      const replyLevel = await askGemini('', session,
        `Khách vừa cho biết trình độ: "${userText}". Nhận xét ngắn về trình độ đó trong bối cảnh Ausbildung (tích cực nếu đủ điều kiện, hoặc sơ bộ giới thiệu lộ trình học tiếng nếu chưa đủ B1). Sau đó hỏi khách dự định muốn đi Đức vào khoảng thời gian nào. Tối đa 3 câu.`
      );
      await sendText(senderId, replyLevel);
      session.step = 'timeline';
      break;

    case 'timeline':
      session.timeline = userText;
      // Gemini tạo câu chốt xin SĐT tự nhiên
      const closing = await buildPhoneClosing(session);
      await sendText(senderId, closing);
      session.step = 'phone';
      break;

    case 'phone': {
      const cleaned = userText.replace(/[\s\-\.]/g, '');
      const isPhone = /^(\+84|0)[0-9]{8,11}$/.test(cleaned);

      if (isPhone) {
        session.phone = cleaned;
        session.fbName = await getFbName(senderId);
        session.fbId = senderId;
        session.timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

        await saveLead(session);
        await notifyTelegram(session);

        const thanks = await askGemini('', session,
          `Khách vừa để lại số điện thoại. Viết 1 tin nhắn cảm ơn ngắn gọn, ấm áp. Cho khách biết chuyên gia sẽ liên hệ sớm. Khuyến khích khách hỏi thêm nếu cần. Tối đa 3 câu.`
        );
        await sendText(senderId, thanks);
        session.step = 'done';
      } else {
        // Khách đang hỏi thêm thay vì để SĐT — Gemini trả lời rồi nhắc lại
        const reply = await askGemini(userText, session,
          `Khách chưa để lại số điện thoại mà đang hỏi thêm hoặc chia sẻ thêm thông tin. Hãy trả lời câu hỏi/nội dung đó một cách tự nhiên, thân thiện. Sau đó nhẹ nhàng dẫn dắt lại để khách để lại số điện thoại — nhưng không được gượng ép, phải thật tự nhiên.`
        );
        await sendText(senderId, reply);
      }
      break;
    }

    case 'done': {
      const reply = await askGemini(userText, session,
        'Khách đã để lại SĐT rồi. Trả lời câu hỏi của khách thân thiện, ngắn gọn. Nếu câu hỏi quá chi tiết về chi phí hay hồ sơ, nhắc nhẹ rằng chuyên gia sẽ tư vấn kỹ hơn khi liên hệ.'
      );
      await sendText(senderId, reply);
      break;
    }
  }
}

module.exports = { handleMessage };
