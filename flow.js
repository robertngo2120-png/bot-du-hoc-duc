require('dotenv').config();
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { saveLead } = require('./sheets');
const { notifyTelegram } = require('./notify');
const { getSession, saveSession, cleanOldSessions } = require('./sessions');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
];

const models = MODEL_CHAIN.map(m => ({
  name: m,
  instance: genAI.getGenerativeModel({ model: m })
}));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function generateContent(prompt) {
  for (let i = 0; i < models.length; i++) {
    const { name, instance } = models[i];
    try {
      if (i > 0) await sleep(1000);
      const result = await instance.generateContent(prompt);
      if (i > 0) console.log(`Fallback success: ${name}`);
      return (await result.response).text();
    } catch (err) {
      const isOverload = err.message?.includes('503') ||
        err.message?.includes('overloaded') ||
        err.message?.includes('high demand') ||
        err.message?.includes('unavailable') ||
        err.message?.includes('429');
      console.log(`[${name}] failed: ${err.message?.slice(0, 60)}`);
      if (!isOverload || i === models.length - 1) throw err;
    }
  }
}

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const queues = new Map();

// Dọn session cũ mỗi 24h
setInterval(cleanOldSessions, 24 * 60 * 60 * 1000);

const SYSTEM_PROMPT = `
Bạn là trợ lý tư vấn của ICOEuro — đơn vị tư vấn du học nghề Đức (Ausbildung) uy tín tại Việt Nam.

== KIẾN THỨC CÔNG TY ==
ĐỐI TƯỢNG: Nam/nữ 18-30 tuổi, tốt nghiệp THPT trở lên (học lực Khá+), sức khỏe tốt, không tiền án, không người thân bất hợp pháp tại EU.

NGÀNH ĐÀO TẠO:
- Kỹ thuật: Cơ khí, Ô tô, Điện-Điện tử, CNC, Xây dựng, CNTT
- Dịch vụ: Nhà hàng, Khách sạn, Đầu bếp, Thực phẩm, Bán hàng, Làm đẹp
- Y tế: Điều dưỡng đa khoa, Trợ lý điều dưỡng, Trợ lý nha khoa

QUYỀN LỢI:
- Học tại Đức: MIỄN PHÍ 100%
- Lương thực tập: 1.000 - 1.400 EUR/tháng
- Làm thêm: 9-15 EUR/h (hơn 1.000h/năm)
- Tự do đi lại 29 nước EU
- Sau tốt nghiệp: lương từ 3.000 EUR/tháng
- Về VN: lương tối thiểu 30 triệu/tháng
- Định cư sau 2 năm, quốc tịch sau 5 năm

LỘ TRÌNH:
- 8-10 tháng: Học tiếng Đức đến B1 tại VN (ICOEuro có lộ trình đào tạo từ đầu)
- 4-6 tháng: Làm visa
- 4 tháng: Học B2 tại Đức
- 2,5-3,5 năm: Học nghề + thực tập có lương
- Sau đó: Đi làm chính thức, định cư

YÊU CẦU TIẾNG ĐỨC: Tối thiểu B1. Nếu chưa có → giới thiệu sơ bộ lộ trình học tiếng, không đi sâu chi tiết.
CHI PHÍ CÔNG TY: KHÔNG đề cập số tiền. Nếu hỏi → "Chi phí tùy từng trường hợp, chuyên viên sẽ tư vấn miễn phí ạ." Không lảng tránh quá 1 lần.
CHƯƠNG TRÌNH KHÁC: Công ty có chương trình 18B và Đại học — page tập trung vào du học nghề. Nếu hỏi → ghi nhận, chuyên viên sẽ tư vấn.
ĐỊA ĐIỂM: ICOEuro có 2 cơ sở đào tạo tại TP. Hồ Chí Minh.

UY TÍN CÔNG TY: ICO Group thành lập năm 2008, ICOEuro là công ty con chuyên về du học nghề Đức. Có 1 trụ sở và 3 văn phòng tại Đức, hoạt động minh bạch và rõ ràng về pháp lý.

== XỬ LÝ PHẢN ĐỐI ==

NHÓM TÀI CHÍNH ("chi phí cao không?", "lương có đủ sống không?", "đầu tư nhiều lỡ không theo được"):
→ Nhấn mạnh: học phí tại Đức miễn phí 100%, lương thực tập 1.000-1.700 EUR/tháng đủ trang trải sinh hoạt và nhà ở tại Đức. Không cần lo về chi phí bên kia. Chi phí đầu tư ban đầu thì chuyên viên sẽ tư vấn cụ thể và miễn phí.

NHÓM AN TOÀN ("xa nhà có lo không?", "con gái đi một mình?", "kỳ thị người châu Á?", "ốm đau ai lo?"):
→ Khi tham gia chương trình, các bạn được pháp luật Đức bảo vệ đầy đủ. ICOEuro có 1 trụ sở và 3 văn phòng tại Đức — luôn sẵn sàng hỗ trợ khi cần. Trấn an nhẹ nhàng, không đi quá sâu, xin SĐT để chuyên viên tư vấn chi tiết hơn.

NHÓM NĂNG LỰC ("con học bình thường có được không?", "tiếng Đức chưa biết?", "lỡ không theo được?"):
→ Trấn an nhẹ nhàng: công ty có lộ trình đào tạo bài bản từ đầu, nhiều bạn xuất phát điểm tương tự vẫn thành công. Phần này chuyên viên sale sẽ thuyết phục tốt hơn — xin SĐT để kết nối.

NHÓM UY TÍN ("sợ lừa đảo?", "chỗ nào cũng nói hay?"):
→ ICO Group hoạt động từ 2008, ICOEuro có văn phòng thực tế tại Đức, pháp lý rõ ràng. Anh/chị có thể tìm hiểu thêm về ICO Group và ICOEuro trên internet. Không cần thuyết phục quá nhiều — xin SĐT để chuyên viên giới thiệu cụ thể hơn.

NHÓM DO DỰ ("để bàn gia đình", "visa có bị từ chối không?", "bằng có được công nhận?", "đang đi làm bỏ có đáng không?", "ở tỉnh xa lên TPHCM học bất tiện không?"):
→ Hoàn toàn thông cảm với băn khoăn của anh/chị. Trấn an nhẹ nhàng, không ép. Xin SĐT để chuyên viên giải đáp chi tiết và miễn phí — đây là bước tốt nhất để có câu trả lời chính xác cho từng trường hợp.

NGUYÊN TẮC XỬ LÝ PHẢN ĐỐI:
- Luôn thừa nhận lo lắng của khách trước ("Dạ lo lắng đó của anh/chị hoàn toàn có lý...")
- Trả lời ngắn gọn, đủ để trấn an — không giải thích dài dòng
- Kết thúc bằng đề nghị kết nối chuyên viên một cách tự nhiên
- KHÔNG hứa hẹn những điều không chắc chắn

== GIỚI HẠN THÔNG TIN ==
Chỉ nói những gì có trong tài liệu. Nếu vượt phạm vi → "Câu hỏi này cần chuyên viên tư vấn trực tiếp mới chính xác ạ" rồi đề nghị để lại SĐT. KHÔNG tự bịa, KHÔNG đoán mò.

== CHIẾN LƯỢC TƯ VẤN ==
NGUYÊN TẮC: Lắng nghe trước, tư vấn thật, tạo tin tưởng, rồi mới xin SĐT. Không bán hàng ngay từ đầu.

GIAI ĐOẠN 1 — LẮNG NGHE (2-3 tin đầu):
- Chào hỏi tự nhiên, trả lời thẳng câu hỏi
- Chưa hỏi thông tin cá nhân
- Mục tiêu: khách thấy "chỗ này đáng tin, trả lời được"
- Nếu khách đến từ quảng cáo [Khách vừa nhắn tin qua quảng cáo Facebook] → chào hỏi thân thiện, hỏi anh/chị quan tâm điều gì về chương trình du học nghề Đức

GIAI ĐOẠN 2 — TẠO KẾT NỐI (3-5 tin):
- Tự nhiên tìm hiểu: chương trình này cho bản thân hay người thân (con cái)?
- Hỏi năm sinh một cách tự nhiên để tư vấn phù hợp
- Nếu đã biết từ context (VD: "con tôi", "tôi muốn đi") → KHÔNG hỏi lại
- Hỏi tỉnh/thành phố đang ở (vì trung tâm đào tạo tại TPHCM)
- Dần hiểu: trình độ, ngành quan tâm, timeline

XỬ LÝ TUỔI (sau khi biết năm sinh):
- Tính tuổi = 2025 - năm sinh
- Dưới 18: "Hiện cháu chưa đủ tuổi theo quy định, nhưng anh/chị có thể đăng ký tìm hiểu trước để chuẩn bị lộ trình — chuyên viên sẽ tư vấn cụ thể hơn ạ"
- 18-30: Đủ điều kiện, tiếp tục tư vấn bình thường
- Trên 30: "Với độ tuổi này chương trình Ausbildung sẽ không phù hợp, nhưng ICOEuro có các chương trình khác — chuyên viên sẽ tư vấn hướng phù hợp hơn cho anh/chị ạ"

GIAI ĐOẠN 3 — XIN SĐT (khi đã đủ tin tưởng):
- Chỉ xin khi khách đã hỏi 2-3 lượt và có dấu hiệu quan tâm thật
- Tự nhiên, không xin xỏ — framing: có lợi cho khách
- Ví dụ tốt: "Để chuyên viên ICOEuro tư vấn riêng và miễn phí cho trường hợp của anh/chị, anh/chị hay dùng số nào để tiện liên lạc ạ?"

== XỬ LÝ ĐẦU VÀO ==
- Hiểu tiếng Việt KHÔNG DẤU và SAI CHÍNH TẢ — tự hiểu, không nhận xét
- Phụ huynh hỏi cho con → xưng hô anh/chị, hỏi thông tin của con
- Kiên nhẫn, ấm áp dù hỏi đi hỏi lại
- Không hiểu → hỏi lại nhẹ nhàng

== PHONG CÁCH ==
- Ngắn gọn, đúng trọng tâm — không dài dòng
- Tự nhiên như người quen, không phải nhân viên bán hàng
- EMOJI: hạn chế tối đa
- Xưng hô: anh/chị (với phụ huynh), em (với bot)
- Tiếng Việt tự nhiên, không sáo rỗng

== ĐỊNH DẠNG ==
Facebook Messenger KHÔNG hỗ trợ markdown.
TUYỆT ĐỐI KHÔNG dùng: dấu **, dấu *, dấu #, dấu ---
Nếu liệt kê: dùng số (1. 2. 3.) hoặc xuống dòng thường
Văn bản thuần túy, như tin nhắn thật.
`;

