// tests/mock.test.js
// Tests for mock data generation and expense parsing.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateMockInbox, parseExpense, isNearDuplicate, FREEMAIL_DOMAINS } from '../src/mock.js';

describe('Mock Inbox Generation', () => {
  let inbox;

  before(() => {
    inbox = generateMockInbox(1337);
  });

  it('generates exactly 5000 messages', () => {
    assert.equal(inbox.messages.length, 5000);
  });

  it('has ~120 senders (>= 80)', () => {
    assert.ok(inbox.senderConfigs.length >= 80, `senders: ${inbox.senderConfigs.length}`);
  });

  it('top 15 senders account for ~75% of mail', () => {
    const vols = [...inbox.senderVolumes.values()].sort((a, b) => b - a);
    const top15 = vols.slice(0, 15).reduce((a, b) => a + b, 0);
    const ratio = top15 / 5000;
    assert.ok(ratio >= 0.6 && ratio <= 0.9, `top-15 ratio ${ratio.toFixed(2)}`);
  });

  it('has promotions, social, updates and personal categories', () => {
    const labelSet = new Set();
    for (const m of inbox.messages) {
      for (const l of m.labels) {
        if (l.startsWith('CATEGORY_')) labelSet.add(l);
      }
    }
    assert.ok(labelSet.has('CATEGORY_PROMOTIONS'));
    assert.ok(labelSet.has('CATEGORY_SOCIAL'));
    assert.ok(labelSet.has('CATEGORY_UPDATES'));
  });

  it('has List-Unsubscribe on bulk senders', () => {
    const bulk = inbox.messages.filter(m => m.isPromo);
    assert.ok(bulk.length > 0);
    const withUnsub = bulk.filter(m => m.hasListUnsubscribe).length;
    assert.ok(withUnsub / bulk.length >= 0.7, `unsub ratio ${withUnsub / bulk.length}`);
  });

  it('has ~60 starred messages', () => {
    const starred = inbox.messages.filter(m => m.isStarred).length;
    assert.ok(starred >= 55 && starred <= 70, `starred: ${starred}`);
  });

  it('has ~60 important messages', () => {
    const important = inbox.messages.filter(m => m.isImportant).length;
    assert.ok(important >= 55 && important <= 70, `important: ${important}`);
  });

  it('has ~30 known contacts (sent mail)', () => {
    assert.ok(inbox.stats.contacts >= 25 && inbox.stats.contacts <= 40,
      `contacts: ${inbox.stats.contacts}`);
  });

  it('has personal emails on freemail domains', () => {
    const personal = inbox.messages.filter(m =>
      FREEMAIL_DOMAINS.includes(m.senderDomain) && !m.isPromo && !m.isExpense);
    assert.ok(personal.length >= 60, `personal freemail: ${personal.length}`);
  });

  it('has ~150 expense emails (counted inside the 5000 total)', () => {
    assert.ok(inbox.stats.expense >= 130 && inbox.stats.expense <= 180,
      `expense: ${inbox.stats.expense}`);
  });

  it('has tricky case: promo with "receipt" in subject', () => {
    const m = inbox.messages.find(x => x.specialTag === 'receipt-promo');
    assert.ok(m);
    assert.ok(m.isPromo && /receipt/i.test(m.subject));
  });

  it('has tricky case: newsletter from a known contact domain', () => {
    const m = inbox.messages.find(x => x.specialTag === 'contact-newsletter');
    assert.ok(m);
    assert.ok(inbox.contactDomains.has(m.senderDomain));
    assert.equal(m.from, `newsletter@${m.senderDomain}`);
  });

  it('has tricky case: half-read sender around 50% unread', () => {
    const msgs = inbox.messages.filter(m => m.senderDomain === inbox.halfReadDomain);
    assert.ok(msgs.length > 10);
    const ratio = msgs.filter(m => m.isUnread).length / msgs.length;
    assert.ok(ratio >= 0.35 && ratio <= 0.65, `half-read ratio ${ratio.toFixed(2)}`);
  });

  it('expense emails come from ~20 vendors', () => {
    const vendors = new Set(inbox.messages.filter(m => m.isExpense).map(m => m.vendor));
    assert.ok(vendors.size >= 15 && vendors.size <= 25, `vendors: ${vendors.size}`);
  });

  it('expense emails have mixed currencies', () => {
    const currencies = new Set(inbox.messages.filter(m => m.isExpense).map(m => m.currency));
    assert.ok(currencies.has('USD'));
    assert.ok(currencies.size >= 3, `currencies: ${[...currencies].join(',')}`);
  });

  it('~15% of expense emails have NO amount', () => {
    const exp = inbox.messages.filter(m => m.isExpense);
    const ratio = exp.filter(m => m.amount === null).length / exp.length;
    assert.ok(ratio >= 0.10 && ratio <= 0.20, `no-amount ratio ${ratio.toFixed(3)}`);
  });

  it('~5% of non-subscription expenses are near-duplicates', () => {
    const exp = inbox.messages.filter(m => m.isExpense && !m.isSubscription);
    let dupCount = 0;
    const seen = new Set();
    for (let i = 0; i < exp.length; i++) {
      if (seen.has(exp[i].id)) continue;
      for (let j = i + 1; j < exp.length; j++) {
        if (isNearDuplicate(exp[i], exp[j])) {
          dupCount++;
          seen.add(exp[j].id);
          break;
        }
      }
    }
    const ratio = dupCount / exp.length;
    assert.ok(ratio >= 0.02 && ratio <= 0.10, `dup ratio ${ratio.toFixed(3)}`);
  });

  it('monthly subscriptions are NOT flagged as duplicates', () => {
    const subs = inbox.messages.filter(m => m.isExpense && m.isSubscription);
    for (let i = 0; i < subs.length; i++) {
      for (let j = i + 1; j < subs.length; j++) {
        assert.equal(isNearDuplicate(subs[i], subs[j]), false);
      }
    }
  });

  it('sentContacts and contactDomains populated', () => {
    assert.ok(inbox.sentContacts.size > 20);
    assert.ok(inbox.contactDomains.size >= 10);
  });

  it('deterministic for the same seed', () => {
    const a = generateMockInbox(1337);
    const b = generateMockInbox(1337);
    assert.deepEqual(a.messages[0], b.messages[0]);
    assert.equal(a.messages.length, b.messages.length);
  });
});

