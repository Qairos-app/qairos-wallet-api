# Configuration

Copy `.env.example` to `.env`; supply values privately. Never commit `.env`.

| Variable | Requirement |
| --- | --- |
| PORT | Listening port, for example 8080 |
| NODE_ENV | production for deployed HTTPS service |
| DATABASE_URL | Private PostgreSQL connection URL |
| SESSION_SECRET | Strong random secret, at least 32 characters; keep stable and plan ownership migration before rotation |
| APP_ORIGIN | Exact console origin, e.g. http://localhost:5173 locally or your canonical HTTPS origin in production; no trailing slash |
| ETH_RPC_URL | Private HTTPS Ethereum chain-1 endpoint; do not use a WebSocket URL |
| ANU_QRNG_API_KEY | Optional private credential for the quantum-random provider |
| LOG_LEVEL | Optional; info by default |

Expose `/api` behind a trusted HTTPS reverse proxy. Do not log authorization or cookie headers.
The global challenge throttle is per process, not a distributed abuse-control service.
Generate new migrations with `pnpm db:generate`; review SQL and backups before applying `pnpm db:migrate`.
Initial migrations create empty tables only and contain no production records.
Health endpoint: `/api/healthz`. Successful health is not proof that every upstream or database operation is available.
