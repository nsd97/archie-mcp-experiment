import crypto from 'crypto';

export function computeSlackSignature(secret: string, timestamp: string, rawBody: string): string {
  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret).update(base).digest('hex');
  return `v0=${hmac}`;
}

export function verifySlackSignature(secret: string, timestamp: string, rawBody: string, headerSig: string, nowSeconds?: number): boolean {
  const now = Math.floor((nowSeconds ?? Date.now()) / 1000);
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(now - tsNum) > 60 * 5) return false;
  const expected = computeSlackSignature(secret, timestamp, rawBody);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(headerSig || '');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}


