const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, 'sessions');

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR);
}

function getPath(senderId) {
  return path.join(SESSION_DIR, `${senderId}.json`);
}

function getSession(senderId) {
  const filePath = getPath(senderId);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      // file bị corrupt → tạo mới
    }
  }
  return {
    step: 'chatting',
    turns: 0,
    history: [],
    collectedInfo: {}
  };
}

function saveSession(senderId, session) {
  // Giữ tối đa 20 tin nhắn gần nhất để tránh file quá lớn
  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }
  fs.writeFileSync(getPath(senderId), JSON.stringify(session), 'utf8');
}

module.exports = { getSession, saveSession };