// ── Helpers ──────────────────────────────────────────

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/#{1,6}\s?/g, '')
    .replace(/---+/g, '')
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, '')
    .replace(/^\s*[-*•]\s/gm, '')
    .trim();
}

function enqueue(senderId, fn) {
  if (!queues.has(senderId)) {
    queues.set(senderId, Promise.resolve());
  }
  const next = queues.get(senderId)
    .then(fn)
    .catch(err => console.error('Queue error:', err))
    .finally(() => {
      // Dọn queue entry nếu không còn tin nhắn nào đang chờ
      if (queues.get(senderId) === next) {
        queues.delete(senderId);
      }
    });
  queues.set(senderId, next);
}

async function sendText(recipientId, text) {
  try {
    await axios.post(
      'https://graph.facebook.com/v19.0/me/messages',
      { recipient: { id: recipientId }, message: { text } },
      { params: { access_token: PAGE_ACCESS_TOKEN } }
    );
  } catch (err) {
    const errData = err?.response?.data?.error;
    console.error('sendText error:', errData || err.message);

    // Cảnh báo Telegram khi token hết hạn
    if (errData?.code === 190) {
      alertTokenExpired();
    }
  }
}

let tokenAlertSent = false;
async function alertTokenExpired() {
  if (tokenAlertSent) return;
  tokenAlertSent = true;
  try {
    const { notifyTelegram } = require('./notify');
    const TelegramBot = require('node-telegram-bot-api');
    const tgBot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
    await tgBot.sendMessage(
      Number(process.env.OWNER_ID),
      '⚠️ CẢNH BÁO: Facebook Page Access Token đã hết hạn!\n\nBot đang không thể trả lời khách. Cần cập nhật token mới ngay!'
    );
  } catch (e) {
    console.error('alertTokenExpired error:', e.message);
  }
}

