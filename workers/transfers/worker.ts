import dotenv from "dotenv";
import { RedisService } from "../../src/services/redisService";
import { sendMessage } from "../../src/utils/helpers";
import { TELEGRAM_BASE_URL } from "../../src/utils/constant";
dotenv.config();

const redis = RedisService.getInstance();

function matchesFilter(event: any, direction: 'send' | 'receive', filters: any): boolean {
  if (filters.active === false) return false;
  if (direction === 'send' && !filters.send) return false;
  if (direction === 'receive' && !filters.receive) return false;
  if (filters.mintAddress && filters.mintAddress !== event.mintAddress) return false;
  if (typeof filters.amount === 'number') {
    if (filters.greater && event.amount <= filters.amount) return false;
    if (!filters.greater && event.amount >= filters.amount) return false;
  }
  return true;
}

async function processQueue() {
  await redis.init();

  while (true) {
    try {
      const payload = await redis.dequeueTransferAlert();

      if (!payload) {
        await new Promise(res => setTimeout(res, 1000));
        continue;
      }

      const { whaleAddress, data } = payload;
      const direction = data.senderAddress === whaleAddress ? 'send' : 'receive';

      const rawTransfers = await redis.get("transfers");
      if (!rawTransfers) continue;

      const parsedTransfers = JSON.parse(rawTransfers);
      console.log("parsedTransfers", parsedTransfers);
      const users = parsedTransfers[whaleAddress] || [];

      for (const watcher of users) {
        console.log("watcher", watcher);
        if (matchesFilter(data, direction, watcher.filters)) {
          const formattedAmount = Number(data.amount).toLocaleString();
          const msg = `🚨 <b>Whale Alert</b><br><br>
<b>Address:</b> <code>${whaleAddress}</code><br>
<b>Action:</b> ${direction === 'send' ? '📤 <b>Sent</b>' : '📥 <b>Received</b>'}<br>
<b>Token:</b> <code>${data.mintAddress}</code><br>
<b>Amount:</b> ${formattedAmount}`;
          console.log(msg);
         
          await sendMessage(TELEGRAM_BASE_URL, {
            chat_id: watcher.userId,
            text: msg,
            parse_mode: "HTML"
          });
        }
      }
    } catch (err) {
      console.error("❌ Error while processing queue:", err);
      await new Promise(res => setTimeout(res, 1000));
    }
  }
}

processQueue();
