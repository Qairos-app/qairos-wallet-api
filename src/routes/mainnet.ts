import { Router, type IRouter } from "express";
import { mainnetStatus } from "../lib/live-mainnet";
const router: IRouter = Router();
router.get("/mainnet/status", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try { res.json(await mainnetStatus()); }
  catch {
    req.log.warn("Mainnet snapshot unavailable");
    res.status(503).json({ error: "Mainnet data is unavailable. Do not interpret this as a safe threat level." });
  }
});
export default router;