async function getFbName(senderId) {
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${senderId}`, {
      params: { fields: 'first_name,last_name', access_token: PAGE_ACCESS_TOKEN }
    });
    return `${res.data.first_name} ${res.data.last_name}`.trim();
  } catch {
    return 'Khách';
  }
}

function extractPhone(text) {
  const cleaned = text.replace(/[\s\-\.]/g, '');
  const match = cleaned.match(/(\+84|0)[0-9]{8,11}/);
  return match ? match[0] : null;
}

function isGoodbye(text) {
  const t = text.toLowerCase();
  const keywords = [
    'thôi', 'không cần', 'khong can', 'bận rồi', 'ban roi',
    'hẹn sau', 'hen sau', 'tạm biệt', 'tam biet', 'bye',
    'không quan tâm', 'khong quan tam', 'không có nhu cầu',
    'thôi khỏi', 'thoi khoi', 'dừng lại', 'dung lai'
  ];
  return keywords.some(k => t.includes(k));
}

// ── Gemini ───────────────────────────────────────────

async function extractLeadInfo(history) {
  const conversation = history
    .map(h => `${h.role === 'user' ? 'Khách' : 'Bot'}: ${h.text}`)
    .join('\n');

  const prompt = `Từ đoạn hội thoại sau, trích xuất thông tin theo định dạng JSON:
{
  "name": "tên khách hoặc null",
  "forSelf": true/false/null (true nếu hỏi cho bản thân, false nếu cho con/người thân),
  "relationship": "Bản thân / Con / Người thân khác hoặc null",
  "birthYear": năm sinh dạng số hoặc null,
  "interest": "Ausbildung / Du học Đại học / Học tiếng Đức hoặc null",
  "level": "trình độ học vấn hoặc null",
  "timeline": "thời gian dự định hoặc null",
  "location": "tỉnh/thành phố hoặc null"
}
Chỉ trả về JSON, không giải thích.

Hội thoại:
${conversation}`;

  try {
    const raw = (await generateContent(prompt)).trim();
    const json = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(json);
  } catch {
    return {
      name: null, forSelf: null, relationship: null,
      birthYear: null, interest: null, level: null,
      timeline: null, location: null
    };
  }
}

async function chat(session, userMessage) {
  session.history.push({ role: 'user', text: userMessage });
  session.turns++;

  const recentHistory = session.history.slice(-12);
  const conversationContext = recentHistory
    .slice(0, -1)
    .map(h => `${h.role === 'user' ? 'Khách' : 'Bot'}: ${h.text}`)
    .join('\n');

  const recentUserMessages = session.history
    .filter(h => h.role === 'user')
    .map(h => h.text.toLowerCase())
    .join(' ');

  const interestSignals = [
    'ngành', 'nganh', 'điều dưỡng', 'dieu duong', 'cơ khí', 'co khi',
    'ô tô', 'o to', 'khách sạn', 'khach san', 'nhà hàng', 'nha hang',
    'điện', 'dien', 'xây dựng', 'xay dung', 'cntt', 'it',
    'lộ trình', 'lo trinh', 'điều kiện', 'dieu kien', 'visa',
    'bao lâu', 'bao lau', 'khi nào', 'khi nao', 'năm nào', 'nam nao',
    'b1', 'tiếng đức', 'tieng duc', 'lương', 'luong', 'euro',
    'chi phí', 'chi phi', 'con tôi', 'con toi', 'muốn đi', 'muon di',
    'sinh năm', 'sinh nam', 'tuổi', 'tuoi'
  ];

  const hasInterest = interestSignals.some(s => recentUserMessages.includes(s));
  const enoughTurns = session.turns >= 3;

  const turnInstruction = (hasInterest && enoughTurns)
    ? 'LƯU Ý: Khách đã thể hiện quan tâm thật sự. Nếu chưa xin SĐT, hãy tự nhiên dẫn dắt để xin — nhưng phải thật tự nhiên, không gượng ép.'
    : session.turns >= 7
    ? 'LƯU Ý: Cuộc trò chuyện đã khá dài. Nếu thấy thời điểm phù hợp, nhẹ nhàng đề xuất để chuyên viên liên hệ tư vấn.'
    : '';

  const prompt = `${SYSTEM_PROMPT}
${conversationContext ? `\nLỊCH SỬ TRÒ CHUYỆN:\n${conversationContext}\n` : ''}
${turnInstruction}

Tin nhắn mới nhất của khách: "${userMessage}"

Hãy trả lời tự nhiên, phù hợp với giai đoạn của cuộc trò chuyện.`;

  try {
    const reply = stripMarkdown(await generateContent(prompt));
    session.history.push({ role: 'bot', text: reply });
    return reply;
  } catch (err) {
    console.error('All models failed:', err.message);
    return null;
  }
}

// ── Main handler ─────────────────────────────────────

async function processMessage(event) {
  const senderId = event.sender.id;
  const session = getSession(senderId);

  try {
    // Tin nhắn không phải text
    if (event.message && !event.message.text && !event.message.quick_reply) {
      await sendText(senderId,
        'Dạ hiện tại em chỉ hỗ trợ qua tin nhắn văn bản. Anh/chị có thể nhắn nội dung cần tư vấn, em sẽ hỗ trợ ngay ạ.'
      );
      return;
    }

    let userText = '';
    if (event.referral) {
      userText = '[Khách vừa nhắn tin qua quảng cáo Facebook]';
    } else if (event.postback) {
      userText = event.postback.payload;
    } else if (event.message?.quick_reply) {
      userText = event.message.quick_reply.payload;
    } else if (event.message?.text) {
      userText = event.message.text.trim();
    } else {
      return;
    }

    // Khách muốn dừng
    if (isGoodbye(userText) && session.step !== 'done') {
      await sendText(senderId,
        'Dạ anh/chị cứ thoải mái. Khi nào cần tư vấn thêm thì nhắn em, bên ICOEuro luôn sẵn sàng hỗ trợ ạ.'
      );
      session.step = 'paused';
      return;
    }

    // Khách nhắn lại sau khi dừng
    if (session.step === 'paused') {
      session.step = 'chatting';
    }

    // Sau khi có SĐT vẫn trả lời
    if (session.step === 'done') {
      const reply = await chat(session, userText);
      if (reply) await sendText(senderId, reply);
      return;
    }

    // Kiểm tra SĐT trong tin nhắn
    const phone = extractPhone(userText);

    if (phone) {
      session.history.push({ role: 'user', text: userText });
      const info = await extractLeadInfo(session.history);
      const fbName = await getFbName(senderId);

      const currentYear = new Date().getFullYear();
      const age = info.birthYear ? currentYear - info.birthYear : null;

      const leadData = {
        name: info.name || fbName,
        phone,
        forSelf: info.forSelf,
        relationship: info.relationship || 'Chưa xác định',
        birthYear: info.birthYear || 'Chưa xác định',
        age: age || 'Chưa xác định',
        interest: info.interest || 'Chưa xác định',
        level: info.level || 'Chưa xác định',
        timeline: info.timeline || 'Chưa xác định',
        location: info.location || 'Chưa xác định',
        fbName,
        fbId: senderId,
        timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
      };

      await saveLead(leadData);
      await notifyTelegram(leadData);

      await sendText(senderId,
        'Cảm ơn anh/chị đã tin tưởng ICOEuro. Em sẽ chuyển thông tin đến chuyên viên phòng tư vấn, anh/chị sẽ được liên hệ trong thời gian sớm nhất.\n\nAnh/chị có thêm câu hỏi nào cần giải đáp không ạ?'
      );
      session.step = 'done';
    } else {
      const reply = await chat(session, userText);
      if (reply) await sendText(senderId, reply);
    }
  } finally {
    // Luôn lưu session dù có lỗi hay không
    saveSession(senderId, session);
  }
}

async function handleMessage(event) {
  const senderId = event.sender.id;
  enqueue(senderId, () => processMessage(event));
}

module.exports = { handleMessage };
