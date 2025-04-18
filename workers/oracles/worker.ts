import dotenv from "dotenv";
import { RedisService } from "../../src/services/redisService";
import { sendMessage } from "../../src/utils/helpers";
import { TELEGRAM_BASE_URL } from "../../src/utils/constant";

dotenv.config();
const redis = RedisService.getInstance();

async function processQueue() {
  await redis.init();

  while (true) {
    try {
      const payload = await redis.dequeueOracleAlert();

      if (!payload) {
        await new Promise(res => setTimeout(res, 1000));
        continue;
      }

      const { priceFeedId, data } = payload;
      const currentPrice = parseFloat(data.price);
      console.log("the price is ", currentPrice)
      const raw = await redis.get("oracles");
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const watchers = parsed[priceFeedId] || [];

      for (const watcher of watchers) {
        const target = watcher.filters.price;
        console.log("✅ Target:", target)
        // Match if price is within a small range (due to float precision)
        if (Math.floor(currentPrice) === Math.floor(target) && watcher.filters.active) {
            const msg = `📈 <b>Token Price Alert</b>\n\n<b>Feed:</b> <code>${priceFeedId}</code>\n<b>Price Reached:</b> $${currentPrice}`;
            await sendMessage(TELEGRAM_BASE_URL, {
              chat_id: watcher.userId,
              text: msg,
              parse_mode: "HTML",
              reply_markup:{
                inline_keyboard: [
                  [
                    {
                      text: '🔴 Deactivate',
                      callback_data: `/sub-pa_active_${priceFeedId}`
                    },
                  ]
                ]
              }
            });
          }
      }
    } catch (err) {
      console.error("❌ Error in OracleAlertProcessor:", err);
      await new Promise(res => setTimeout(res, 1000));
    }
  }
}

processQueue();
