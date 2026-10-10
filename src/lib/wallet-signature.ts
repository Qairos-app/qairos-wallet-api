import { hashMessage, Interface, verifyMessage } from "ethers";

const signatureInterface = new Interface(["function isValidSignature(bytes32,bytes) view returns (bytes4)"]);

export async function validWalletSignature(address: string, message: string, signature: string): Promise<boolean> {
  try {
    if (verifyMessage(message, signature).toLowerCase() === address.toLowerCase()) return true;
  } catch { /* Contract-wallet signatures need not have an EOA signature shape. */ }
  // ERC-1271 smart accounts are verified on Ethereum, without a signer or funds.
  const rpcUrl = process.env.ETH_RPC_URL;
  if (!rpcUrl?.startsWith("https://")) throw new Error("Signature verification unavailable");
  const response = await fetch(rpcUrl, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 0, method: "eth_chainId", params: [] },
      { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{
        to: address, data: signatureInterface.encodeFunctionData("isValidSignature", [hashMessage(message), signature]),
      }, "latest"] },
    ]),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Signature verification unavailable");
  const result: unknown = await response.json();
  if (!Array.isArray(result)) throw new Error("Signature verification unavailable");
  const chain = result.find(item => item?.id === 0);
  const call = result.find(item => item?.id === 1);
  if (chain?.error || chain?.result !== "0x1") throw new Error("Signature verification unavailable");
  if (call?.error || typeof call?.result !== "string") return false;
  try { return signatureInterface.decodeFunctionResult("isValidSignature", call.result)[0] === "0x1626ba7e"; }
  catch { return false; }
}
