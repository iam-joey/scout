import express from 'express';
import { createServer } from 'http';
import { setupWebSocketServer } from './websocket/server';
import { config } from 'dotenv';
import v1router from './routes/v1/v1';
import { RedisService } from './services/redisService';

config();

const app = express();
const port = process.env.PORT || 3000;

const server = createServer(app);
setupWebSocketServer(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Express + TypeScript + Bun API' });
});

app.use('/v1', v1router);

server.listen(port, async () => {
  try {
    const redis = RedisService.getInstance();
    await redis.init();

    console.log(`Server running on port ${port}`);
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    process.exit(1);
  }
});
