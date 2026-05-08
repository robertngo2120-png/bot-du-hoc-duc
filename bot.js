require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { exec } = require('child_process');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const OWNER_ID = Number(process.env.OWNER_ID);

// 🔥 Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

console.log('Bot is running...');

// =========================
// 🧠 COMMAND HANDLERS
// =========================

const handlers = {
  '/ping': async (chatId) => {
    return bot.sendMessage(chatId, 'pong 🏓');
  },

  '/help': async (chatId) => {
    return bot.sendMessage(
      chatId,
`Commands:
/ping
/status
/logs
/exec <command>
/ai <prompt>

/lead <lead info>
/reply <customer message>
/plan <customer info>`
    );
  },

  '/status': async (chatId) => {
    const uptime = process.uptime();
    return bot.sendMessage(chatId, `Uptime: ${uptime.toFixed(2)}s`);
  },

  '/logs': async (chatId) => {
    exec('pm2 logs --lines 20', (err, stdout, stderr) => {
      if (err) {
        return bot.sendMessage(chatId, 'Error reading logs ❌');
      }

      const output = stdout || stderr || 'No logs';
      bot.sendMessage(chatId, `\n${output.slice(-4000)}`);
    });
  },

  '/exec': async (chatId, args) => {
    if (!args) {
      return bot.sendMessage(chatId, 'Usage: /exec <command>');
    }

    exec(args, (err, stdout, stderr) => {
      if (err) {
        return bot.sendMessage(chatId, `Error:\n${err.message}`);
      }

      const output = stdout || stderr || 'Done';
      bot.sendMessage(chatId, `\n${output.slice(-4000)}`);
    });
  },

  // =========================
  // 🤖 AI BASE
  // =========================

  '/ai': async (chatId, args) => {
    if (!args) {
      return bot.sendMessage(chatId, 'Usage: /ai <prompt>');
    }

    try {
      const result = await model.generateContent(args);
      const response = await result.response;
      const reply = response.text();

      return bot.sendMessage(chatId, reply);
    } catch (err) {
      console.error(err);
      return bot.sendMessage(chatId, "AI error ❌");
    }
  },

  // =========================
  // 🟢 MARKETING BRAIN
  // =========================

  '/lead': async (chatId, args) => {
    if (!args) {
      return bot.sendMessage(chatId, 'Usage: /lead <lead info>');
    }

    const prompt = `Bạn là chuyên gia tư vấn du học Đức.

Phân tích lead sau và trả về NGẮN GỌN theo format:

1. Mức độ: NÓNG / ẤM / LẠNH
2. Lý do (1-2 dòng)
3. Khả năng chốt (%)
4. Hướng tư vấn phù hợp:
   - Ausbildung / Du học / Học tiếng
5. Việc cần làm tiếp theo (rất cụ thể)

Lead:
${args}`;

    try {
      const result = await model.generateContent(prompt);
      const reply = (await result.response).text();

      return bot.sendMessage(chatId, reply);
    } catch (err) {
      console.error(err);
      return bot.sendMessage(chatId, "Lead analysis error ❌");
    }
  },

  '/reply': async (chatId, args) => {
    if (!args) {
      return bot.sendMessage(chatId, 'Usage: /reply <customer message>');
    }

    const prompt = `Bạn là tư vấn viên du học Đức nhiều kinh nghiệm.

Viết câu trả lời cho khách:
- rõ ràng
- không dài dòng
- không hứa suông
- tạo cảm giác tin tưởng

Nếu thiếu thông tin → hỏi lại thông minh

Nội dung khách:
${args}`;

    try {
      const result = await model.generateContent(prompt);
      const reply = (await result.response).text();

      return bot.sendMessage(chatId, reply);
    } catch (err) {
      console.error(err);
      return bot.sendMessage(chatId, "Reply generation error ❌");
    }
  },

  '/plan': async (chatId, args) => {
    if (!args) {
      return bot.sendMessage(chatId, 'Usage: /plan <customer info>');
    }

    const prompt = `Bạn là chuyên gia tư vấn du học Đức thực tế.

Phân tích NGẮN GỌN khách sau (không dài dòng):

1. Hướng phù hợp nhất (1 dòng duy nhất)
2. Lộ trình chính (tối đa 3 bước, mỗi bước 1 dòng)
3. Rào cản lớn nhất (1 dòng)
4. Cách xử lý trực tiếp (1-2 dòng)

Không giải thích lan man.

Khách:
${args}`;

    try {
      const result = await model.generateContent(prompt);
      const reply = (await result.response).text();

      return bot.sendMessage(chatId, reply);
    } catch (err) {
      console.error('PLAN ERROR:', err);
      return bot.sendMessage(chatId, "Plan error ❌");
    }
  }
};

// =========================
// 🧭 ROUTER
// =========================

function parseCommand(text) {
  if (!text.startsWith('/')) return null;

  const [command, ...rest] = text.split(' ');
  const args = rest.join(' ').trim();

  return { command, args };
}

// =========================
// 🤖 MAIN LOOP
// =========================

bot.on('message', async (msg) => {
  try {
    if (msg.from.id !== OWNER_ID) return;

    const text = msg.text;
    const chatId = msg.chat.id;

    if (!text) return;

    const parsed = parseCommand(text);

    if (!parsed) {
      return bot.sendMessage(chatId, 'Unknown command. Use /help');
    }

    const { command, args } = parsed;
    const handler = handlers[command];

    if (!handler) {
      return bot.sendMessage(chatId, 'Unknown command. Use /help');
    }

    await handler(chatId, args);

  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "Error xảy ra ❌");
  }
});