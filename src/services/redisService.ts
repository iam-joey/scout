import { createClient, type RedisClientType } from 'redis';

export class RedisService {
  private client!: RedisClientType;
  private isInitialized = false;
  private static instance: RedisService;

  private constructor() {}

  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  async init() {
    if (this.isInitialized) return;

    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = process.env.REDIS_PORT || '6379';
    const redisPassword = process.env.REDIS_PASSWORD || '';

    this.client = createClient({
      url: `redis://${redisHost}:${redisPort}`,
      password: redisPassword,
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error', err);
    });

    await this.client.connect();
    console.log('Redis client initialized');
    this.isInitialized = true;
  }

  async set(key: string, value: string, ttl?: number) {
    if (!this.client) throw new Error('Redis client not initialized');

    if (ttl) {
      await this.client.set(key, value, { EX: ttl });
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis client not initialized');
    return await this.client.get(key);
  }

  async del(key: string) {
    if (!this.client) throw new Error('Redis client not initialized');
    return await this.client.del(key);
  }

  async close() {
    if (!this.client) return;
    await this.client.quit();
  }

  async isAlive(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }
}