describe('parseExpense', () => {
  it('returns exact minor units for "$42.10" (4210)', () => {
    const r = parseExpense('Receipt from Uber', 'Your receipt: $42.10 for the ride');
    assert.equal(r.amount, 4210);
    assert.equal(r.currency, 'USD');
  });

  it('returns exact minor units for "USD 1,299.00" (129900)', () => {
    const r = parseExpense('Invoice #123', 'Amount: USD 1,299.00');
    assert.equal(r.amount, 129900);
    assert.equal(r.currency, 'USD');
  });

  it('returns exact minor units for "₹1,150" (115000)', () => {
    const r = parseExpense('Receipt', 'Amount: \u20B91,150');
    assert.equal(r.amount, 115000);
    assert.equal(r.currency, 'INR');
  });

  it('detects vendor and category', () => {
    const r = parseExpense('Your Uber receipt', 'Thanks for riding with Uber');
    assert.equal(r.vendor, 'Uber');
    assert.equal(r.category, 'travel');
  });

  it('flags missing amount (null, not 0)', () => {
    const r = parseExpense('Receipt from Stripe', 'Your receipt is attached');
    assert.equal(r.amount, null);
  });

  it('extracts date when present', () => {
    const r = parseExpense('Invoice Jan 15, 2024', 'Paid on Jan 15, 2024');
    assert.ok(r.date);
  });

  it('guesses categories travel/food/software/other', () => {
    assert.equal(parseExpense('Uber receipt', 'ride').category, 'travel');
    assert.equal(parseExpense('DoorDash order', 'food').category, 'food');
    assert.equal(parseExpense('GitHub invoice', 'dev').category, 'software');
    assert.equal(parseExpense('Mystery receipt', 'stuff').category, 'other');
  });
});

describe('isNearDuplicate', () => {
  const mk = (over) => ({
    id: 'a', vendor: 'Uber', currency: 'USD', amount: 4210,
    date: '2024-01-15T10:00:00Z', dateEpoch: Date.parse('2024-01-15T10:00:00Z'),
    isSubscription: false, ...over
  });

  it('flags same vendor+currency, amount within 1 minor unit, within 48h', () => {
    const a = mk({ id: '1' });
    const b = mk({ id: '2', amount: 4211, dateEpoch: a.dateEpoch + 6 * 3600000 });
    assert.equal(isNearDuplicate(a, b), true);
  });

  it('does not flag when amounts differ by more than 1 minor unit', () => {
    assert.equal(isNearDuplicate(mk({ id: '1' }), mk({ id: '2', amount: 4212 })), false);
  });

  it('does not flag when currency differs', () => {
    assert.equal(isNearDuplicate(mk({ id: '1' }), mk({ id: '2', currency: 'EUR' })), false);
  });

  it('does not flag when vendor differs', () => {
    assert.equal(isNearDuplicate(mk({ id: '1' }), mk({ id: '2', vendor: 'Lyft' })), false);
  });

  it('does not flag when more than 48 hours apart', () => {
    const a = mk({ id: '1' });
    const b = mk({ id: '2', dateEpoch: a.dateEpoch + 49 * 3600000 });
    assert.equal(isNearDuplicate(a, b), false);
  });

  it('does not flag monthly subscriptions', () => {
    const a = mk({ id: '1', vendor: 'Netflix', amount: 1599, isSubscription: true });
    const b = mk({ id: '2', vendor: 'Netflix', amount: 1599, isSubscription: true, dateEpoch: a.dateEpoch + 30 * 86400000 });
    assert.equal(isNearDuplicate(a, b), false);
  });

  it('does not flag when amount is null', () => {
    assert.equal(isNearDuplicate(mk({ id: '1', amount: null }), mk({ id: '2' })), false);
  });

  it('never flags a message against itself', () => {
    const a = mk({ id: '1' });
    assert.equal(isNearDuplicate(a, a), false);
  });
});