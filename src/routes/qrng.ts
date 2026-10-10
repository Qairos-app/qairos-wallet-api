import { Router, type IRouter } from "express";
import {
  GetQrngBytesQueryParams,
  GetQrngBytesResponse,
} from "../validation/index";

const router: IRouter = Router();
const UPSTREAM_URL = "https://api.quantumnumbers.anu.edu.au/";
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

let windowStartedAt = Date.now();
let requestsInWindow = 0;

router.get("/qrng", async (req, res): Promise<void> => {
  const query = GetQrngBytesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Byte count must be between 1 and 64." });
    return;
  }

  const apiKey = process.env.ANU_QRNG_API_KEY?.trim();

  const now = Date.now();
  if (now - windowStartedAt >= WINDOW_MS) {
    windowStartedAt = now;
    requestsInWindow = 0;
  }
  if (requestsInWindow >= MAX_REQUESTS_PER_WINDOW) {
    res.setHeader(
      "Retry-After",
      String(Math.max(1, Math.ceil((WINDOW_MS - (now - windowStartedAt)) / 1000))),
    );
    res.status(429).json({ error: "QRNG request limit reached. Try again shortly." });
    return;
  }
  requestsInWindow += 1;

  // The public ANU endpoint remains available, but ANU marks it as legacy.
  // An explicitly configured key selects the recommended AWS service.
  const upstreamUrl = new URL(apiKey ? UPSTREAM_URL : "https://qrng.anu.edu.au/API/jsonI.php");
  upstreamUrl.searchParams.set("length", String(query.data.length));
  upstreamUrl.searchParams.set("type", "uint8");

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      signal: AbortSignal.timeout(6_000),
    });

    if (!upstream.ok) {
      req.log.warn(
        { upstreamStatus: upstream.status },
        "Quantum random provider returned an error",
      );
      res.status(502).json({ error: "Quantum random service is temporarily unavailable." });
      return;
    }

    const body: unknown = await upstream.json();
    if (typeof body !== "object" || body === null || !("success" in body) || body.success !== true) {
      res.status(502).json({ error: "Quantum random provider did not confirm success." });
      return;
    }
    const values =
      typeof body === "object" && body !== null && "data" in body
        ? (body as { data?: unknown }).data
        : undefined;
    if (!Array.isArray(values) || values.length !== query.data.length) {
      req.log.warn(
        { receivedCount: Array.isArray(values) ? values.length : 0 },
        "Quantum random provider returned an invalid response",
      );
      res.status(502).json({ error: "Quantum random service returned invalid data." });
      return;
    }

    const result = GetQrngBytesResponse.safeParse({
      data: values,
      count: values.length,
    });
    if (!result.success) {
      req.log.warn("Quantum random provider returned non-byte values");
      res.status(502).json({ error: "Quantum random service returned invalid data." });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-QRNG-Source", apiKey ? "ANU-AWS" : "ANU-public-legacy");
    res.json(result.data);
  } catch (error) {
    req.log.warn(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Quantum random provider request failed",
    );
    res.status(502).json({ error: "Quantum random service is temporarily unavailable." });
  }
});

export default router;
