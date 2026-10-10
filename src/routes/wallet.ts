import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getAddress } from "ethers";
import { db, walletSessions } from "../db/index";
import { WalletNonceBody, VerifyWalletBody } from "../validation/index";
import {
  NONCE_COOKIE, WALLET_COOKIE, cookieToken, hashToken, newToken, sameOrigin,
  setWalletCookie, clearWalletCookie, walletCsrf, walletSession,
} from "../lib/wallet-session";
import { validWalletSignature } from "../lib/wallet-signature";

const router: IRouter = Router();
const CHALLENGE_AGE = 10 * 60_000;
const SESSION_AGE = 24 * 60 * 60_000;
let windowStart = 0, attempts = 0;
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function allowAttempt(): boolean {
  if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); attempts = 0; }
  return ++attempts <= 120;
}
router.use("/wallet", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.post("/wallet/nonce", async (req, res): Promise<void> => {
  const origin = sameOrigin(req);
  if (!origin) { res.status(403).json({ error: "Use this site's wallet sign-in button." }); return; }
  if (!allowAttempt()) { res.setHeader("Retry-After", "60"); res.status(429).json({ error: "Too many wallet sign-in attempts. Try again shortly." }); return; }
  const input = WalletNonceBody.strict().safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "A valid Ethereum address is required." }); return; }
  try {
    const address = getAddress(input.data.address.toLowerCase());
    const token = newToken(), nonce = newToken(), now = new Date(), expiry = new Date(now.getTime() + CHALLENGE_AGE);
    const message = `${new URL(origin).host} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Qairos. This does not authorize transactions or transfer funds.\n\nURI: ${origin}/app/\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${now.toISOString()}\nExpiration Time: ${expiry.toISOString()}`;
    await db.transaction(async tx => {
      await tx.delete(walletSessions).where(lt(walletSessions.expiresAt, now));
      const previous = cookieToken(req, NONCE_COOKIE);
      if (previous) await tx.delete(walletSessions).where(and(eq(walletSessions.sessionHash, hashToken(previous)), isNull(walletSessions.authenticatedAt)));
      await tx.insert(walletSessions).values({ sessionHash: hashToken(token), address, message, expiresAt: expiry });
    });
    setWalletCookie(res, NONCE_COOKIE, token, CHALLENGE_AGE);
    res.json({ message });
  } catch {
    req.log.warn("Wallet challenge unavailable");
    res.status(503).json({ error: "Wallet sign-in is temporarily unavailable." });
  }
});
router.post("/wallet/verify", async (req, res): Promise<void> => {
  const origin = sameOrigin(req), challengeToken = cookieToken(req, NONCE_COOKIE);
  if (!origin || !challengeToken) { res.status(403).json({ error: "Request a new wallet sign-in message." }); return; }
  if (!allowAttempt()) { res.setHeader("Retry-After", "60"); res.status(429).json({ error: "Too many wallet sign-in attempts. Try again shortly." }); return; }
  const input = VerifyWalletBody.strict().safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "A wallet signature is required." }); return; }
  try {
    const hash = hashToken(challengeToken), now = new Date();
    const [challenge] = await db.select().from(walletSessions).where(and(
      eq(walletSessions.sessionHash, hash), isNull(walletSessions.authenticatedAt), gt(walletSessions.expiresAt, now),
    )).limit(1);
    if (!challenge?.message || !challenge.message.includes(`\nURI: ${origin}/app/\n`)) {
      res.status(401).json({ error: "Sign-in message expired or already used. Sign again." }); return;
    }
    if (!await validWalletSignature(challenge.address, challenge.message, input.data.signature)) {
      res.status(401).json({ error: "Signature does not match this wallet and sign-in message." }); return;
    }
    const token = newToken(), newHash = hashToken(token), expiresAt = new Date(Date.now() + SESSION_AGE);
    const [record] = await db.update(walletSessions).set({
      sessionHash: newHash, authenticatedAt: new Date(), message: null, expiresAt,
    }).where(and(eq(walletSessions.sessionHash, hash), isNull(walletSessions.authenticatedAt), gt(walletSessions.expiresAt, new Date()))).returning();
    if (!record) { res.status(401).json({ error: "Sign-in message expired or already used. Sign again." }); return; }
    const previous = cookieToken(req, WALLET_COOKIE);
    if (previous) await db.delete(walletSessions).where(eq(walletSessions.sessionHash, hashToken(previous)));
    clearWalletCookie(res, NONCE_COOKIE);
    setWalletCookie(res, WALLET_COOKIE, token, SESSION_AGE);
    res.json({ address: record.address, csrfToken: walletCsrf(newHash), expiresAt: expiresAt.toISOString() });
  } catch {
    req.log.warn("Wallet signature verification unavailable");
    res.status(503).json({ error: "Wallet sign-in could not be verified. No login was completed." });
  }
});
router.get("/wallet/session", async (req, res): Promise<void> => {
  try {
    const session = await walletSession(req);
    res.json(session
      ? { address: session.address, csrfToken: walletCsrf(session.sessionHash), expiresAt: session.expiresAt.toISOString() }
      : { address: null, csrfToken: null, expiresAt: null });
  } catch {
    req.log.warn("Wallet session lookup unavailable");
    res.status(503).json({ error: "Wallet session is temporarily unavailable." });
  }
});
router.delete("/wallet/session", async (req, res): Promise<void> => {
  if (!sameOrigin(req)) { res.status(403).json({ error: "Use this site's logout button." }); return; }
  try {
    const session = await walletSession(req);
    if (session && !safeEqual(walletCsrf(session.sessionHash), req.get("X-CSRF-Token") ?? "")) {
      res.status(403).json({ error: "Refresh your wallet session before signing out." }); return;
    }
    if (session) await db.delete(walletSessions).where(eq(walletSessions.sessionHash, session.sessionHash));
    const nonce = cookieToken(req, NONCE_COOKIE);
    if (nonce) await db.delete(walletSessions).where(eq(walletSessions.sessionHash, hashToken(nonce)));
    clearWalletCookie(res); clearWalletCookie(res, NONCE_COOKIE);
    res.status(204).end();
  } catch {
    req.log.warn("Wallet logout unavailable");
    res.status(503).json({ error: "Logout was not completed. Try again." });
  }
});
export default router;
