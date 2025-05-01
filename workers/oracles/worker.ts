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
        console.log("✅ Target:", target);
      }
      
      const alertTasks = watchers
      //@ts-ignore
        .filter(watcher =>
          currentPrice >= watcher.filters.price &&
          currentPrice < watcher.filters.price + 1 &&
          watcher.filters.active
        )
        //@ts-ignore
        .map(watcher => {
          const msg = `📈 <b>Token Price Alert</b>\n\n<b>Feed:</b> <code>${priceFeedId}</code>\n<b>Price Reached:</b> $${currentPrice}`;
          return sendMessage(TELEGRAM_BASE_URL, {
            chat_id: watcher.userId,
            text: msg,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🔴 Deactivate',
                    callback_data: `/sub-pa_active_${priceFeedId}`
                  }
                ]
              ]
            }
          });
        });
      
      if (alertTasks.length > 0) {
        await Promise.all(alertTasks);
        console.log(`✅ Sent ${alertTasks.length} alerts for ${priceFeedId}`);
      }
      
    } catch (err) {
      console.error("❌ Error in OracleAlertProcessor:", err);
      await new Promise(res => setTimeout(res, 1000));
    }
  }
}

processQueue();
