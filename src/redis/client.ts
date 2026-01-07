import Redis from 'ioredis';
import { REDIS_URL } from '../env';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
    if (!REDIS_URL) return null;
    if (redis) return redis;

    redis = new Redis(REDIS_URL, {
        enableReadyCheck: true,
        maxRetriesPerRequest: null,
    });

    redis.on('error', (err) => {
        console.error('❌ Redis error:', err);
    });

    return redis;
}
