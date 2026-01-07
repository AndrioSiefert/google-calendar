import crypto from 'crypto';
import { STATE_SIGNING_SECRET } from './env';

function signState(b64: string): string {
    const h = crypto.createHmac('sha256', STATE_SIGNING_SECRET);
    h.update(b64);
    return Buffer.from(h.digest()).toString('base64url');
}

export function createState(phone: string): string {
    const payload = {
        phone,
        nonce: crypto.randomBytes(8).toString('hex'),
        iat: Date.now(),
        ttl_ms: 15 * 60_000,
    };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = signState(b64);
    return `${b64}.${sig}`;
}

export function decodeState(state: string): { phone: string; nonce: string } {
    const parts = String(state).split('.');
    if (parts.length !== 2) {
        throw new Error('state_invalid_format');
    }

    const [b64, sig] = parts;
    const expected = signState(b64);

    if (sig.length !== expected.length) {
        throw new Error('state_invalid_signature');
    }

    const sigOk = crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
    if (!sigOk) {
        throw new Error('state_invalid_signature');
    }

    const json = Buffer.from(b64, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { phone: string; nonce: string; iat?: number; ttl_ms?: number };

    const iat = payload.iat ?? 0;
    const ttl = payload.ttl_ms ?? 0;
    if (!iat || !ttl || Date.now() > iat + ttl) {
        throw new Error('state_expired');
    }

    return { phone: payload.phone, nonce: payload.nonce };
}
