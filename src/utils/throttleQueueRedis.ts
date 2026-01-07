import { getRedis } from '../redis/client';

type Work<T> = () => Promise<T>;

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function jitterMs(baseMs: number, pct: number) {
    const factor = 1 - pct + Math.random() * (2 * pct); 
    return Math.max(0, Math.round(baseMs * factor));
}


const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

async function acquireLock(redis: any, lockKey: string, lockValue: string, ttlMs: number, maxWaitMs: number) {
    const started = Date.now();

    while (Date.now() - started < maxWaitMs) {
        const ok = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
        if (ok === 'OK') return true;

      
        await sleep(jitterMs(120, 0.5)); // Para evitar concorrencia
    }

    return false;
}

export async function enqueueThrottledRedis<T>(
    key: string,
    minIntervalMs: number,
    work: Work<T>,
    opts?: {
        lockTtlMs?: number;
        maxWaitMs?: number;
        lastKeyTtlMs?: number;
    },
): Promise<T> {
    const redis = getRedis();
    if (!redis) {
    
        return await work();
    }

    const lockKey = `throttle:lock:${key}`;
    const lastKey = `throttle:last:${key}`;

    const lockTtlMs = Math.max(1000, opts?.lockTtlMs ?? 60_000);
    const maxWaitMs = Math.max(1000, opts?.maxWaitMs ?? 240_000);
    const lastKeyTtlMs = Math.max(60_000, opts?.lastKeyTtlMs ?? 24 * 60 * 60 * 1000);

    const lockValue = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;

    const acquired = await acquireLock(redis, lockKey, lockValue, lockTtlMs, maxWaitMs);
    if (!acquired) {
        throw new Error(`throttle_lock_timeout:${key}`);
    }

    try {
        const lastStr = await redis.get(lastKey);
        const last = lastStr ? Number(lastStr) : 0;

        const waitMs = last + minIntervalMs - Date.now();
        if (waitMs > 0) {
            await sleep(waitMs);
        }

        const result = await work();

        await redis.set(lastKey, String(Date.now()), 'PX', lastKeyTtlMs);

        return result;
    } finally {
        try {
            await redis.eval(RELEASE_LOCK_LUA, 1, lockKey, lockValue);
        } catch (e) {
            console.error('Falha ao liberar lock do Redis:', e);
        }
    }
}
