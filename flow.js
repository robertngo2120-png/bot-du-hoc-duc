require('dotenv').config();
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { saveLead } = require('./sheets');
const { notifyTelegram } = require('./notify');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const { getSession, saveSession } = require('./sessions');

// Queue xử lý tin nhắn theo thứ tự từng user
const queues = new Map();

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
- 8-10 tháng: Học tiếng Đức đến B1 tại VN
- 4-6 tháng: Làm visa
- 4 tháng: Học B2 tại Đức
- 2,5-3,5 năm: Học nghề + thực tập có lương
- Sau đó: Đi làm chính thức, định cư

YÊU CẦU TIẾNG ĐỨC: Tối thiểu B1. Nếu chưa có → công ty có lộ trình học từ đầu (không đi sâu chi tiết).
CHI PHÍ CÔNG TY: KHÔNG đề cập số tiền cụ thể. Nếu khách hỏi → trả lời: "Chi phí cụ thể tùy theo từng trường hợp, chuyên viên sẽ tư vấn chi tiết và miễn phí cho anh/chị ạ." Không lảng tránh quá 1 lần.
CHƯƠNG TRÌNH KHÁC: Công ty có thêm chương trình 18B và du học Đại học, nhưng page này tập trung vào du học nghề. Nếu khách hỏi về các chương trình khác → ghi nhận và cho biết chuyên viên sẽ tư vấn phù hợp.

== GIỚI HẠN THÔNG TIN ==
QUAN TRỌNG: Chỉ nói những gì có trong tài liệu trên. Nếu câu hỏi vượt ngoài phạm vi hiểu biết → KHÔNG tự bịa, KHÔNG đoán mò. Thay vào đó nói: "Câu hỏi này cần chuyên viên tư vấn trực tiếp mới chính xác được ạ" rồi đề nghị để lại SĐT.

== CHIẾN LƯỢC TƯ VẤN ==
NGUYÊN TẮC CỐT LÕI: Đừng bán hàng ngay từ đầu. Hãy là người bạn đáng tin, lắng nghe và giải đáp thật sự trước.

GIAI ĐOẠN 1 — LẮNG NGHE & TRẢ LỜI (2-3 tin nhắn đầu):
- Chào hỏi tự nhiên, ấm áp
- Trả lời THẲNG vào câu hỏi của khách — không vòng vo, không lảng tránh
- Chưa hỏi tên, chưa hỏi thông tin cá nhân
- Mục tiêu: khách cảm thấy "à, chỗ này trả lời được, đáng tin"

GIAI ĐOẠN 2 — TẠO KẾT NỐI (3-5 tin nhắn):
- Hỏi thêm về hoàn cảnh của khách một cách TỰ NHIÊN (không phải hỏi form)
- Ví dụ: "Cháu đang học hay đi làm rồi ạ?" thay vì "Trình độ của bạn là gì?"
- Dần dần hiểu khách: độ tuổi, tình trạng, mong muốn
- Chia sẻ thêm thông tin phù hợp với hoàn cảnh của họ
- QUAN TRỌNG: Trong quá trình trò chuyện, hãy tự nhiên hỏi anh/chị và cháu đang ở tỉnh/thành phố nào. Lý do: Trung tâm đào tạo của ICOEuro có 2 cơ sở tại TP. Hồ Chí Minh — thông tin này giúp chuyên viên tư vấn lịch học phù hợp hơn.

GIAI ĐOẠN 3 — XIN SĐT (khi đã tạo đủ tin tưởng):
- Chỉ xin SĐT khi khách đã hỏi ít nhất 2-3 lượt và có vẻ quan tâm thật sự
- Câu xin SĐT phải TỰ NHIÊN, không xin xỏ, không gượng ép
- Framing: đây là bước tiếp theo có lợi cho KHÁCH, không phải cho mình
- Ví dụ tốt: "Để mình kết nối bạn với chuyên gia của ICOEuro — họ sẽ tư vấn riêng theo đúng hoàn cảnh của bạn, hoàn toàn miễn phí. Bạn hay dùng số nào để tiện liên lạc?"
- Ví dụ xấu: "Bạn cho mình xin số điện thoại nhé"

