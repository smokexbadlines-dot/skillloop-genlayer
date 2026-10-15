import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import proof from '../proof/manifest.json';
import { connectWalletProvider, verifyWalletProvider } from './wallet.js';
import { transactionOutcome } from './transaction.js';
import './style.css';

const contractFromBuild = import.meta.env.VITE_CONTRACT_ADDRESS || '0xce9A6dFC2401Db01E1224b4E08c82D99e3a3099e';
const savedAddress = localStorage.getItem('skillloop_address') || '';
const state = {
  address: savedAddress || contractFromBuild,
  mode: savedAddress || contractFromBuild ? 'live' : 'sample',
  tab: 'board',
  wallet: '',
  board: null,
  busy: false,
  txId: sessionStorage.getItem('skillloop_tx') || '',
  txStatus: '',
  liveError: '',
  offerDraft: null,
};

const sampleBoard = () => ({
  offer_count: 4,
  cycle_count: 0,
  offers: [
    { id: 1, owner: '0xA11cE00000000000000000000000000000000001', title: 'API test suite', gives: 'Write pytest tests for a Python REST API', wants: 'Write API reference docs for a Python REST API', status: 'OPEN', expires_at: Math.floor(Date.now()/1000) + 14*86400, cycle_id: 0, delivery_url: '', confirmed: false },
    { id: 2, owner: '0xB0b0000000000000000000000000000000000002', title: 'API documentation', gives: 'Write API reference docs for a Python REST API', wants: 'Audit the keyboard navigation of a React dashboard', status: 'OPEN', expires_at: Math.floor(Date.now()/1000) + 14*86400, cycle_id: 0, delivery_url: '', confirmed: false },
    { id: 3, owner: '0xCaA0000000000000000000000000000000000003', title: 'Accessibility audit', gives: 'Audit the keyboard navigation of a React dashboard', wants: 'Write pytest tests for a Python REST API', status: 'OPEN', expires_at: Math.floor(Date.now()/1000) + 14*86400, cycle_id: 0, delivery_url: '', confirmed: false },
    { id: 4, owner: '0xD400000000000000000000000000000000000004', title: 'Logo refresh', gives: 'Design three SVG logo proposals for a developer tool', wants: 'Write API reference docs for a Python REST API', status: 'OPEN', expires_at: Math.floor(Date.now()/1000) + 14*86400, cycle_id: 0, delivery_url: '', confirmed: false },
  ],
  edges: [
    { giver: 1, receiver: 3, verdict: 'FIT' },
    { giver: 3, receiver: 2, verdict: 'FIT' },
    { giver: 2, receiver: 1, verdict: 'FIT' },
    { giver: 4, receiver: 2, verdict: 'NO_FIT' },
  ],
  cycles: [],
});

state.board = state.mode === 'live' ? { offer_count: 0, cycle_count: 0, offers: [], edges: [], cycles: [] } : sampleBoard();

const $ = (selector) => document.querySelector(selector);
const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (value) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—';
const date = (seconds) => seconds ? new Date(Number(seconds) * 1000).toLocaleDateString() : '—';
const tagClass = (status) => ['NO_FIT', 'UNCLEAR', 'DECLINED', 'EXPIRED', 'INCOMPLETE', 'CANCELLED'].includes(status) ? 'bad' : ['PROPOSED', 'RESERVED', 'UNREVIEWED'].includes(status) ? 'neutral' : '';
const explorer = (id, kind = 'tx') => `https://explorer-studio.genlayer.com/${kind}/${encodeURIComponent(id)}`;

function toast(message, error = false) {
  const old = $('.toast'); if (old) old.remove();
  const el = document.createElement('div'); el.className = `toast${error ? ' error' : ''}`; el.textContent = message;
  document.body.append(el); setTimeout(() => el.remove(), 7000);
}

function readClient() { return createClient({ chain: studionet }); }
function walletClient() {
  if (!window.ethereum || !state.wallet) throw new Error('Connect an EIP-1193 wallet first.');
  return createClient({ chain: studionet, account: state.wallet, provider: window.ethereum });
}

