import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant, TransactionStatus } from 'genlayer-js/types';

const manifest = JSON.parse(readFileSync(new URL('../proof/manifest.json', import.meta.url), 'utf8'));
const client = createClient({ chain: studionet });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const boardOnly = process.argv.slice(2).includes('--board-only');
assert(process.argv.slice(2).every((arg) => arg === '--board-only'), 'Unknown verification option');

assert(manifest.chain_id === 61999 && /^0x[0-9a-fA-F]{40}$/.test(manifest.contract), 'Unexpected network or contract');
const sourceHash = createHash('sha256').update(readFileSync(new URL('../contracts/SkillLoop.py', import.meta.url))).digest('hex');
assert(sourceHash === manifest.contract_source_sha256, 'Contract source hash mismatch');

try {
if (!boardOnly) {
  for (const [label, hash] of Object.entries(manifest.transactions)) {
    const tx = await client.getTransaction({ hash });
    assert(tx.statusName === TransactionStatus.FINALIZED, `${label}: ${tx.statusName}`);
    assert(Number(tx.result) === 6, `${label}: consensus result ${tx.result}`);
    const receipt = await client.getTransactionReceipt({ hash });
    assert(receipt.status === 'success', `${label}: EVM receipt ${receipt.status}`);
    console.log(`PASS ${label}: finalized, majority agree, successful execution`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

const raw = await client.readContract({
  address: manifest.contract,
  functionName: 'get_board',
  args: [],
  transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
});
const board = typeof raw === 'string' ? JSON.parse(raw) : raw;
for (const [id, owner] of Object.entries(manifest.expected_owners)) {
  assert(board.offers.some((offer) => offer.id === Number(id) && offer.owner.toLowerCase() === owner.toLowerCase()), `Offer ${id} owner mismatch`);
}
for (const [id, status] of Object.entries(manifest.expected_offer_statuses || {})) {
  assert(board.offers.some((offer) => offer.id === Number(id) && offer.status === status), `Offer ${id} status mismatch`);
}
for (const expected of manifest.expected_edges) {
  assert(board.edges.some((edge) => edge.giver === expected.giver && edge.receiver === expected.receiver && edge.verdict === expected.verdict), `Missing edge ${expected.giver} → ${expected.receiver}: ${expected.verdict}`);
}
if (manifest.expected_cycle) {
  const expected = manifest.expected_cycle;
  assert(board.cycles.some((cycle) => cycle.id === expected.id && cycle.status === expected.status && cycle.accepted_count === expected.accepted_count && JSON.stringify(cycle.offers) === JSON.stringify(expected.offers)), 'Cycle state mismatch');
  assert(board.offers.filter((offer) => expected.offers.includes(offer.id)).every((offer) => offer.status === 'COMMITTED'), 'Cycle offers are not committed');
}
console.log(`PASS board: ${board.offer_count} offers, ${board.edges.length} reviewed edges, ${board.cycle_count} cycles`);
} catch (error) {
  const retryAfter = error?.cause?.data?.retry_after_seconds;
  if (Number.isFinite(retryAfter)) {
    console.error(`Studionet RPC rate limit reached. Retry after ${retryAfter} seconds.`);
  } else {
    console.error(`Live verification failed: ${error?.message || String(error)}`);
  }
  process.exitCode = 1;
}
