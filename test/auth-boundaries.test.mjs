import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { sameOrigin } from '../dist/lib/origin.mjs';
import { validWalletSignature } from '../dist/lib/wallet-signature.mjs';
test('origin matches configured canonical origin, not a forwarded header', () => {
  process.env.APP_ORIGIN = 'https://qairos.tech';
  process.env.NODE_ENV = 'production';
  const req = origin => ({ get: name => name === 'Origin' ? origin : 'evil.example' });
  assert.equal(sameOrigin(req('https://qairos.tech')), 'https://qairos.tech');
  assert.equal(sameOrigin(req('https://evil.example')), undefined);
  assert.equal(sameOrigin(req('https://qairos.tech/')), undefined);
  assert.equal(sameOrigin(req('http://qairos.tech')), undefined);
});
test('valid ephemeral EOA signature verifies without signing transactions', async () => {
  const wallet = Wallet.createRandom();
  const message = 'Qairos offline test: no transaction authorization.';
  const signature = await wallet.signMessage(message);
  assert.equal(await validWalletSignature(wallet.address, message, signature), true);
});
