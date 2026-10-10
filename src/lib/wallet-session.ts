import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { db, walletSessions } from "../db/index";
import { and, eq, gt, isNotNull } from "drizzle-orm";

export const WALLET_COOKIE = "qairos_wallet";
export const NONCE_COOKIE = "qairos_wallet_nonce";
export const hashToken = (value: string): string => createHash("sha256").update(value).digest("hex");
export const newToken = (): string => randomBytes(32).toString("hex");
export function cookieToken(req: Request, name: string): string | undefined {
  const value = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="))?.slice(name.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
export function setWalletCookie(res: Response, name: string, token: string, age: number): void {
  res.cookie(name, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict",
    path: "/api", maxAge: age,
  });
}
export function clearWalletCookie(res: Response, name = WALLET_COOKIE): void {
  res.clearCookie(name, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api",
  });
}
export { sameOrigin } from "./origin";
export async function walletSession(req: Request) {
  const token = cookieToken(req, WALLET_COOKIE);
  if (!token) return undefined;
  const [record] = await db.select().from(walletSessions).where(and(
    eq(walletSessions.sessionHash, hashToken(token)), isNotNull(walletSessions.authenticatedAt),
    gt(walletSessions.expiresAt, new Date()),
  )).limit(1);
  return record;
}
export function walletCsrf(sessionHash: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Session secret not configured");
  return createHmac("sha256", secret).update("wallet-csrf:" + sessionHash).digest("hex");
}
// Stable pseudonymous ownership across signed-in browsers; never exposes the
// wallet address as a database ownership key or changes old anonymous records.
export function walletOwner(address: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Session secret not configured");
  return createHmac("sha256", secret).update("wallet-owner:1:" + address.toLowerCase()).digest("hex");
}
