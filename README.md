# Qairos Wallet API

**Signature-backed wallet sessions, shared ledger and read-only Ethereum monitoring.**

[Source](https://github.com/Qairos-app/qairos-wallet-api) · [Releases](https://github.com/Qairos-app/qairos-wallet-api/releases) · [Support](mailto:support@qairos.tech)

## Status
Version `0.1.0` is an experimental standalone distribution. Contracts have not been independently audited.
Quantum monitoring does not guarantee safety, and ordinary EVM wallet signatures are not post-quantum.
Local validation results are included with the initial release; no CI success, npm publication or Mainnet write is implied without separate evidence.

## Features
- Ten-minute, one-use wallet challenges and 24-hour revocable HttpOnly sessions.
- Origin checks, session-bound CSRF protection and wallet-owned ledger storage.
- EOA and ERC-1271 signature verification; no shared transaction signer.
- Sanitized logging, Ethereum status snapshots and explicit QRNG upstream failures.

## Quick start
Requirements: Node.js 24, pnpm 10.26.1.

```sh
git clone https://github.com/Qairos-app/qairos-wallet-api.git
cd qairos-wallet-api
pnpm install --frozen-lockfile
cp .env.example .env
# Fill .env privately; review docs/CONFIGURATION.md first.
pnpm run build
pnpm run db:migrate
pnpm start
```

## Boundaries and configuration
Requires PostgreSQL, a stable strong SESSION_SECRET, an exact APP_ORIGIN and an HTTPS Ethereum Mainnet RPC URL. Use the same public HTTPS origin for console and `/api`. Apply reviewed migrations separately; the server never creates tables on startup. RPC and quantum-provider credentials belong on the server only. The API does not deploy contracts or send Ethereum transactions.

## Quality and releases
Run `pnpm run validate`. Run `pnpm run release:package` to create the versioned `.tgz` and SHA-256 checksum.
Follow [docs/RELEASE.md](docs/RELEASE.md) before tagging. GitHub releases and npm registry publication are separate operations.
See [docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md) for reproducible checks and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for component boundaries.

## Community
- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security reporting](SECURITY.md)
- [Support](SUPPORT.md)
- [Governance](GOVERNANCE.md)
- [Changelog](CHANGELOG.md)

## License
MIT for Qairos-authored source; retain upstream and per-file notices. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
Brand assets do not grant endorsement or trademark rights.
