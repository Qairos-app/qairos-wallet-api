import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const COOKIE = "qairos_browser";
const AGE = 30 * 24 * 60 * 60;
function mac(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Session secret not configured");
  return createHmac("sha256", secret).update(value).digest("hex");
}
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function session(req: Request, res: Response, create = false): string | undefined {
  const raw = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (raw && /^[a-f0-9]{64}\.[0-9]{10}\.[a-f0-9]{64}$/.test(raw)) {
    const [id, expiry, signature] = raw.split(".");
    if (Number(expiry) > Date.now() / 1000 && equal(mac(id + "." + expiry), signature!)) return id;
  }
  if (!create) return undefined;
  const id = randomBytes(32).toString("hex");
  const payload = id + "." + (Math.floor(Date.now() / 1000) + AGE);
  res.cookie(COOKIE, payload + "." + mac(payload), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict",
    path: "/api", maxAge: AGE * 1000,
  });
  return id;
}
export function csrf(id: string): string { return mac("csrf:" + id); }
export function authorized(req: Request, res: Response): string | undefined {
  const id = session(req, res);
  const token = req.get("X-CSRF-Token") ?? "";
  if (!id || !equal(csrf(id), token)) return undefined;
  return id;
}
export function clearSession(res: Response): void {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api" });
}
