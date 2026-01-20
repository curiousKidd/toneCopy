import Redis from 'ioredis';
import { logger } from '../utils/logger';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error: any) {
      logger.error('Cache get failed', { key, error: error.message });
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (error: any) {
      logger.error('Cache set failed', { key, error: error.message });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error: any) {
      logger.error('Cache delete failed', { key, error: error.message });
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error: any) {
      logger.error('Cache invalidate pattern failed', { pattern, error: error.message });
    }
  }

  async disconnect(): Promise<void> {
    await redis.quit();
  }
}

export const cacheService = new CacheService();
