import { GetMainnetStatusResponse } from "../validation/index";
import deployment from "../deployments/ethereum-mainnet.json";

type Call = { method: string; params: unknown[] };
type Snapshot = ReturnType<typeof GetMainnetStatusResponse.parse>;
const addresses = Object.fromEntries(
  Object.entries(deployment.contracts).map(([name, entry]) => [name, entry.address]),
);
let cached: { value: Snapshot; expires: number } | undefined;
let pending: Promise<Snapshot> | undefined;
let retryAfter = 0;
let codesVerifiedAt = 0;
async function rpc(calls: Call[], deadline: AbortSignal): Promise<string[]> {
  // Keep batches small: the configured dRPC endpoint rejects larger batches.
  // All chunks share a deadline and the same block tag.
  if (calls.length > 2) {
    const values: string[] = [];
    for (let i = 0; i < calls.length; i += 2) values.push(...await rpc(calls.slice(i, i + 2), deadline));
    return values;
  }
  const url = process.env.ETH_RPC_URL;
  if (!url || !url.startsWith("https://")) throw new Error("RPC unavailable");
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(calls.map((call, id) => ({ jsonrpc: "2.0", id, ...call }))),
    signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]),
  });
  if (!response.ok) throw new Error("RPC unavailable");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Invalid RPC response");
  return calls.map((_, id) => {
    const item = data.find(item => item?.id === id);
    if (!item || item.error || typeof item.result !== "string" || !/^0x[0-9a-f]*$/i.test(item.result)) {
      throw new Error("Invalid RPC result");
    }
    return item.result;
  });
}
function word(data: string, index = 0): bigint {
  const hex = data.slice(2 + index * 64, 2 + (index + 1) * 64);
  if (hex.length !== 64) throw new Error("Incomplete ABI result");
  return BigInt("0x" + hex);
}
function read(name: string, selector: string, block: string, arg?: number): Call {
  return { method: "eth_call", params: [
    { to: addresses[name], data: "0x" + selector + (arg === undefined ? "" : arg.toString(16).padStart(64, "0")) },
    block,
  ] };
}
async function load(): Promise<Snapshot> {
  const deadline = AbortSignal.timeout(25_000);
  const [chain, block] = await rpc([
    { method: "eth_chainId", params: [] }, { method: "eth_blockNumber", params: [] },
  ], deadline);
  if (BigInt(chain!) !== 1n) throw new Error("Wrong Ethereum network");
  const tag = block!;
  if (Date.now() - codesVerifiedAt > 300_000) {
    const codes = await rpc(Object.values(addresses).map(address => ({ method: "eth_getCode", params: [address, tag] })), deadline);
    if (codes.some(code => code === "0x")) throw new Error("Contract missing");
    codesVerifiedAt = Date.now();
  }
  const base = await rpc([
    read("QairosOracle", "6405e8e4", tag),
    read("QairosOracle", "21250fff", tag),
    read("QairosCanary", "a9069b4a", tag),
    read("QairosMarket", "ec979082", tag),
    read("QairosVault", "8cfe95aa", tag),
    read("QairosInsurance", "e6e46571", tag),
  ], deadline);
  const rungCount = Number(word(base[2]!)), marketCount = Number(word(base[3]!));
  if (rungCount > 32 || marketCount > 32) throw new Error("Contract list exceeds supported bounds");
  const values = await rpc([
    ...Array.from({ length: rungCount }, (_, id) => read("QairosCanary", "97e627a7", tag, id)),
    ...Array.from({ length: marketCount }, (_, id) => read("QairosMarket", "28861d22", tag, id)),
  ], deadline);
  const rungs = values.slice(0, rungCount).map((data, id) => {
    if (word(data) !== 32n) throw new Error("Unexpected rung ABI");
    return {
      id, bits: Number(word(data, 1)), armed: word(data, 2) === 1n, broken: word(data, 3) === 1n,
      solver: "0x" + word(data, 4).toString(16).padStart(40, "0"),
      brokenAt: Number(word(data, 5)), bountyWei: word(data, 6).toString(),
    };
  });
  const markets = values.slice(rungCount).map((data, id) => {
    if (word(data) !== 32n) throw new Error("Unexpected market ABI");
    return {
      id, bits: Number(word(data, 1)), deadline: Number(word(data, 2)),
      settled: word(data, 3) === 1n, yesWon: word(data, 4) === 1n,
      yesPoolWei: word(data, 5).toString(), noPoolWei: word(data, 6).toString(),
    };
  });
  return GetMainnetStatusResponse.parse({
    chainId: 1, blockNumber: Number(BigInt(tag)), observedAtUtc: new Date().toISOString(),
    threatLevel: Number(word(base[0]!)), firstBreakTime: Number(word(base[1]!)),
    rungCount, marketCount, vaultBreakerTripped: word(base[4]!) === 1n,
    insuranceFreeCapitalWei: word(base[5]!).toString(),
    contracts: Object.entries(addresses).map(([name, address]) => ({ name, address, deployed: true })),
    rungs, markets,
  });
}
export async function mainnetStatus(): Promise<Snapshot> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  if (retryAfter > Date.now()) throw new Error("RPC cooling down");
  pending = load().then(value => {
    cached = { value, expires: Date.now() + 30_000 };
    return value;
  }).catch(() => {
    retryAfter = Date.now() + 15_000;
    // Never cache/return a synthetic zero or stale success after provider failure.
    throw new Error("Mainnet snapshot unavailable");
  }).finally(() => { pending = undefined; });
  return pending;
}
