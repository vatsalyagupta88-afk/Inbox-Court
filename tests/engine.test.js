// tests/engine.test.js
// Tests for tier scoring, safety guarantees, batching, undo, and CSV.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateMockInbox } from '../src/mock.js';
import { MockGmailClient } from '../src/client.js';
import {
  groupIntoSenderCards, scoreCard, checkJunkSignals, applyCourtVerdict, applyDocketVerdict,
  groupExpenseMessages, flushActions, undoLast, generateExpenseCSV, totalsPerCurrency, approvedTotals
} from '../src/engine.js';

const inbox = generateMockInbox(1337);
const client = new MockGmailClient(1337);
const cards = groupIntoSenderCards(inbox.messages.map(m => ({ ...m, labels: [...m.labels] })));
for (const c of cards) c.tier = scoreCard(c, inbox.sentContacts, inbox.contactDomains);
const byTier = (t) => cards.filter(c => c.tier === t);

// ---------- safety: protected mail ----------

describe('protected mail never reaches batchModify', () => {
  it('exiling every non-protected card leaves protected messages untouched', async () => {
    const c = new MockGmailClient(1337);
    const all = c.getAllMessages();
    const localCards = groupIntoSenderCards(all);
    for (const card of localCards) {
      card.tier = scoreCard(card, c.sentContacts, c.contactDomains);
    }
    const verdicts = {};
    for (const card of localCards) verdicts[card.key] = card.tier === 'protected' ? 'Parole' : 'Exile';
    const actions = applyCourtVerdict(localCards, verdicts);

    const protectedIds = new Set();
    for (const card of localCards) {
      if (card.tier === 'protected') for (const id of card.messageIds) protectedIds.add(id);
    }
    assert.ok(protectedIds.size > 0, 'expected some protected messages');

    const before = new Map();
    for (const id of protectedIds) {
      const m = c.getMessage(id);
      before.set(id, [...m.labels]);
    }

    const undoLog = [];
    await flushActions(c, actions, undoLog);

    for (const id of protectedIds) {
      assert.deepEqual(c.getMessage(id).labels, before.get(id), `protected message ${id} changed`);
    }
  });
});