== XỬ LÝ ĐẦU VÀO ==
- Hiểu tiếng Việt KHÔNG DẤU và SAI CHÍNH TẢ — tự hiểu, không nhận xét
- Khách có thể là PHỤ HUYNH hỏi cho con → điều chỉnh xưng hô (anh/chị)
- Kiên nhẫn, ấm áp dù khách hỏi đi hỏi lại
- Nếu không hiểu → hỏi lại nhẹ nhàng, không nói "tôi không hiểu"

== PHONG CÁCH ==
- Ngắn gọn, tập trung vào đúng câu hỏi — không giải thích dài dòng
- Tự nhiên, chân thành — như người quen đang trao đổi, không phải nhân viên bán hàng
- EMOJI: hạn chế tối đa, chỉ dùng khi thật sự cần thiết
- Đối tượng chủ yếu là PHỤ HUYNH — xưng hô lịch sự (anh/chị), văn phong nghiêm túc nhưng gần gũi
- Tiếng Việt tự nhiên, không cứng nhắc, không sáo rỗng

== ĐỊNH DẠNG VĂN BẢN ==
QUAN TRỌNG: Tin nhắn hiển thị trên Facebook Messenger — KHÔNG hỗ trợ markdown.
- TUYỆT ĐỐI KHÔNG dùng: **bold**, *italic*, # heading, --- , ``` code ```
- KHÔNG dùng dấu * hay - để liệt kê
- Nếu cần liệt kê: dùng số thứ tự (1. 2. 3.) hoặc xuống dòng thông thường
- Văn bản thuần túy, đọc tự nhiên như tin nhắn thật
`;

function enqueue(senderId, fn) {
  if (!queues.has(senderId)) {
    queues.set(senderId, Promise.resolve());
  }
  const next = queues.get(senderId).then(fn).catch(err => console.error('Queue error:', err));
  queues.set(senderId, next);
}

async function sendText(recipientId, text) {
  await axios.post(
    'https://graph.facebook.com/v19.0/me/messages',
    { recipient: { id: recipientId }, message: { text } },
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

function extractPhone(text) {
  const cleaned = text.replace(/[\s\-\.]/g, '');
  const match = cleaned.match(/(\+84|0)[0-9]{8,11}/);
  return match ? match[0] : null;
}

function isGoodbye(text) {
  const t = text.toLowerCase();
  const keywords = [
    'thôi', 'không cần', 'khong can', 'bận rồi', 'ban roi',
    'hẹn sau', 'hen sau', 'tạm biệt', 'tam biet', 'bye', 'ok rồi',
    'không quan tâm', 'khong quan tam', 'không có nhu cầu',
    'thôi khỏi', 'thoi khoi', 'dừng lại', 'dung lai'
  ];
  return keywords.some(k => t.includes(k));
}

// Gemini trích xuất thông tin lead từ lịch sử hội thoại
async function extractLeadInfo(history) {
  const conversation = history.map(h => `${h.role === 'user' ? 'Khách' : 'Bot'}: ${h.text}`).join('\n');

  const prompt = `Từ đoạn hội thoại sau, hãy trích xuất thông tin theo định dạng JSON:
{
  "name": "tên khách hoặc null",
  "interest": "hướng quan tâm (Ausbildung/Đại học/Tiếng Đức) hoặc null",
  "level": "trình độ học vấn hoặc null",
  "timeline": "thời gian dự định hoặc null",
  "location": "tỉnh/thành phố khách đang ở hoặc null"
}
Chỉ trả về JSON, không giải thích thêm.

