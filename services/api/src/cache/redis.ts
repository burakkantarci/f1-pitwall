import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'redis' });
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisOptions = {
  retryStrategy(times: number) {
    return Math.min(times * 500, 5000);
  },
  maxRetriesPerRequest: null,
};

export const redis = new Redis(redisUrl, redisOptions);
export const redisSub = new Redis(redisUrl, redisOptions);

redis.on('error', (err) => logger.error({ err: err.message }, 'Redis connection error'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));

redisSub.on('error', (err) => logger.error({ err: err.message }, 'Redis subscriber connection error'));
redisSub.on('reconnecting', () => logger.warn('Redis subscriber reconnecting...'));
