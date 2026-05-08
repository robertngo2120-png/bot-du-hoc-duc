const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, 'sessions');
const MAX_AGE_DAYS = 7;

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
      // file corrupt → tạo mới
    }
  }
  return { step: 'chatting', turns: 0, history: [], collectedInfo: {} };
}

function saveSession(senderId, session) {
  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }
  session._lastUpdated = Date.now();
  fs.writeFileSync(getPath(senderId), JSON.stringify(session), 'utf8');
}

function cleanOldSessions() {
  try {
    const files = fs.readdirSync(SESSION_DIR);
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(SESSION_DIR, file);
      try {
        const session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const lastUpdated = session._lastUpdated || 0;
        if (session.step === 'done' && lastUpdated < cutoff) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch {
        // file lỗi → xóa luôn
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }

    if (cleaned > 0) console.log(`Cleaned ${cleaned} old sessions`);
  } catch (err) {
    console.error('cleanOldSessions error:', err.message);
  }
}

module.exports = { getSession, saveSession, cleanOldSessions };
