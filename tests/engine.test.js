import test from 'node:test';
import assert from 'node:assert/strict';

import {
    groupIntoSenderCards,
    scoreCard,
    applyCourtVerdict,
    applyDocketVerdict,
    flushActions,
    undoEntries,
    calculateNaiveCalls,
    formatAmountDisplay,
    generateExpenseCSV,
    totalsPerCurrency,
    CLEARED_LABEL
} from '../src/engine.js';

import { MockGmailClient } from '../src/client.js';

function makeMsg(overrides = {}) {
    return {
        id: overrides.id || `msg-${Math.random().toString(36).slice(2)}`,
        name: overrides.name || 'Tester',
        email: overrides.email || 'tester@example.com',
        subject: overrides.subject || 'Hello',
        date: overrides.date || '2026-01-01T00:00:00.000Z',
        labels: overrides.labels || ['INBOX'],
        starred: overrides.starred || false,
        important: overrides.important || false,
        listUnsubscribe: overrides.listUnsubscribe || false,
        ignored: overrides.ignored || false,
        isExpense: overrides.isExpense || false,
        amount: overrides.amount ?? null,
        currency: overrides.currency || null,
        category: overrides.category || null,
        ...overrides
    };
}

test('mock inbox has exactly 5000 messages', () => {
    const client = new MockGmailClient();
    assert.equal(client.getAllMessages().length, 5000);
});

test('protected mail never reaches batchModify', () => {
    const client = new MockGmailClient();
    const cards = groupIntoSenderCards(client.getAllMessages());

    const protectedCard = cards.find(c => {
        c.tier = scoreCard(c, client.sentContacts, client.contactDomains);
        return c.tier === 'protected';
    });

    assert.ok(protectedCard, 'expected at least one protected card');

    const actions = applyCourtVerdict([protectedCard], { [protectedCard.key]: 'Exile' });
    assert.equal(actions.length, 0);
});

test('any single protection signal protects a sender', () => {
    const sentContacts = new Set(['friend@example.com']);
    const contactDomains = new Set(['personal.example']);

    const starred = groupIntoSenderCards([makeMsg({ starred: true })])[0];
    const important = groupIntoSenderCards([makeMsg({ important: true })])[0];
    const sentContact = groupIntoSenderCards([makeMsg({ email: 'friend@example.com' })])[0];
    const domain = groupIntoSenderCards([makeMsg({ email: 'me@personal.example' })])[0];
    const safety = groupIntoSenderCards([makeMsg({ subject: 'Your security code is 123' })])[0];

    assert.equal(scoreCard(starred, sentContacts, contactDomains), 'protected');
    assert.equal(scoreCard(important, sentContacts, contactDomains), 'protected');
    assert.equal(scoreCard(sentContact, sentContacts, contactDomains), 'protected');
    assert.equal(scoreCard(domain, sentContacts, contactDomains), 'protected');
    assert.equal(scoreCard(safety, sentContacts, contactDomains), 'protected');
});

test('no source path can trash, delete, or forward messages', () => {
    const client = new MockGmailClient();
    const cards = groupIntoSenderCards(client.getAllMessages()).slice(0, 30);

    for (const card of cards) {
        card.tier = scoreCard(card, client.sentContacts, client.contactDomains);
    }

    const verdicts = {};
    for (const card of cards) verdicts[card.key] = 'Exile';

    const actions = applyCourtVerdict(cards, verdicts);

    for (const action of actions) {
        assert.ok(action.kind === 'batchModify' || action.kind === 'createFilter');

        if (action.kind === 'batchModify') {
            const banned = ['TRASH', 'SPAM', 'DELETE', 'FORWARD'];
            for (const label of [...(action.addLabels || []), ...(action.removeLabels || [])]) {
                assert.equal(banned.includes(label), false);
            }
        }
    }
});

test('batchModify never exceeds 1000 IDs per call', async () => {
    const sizes = [];
    const fakeClient = {
        getAllMessages: () => [],
        async batchModify(ids) {
            sizes.push(ids.length);
        }
    };

    const ids = Array.from({ length: 2500 }, (_, i) => `id-${i}`);
    await flushActions(fakeClient, [{
        kind: 'batchModify',
        ids,
        addLabels: ['X'],
        removeLabels: ['INBOX']
    }], []);

    assert.equal(sizes.length, 3);
    assert.ok(sizes.every(s => s <= 1000));
});

test('undo restores inbox labels and filters exactly', async () => {
    const client = new MockGmailClient();
    const cards = groupIntoSenderCards(client.getAllMessages());

    const junkCard = cards.find(c => {
        c.tier = scoreCard(c, client.sentContacts, client.contactDomains);
        return c.tier === 'junk';
    });

    assert.ok(junkCard, 'expected at least one junk card');

    const original = junkCard.messages.map(m => ({
        id: m.id,
        labels: [...m.labels]
    }));

    const actions = applyCourtVerdict([junkCard], { [junkCard.key]: 'Exile' });
    const undoLog = [];

    await flushActions(client, actions, undoLog);

    assert.ok(client.filters.size > 0);
    for (const msg of client.getAllMessages()) {
        if (original.some(o => o.id === msg.id)) {
            assert.equal(msg.labels.includes('INBOX'), false);
            assert.ok(msg.labels.includes(CLEARED_LABEL));
        }
    }

    await undoEntries(client, undoLog);

    assert.equal(client.filters.size, 0);
    const byId = new Map(client.getAllMessages().map(m => [m.id, m]));
    for (const o of original) {
        assert.deepEqual(byId.get(o.id).labels, o.labels);
    }
});

test('expense cards cannot receive Exile or create filters', () => {
    const expenseCard = {
        key: 'uber',
        vendor: 'Uber',
        category: 'travel',
        displayAmount: 2500,
        displayCurrency: 'USD',
        dateRange: '2026-01-01',
        count: 1,
        subjects: ['Receipt'],
        hasMissingAmount: false,
        hasNearDuplicate: false,
        messages: [makeMsg({
            id: 'exp-1',
            name: 'Uber',
            email: 'receipts@uber.example',
            subject: 'Your receipt from Uber',
            isExpense: true,
            amount: 2500,
            currency: 'USD',
            category: 'travel'
        })]
    };

    const exileActions = applyDocketVerdict([expenseCard], { uber: 'Exile' });
    assert.equal(exileActions.length, 0);

    const approveActions = applyDocketVerdict([expenseCard], { uber: 'Approve' });
    assert.ok(approveActions.every(a => a.kind === 'batchModify'));
    assert.equal(approveActions.some(a => a.kind === 'createFilter'), false);
});

test('totals are never summed across currencies', () => {
    const messages = [
        makeMsg({ amount: 1000, currency: 'USD' }),
        makeMsg({ amount: 2000, currency: 'EUR' }),
        makeMsg({ amount: 3000, currency: 'USD' })
    ];

    const totals = totalsPerCurrency(messages);
    assert.equal(totals.get('USD'), 4000);
    assert.equal(totals.get('EUR'), 2000);
});

test('CSV header is exact', () => {
    const csv = generateExpenseCSV([], {});
    assert.equal(csv.split('\n')[0], 'vendor,date,amount,currency,category,verdict,messageId');
});

test('naive API model is 2x affected', () => {
    assert.equal(calculateNaiveCalls(0), 0);
    assert.equal(calculateNaiveCalls(10), 20);
});

test('amount formatting does not crash on null', () => {
    assert.equal(formatAmountDisplay(null, 'USD'), '—');
    assert.equal(formatAmountDisplay(12345, 'USD'), '$123.45');
});