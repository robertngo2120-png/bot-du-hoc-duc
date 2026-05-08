const { google } = require('googleapis');

async function saveLead(session) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Lead Messenger!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        session.timestamp,
        session.name,
        session.phone,
        session.interest,
        session.level,
        session.timeline,
        session.fbName,
        `https://m.me/${session.fbId}`
      ]]
    }
  });
}

module.exports = { saveLead };
