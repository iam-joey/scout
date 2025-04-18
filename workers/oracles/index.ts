import dotenv from "dotenv";
import WebSocket from "ws";
import { RedisService } from "../../src/services/redisService";

dotenv.config();

const redis = RedisService.getInstance();
const websocketUri = process.env.WS_URL;
let ws: WebSocket;

const priceFeedSet = new Set<string>();
const enableReconnect = true;

function getTimestamp() {
  return Math.floor(Date.now() / 1000);
}

async function refreshPriceFeedSet() {
  const raw = await redis.get("oracles");
  if (!raw) return;

  const data = JSON.parse(raw);
  priceFeedSet.clear();

  for (const feedId of Object.keys(data)) {
    priceFeedSet.add(feedId);
  }
  console.log("Price feed set size:", priceFeedSet.size);
  console.log("Price feed set:", priceFeedSet);
  console.log("🔁 Refreshed oracle priceFeedId set @", new Date().toISOString());
}

async function connect() {
  ws = new WebSocket(websocketUri as string, {
    headers: {
      "X-API-Key": process.env.VYBE_NETWORK_KEY,
    },
  });

  ws.on("open", () => {
    console.log("✅ Connected to Oracle WebSocket @", getTimestamp());

    const configureMessage = JSON.stringify({
      type: "configure",
      filters: {
        oraclePrices: [],
      },
    });

    ws.send(configureMessage);
  });

  ws.on("message", async (data: WebSocket.Data) => {
    try {
      const event = JSON.parse(data.toString());
      const { priceFeedAccount } = event;
      if (priceFeedSet.has(priceFeedAccount)) {
        console.log("✅ Matched priceFeed:", priceFeedAccount);
        await redis.enqueueOracleAlert(priceFeedAccount, event);
      }
    } catch (err) {
      console.error("❌ Failed to process oracle event:", err);
    }
  });

  ws.on("close", () => {
    console.log("🔌 Oracle WebSocket closed. Reconnecting...");
    if (enableReconnect) attemptReconnect();
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err);
    if (enableReconnect) attemptReconnect();
  });
}

function attemptReconnect() {
  setTimeout(() => connect(), 5000);
}

async function startWorker() {
  await redis.init();
  await refreshPriceFeedSet();
  setInterval(refreshPriceFeedSet, 30000);
  connect();
}

startWorker();