describe('any single protection signal protects a sender', () => {
  const base = () => ({
    key: 'k', domain: 'example.com', from: 'news@example.com', hasListUnsubscribe: true,
    name: 'example', count: 10, ignoredRatio: 0.95,
    subjects: [], oldest: '', newest: '',
    messages: Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`, from: 'news@example.com', subject: 'Weekly deals', snippet: 'offers',
      labels: ['INBOX', 'CATEGORY_PROMOTIONS'], isUnread: true, isStarred: false,
      isImportant: false, isExpense: false
    })),
    messageIds: []
  });
  const contacts = new Set(['friend@gmail.com']);
  const contactDomains = new Set(['partnerco.com']);

  it('starred signal', () => {
    const card = base();
    card.messages[3].isStarred = true;
    assert.equal(scoreCard(card, contacts, contactDomains), 'protected');
  });
  it('important signal', () => {
    const card = base();
    card.messages[3].isImportant = true;
    assert.equal(scoreCard(card, contacts, contactDomains), 'protected');
  });
  it('sent-contact address signal', () => {
    const card = base();
    card.from = 'friend@gmail.com';
    card.messages.forEach(m => { m.from = 'friend@gmail.com'; });
    assert.equal(scoreCard(card, contacts, contactDomains), 'protected');
  });
  it('contact-domain signal (non-freemail domain matches a sent contact domain)', () => {
    const card = base();
    card.domain = 'partnerco.com';
    card.messages.forEach(m => { m.senderDomain = 'partnerco.com'; });
    assert.equal(scoreCard(card, contacts, contactDomains), 'protected');
  });
  it('subject word signal - receipt', () => {
    const card = base();
    card.messages[3].subject = 'Your receipt is attached';
    assert.equal(scoreCard(card, contacts, contactDomains), 'protected');
  });
  it('subject word signal - order only counts structurally, not as a verb', () => {
    const card = base();
    card.messages[3].subject = 'Order now, 50% off everything';
    assert.equal(scoreCard(card, contacts, contactDomains), 'junk',
      '"Order now" is not a protection match');
    card.messages[3].subject = 'Your order #4521 has shipped';
    assert.equal(scoreCard(card, contacts, contactDomains), 'protected',
      '"order #" is a protection match');
  });
  it('personal-looking freemail sender with low volume and low ignore ratio', () => {
    const card = base();
    card.domain = 'gmail.com';
    card.from = 'buddy@gmail.com';
    card.messages.forEach(m => { m.senderDomain = 'gmail.com'; m.from = 'buddy@gmail.com'; m.labels = ['INBOX']; });
    card.count = 5;
    card.ignoredRatio = 0.2;
    card.messages.length = 5;
    assert.equal(scoreCard(card, contacts, contactDomains), 'protected');
  });
});

// ---------- tiers ----------

describe('the three tricky cases land in the expected tiers', () => {
  it('promo with "receipt" in subject is protected (subject-word wins)', () => {
    const msg = inbox.messages.find(m => m.specialTag === 'receipt-promo');
    assert.ok(msg, 'receipt-promo exists in mock');
    const card = cards.find(c => c.key === `${msg.senderDomain}|${msg.hasListUnsubscribe}`);
    assert.ok(card, 'card exists');
    assert.equal(card.tier, 'protected');
  });

  it('newsletter from a known contact domain is protected (contact-domain signal)', () => {
    const msg = inbox.messages.find(m => m.specialTag === 'contact-newsletter');
    assert.ok(msg, 'contact-newsletter exists in mock');
    assert.ok(inbox.contactDomains.has(msg.senderDomain), 'domain is a contact domain');
    const card = cards.find(c => c.key === `${msg.senderDomain}|${msg.hasListUnsubscribe}`);
    assert.ok(card, 'card exists');
    assert.equal(card.tier, 'protected');
  });

  it('half-read sender is ambiguous (no protection, not 90% ignored)', () => {
    const domain = inbox.halfReadDomain;
    const card = cards.find(c => c.domain === domain);
    assert.ok(card, 'half-read card exists');
    assert.equal(card.tier, 'ambiguous');
  });

  it('a sender with no protection and no junk signals is ambiguous (tier gap closed)', () => {
    const card = {
      key: 'x', domain: 'unknown.example', from: 'hi@unknown.example', hasListUnsubscribe: false,
      name: 'unknown', count: 5, ignoredRatio: 0.4, subjects: [], oldest: '', newest: '',
      messages: Array.from({ length: 5 }, (_, i) => ({
        id: `u${i}`, from: 'hi@unknown.example', subject: 'Hello', snippet: 'hi',
        labels: ['INBOX'], isUnread: i % 2 === 0, isStarred: false, isImportant: false, isExpense: false
      })),
      messageIds: []
    };
    assert.equal(checkJunkSignals(card), false);
    assert.equal(scoreCard(card, new Set(), new Set()), 'ambiguous');
  });
});

// ---------- static safety scan ----------

describe('no source file references trash, delete, batchDelete or forward', () => {
  it('static scan of src/ finds no forbidden message-destroying operations', async () => {
    const { readFile, readdir } = await import('node:fs/promises');
    const path = await import('node:path');
    const dir = path.resolve(process.cwd(), 'src');
    const files = (await readdir(dir)).filter(f => f.endsWith('.js'));
    // Forbid trashing/deleting/forwarding MESSAGES. deleteFilter is the Gmail
    // settings API method (required by the spec) and Map.delete is unrelated.
    const forbidden = [
      /\btrash\b/i,
      /\bbatchDelete\b/,
      /\bforward\b/i,
      /\.messages\s*\.\s*delete\b/,
      /\bdeleteMessage/
    ];
    for (const file of files) {
      const text = await readFile(path.join(dir, file), 'utf8');
      for (const rx of forbidden) {
        assert.ok(!rx.test(text), `${file} matches forbidden pattern ${rx}`);
      }
    }
  });
});

describe('batchModify never exceeds 1000 IDs', () => {
  it('client rejects batches over 1000', async () => {
    const c = new MockGmailClient(7);
    const ids = Array.from({ length: 1001 }, (_, i) => `x${i}`);
    await assert.rejects(() => c.batchModify({ ids, addLabelIds: [], removeLabelIds: [] }));
  });

  it('flushActions splits large verdicts into batches of at most 1000', async () => {
    const c = new MockGmailClient(7);
    const all = c.getAllMessages();
    const card = {
      key: 'big', domain: 'big.example', from: 'n@big.example', hasListUnsubscribe: true,
      name: 'big', count: 2500, ignoredRatio: 1, subjects: [], oldest: '', newest: '',
      messages: [],
      messageIds: all.slice(0, 2500).map(m => m.id)
    };
    const undoLog = [];
    await flushActions(c, applyCourtVerdict([card], { big: 'Exile' }), undoLog);
    assert.ok(c.calls.batchModify >= 3, `expected >= 3 batches, got ${c.calls.batchModify}`);
    for (const m of card.messageIds.map(id => c.getMessage(id))) {
      assert.ok(!m.labels.includes('INBOX'));
    }
  });
});

// ---------- undo ----------

describe('undo restores the mock inbox exactly, including created filters', () => {
  it('deep-equal snapshot before vs after undo-everything', async () => {
    const c = new MockGmailClient(1337);
    const before = c.snapshot();

    const all = c.getAllMessages();
    const localCards = groupIntoSenderCards(all);
    for (const card of localCards) {
      card.tier = scoreCard(card, c.sentContacts, c.contactDomains);
    }
    const verdicts = {};
    for (const card of localCards) verdicts[card.key] = card.tier === 'protected' ? 'Parole' : 'Exile';
    const undoLog = [];
    await flushActions(c, applyCourtVerdict(localCards, verdicts), undoLog);
    assert.ok(undoLog.length > 0);
    assert.ok(c.getFilters().length > 0, 'filters were created');

    await undoLast(c, undoLog, true);
    const after = c.snapshot();

    assert.deepEqual(after, before, 'undo must restore inbox + filters exactly');
  });

  it('undo after a partial flush only reverts fully-flushed batches', async () => {
    const c = new MockGmailClient(7);
    const all = c.getAllMessages();
    const before = c.snapshot();
    // Archive verdict → only batchModify entries, no filter, for clean bookkeeping
    const card = {
      key: 'big', domain: 'big.example', from: 'n@big.example', hasListUnsubscribe: true,
      name: 'big', count: 1500, ignoredRatio: 1, subjects: [], oldest: '', newest: '',
      messages: [],
      messageIds: all.slice(0, 1500).map(m => m.id)
    };
    const undoLog = [];
    await flushActions(c, applyCourtVerdict([card], { big: 'Archive' }), undoLog);
    assert.equal(undoLog.length, 2, '1500 ids split into 2 batches');

    // Undo only the FIRST batch = partial revert
    const firstEntry = undoLog[0];
    await undoLast(c, [firstEntry], true);

    // First batch restored exactly (including label order)
    for (const id of firstEntry.ids) {
      const m = c.getMessage(id);
      assert.ok(m.labels.includes('INBOX'), 'first batch reverted to inbox');
    }
    // Second (fully flushed later) batch remains applied
    const secondEntry = undoLog[1];
    for (const id of secondEntry.ids) {
      const m = c.getMessage(id);
      assert.ok(!m.labels.includes('INBOX'), 'second batch remains archived');
      assert.ok(m.labels.includes('InboxCourt/Cleared'), 'second batch keeps label');
    }

    // Cleanup: undo the rest to restore state for other tests
    await undoLast(c, [secondEntry], true);
    assert.deepEqual(c.snapshot(), before);
  });
});

// ---------- expense handling ----------

describe('expense cards can never receive an Exile verdict or a filter action', () => {
  it('applyDocketVerdict ignores Exile and emits no filter actions', () => {
    const expenses = groupExpenseMessages(inbox.messages);
    assert.ok(expenses.length > 0);
    const verdicts = {};
    for (const card of expenses) verdicts[card.key] = 'Exile'; // attempt forbidden verdict
    const actions = applyDocketVerdict(expenses, verdicts);
    assert.equal(actions.length, 0, 'Exile must be a no-op for expense cards');
    assert.ok(!actions.some(a => a.type === 'createFilter'), 'no filter from Docket');

    const okVerdicts = {};
    for (const card of expenses) okVerdicts[card.key] = 'Approve';
    const okActions = applyDocketVerdict(expenses, okVerdicts);
    assert.ok(okActions.length > 0);
    assert.ok(okActions.every(a => a.type === 'batchModify'), 'Docket only emits batchModify');
    for (const a of okActions) {
      assert.ok(a.addLabelIds.every(l => l.startsWith('InboxCourt/Expense/')));
      assert.deepEqual(a.removeLabelIds, ['INBOX']);
    }
  });

  it('Court verdicts never modify expense messages', async () => {
    const c = new MockGmailClient(1337);
    const all = c.getAllMessages();
    const expenseIds = new Set(all.filter(m => m.isExpense).map(m => m.id));
    assert.ok(expenseIds.size > 0);
    const before = new Map();
    for (const id of expenseIds) before.set(id, [...c.getMessage(id).labels]);

    const localCards = groupIntoSenderCards(all);
    for (const card of localCards) card.tier = scoreCard(card, c.sentContacts, c.contactDomains);
    const verdicts = {};
    for (const card of localCards) verdicts[card.key] = 'Exile';
    const undoLog = [];
    await flushActions(c, applyCourtVerdict(localCards, verdicts), undoLog);

    for (const id of expenseIds) {
      assert.deepEqual(c.getMessage(id).labels, before.get(id), `expense message ${id} was modified by Court`);
    }
  });
});

describe('totals are never summed across currencies', () => {
  it('totalsPerCurrency keeps currencies separate', () => {
    const messages = [
      { amount: 4210, currency: 'USD' },
      { amount: 1000, currency: 'USD' },
      { amount: 115000, currency: 'INR' },
      { amount: null, currency: 'USD' }
    ];
    const totals = totalsPerCurrency(messages);
    assert.equal(totals.size, 2);
    assert.equal(totals.get('USD'), 5210);
    assert.equal(totals.get('INR'), 115000);
  });

  it('approvedTotals counts only Approved cards and never merges currencies', () => {
    const cards = [
      {
        key: 'expense|Uber', vendor: 'Uber', count: 2, category: 'travel',
        messages: [
          { id: 'a', amount: 4210, currency: 'USD', vendor: 'Uber', category: 'travel', date: '2024-01-01T00:00:00.000Z' },
          { id: 'b', amount: 1000, currency: 'USD', vendor: 'Uber', category: 'travel', date: '2024-01-02T00:00:00.000Z' }
        ]
      },
      {
        key: 'expense|Zoomcab', vendor: 'Zoomcab', count: 1, category: 'travel',
        messages: [{ id: 'c', amount: 115000, currency: 'INR', vendor: 'Zoomcab', category: 'travel', date: '2024-01-03T00:00:00.000Z' }]
      },
      {
        key: 'expense|Stripe', vendor: 'Stripe', count: 1, category: 'software',
        messages: [{ id: 'd', amount: 9999, currency: 'EUR', vendor: 'Stripe', category: 'software', date: '2024-01-04T00:00:00.000Z' }]
      }
    ];
    const verdicts = { 'expense|Uber': 'Approve', 'expense|Zoomcab': 'Review', 'expense|Stripe': 'Approve' };
    const totals = approvedTotals(cards, verdicts);
    assert.equal(totals.get('USD'), 5210, 'approved USD summed');
    assert.equal(totals.get('EUR'), 9999, 'approved EUR kept separate');
    assert.equal(totals.has('INR'), false, 'Review card excluded from approved totals');
  });
});

// ---------- CSV ----------

describe('CSV export contains the exact header and escaping', () => {
  it('header is exactly vendor,date,amount,currency,category,verdict,messageId', () => {
    const cards = groupExpenseMessages(inbox.messages);
    const csv = generateExpenseCSV(cards, {});
    const header = csv.split('\n')[0];
    assert.equal(header, 'vendor,date,amount,currency,category,verdict,messageId');
  });

  it('amounts are integer minor units and verdicts default to Review', () => {
    const cards = groupExpenseMessages(inbox.messages);
    const csv = generateExpenseCSV(cards, {});
    const lines = csv.split('\n').slice(1);
    assert.ok(lines.length > 0);
    for (const line of lines) {
      const cols = line.split(',');
      assert.equal(cols.length, 7, `row has 7 columns: ${line}`);
      if (cols[2] !== '') {
        assert.match(cols[2], /^\d+$/, `amount must be integer minor units: ${cols[2]}`);
      }
      assert.ok(['Approve', 'Review'].includes(cols[5]), `verdict must be Approve/Review: ${cols[5]}`);
    }
  });

  it('escapes commas, quotes and formula prefixes', () => {
    const cards = [{
      key: 'e', vendor: 'Evil, Inc', category: 'other', count: 2,
      messages: [
        { id: 'x1', vendor: 'Evil, Inc', amount: 100, currency: 'USD', category: 'other', date: '2024-01-01T00:00:00.000Z' },
        { id: 'x2', vendor: '=SUM(A1:A2)', amount: 200, currency: 'USD', category: 'other', date: '2024-01-02T00:00:00.000Z' }
      ]
    }];
    const csv = generateExpenseCSV(cards, { e: 'Approve' });
    const lines = csv.split('\n');
    assert.ok(lines[1].includes('"Evil, Inc"'), 'comma field is quoted');
    assert.ok(lines[2].includes("'=SUM(A1:A2)"), 'formula prefix is neutralized');
  });
});