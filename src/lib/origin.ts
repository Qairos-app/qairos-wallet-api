import type { Request } from 'express';
export function sameOrigin(req: Request): string | undefined {
  const raw = req.get('Origin');
  if (!raw) return undefined;
  try {
    const actual = new URL(raw);
    const configured = process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
    if (!configured || raw !== actual.origin || actual.origin !== configured) return undefined;
    if (actual.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && actual.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(actual.hostname))) return undefined;
    return actual.origin;
  } catch { return undefined; }
}
