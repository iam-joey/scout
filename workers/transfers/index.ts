import dotenv from "dotenv";
import WebSocket from "ws";
import { RedisService } from "../../src/services/redisService";
import { programData } from "../../src/data/programs"
dotenv.config();

const websocketUri = process.env.WS_URL;
let ws: WebSocket;
const enableReconnect = true;
const whaleAddressSet = new Set<string>();
const redis = RedisService.getInstance();

function getTimestamp() {
  return Math.floor(Date.now() / 1000);
}

async function refreshWhaleCache() {
  const raw = await redis.get("transfers");
  if (!raw) return;

  const data = JSON.parse(raw);
  whaleAddressSet.clear();

  for (const whaleAddress of Object.keys(data)) {
    whaleAddressSet.add(whaleAddress);
  }
  console.log("this is the whaleAddressSet",whaleAddressSet)
  console.log(`🔁 Refreshed whaleAddressSet @ ${new Date().toISOString()}`);
}

async function connect() {
  ws = new WebSocket(websocketUri as string, {
    headers: {
      "X-API-Key": process.env.VYBE_NETWORK_KEY,
    },
  });

  ws.on("open", () => {
    console.log("Connected to Transfer WebSocket @", getTimestamp());
    const configureMessage = JSON.stringify({
      type: "configure",
      filters: {
        transfers: [],
      },
    });
    ws.send(configureMessage);
  });

  ws.on("message", async (data: WebSocket.Data) => {
    try {
      const event = JSON.parse(data.toString());
      const { senderAddress, receiverAddress } = event;

      if (whaleAddressSet.has(senderAddress)) {
        console.log(event)
        await redis.enqueueTransferAlert(senderAddress, event);
      }else if (whaleAddressSet.has(receiverAddress)) {
        console.log(event)
        await redis.enqueueTransferAlert(receiverAddress, event);
      }
    } catch (e) {
      console.error("❌ Failed to process transfer message:", e);
    }
  });

  ws.on("close", () => {
    console.log("Connection closed. Reconnecting...");
    if (enableReconnect) attemptReconnect();
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    if (enableReconnect) attemptReconnect();
  });
}

function attemptReconnect() {
  setTimeout(() => connect(), 5000);
}

async function startWorker() {
  await redis.init();
  await refreshWhaleCache();
  setInterval(refreshWhaleCache, 30000);
  connect();
}

startWorker();
