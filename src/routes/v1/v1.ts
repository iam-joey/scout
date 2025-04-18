import express from 'express';
import { TelegramWebhookSchema } from '../../types/telegram';
import { handleMessage } from '../../handlers/telegram/messageHandler';
import { handleCallback } from '../../handlers/telegram/callbackHandler';
import { RedisService } from '../../services/redisService';

const router = express.Router();

router.post('/webhook', async (req, res) => {
  try {
    const webhookData = TelegramWebhookSchema.parse(req.body);

    if ('message' in webhookData) {
      console.log('Message received:');
      await handleMessage(webhookData);
    } else if ('callback_query' in webhookData) {
      await handleCallback(webhookData);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ ok: false, error: 'Invalid webhook data' });
  }
});

router.get('/check', async (req: any, res: any) => {
  const data = await RedisService.getInstance().get("oracles");
  res.json(data);
});

router.get('/delete', async (req: any, res: any) => {
  const data = await RedisService.getInstance().deleteAllKeys();
  res.json(data);
});

export default router;
