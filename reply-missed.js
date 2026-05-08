require('dotenv').config();
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.FB_PAGE_ID;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const SYSTEM_PROMPT = `Bạn là trợ lý tư vấn của ICOEuro — đơn vị tư vấn du học nghề Đức (Ausbildung) uy tín tại Việt Nam.

THÔNG TIN CHƯƠNG TRÌNH:
- Độ tuổi: 18-30 tuổi, tốt nghiệp THPT trở lên
- Học phí tại Đức: MIỄN PHÍ 100%
- Lương thực tập: 1.000-1.400 EUR/tháng
- Ngành: Kỹ thuật (Cơ khí, Ô tô, Điện, CNC, Xây dựng, CNTT), Dịch vụ (Nhà hàng, Khách sạn, Đầu bếp, Làm đẹp), Y tế (Điều dưỡng, Trợ lý nha khoa)
- Lộ trình: 8-10 tháng học tiếng B1 → 4-6 tháng visa → sang Đức học nghề + thực tập có lương
- Sau tốt nghiệp: lương 3.000 EUR/tháng, định cư sau 2 năm
- Trung tâm: 2 cơ sở tại TP. Hồ Chí Minh
- ICO Group thành lập 2008, có văn phòng tại Đức

ĐẶT LỊCH HẸN: Bên em có thể sắp xếp lịch tư vấn trực tiếp hoặc online. Hỏi khách muốn tư vấn hình thức nào và thời gian thuận tiện, sau đó cho biết chuyên viên sẽ liên hệ xác nhận.
CHI PHÍ CÔNG TY: Không đề cập, chuyên viên sẽ tư vấn trực tiếp.

PHONG CÁCH: Ngắn gọn, thân thiện, xưng em/anh chị. Không dùng markdown. Trả lời đúng câu hỏi của khách.`;

async function getConversations() {
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${PAGE_ID}/conversations`,
    { params: { fields: 'id,participants,unread_count', access_token: PAGE_ACCESS_TOKEN } }
  );
  return res.data.data || [];
}

async function getLastUserMessage(convId) {
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${convId}/messages`,
    { params: { fields: 'message,from', limit: 5, access_token: PAGE_ACCESS_TOKEN } }
  );
  const messages = res.data.data || [];
  // Tìm tin nhắn cuối cùng từ khách (không phải page)
  const userMsg = messages.find(m => m.from?.id !== PAGE_ID);
  return userMsg?.message || null;
}

async function generateReply(userMessage) {
  const prompt = `${SYSTEM_PROMPT}\n\nKhách hỏi: "${userMessage}"\n\nHãy trả lời ngắn gọn, đúng trọng tâm câu hỏi. Nếu khách hỏi đặt lịch hẹn, hỏi thêm hình thức và thời gian thuận tiện.`;
  const result = await model.generateContent(prompt);
  return (await result.response).text()
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/#{1,6}\s?/g, '')
    .trim();
}

async function sendMessage(userId, text) {
  await axios.post(
    'https://graph.facebook.com/v19.0/me/messages',
    { recipient: { id: userId }, message: { text } },
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  );
}

async function run() {
  console.log('Fetching unread conversations...');
  const conversations = await getConversations();
  const unread = conversations.filter(c => c.unread_count > 0);
  console.log(`Found ${unread.length} unread conversations`);

  for (const conv of unread) {
    const user = (conv.participants?.data || []).find(p => p.id !== PAGE_ID);
    if (!user) continue;

    try {
      const lastMsg = await getLastUserMessage(conv.id);
      if (!lastMsg) continue;

      console.log(`\n${user.name}: "${lastMsg}"`);
      const reply = await generateReply(lastMsg);
      console.log(`Reply: "${reply.slice(0, 80)}..."`);

      await sendMessage(user.id, reply);
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.log(`Failed for ${user.name}: ${err?.response?.data?.error?.message || err.message}`);
    }
  }
  console.log('\nDone.');
}

run().catch(console.error);
