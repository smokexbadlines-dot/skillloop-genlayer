import test from 'node:test';
import assert from 'node:assert/strict';
import { connectWalletProvider, verifyWalletProvider, studioChainId } from '../src/wallet.js';
import { transactionOutcome } from '../src/transaction.js';

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
