const { google } = require('googleapis');

async function saveLead(lead) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Lead Messenger!A:M',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        lead.timestamp,
        lead.name,
        lead.phone,
        lead.location,
        lead.relationship,
        lead.birthYear,
        lead.age,
        lead.interest,
        lead.level,
        lead.timeline,
        lead.fbName,
        `https://m.me/${lead.fbId}`
      ]]
    }
  });
}

module.exports = { saveLead };
