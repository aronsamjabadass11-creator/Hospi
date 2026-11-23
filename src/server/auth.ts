import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from './database.ts';
import type { AuthUser, AdminRole } from '../shared/types.ts';

const TOKEN_SECRET = process.env.HOSPIFIND_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(plainPassword, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

interface SessionPayload {
  jti: string;
  user: AuthUser;
  exp: number;
}

export function signSessionToken(user: AuthUser): string {
  const jti = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + SESSION_TTL_MS;
  const payload: SessionPayload = {
    jti,
    user,
    exp,
  };

  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO admin_sessions (session_id, admin_id, expires_at, revoked, created_at)
      VALUES (?, ?, ?, 0, ?)
    `).run(jti, user.admin_id, exp, new Date().toISOString());
  } catch (err) {
    console.error('Failed to persist session record:', err);
  }

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): AuthUser | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now() || !parsed.jti) {
      return null;
    }
    if (parsed.user.account_status !== 'active') {
      return null;
    }

    const db = getDb();
    const sessionRow = db
      .prepare('SELECT session_id, expires_at, revoked FROM admin_sessions WHERE session_id = ?')
      .get(parsed.jti) as { session_id: string; expires_at: number; revoked: number } | undefined;

    if (!sessionRow || sessionRow.revoked === 1 || sessionRow.expires_at < Date.now()) {
      return null;
    }

    return parsed.user;
  } catch {
    return null;
  }
}

export function revokeSessionToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  try {
    const parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed?.jti) return false;
    const db = getDb();
    const result = db.prepare('UPDATE admin_sessions SET revoked = 1 WHERE session_id = ?').run(parsed.jti);
    return Number(result.changes) > 0;
  } catch {
    return false;
  }
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export function requireAuth(allowedRoles?: AdminRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    const user = verifySessionToken(token);
    if (!user) {
      res.status(401).json({ error: 'Authentication required. Your session may have expired or been signed out.' });
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this operation.' });
      return;
    }
    req.authUser = user;
    next();
  };
}

// Sliding-window in-memory rate limiter for auth, AI assistant, and admin mutations
const rateWindows = new Map<string, number[]>();

export function createRateLimiter(bucketName: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucketName}:${ip}`;
    const now = Date.now();
    const cutoff = now - windowMs;

    const prev = (rateWindows.get(key) || []).filter((ts) => ts > cutoff);
    if (prev.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests in a short window. Please wait a moment and try again.',
      });
      return;
    }
    prev.push(now);
    rateWindows.set(key, prev);
    next();
  };
}
