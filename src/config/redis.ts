import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';

class RedisManager {
  private client: RedisClientType | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    try {
      if (this.client) {
        return;
      }

      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              logger.error('❌ Redis: Too many retry attempts, giving up');
              return new Error('Too many retries');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      }) as RedisClientType;

      this.client.on('error', (error) => {
        logger.error('❌ Redis Client Error:', error);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('🔄 Redis: Connecting...');
      });

      this.client.on('ready', () => {
        logger.info('✅ Redis: Connected and ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        logger.info('🔴 Redis: Connection ended');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      logger.error('❌ Redis connection failed:', error);
      this.client = null;
      this.isConnected = false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.quit();
        logger.info('✅ Redis: Disconnected successfully');
      }
    } catch (error) {
      logger.error('❌ Redis disconnection error:', error);
    } finally {
      this.client = null;
      this.isConnected = false;
    }
  }

  getClient(): RedisClientType | null {
    return this.client;
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  // Méthodes utilitaires pour les opérations communes
  async set(key: string, value: string, expirationInSeconds?: number): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        logger.warn('⚠️ Redis: Client not ready for SET operation');
        return false;
      }

      if (expirationInSeconds) {
        await this.client.setEx(key, expirationInSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error('❌ Redis SET error:', error);
      return false;
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<boolean> {
    return await this.set(key, value, seconds);
  }

  async get(key: string): Promise<string | null> {
    try {
      if (!this.client || !this.isConnected) {
        logger.warn('⚠️ Redis: Client not ready for GET operation');
        return null;
      }

      return await this.client.get(key);
    } catch (error) {
      logger.error('❌ Redis GET error:', error);
      return null;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        logger.warn('⚠️ Redis: Client not ready for DEL operation');
        return false;
      }

      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error('❌ Redis DEL error:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('❌ Redis EXISTS error:', error);
      return false;
    }
  }

  // Cache avec TTL automatique
  async cacheSet(key: string, data: any, ttlSeconds: number = 300): Promise<boolean> {
    try {
      const serializedData = JSON.stringify(data);
      return await this.set(key, serializedData, ttlSeconds);
    } catch (error) {
      logger.error('❌ Redis cache SET error:', error);
      return false;
    }
  }

  async cacheGet<T>(key: string): Promise<T | null> {
    try {
      const data = await this.get(key);
      if (!data) return null;
      
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error('❌ Redis cache GET error:', error);
      return null;
    }
  }

  // Session management
  async setSession(sessionId: string, userData: any, ttlSeconds: number = 86400): Promise<boolean> {
    const sessionKey = `session:${sessionId}`;
    return await this.cacheSet(sessionKey, userData, ttlSeconds);
  }

  async getSession<T>(sessionId: string): Promise<T | null> {
    const sessionKey = `session:${sessionId}`;
    return await this.cacheGet<T>(sessionKey);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const sessionKey = `session:${sessionId}`;
    return await this.del(sessionKey);
  }

  // Rate limiting helpers
  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    try {
      if (!this.client || !this.isConnected) {
        return 0;
      }

      const result = await this.client.incr(key);
      if (result === 1) {
        await this.client.expire(key, windowSeconds);
      }
      return result;
    } catch (error) {
      logger.error('❌ Redis rate limit error:', error);
      return 0;
    }
  }
}

// Singleton instance
const redisManager = new RedisManager();

export { redisManager };
export default redisManager;