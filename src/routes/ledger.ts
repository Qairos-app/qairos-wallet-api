import { Router, type IRouter, type Request, type Response } from "express";
import { db, paperPositions, publicCommitments } from "../db/index";
import { eq, desc, sql } from "drizzle-orm";
import { GetSharedLedgerResponse, SavePaperPositionsBody, SavePaperPositionsResponse, PublishArkCommitmentBody, PublishArkCommitmentResponse } from "../validation/index";
import { session, csrf, authorized, clearSession } from "../lib/ledger-session";
import { cookieToken, WALLET_COOKIE, walletSession, walletOwner, walletCsrf } from "../lib/wallet-session";
import { timingSafeEqual } from "node:crypto";

const router: IRouter = Router();
let windowStart = 0, writes = 0;
async function writer(req: Request, res: Response): Promise<string | undefined> {
  const wallet = await walletSession(req);
  if (cookieToken(req, WALLET_COOKIE) && !wallet) {
    res.status(401).json({ error: "Wallet login expired. Sign in again before saving." }); return;
  }
  let id: string | undefined;
  if (wallet) {
    const expected = Buffer.from(walletCsrf(wallet.sessionHash));
    const received = Buffer.from(req.get("X-CSRF-Token") ?? "");
    if (expected.length === received.length && timingSafeEqual(expected, received)) id = walletOwner(wallet.address);
  } else id = authorized(req, res);
  if (!id) { res.status(403).json({ error: "Refresh shared data after signing in or changing wallets." }); return; }
  if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); writes = 0; }
  if (++writes > 180) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Shared storage write limit reached. Try again shortly." }); return;
  }
  return id;
}
function unavailable(req: Request, res: Response): void {
  req.log.warn("Shared storage operation unavailable");
  res.status(503).json({ error: "Shared storage is unavailable. No successful save was confirmed." });
}
const zeros = () => [[0, 0], [0, 0], [0, 0]];
router.get("/ledger", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const browserId = session(req, res, true)!;
    const wallet = await walletSession(req);
    if (cookieToken(req, WALLET_COOKIE) && !wallet) {
      res.status(401).json({ error: "Wallet login expired. Sign in again." }); return;
    }
    const id = wallet ? walletOwner(wallet.address) : browserId;
    const [agg, own, entries, ownArk] = await Promise.all([
      db.select({ marketId: paperPositions.marketId, yes: sql<string>`coalesce(sum(${paperPositions.yes}), 0)`, no: sql<string>`coalesce(sum(${paperPositions.no}), 0)` }).from(paperPositions).groupBy(paperPositions.marketId),
      db.select().from(paperPositions).where(eq(paperPositions.sessionId, id)),
      db.select({ account: publicCommitments.account, commitment: publicCommitments.commitment, createdAt: publicCommitments.createdAt }).from(publicCommitments).orderBy(desc(publicCommitments.createdAt)).limit(50),
      db.select({ sessionId: publicCommitments.sessionId }).from(publicCommitments).where(eq(publicCommitments.sessionId, id)),
    ]);
    const pools = zeros(), mine = zeros();
    for (const row of agg) if (pools[row.marketId]) pools[row.marketId] = [Number(row.yes), Number(row.no)];
    for (const row of own) if (mine[row.marketId]) mine[row.marketId] = [row.yes, row.no];
    res.json(GetSharedLedgerResponse.parse({
      csrfToken: wallet ? walletCsrf(wallet.sessionHash) : csrf(browserId), pools, mine,
      entries: entries.map(x => ({ account: x.account, commitment: x.commitment, ts: x.createdAt.getTime() })),
      hasOwnEntry: ownArk.length > 0,
    }));
  } catch { unavailable(req, res); }
});
router.put("/ledger/bets", async (req, res): Promise<void> => {
  try {
    const id = await writer(req, res); if (!id) return;
    const body = SavePaperPositionsBody.strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Expected three bounded YES/NO paper positions." }); return; }
    await db.transaction(async tx => {
      for (let marketId = 0; marketId < 3; marketId++) {
        const [yes, no] = body.data.s[marketId]!;
        await tx.insert(paperPositions).values({ sessionId: id, marketId, yes, no })
          .onConflictDoUpdate({ target: [paperPositions.sessionId, paperPositions.marketId], set: { yes, no, updatedAt: new Date() } });
      }
    });
    res.json(SavePaperPositionsResponse.parse(body.data));
  } catch { unavailable(req, res); }
});
router.put("/ledger/ark", async (req, res): Promise<void> => {
  try {
    const id = await writer(req, res); if (!id) return;
    const body = PublishArkCommitmentBody.strict().safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Public address, commitment hash and explicit consent are required. Never upload recovery secrets." }); return; }
    const wallet = await walletSession(req);
    if (!wallet) { res.status(401).json({ error: "Sign in with your wallet before publishing its commitment." }); return; }
    if (body.data.account.toLowerCase() !== wallet.address.toLowerCase()) {
      res.status(403).json({ error: "The commitment account must match your signed-in wallet." }); return;
    }
    const value = { account: body.data.account, commitment: body.data.commitment, createdAt: new Date() };
    const [saved] = await db.insert(publicCommitments).values({ ...value, sessionId: id })
      .onConflictDoUpdate({ target: publicCommitments.sessionId, set: value }).returning();
    res.json(PublishArkCommitmentResponse.parse({ account: saved!.account, commitment: saved!.commitment, ts: saved!.createdAt.getTime() }));
  } catch { unavailable(req, res); }
});
router.delete("/ledger/ark", async (req, res): Promise<void> => {
  try {
    const id = await writer(req, res); if (!id) return;
    await db.delete(publicCommitments).where(eq(publicCommitments.sessionId, id));
    res.status(204).end();
  } catch { unavailable(req, res); }
});
router.delete("/ledger", async (req, res): Promise<void> => {
  try {
    const id = await writer(req, res); if (!id) return;
    await db.transaction(async tx => {
      await tx.delete(paperPositions).where(eq(paperPositions.sessionId, id));
      await tx.delete(publicCommitments).where(eq(publicCommitments.sessionId, id));
    });
    clearSession(res);
    res.status(204).end();
  } catch { unavailable(req, res); }
});
export default router;