Hội thoại:
${conversation}`;

  try {
    const result = await model.generateContent(prompt);
    const text = (await result.response).text().trim();
    const json = text.replace(/```json|```/g, '').trim();
    return JSON.parse(json);
  } catch {
    return { name: null, interest: null, level: null, timeline: null };
  }
}

async function chat(session, userMessage) {
  // Thêm tin nhắn khách vào history
  session.history.push({ role: 'user', text: userMessage });
  session.turns++;

  // Tạo context từ history (giữ 10 tin nhắn gần nhất)
  const recentHistory = session.history.slice(-10);
  const conversationContext = recentHistory
    .slice(0, -1) // bỏ tin nhắn hiện tại
    .map(h => `${h.role === 'user' ? 'Khách' : 'Bot'}: ${h.text}`)
    .join('\n');

  // Phân tích dấu hiệu quan tâm thật sự từ lịch sử
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
    'b1', 'tiếng đức', 'tieng duc', 'học phí', 'hoc phi',
    'lương', 'luong', 'euro', 'chi phí', 'chi phi',
    'con tôi', 'con toi', 'con mình', 'con minh', 'muốn đi', 'muon di'
  ];

  const hasInterest = interestSignals.some(s => recentUserMessages.includes(s));
  const enoughTurns = session.turns >= 3;

  const turnInstruction = (hasInterest && enoughTurns)
    ? `LƯU Ý: Khách đã thể hiện quan tâm thật sự qua nội dung trò chuyện. Nếu chưa xin SĐT, hãy tự nhiên dẫn dắt để xin trong tin nhắn này — nhưng phải thật tự nhiên, không gượng ép.`
    : session.turns >= 6
    ? `LƯU Ý: Cuộc trò chuyện đã khá dài. Nếu thấy thời điểm phù hợp, có thể nhẹ nhàng đề xuất để chuyên viên liên hệ tư vấn trực tiếp.`
    : '';

  const prompt = `${SYSTEM_PROMPT}

${conversationContext ? `LỊCH SỬ TRÒ CHUYỆN:\n${conversationContext}\n` : ''}
${turnInstruction}

Tin nhắn mới nhất của khách: "${userMessage}"

Hãy trả lời tự nhiên, phù hợp với giai đoạn của cuộc trò chuyện.`;

  const result = await model.generateContent(prompt);
  const reply = (await result.response).text();

  // Lưu câu trả lời vào history
  session.history.push({ role: 'bot', text: reply });

  return reply;
}

async function processMessage(event) {
  const senderId = event.sender.id;
  const session = getSession(senderId);

  // Xử lý tin nhắn không phải text (ảnh, voice, sticker, file...)
  if (event.message && !event.message.text && !event.message.quick_reply) {
    await sendText(senderId,
      'Dạ hiện tại em chỉ hỗ trợ qua tin nhắn văn bản. Anh/chị có thể nhắn nội dung cần tư vấn, em sẽ hỗ trợ ngay ạ.'
    );
    return;
  }

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

  // Xử lý khách muốn dừng
  if (isGoodbye(userText) && session.step !== 'done') {
    await sendText(senderId,
      'Dạ anh/chị cứ thoải mái. Khi nào cần tư vấn thêm thì nhắn em, bên ICOEuro luôn sẵn sàng hỗ trợ ạ.'
    );
    session.step = 'paused';
    return;
  }

  // Nếu trước đó khách dừng mà giờ nhắn lại → tiếp tục bình thường
  if (session.step === 'paused') {
    session.step = 'chatting';
  }

  if (session.step === 'done') {
    // Sau khi có SĐT — vẫn trả lời câu hỏi thêm
    const reply = await chat(session, userText);
    await sendText(senderId, reply);
    return;
  }

  // Kiểm tra có số điện thoại trong tin nhắn không
  const phone = extractPhone(userText);

  if (phone) {
    // Có SĐT — lưu lead
    session.history.push({ role: 'user', text: userText });
    const info = await extractLeadInfo(session.history);
    const fbName = await getFbName(senderId);

    const leadData = {
      name: info.name || fbName,
      phone,
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

    // Tin nhắn xác nhận sau khi có SĐT — nhẹ nhàng, chuyên nghiệp
    await sendText(senderId,
      `Cảm ơn anh/chị đã tin tưởng ICOEuro. Em sẽ chuyển thông tin đến chuyên viên phòng tư vấn, anh/chị sẽ được liên hệ trong thời gian sớm nhất.\n\nAnh/chị có thêm câu hỏi nào cần giải đáp không ạ?`
    );
    session.step = 'done';
  } else {
    // Hội thoại bình thường
    const reply = await chat(session, userText);
    await sendText(senderId, reply);
  }

  saveSession(senderId, session);
}

async function handleMessage(event) {
  const senderId = event.sender.id;
  enqueue(senderId, () => processMessage(event));
}

module.exports = { handleMessage };
