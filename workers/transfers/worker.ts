import dotenv from "dotenv";
import { RedisService } from "../../src/services/redisService";
import { sendMessage } from "../../src/utils/helpers";
import { TELEGRAM_BASE_URL } from "../../src/utils/constant";

dotenv.config();
const redis = RedisService.getInstance();

function matchesFilter(event: any, direction: 'send' | 'receive', filters: any): boolean {
  if (filters.active === false) return false;

  // Respect user's direction preference
  if (direction === 'send' && !filters.send) return false;
  if (direction === 'receive' && !filters.receive) return false;

  // Match mint only if user set a specific mint address
  if (filters.mintAddress && filters.mintAddress !== event.mintAddress) return false;

  // If user has set amount threshold
  if (typeof filters.amount === 'number') {
    const eventTokenAmount = event.amount / (10 ** (event.decimal || 0));
    if (filters.greater && eventTokenAmount <= filters.amount) return false;
    if (!filters.greater && eventTokenAmount >= filters.amount) return false;
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
      const users = parsedTransfers[whaleAddress] || [];

      for (const watcher of users) {
        console.log('Checking user:', watcher);
        if (matchesFilter(data, direction, watcher.filters)) {
          const tokenAmount = (data.amount / 10 ** data.decimal).toLocaleString();

          const msg = `📤 <b>Token Transfer Alert</b>\n\n` +
            `📦 <b>Amount:</b> ${tokenAmount}\n` +
            `🪙 <b>Mint:</b> <code>${data.mintAddress}</code>\n\n` +
            `👤 <b>From:</b> <code>${data.senderAddress}</code>\n` +
            `👤 <b>To:</b> <code>${data.receiverAddress}</code>\n\n` +
            `🔗 <b>Tx:</b> <a href="https://solscan.io/tx/${data.signature}">View on Solscan</a>`;

          await sendMessage(TELEGRAM_BASE_URL, {
            chat_id: watcher.userId,
            text: msg,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            // reply_markup:{
            //   inline_keyboard: [
            //     [
            //       {
            //         text: '🔴 Deactivate',
            //         callback_data: `/sub-ta_active_${whaleAddress}`
            //       },
            //     ]
            //   ]
            // }
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
