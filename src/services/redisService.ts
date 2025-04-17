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

  async listKeys(pattern = '*'): Promise<string[]> {
    if (!this.client) throw new Error('Redis client not initialized');

    const keys: string[] = [];
    const iter = this.client.scanIterator({ MATCH: pattern });

    for await (const key of iter) {
      keys.push(key);
    }

    return keys;
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

  async deleteAllKeys(pattern = '*') {
    console.log('Deleting all keys matching pattern:', pattern);
    if (!this.client) throw new Error('Redis client not initialized');

    const iter = this.client.scanIterator({ MATCH: pattern });
    const keysToDelete: string[] = [];

    for await (const key of iter) {
      keysToDelete.push(key);
    }

    if (keysToDelete.length > 0) {
      //@ts-ignore
      await this.client.del(...keysToDelete);
      console.log(`Deleted ${keysToDelete.length} keys`);
    } else {
      console.log('No matching keys found');
    }

    return keysToDelete.length;
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

  async saveAlertTransfer(userId: number, whaleAddress: string, filters: TransferFilters) {
    if (!this.client) throw new Error('Redis client not initialized');
    
    const key = "transfers";

    const existingRaw = await this.client.get(key) || "{}";

    const data:TransferEntry = JSON.parse(existingRaw);

    if (!data[whaleAddress]) {
      data[whaleAddress] = [{ userId, filters }];
    } else {
      const existingUser = data[whaleAddress].find(user => user.userId === userId);
      if (existingUser) {
        existingUser.filters = filters;
      } else {
        data[whaleAddress].push({ userId, filters });
      }
    }

    await this.client.set(key, JSON.stringify(data));
  }

  async enqueueTransferAlert(whaleAddress: string, data: any): Promise<void> {
    if (!this.client) throw new Error('Redis client not initialized');
  
    const payload = {
      whaleAddress,
      data,
    };
  
    await this.client.lPush("transfer:alert:queue", JSON.stringify(payload));
  }

  async dequeueTransferAlert(): Promise<{ whaleAddress: string; data: any } | null> {
    if (!this.client) throw new Error('Redis client not initialized');
  
    const raw = await this.client.rPop("transfer:alert:queue");
    if (!raw) return null;
  
    return JSON.parse(raw);
  }
  
  

}




export interface TransferFilters {
  send: boolean;
  receive: boolean;
  mintAddress?: string;
  amount?: number;
  greater?: boolean;
  active: boolean;
}

export interface UserTransfer {
  userId: number;
  filters: TransferFilters;
}

export interface TransferEntry {
  [transferId: string]: UserTransfer[];
}

export interface TransfersData {
  transfers: TransferEntry;
}


