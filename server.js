require('dotenv').config();
const express = require('express');
const { handleMessage } = require('./flow');
const { handleComment } = require('./comment');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');

    for (const entry of body.entry) {
      // Xử lý tin nhắn Messenger
      const messagingEvents = entry.messaging || [];
      for (const event of messagingEvents) {
        if (event.message || event.postback) {
          handleMessage(event).catch(err => console.error('handleMessage error:', err));
        }
      }

      // Xử lý comment trên bài đăng/quảng cáo
      const feedChanges = entry.changes || [];
      for (const change of feedChanges) {
        if (change.field === 'feed') {
          handleComment(change.value).catch(err => console.error('handleComment error:', err));
        }
      }
    }
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Messenger webhook running on port ${PORT}`));
