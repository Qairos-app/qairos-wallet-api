# Wallet API Integration Tests

`pnpm test` checks origin authorization and an unfunded ephemeral wallet signature offline.
`pnpm test:integration` exercises 34 nonce, replay, signature, session, CSRF and cross-wallet ownership checks against a running development API.
The test identities are generated in memory; it never sends a blockchain transaction.
Use an isolated development database and set APP_ORIGIN=http://localhost for this command. Do not run it against production.
Set WALLET_TEST_BASE_URL to the local API prefix, for example http://127.0.0.1:8080/api.
Apply reviewed migrations to your test database before starting the service.
The initial release passed these checks against the standalone API build, not only the original application.
