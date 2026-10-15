import test from 'node:test';
import assert from 'node:assert/strict';
import { connectWalletProvider, verifyWalletProvider, studioChainId } from '../src/wallet.js';
import { transactionOutcome } from '../src/transaction.js';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const account = '0x1234567890123456789012345678901234567890';

function wallet(initialChain, unknownChain = false) {
  let chainId = initialChain;
  const calls = [];
  return {
    calls,
    async request({ method, params }) {
      calls.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
      if (method === 'eth_chainId') return chainId;
      if (method === 'wallet_switchEthereumChain') {
        if (unknownChain) { unknownChain = false; throw { code: 4902 }; }
        chainId = params[0].chainId;
        return null;
      }
      if (method === 'wallet_addEthereumChain') {
        assert.equal(params[0].chainId, studioChainId);
        assert.equal(params[0].rpcUrls[0], 'https://studio.genlayer.com/api');
        return null;
      }
      throw new Error(`Unexpected method: ${method}`);
    },
  };
}

test('wallet connection uses a standard EIP-1193 provider and selects Studionet', async () => {
  const provider = wallet('0x1', true);
  assert.equal(await connectWalletProvider(provider), account);
  assert.deepEqual(provider.calls, [
    'eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain',
    'wallet_addEthereumChain', 'wallet_switchEthereumChain', 'eth_chainId',
  ]);
  await verifyWalletProvider(provider, account.toUpperCase().replace('0X', '0x'));
  assert.equal(provider.calls.at(-1), 'eth_chainId');
});

test('write preparation rejects a changed account', async () => {
  await assert.rejects(verifyWalletProvider(wallet(studioChainId), '0x0000000000000000000000000000000000000000'), /account changed/);
});

test('finalization requires majority agreement and successful leader execution', () => {
  const tx = {
    statusName: 'FINALIZED',
    result: 6,
    consensus_data: { leader_receipt: [{ mode: 'leader', execution_result: 'SUCCESS' }] },
  };
  assert.equal(transactionOutcome(tx).phase, 'finalized-success');
  assert.equal(transactionOutcome({ ...tx, result: 7 }).phase, 'finalized-error');
  assert.equal(transactionOutcome({ ...tx, consensus_data: { leader_receipt: [{ mode: 'leader', execution_result: 'ERROR' }] } }).phase, 'finalized-error');
  assert.equal(transactionOutcome({ ...tx, statusName: 'ACCEPTED' }).terminal, false);
});

test('stable SDK routes a contract write through the EIP-1193 wallet', async () => {
  const originalFetch = globalThis.fetch;
  const walletRequests = [];
  const rpcMethods = [];
  const provider = {
    async request(request) {
      walletRequests.push(request);
      if (request.method === 'eth_sendTransaction') return `0x${'ab'.repeat(32)}`;
      throw new Error(`Unexpected wallet method: ${request.method}`);
    },
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, studionet.rpcUrls.default.http[0]);
    const { method } = JSON.parse(options.body);
    rpcMethods.push(method);
    const result = {
      eth_getTransactionCount: '0x0',
      eth_estimateGas: '0x30d40',
      eth_gasPrice: '0x1',
    }[method];
    assert.ok(result, `Unexpected RPC method: ${method}`);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const client = createClient({ chain: studionet, account, provider });
    const hash = await client.writeContract({
      address: '0xce9A6dFC2401Db01E1224b4E08c82D99e3a3099e',
      functionName: 'cancel_offer',
      args: [1],
      value: 0n,
    });
    assert.equal(hash, `0x${'ab'.repeat(32)}`);
    assert.deepEqual(rpcMethods, ['eth_getTransactionCount', 'eth_estimateGas', 'eth_gasPrice']);
    assert.equal(walletRequests.length, 1);
    assert.equal(walletRequests[0].method, 'eth_sendTransaction');
    assert.equal(walletRequests[0].params[0].from, account);
    assert.equal(walletRequests[0].params[0].to.toLowerCase(), studionet.consensusMainContract.address.toLowerCase());
    assert.equal(walletRequests[0].params[0].chainId, studioChainId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
