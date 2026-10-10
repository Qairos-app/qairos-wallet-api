import { Router, type IRouter } from "express";
import healthRouter from "./health";
import qrngRouter from "./qrng";
import mainnetRouter from "./mainnet";
import ledgerRouter from "./ledger";
import walletRouter from "./wallet";

const router: IRouter = Router();

router.use(healthRouter);
router.use(qrngRouter);
router.use(mainnetRouter);
router.use(ledgerRouter);
router.use(walletRouter);

export default router;
