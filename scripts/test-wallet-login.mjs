import assert from "node:assert/strict";
import { Wallet } from "ethers";

// Development API only. Random, unfunded test identities never leave this process.
const base = process.env.WALLET_TEST_BASE_URL || "http://localhost:8080/api";
const origin = "http://localhost";
class Client {
  cookies = new Map();
  async request(path, method = "GET", body, csrf) {
    const response = await fetch(base + path, {
      method, headers: {
        Origin: origin, Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0], split = pair.indexOf("=");
      this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }
}
const a = new Client(), b = new Client(), c = new Client(), signerA = Wallet.createRandom(), signerB = Wallet.createRandom();
let passed = 0;
function check(condition, message) { assert.ok(condition, message); passed++; }
async function signIn(client, signer) {
  const challenge = await client.request("/wallet/nonce", "POST", { address: signer.address });
  check(challenge.status === 200, "nonce issued");
  check(challenge.data.message.startsWith("localhost wants you"), "message domain bound");
  check(challenge.data.message.includes("Chain ID: 1") && challenge.data.message.includes("Expiration Time:"), "chain and expiry bound");
  const signature = await signer.signMessage(challenge.data.message);
  const replay = new Client(); replay.cookies = new Map(client.cookies);
  const login = await client.request("/wallet/verify", "POST", { signature });
  check(login.status === 200 && login.data.address === signer.address, "signature logs in intended wallet");
  check((await replay.request("/wallet/verify", "POST", { signature })).status === 401, "consumed challenge cannot be replayed");
  return login.data;
}
try {
  check((await a.request("/wallet/session")).data.address === null, "starts signed out");
  const anonymousCsrf = (await a.request("/ledger")).data.csrfToken;
  check((await a.request("/wallet/nonce", "POST", { address: "bad" })).status === 400, "invalid address rejected");
  const hostile = await fetch(base + "/wallet/nonce", {
    method: "POST", headers: { Origin: "https://other.invalid", "Content-Type": "application/json" },
    body: JSON.stringify({ address: signerA.address }),
  });
  check(hostile.status === 403, "cross-origin challenge rejected");
  const badChallenge = await a.request("/wallet/nonce", "POST", { address: signerA.address });
  const wrongSignature = await signerB.signMessage(badChallenge.data.message);
  check((await a.request("/wallet/verify", "POST", { signature: wrongSignature })).status === 401, "signature from another wallet rejected");
  const loginA = await signIn(a, signerA), loginB = await signIn(b, signerB);
  check((await a.request("/wallet/session")).data.address === signerA.address, "authenticated session survives requests");
  const ledgerA = (await a.request("/ledger")).data, ledgerB = (await b.request("/ledger")).data;
  check((await a.request("/ledger/bets", "PUT", { s: [[0, 0], [0, 0], [0, 0]] }, anonymousCsrf)).status === 403, "stale anonymous token cannot mutate wallet-owned data");
  check((await a.request("/ledger/bets", "PUT", { s: [[0, 0], [0, 0], [0, 0]] }, ledgerB.csrfToken)).status === 403, "another wallet session token cannot mutate own data");
  check((await a.request("/ledger/bets", "PUT", { s: [[0.125, 0], [0, 0], [0, 0]] }, ledgerA.csrfToken)).status === 200, "wallet-owned paper data saved");
  check((await b.request("/ledger")).data.mine[0][0] === 0, "another wallet cannot see positions as its own");
  const loginC = await signIn(c, signerA);
  check((await c.request("/ledger")).data.mine[0][0] === 0.125, "same wallet in another signed-in browser owns the saved positions");
  check((await a.request("/ledger/ark", "PUT", { account: signerB.address, commitment: "0x" + "a".repeat(64), consent: true }, ledgerA.csrfToken)).status === 403, "registry rejects another wallet identity");
  check((await a.request("/ledger/ark", "PUT", { account: signerA.address, commitment: "0x" + "a".repeat(64), consent: true }, ledgerA.csrfToken)).status === 200, "registry accepts verified own wallet and consent");
  check((await b.request("/ledger")).data.hasOwnEntry === false, "another wallet does not own registry entry");
  check((await a.request("/wallet/session", "DELETE", undefined, "wrong")).status === 403, "logout requires matching CSRF token");
  check((await a.request("/ledger", "DELETE", undefined, ledgerA.csrfToken)).status === 204, "test wallet data deleted");
  const stolen = new Client(); stolen.cookies = new Map(a.cookies);
  check((await a.request("/wallet/session", "DELETE", undefined, loginA.csrfToken)).status === 204, "logout succeeds");
  check((await stolen.request("/wallet/session")).data.address === null, "server revocation invalidates copied cookie");
  check((await b.request("/wallet/session", "DELETE", undefined, loginB.csrfToken)).status === 204, "second session cleaned up");
  check((await c.request("/wallet/session", "DELETE", undefined, loginC.csrfToken)).status === 204, "third session cleaned up");
  console.log(`PASS: ${passed} wallet login / replay / origin / CSRF / ownership checks. No blockchain transactions sent.`);
} finally {
  for (const client of [a, b, c]) {
    try {
      const ledger = await client.request("/ledger");
      if (ledger.status === 200) await client.request("/ledger", "DELETE", undefined, ledger.data.csrfToken);
      const current = await client.request("/wallet/session");
      if (current.data.csrfToken) await client.request("/wallet/session", "DELETE", undefined, current.data.csrfToken);
    } catch { /* Preserve the original assertion failure, if any. */ }
  }
}