async function connectWallet() {
  const address = await connectWalletProvider(window.ethereum);
  state.wallet = address;
  render();
}

async function loadLive() {
  if (!/^0x[0-9a-fA-F]{40}$/.test(state.address)) throw new Error('Enter a 20-byte contract address.');
  const raw = await readClient().readContract({ address: state.address, functionName: 'get_board', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  const board = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!board || !Array.isArray(board.offers) || !Array.isArray(board.edges)) throw new Error('Contract did not return a SkillLoop board.');
  state.board = board;
  state.mode = 'live';
  state.liveError = '';
  localStorage.setItem('skillloop_address', state.address);
  render();
}

async function track(txId) {
  const reader = readClient();
  let readFailures = 0;
  for (let attempt = 0; attempt < 180; attempt++) {
    let tx;
    try {
      tx = await reader.getTransaction({ hash: txId });
      readFailures = 0;
    } catch (error) {
      readFailures++;
      if (readFailures >= 4) throw new Error(`Cannot read transaction ${short(txId)}. Resume tracking later: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    const outcome = transactionOutcome(tx);
    const nextStatus = `${outcome.phase} · ${outcome.status}`;
    if (state.txStatus !== nextStatus) { state.txStatus = nextStatus; render(); }
    if (outcome.terminal) {
      sessionStorage.removeItem('skillloop_tx');
      if (outcome.phase !== 'finalized-success') {
        throw new Error(`Transaction ended without successful execution: ${nextStatus}. Open its Explorer link for details.`);
      }
      toast(`Finalized successfully: ${short(txId)}`);
      try {
        await loadLive();
      } catch (error) {
        state.mode = 'sample';
        state.board = sampleBoard();
        state.liveError = `Transaction finalized, but the board could not be refreshed: ${error.message}`;
        render();
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  state.txStatus = 'Tracking timed out; resume from the transaction link';
  render();
  throw new Error('Finality was not reached during this session. Resume tracking before another write.');
}

async function write(functionName, args = []) {
  if (state.mode !== 'live') return sampleWrite(functionName, args);
  if (state.busy) throw new Error('Wait for the current wallet action to finish.');
  if (state.txId && sessionStorage.getItem('skillloop_tx')) throw new Error('Track the pending transaction before another write.');
  const client = walletClient();
  const call = { address: state.address, functionName, args };
  state.busy = true; render();
  try {
    await verifyWalletProvider(window.ethereum, state.wallet);
    const txId = await client.writeContract({ ...call, value: 0n });
    state.txId = txId;
    sessionStorage.setItem('skillloop_tx', txId);
    state.txStatus = 'Submitted; awaiting finality';
    render();
    await track(txId);
  } finally { state.busy = false; render(); }
}

function sampleWrite(functionName, args) {
  const board = state.board;
  const now = Math.floor(Date.now() / 1000);
  if (functionName === 'create_offer') {
    const [title, gives, wants, expires_at] = args;
    const id = ++board.offer_count;
    board.offers.push({ id, owner: '0xYourSampleWallet0000000000000000000000000000', title, gives, wants, expires_at, status: 'OPEN', cycle_id: 0, delivery_url: '', confirmed: false });
    toast('Added to the sample board. No validator reviewed this offer.');
  } else if (functionName === 'review_match') {
    const [giver, receiver] = args;
    if (board.edges.some((edge) => edge.giver === giver && edge.receiver === receiver)) throw new Error('Pair already reviewed in the sample.');
    board.edges.push({ giver, receiver, verdict: 'UNCLEAR' });
    toast('Sample-only result: UNCLEAR. A live validator must assess this pair.');
  } else if (functionName === 'clear_next_cycle') {
    let found = null;
    const offers = board.offers.filter((o) => o.status === 'OPEN' && o.expires_at > now);
    for (let i = 0; i < offers.length && !found; i++) for (let j = i + 1; j < offers.length && !found; j++) for (let k = j + 1; k < offers.length && !found; k++) {
      const [a, b, c] = [offers[i], offers[j], offers[k]];
      const fit = (x, y) => board.edges.some((edge) => edge.giver === x.id && edge.receiver === y.id && edge.verdict === 'FIT');
      if (new Set([a.owner, b.owner, c.owner]).size !== 3) continue;
      if (fit(a, b) && fit(b, c) && fit(c, a)) found = [a.id, b.id, c.id];
      else if (fit(a, c) && fit(c, b) && fit(b, a)) found = [a.id, c.id, b.id];
    }
    if (!found) throw new Error('No reviewed three-party cycle is available.');
    const id = ++board.cycle_count;
    board.cycles.push({ id, offers: found, status: 'PROPOSED', formed_at: now, accept_by: now + 172800, deliver_by: 0, accepted_count: 0, confirmed_count: 0, sampleAccepted: [] });
    for (const offerId of found) { const offer = board.offers.find((o) => o.id === offerId); offer.status = 'RESERVED'; offer.cycle_id = id; }
    toast('Sample cycle reserved. This is a browser simulation.');
  } else if (functionName === 'accept_cycle') {
    const cycle = board.cycles.find((c) => c.id === args[0]);
    if (!cycle || cycle.status !== 'PROPOSED') throw new Error('Cycle cannot be accepted.');
    const offerId = cycle.offers.find((id) => !cycle.sampleAccepted.includes(id));
    if (!offerId) throw new Error('All members already accepted.');
    cycle.sampleAccepted.push(offerId); cycle.accepted_count++;
    if (cycle.accepted_count === 3) { cycle.status = 'ACTIVE'; cycle.deliver_by = now + 1209600; for (const id of cycle.offers) board.offers.find((o) => o.id === id).status = 'COMMITTED'; }
    toast(`Sample acceptance ${cycle.accepted_count}/3 recorded.`);
  } else {
    toast('This action requires a deployed contract and the correct member wallet.', true);
  }
  render();
}

function button(label, action, params = '', extra = '') {
  return `<button class="button ${extra}" data-action="${action}" ${params}>${esc(label)}</button>`;
}

function renderBoard() {
  const offers = state.board.offers;
  return `<div class="section-head"><div><span class="eyebrow">The exchange board</span><h2>Open commitments</h2><span class="muted">Each member names the work they give and the work they want.</span></div>${button('Post an offer', 'tab', 'data-tab="create"', 'primary')}</div>
    <div class="grid">${offers.map((offer) => `<article class="card"><div class="card-top"><span class="data-label">Offer ${offer.id}</span><span class="tag ${tagClass(offer.status)}">${esc(offer.status)}</span></div><h3>${esc(offer.title)}</h3><label>Gives</label><p>${esc(offer.gives)}</p><label>Wants</label><p>${esc(offer.wants)}</p><div class="card-foot"><span title="${esc(offer.owner)}">${esc(short(offer.owner))}</span><span>Until ${date(offer.expires_at)}</span></div>${state.mode === 'live' && offer.status === 'OPEN' && state.wallet.toLowerCase() === offer.owner.toLowerCase() ? `<div style="margin-top:18px">${button('Cancel my offer', 'cancel', `data-id="${offer.id}"`, 'small ghost')}</div>` : ''}</article>`).join('')}</div>`;
}

function renderReview() {
  const options = state.board.offers.map((o) => `<option value="${o.id}">#${o.id} ${esc(o.title)}</option>`).join('');
  const rows = state.board.edges.map((edge) => `<tr><td>#${edge.giver} ${esc(state.board.offers.find((o) => o.id === edge.giver)?.title || '')}</td><td>→ #${edge.receiver} ${esc(state.board.offers.find((o) => o.id === edge.receiver)?.title || '')}</td><td><span class="tag ${tagClass(edge.verdict)}">${esc(edge.verdict)}</span></td></tr>`).join('');
  return `<div class="section-head"><div><span class="eyebrow">Validator judgment</span><h2>One edge at a time</h2><span class="muted">A FIT edge means the giver's written offer covers the receiver's request.</span></div></div>
    <div class="side-by-side"><div><div class="matrix"><table><thead><tr><th>Giver</th><th>Receiver</th><th>Judgment</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No reviewed pairs yet.</td></tr>'}</tbody></table></div></div>
    <form id="review-form" class="card"><h3>Review a pair</h3><label class="field">Giver<select name="giver" required>${options}</select></label><br><label class="field">Receiver<select name="receiver" required>${options}</select></label><p class="muted" style="font-size:12px;margin-top:18px">${state.mode === 'sample' ? 'Sample mode marks new pairs UNCLEAR; only the four displayed judgments are seeded examples.' : 'GenLayer validators independently judge this frozen pair. A transaction may take several minutes.'}</p><button class="button primary" type="submit" ${state.busy || offers.length < 2 ? 'disabled' : ''}>Request judgment</button></form></div>`;
}

function renderCycles() {
  const cycles = [...state.board.cycles].reverse();
  return `<div class="section-head"><div><span class="eyebrow">Deterministic clearing</span><h2>Three-way cycles</h2><span class="muted">Only three FIT edges among distinct members can reserve a cycle.</span></div>${button('Clear next cycle', 'clear', state.busy ? 'disabled' : '', 'primary')}</div>
    ${cycles.length ? cycles.map((cycle) => {
      const myOffer = state.board.offers.find((o) => cycle.offers.includes(o.id) && o.owner.toLowerCase() === state.wallet.toLowerCase());
      const myIndex = myOffer ? cycle.offers.indexOf(myOffer.id) : -1;
      const incoming = myIndex < 0 ? null : state.board.offers.find((o) => o.id === cycle.offers[(myIndex + 2) % 3]);
      const now = Date.now() / 1000;
      const canAccept = cycle.status === 'PROPOSED' && now < Number(cycle.accept_by);
      const canDeliver = cycle.status === 'ACTIVE' && now < Number(cycle.deliver_by);
      const proposedActions = canAccept && (state.mode === 'sample' || myOffer) ? `${state.mode === 'sample' || !cycle.accepted_offers?.includes(myOffer.id) ? button('Accept my place', 'accept', `data-id="${cycle.id}"`, 'small primary') : ''}${state.mode === 'live' ? button('Decline', 'decline', `data-id="${cycle.id}"`, 'small ghost') : ''}` : '';
      const activeActions = canDeliver && state.mode === 'live' && myOffer ? `${!myOffer.delivery_url ? button('Submit delivery', 'deliver', `data-id="${cycle.id}"`, 'small') : ''}${incoming?.delivery_url && !incoming.confirmed ? button('Confirm received work', 'confirm', `data-id="${cycle.id}" data-giver="${incoming.id}"`, 'small') : ''}` : '';
      const deadlinePassed = (cycle.status === 'PROPOSED' && !canAccept) || (cycle.status === 'ACTIVE' && !canDeliver);
      return `<article class="cycle-card" style="margin-bottom:16px"><div class="card-top"><span class="eyebrow">Cycle ${cycle.id}</span><span class="tag ${tagClass(cycle.status)}">${esc(cycle.status)}</span></div><div class="cycle-nodes">${cycle.offers.map((id) => { const offer = state.board.offers.find((o) => o.id === id); return `<div class="cycle-node"><strong>${esc(offer?.title || `Offer ${id}`)}</strong><span>Offer #${id}${offer?.confirmed ? ' · confirmed' : offer?.delivery_url ? ' · submitted' : ''}</span>${offer?.delivery_url?.startsWith('https://') ? `<a class="delivery-link" href="${esc(offer.delivery_url)}" target="_blank" rel="noopener noreferrer">Inspect delivery ↗</a>` : ''}</div><span class="cycle-arrow">→</span>`; }).join('')}</div><p class="muted">${cycle.accepted_count}/3 accepted · ${cycle.confirmed_count}/3 deliveries confirmed · Accept by ${date(cycle.accept_by)}${cycle.deliver_by ? ` · Deliver by ${date(cycle.deliver_by)}` : ''}</p>${incoming?.delivery_url && !incoming.confirmed && canDeliver ? `<p class="muted">Inspect offer #${incoming.id}'s delivery before confirming receipt.</p>` : ''}<div class="hero-buttons">${proposedActions}${activeActions}${deadlinePassed ? button('Close after deadline', 'expire', `data-id="${cycle.id}"`, 'small ghost') : ''}</div></article>`;
    }).join('') : `<div class="empty">${state.mode === 'sample' ? 'The sample already includes three FIT edges. Clear the next cycle to see the reservation.' : 'No cycle has cleared yet. Review three compatible directed pairs, then clear a cycle.'}</div>`}`;
}

function renderCreate() {
  const draft = state.offerDraft || {};
  return `<div class="section-head"><div><span class="eyebrow">Join the loop</span><h2>Post a concrete offer</h2><span class="muted">Name a checkable software deliverable on both sides of the exchange.</span></div></div>
    <div class="side-by-side"><form id="offer-form" class="card"><div class="fields"><label class="field full">Short title<input name="title" maxlength="80" placeholder="API reference documentation" value="${esc(draft.title || '')}" required /></label><label class="field">I can give<textarea name="gives" maxlength="300" placeholder="Write API reference docs for a Python REST API" required>${esc(draft.gives || '')}</textarea><small>What will the next member receive?</small></label><label class="field">I want<textarea name="wants" maxlength="300" placeholder="Audit keyboard navigation in a React dashboard" required>${esc(draft.wants || '')}</textarea><small>What must another member offer?</small></label><label class="field full">Offer expires<input name="expires" type="date" required /></label></div><div class="form-actions"><button type="submit" class="button primary" ${state.busy ? 'disabled' : ''}>Create offer</button><span class="muted" style="font-size:12px">${state.mode === 'live' ? 'Wallet signature required' : 'Sample board only'}</span></div></form>
    <div class="card"><h3>How the loop works</h3><p>01 — Each person posts one offer and one request. Validators reject vague descriptions.</p><p>02 — Anyone requests a judgment on one proposed giver → receiver edge.</p><p>03 — The contract picks the lowest-ID compatible triple, then reserves all three offers together.</p><p>04 — All three accept. Each giver posts a delivery URL, and only its receiver can confirm.</p></div></div>`;
}

function renderSettings() {
  return `<div class="card" style="margin-top:28px"><div class="section-head"><div><span class="eyebrow">Network</span><h3 style="margin:8px 0">Studionet contract</h3><span class="muted">Load a deployed SkillLoop address to switch from the sample board to live contract state.</span></div></div><form id="address-form" class="form-actions" style="flex-wrap:wrap"><input id="address-input" aria-label="Contract address" value="${esc(state.address)}" placeholder="0x… contract address" style="min-width:280px;flex:1;background:#0e2226;color:#e8f2ed;border:1px solid #416063;border-radius:9px;padding:12px" /><button class="button" type="submit">Load contract</button>${button('Use sample board', 'sample', 'type="button"', 'ghost')}</form>${state.mode === 'live' && state.address ? `<p class="muted" style="font-size:12px;margin-top:14px">Contract: <a href="${explorer(state.address, 'address')}" target="_blank" rel="noopener noreferrer">${esc(state.address)}</a></p>` : ''}</div>`;
}

function renderProof() {
  if (state.address.toLowerCase() !== proof.contract.toLowerCase()) return '';
  const links = [
    ['Three FIT judgments', 'fit_1_to_3'],
    ['NO_FIT judgment', 'no_fit_1_to_2'],
    ['Cycle reservation', 'clear_cycle_1'],
    ['Third acceptance', 'accept_offer_2'],
    ['Browser-wallet QA offer', 'wallet_qa_offer_4'],
    ['QA offer cancellation', 'wallet_qa_cancel_4'],
  ];
  return `<div class="card proof-card"><span class="eyebrow">Recorded Studionet proof · ${esc(proof.deployed_at_utc)}</span><h3>Inspect finalized transactions</h3><p>These links document the matching demo and a disposable browser-wallet QA offer that was cancelled. The board above is read live from the contract and can change later.</p><div class="proof-links">${links.map(([label, key]) => `<a href="${explorer(proof.transactions[key])}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join('')}</div></div>`;
}

function render() {
  const board = state.board;
  $('#app').innerHTML = `<header class="topbar"><div class="shell topbar-inner"><a class="brand" href="#top"><span class="brand-mark"></span>SkillLoop</a><div class="top-actions"><span class="mode ${state.mode === 'live' ? 'live' : ''}"><i class="mode-dot"></i>${state.mode === 'live' ? 'Studionet' : 'Sample board'}</span>${button(state.wallet ? short(state.wallet) : 'Connect wallet', 'connect', '', 'small')}</div></div></header>
    <main id="top"><section class="hero"><div class="shell hero-grid"><div><span class="eyebrow">GenLayer Native · Contributor exchange</span><h1>Give your skill.<br><em>Get one back.</em></h1><p class="hero-copy">A three-way exchange for independent builders. GenLayer validators judge whether each offer meets another member's request; contract code finds and reserves a complete cycle.</p><div class="hero-buttons">${button('Explore offers', 'tab', 'data-tab="board"', 'primary')}${button('See the cycle', 'tab', 'data-tab="cycles"', 'ghost')}</div><p class="hero-note">No GEN escrow in this version. Delivery confirmation is a member action.</p></div><div class="orbit" aria-hidden="true"><div class="orbit-line"></div><div class="orb one"><strong>API testing</strong><span>gives tests · wants docs</span></div><div class="orb two"><strong>Documentation</strong><span>gives docs · wants audit</span></div><div class="orb three"><strong>Accessibility</strong><span>gives audit · wants tests</span></div></div></div></section>
    <section class="section"><div class="shell"><div class="notice">${state.mode === 'sample' ? '<b>Sample board:</b> These offers and judgments are examples stored in this browser. They are not validator results or onchain proof.' : '<b>Live Studionet:</b> Board state is read from the configured contract. Verify each transaction in the Explorer after finalization.'}</div>${state.liveError ? `<div class="notice" style="margin-top:12px"><b>Live read unavailable:</b> ${esc(state.liveError)}. The recorded Explorer proof below remains available; the board shown here is only a sample.</div>` : ''}<div class="stats"><div class="stat"><strong>${board.offer_count}</strong><span>Offers posted</span></div><div class="stat"><strong>${board.edges.filter((e) => e.verdict === 'FIT').length}</strong><span>FIT edges</span></div><div class="stat"><strong>${board.cycle_count}</strong><span>Cycles formed</span></div><div class="stat"><strong>${board.cycles.filter((c) => c.status === 'COMPLETED').length}</strong><span>Completed cycles shown</span></div></div>
    ${state.txId ? `<div class="notice" style="margin-top:16px"><b>Latest transaction:</b> <a class="tx" href="${explorer(state.txId)}" target="_blank" rel="noopener noreferrer">${esc(state.txId)}</a> · ${esc(state.txStatus || 'Tracking may be resumed after refresh')} ${sessionStorage.getItem('skillloop_tx') ? button('Resume tracking', 'resume', '', 'small') : ''}</div>` : ''}
    <nav class="tabs" aria-label="App sections">${[['board','Offer board'],['review','Match review'],['cycles','Cycles'],['create','Create offer']].map(([id,label]) => `<button class="tab ${state.tab === id ? 'active' : ''}" data-action="tab" data-tab="${id}">${label}</button>`).join('')}</nav>
    <section id="panel">${state.tab === 'board' ? renderBoard() : state.tab === 'review' ? renderReview() : state.tab === 'cycles' ? renderCycles() : renderCreate()}</section>${renderProof()}${renderSettings()}</div></section></main>
    <footer class="footer"><div class="shell footer-inner"><span>SkillLoop · Semantic matching, deterministic clearing</span><span>Studionet · Experimental software service commitments</span></div></footer>`;
  const expiry = $('#offer-form input[name="expires"]');
  if (expiry) { expiry.min = new Date(Date.now() + 2*86400000).toISOString().slice(0,10); expiry.max = new Date(Date.now() + 59*86400000).toISOString().slice(0,10); expiry.value = state.offerDraft?.expires || new Date(Date.now() + 14*86400000).toISOString().slice(0,10); }
}

async function handleClick(buttonEl) {
  const action = buttonEl.dataset.action;
  if (action === 'tab') { state.tab = buttonEl.dataset.tab; render(); $('#panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (action === 'sample') { state.mode = 'sample'; state.address = ''; state.board = sampleBoard(); state.liveError = ''; localStorage.removeItem('skillloop_address'); render(); return; }
  if (action === 'connect') return connectWallet();
  if (action === 'resume') { if (state.txId) return track(state.txId); return; }
  if (action === 'clear') return write('clear_next_cycle');
  if (action === 'cancel') return write('cancel_offer', [Number(buttonEl.dataset.id)]);
  if (action === 'accept') return write('accept_cycle', [Number(buttonEl.dataset.id)]);
  if (action === 'decline') return write('decline_cycle', [Number(buttonEl.dataset.id)]);
  if (action === 'expire') return write('expire_cycle', [Number(buttonEl.dataset.id)]);
  if (action === 'deliver') { const url = prompt('Public HTTPS URL for the finished work'); if (!url) return; const clean = url.trim(); if (!/^https:\/\/[^\s]+$/i.test(clean) || clean.length > 400 || /[@#]/.test(clean)) throw new Error('Enter an HTTPS delivery URL under 401 characters, without @ or #.'); return write('submit_delivery', [Number(buttonEl.dataset.id), clean]); }
  if (action === 'confirm') return write('confirm_delivery', [Number(buttonEl.dataset.id), Number(buttonEl.dataset.giver)]);
}

document.addEventListener('click', async (event) => {
  const buttonEl = event.target.closest('[data-action]'); if (!buttonEl) return;
  event.preventDefault();
  try { await handleClick(buttonEl); } catch (error) { toast(error?.message || String(error), true); }
});

document.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    if (event.target.id === 'address-form') { state.address = $('#address-input').value.trim(); await loadLive(); toast('Loaded live SkillLoop board.'); }
    if (event.target.id === 'review-form') { const data = new FormData(event.target); const giver = Number(data.get('giver')); const receiver = Number(data.get('receiver')); if (giver === receiver) throw new Error('Select two different offers.'); if (state.board.edges.some((edge) => edge.giver === giver && edge.receiver === receiver)) throw new Error('This pair has already been reviewed.'); await write('review_match', [giver, receiver]); }
    if (event.target.id === 'offer-form') { const data = new FormData(event.target); const draft = { title: data.get('title').trim(), gives: data.get('gives').trim(), wants: data.get('wants').trim(), expires: data.get('expires') }; state.offerDraft = draft; const expires = Math.floor(new Date(`${draft.expires}T12:00:00Z`).getTime()/1000); const secondsAway = expires - Date.now()/1000; if (secondsAway < 86400 || secondsAway > 60*86400) throw new Error('Expiry must be 1–60 days away.'); await write('create_offer', [draft.title, draft.gives, draft.wants, expires]); state.offerDraft = null; render(); }
  } catch (error) { toast(error?.message || String(error), true); }
});

window.ethereum?.on?.('accountsChanged', () => { state.wallet = ''; render(); toast('Wallet account changed. Connect again before writing.'); });

render();
if (state.mode === 'live') loadLive().catch((error) => { state.mode = 'sample'; state.board = sampleBoard(); state.liveError = error.message; render(); toast(`Could not load configured contract: ${error.message}`, true); });
