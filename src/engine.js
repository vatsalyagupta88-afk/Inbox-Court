// src/engine.js
// Pure logic for Inbox Court. No DOM, no I/O. Importable by Node for tests.

import { parseExpense, isNearDuplicate, FREEMAIL_DOMAINS } from './mock.js';

const FREEMAIL = new Set(FREEMAIL_DOMAINS);

/**
 * Group messages into sender cards.
 * Key: (domain, hasListUnsubscribe) — EXCEPT freemail domains, which are
 * keyed by full address so gmail.com does not collapse into one card.
 * Expense messages are excluded (Docket-only).
 */
export function groupIntoSenderCards(messages) {
  const cards = new Map();
  for (const msg of messages) {
    if (!msg.labels.includes('INBOX')) continue;
    if (msg.isExpense) continue;
    const key = FREEMAIL.has(msg.senderDomain)
      ? `${msg.from.toLowerCase()}|${msg.hasListUnsubscribe}`
      : `${msg.senderDomain}|${msg.hasListUnsubscribe}`;
    if (!cards.has(key)) {
      cards.set(key, {
        key,
        domain: msg.senderDomain,
        from: msg.from,
        hasListUnsubscribe: msg.hasListUnsubscribe,
        messages: []
      });
    }
    cards.get(key).messages.push(msg);
  }

  const result = [];
  for (const card of cards.values()) {
    const msgs = card.messages;
    const total = msgs.length;
    const unread = msgs.filter(m => m.isUnread).length;
    const dates = msgs.map(m => m.dateEpoch).sort((a, b) => a - b);
    const subjects = [...new Set(msgs.map(m => m.subject))].slice(0, 3);
    const localPart = card.from.split('@')[0].toLowerCase();
    const isGenericLocal = ['noreply', 'no-reply', 'newsletter', 'updates', 'billing', 'support', 'team', 'notifications', 'hello'].includes(localPart);
    result.push({
      key: card.key,
      domain: card.domain,
      from: card.from,
      hasListUnsubscribe: card.hasListUnsubscribe,
      name: isGenericLocal ? card.domain : localPart,
      count: total,
      ignoredRatio: total ? unread / total : 0,
      subjects,
      oldest: new Date(dates[0]).toISOString(),
      newest: new Date(dates[dates.length - 1]).toISOString(),
      messages: msgs,
      messageIds: msgs.map(m => m.id)
    });
  }
  result.sort((a, b) => b.count - a.count);
  return result;
}

// Protection subject words — whole-word where safe, structural patterns for "order".
const PROTECTION_RX = [
  /\breceipt\b/i,
  /\binvoice\b/i,
  /\botp\b/i,
  /\bbank\b/i,
  /\bstatement\b/i,
  /\bpassword\b/i,
  /\border\s*#/i,
  /\border\s+confirmed\b/i,
  /\byour\s+order\b/i
];

/**
 * Protection signals (any single one → protected):
 *   starred, important, address in sent contacts,
 *   personal-looking freemail sender, sender domain matches a sent
 *   contact's non-freemail domain, or a protection subject word
 *   (receipt/invoice/OTP/bank/statement/password; "order" only as
 *   "order #", "order confirmed", "your order").
 * A signal matches if ANY single message in the card matches.
 */
export function checkProtectionSignals(card, sentContacts, contactDomains) {
  if (card.messages.some(m => m.isStarred)) return true;
  if (card.messages.some(m => m.isImportant)) return true;
  if (card.messages.some(m => sentContacts.has(m.from.toLowerCase()))) return true;

  if (FREEMAIL.has(card.domain) && card.count < 20 && card.ignoredRatio < 0.5) return true;

  if (contactDomains.has(card.domain) && !FREEMAIL.has(card.domain)) return true;

  for (const m of card.messages) {
    const text = `${m.subject} ${m.snippet}`;
    if (PROTECTION_RX.some(rx => rx.test(text))) return true;
  }
  return false;
}

/**
 * Junk requires BOTH a junk signal AND ignoredRatio >= 0.9:
 *   signals = List-Unsubscribe header, promotions/social category, noreply sender,
 *   never opened (ignoredRatio >= 0.9 counts as the never-opened signal itself).
 */
export function checkJunkSignals(card) {
  const isNoReply = card.from.toLowerCase().startsWith('noreply@') ||
    card.from.toLowerCase().startsWith('no-reply@');
  const isPromoOrSocial = card.messages.some(m =>
    m.labels.includes('CATEGORY_PROMOTIONS') || m.labels.includes('CATEGORY_SOCIAL'));
  const hasListUnsub = card.hasListUnsubscribe;
  const hasSignal = hasListUnsub || isPromoOrSocial || isNoReply || card.ignoredRatio >= 0.9;
  return hasSignal && card.ignoredRatio >= 0.9;
}

/**
 * Tier with strict precedence: protected > junk > ambiguous.
 * A card with no protection and no junk signal is ambiguous (never undefined).
 */
export function scoreCard(card, sentContacts, contactDomains) {
  if (checkProtectionSignals(card, sentContacts, contactDomains)) return 'protected';
  if (checkJunkSignals(card)) return 'junk';
  return 'ambiguous';
}

const CLEARED_LABEL = 'InboxCourt/Cleared';

/**
 * Court verdicts → action queue items.
 * Exile = archive all + label InboxCourt/Cleared + create skip-inbox filter.
 * Archive = archive + label only. Parole = no action.
 * Expenses are never touched here.
 */
export function applyCourtVerdict(cards, verdicts) {
  const actions = [];
  for (const card of cards) {
    const verdict = verdicts[card.key];
    if (!verdict) continue;
    if (card.messages.some(m => m.isExpense)) continue; // guard: never touch expenses
    const ids = card.messageIds;
    if (verdict === 'Exile') {
      actions.push({ type: 'batchModify', ids, addLabelIds: [CLEARED_LABEL], removeLabelIds: ['INBOX'] });
      actions.push({
        type: 'createFilter',
        criteria: { from: card.hasListUnsubscribe ? `*@${card.domain}` : card.from },
        action: { addLabelIds: [CLEARED_LABEL], removeLabelIds: ['INBOX'] }
      });
    } else if (verdict === 'Archive') {
      actions.push({ type: 'batchModify', ids, addLabelIds: [CLEARED_LABEL], removeLabelIds: ['INBOX'] });
    }
    // Parole: no action
  }
  return actions;
}

/**
 * Docket verdicts → action queue items.
 * Approve = label InboxCourt/Expense/<Category> + archive.
 * Review = label only, stays in inbox.
 * No Exile verdict, no filter creation — ever.
 */
export function applyDocketVerdict(cards, verdicts) {
  const actions = [];
  for (const card of cards) {
    const verdict = verdicts[card.key];
    if (!verdict) continue;
    if (!['Approve', 'Review'].includes(verdict)) continue; // no Exile for expenses
    const label = `InboxCourt/Expense/${cap(card.category || 'other')}`;
    if (verdict === 'Approve') {
      actions.push({ type: 'batchModify', ids: card.messageIds, addLabelIds: [label], removeLabelIds: ['INBOX'] });
    } else {
      actions.push({ type: 'batchModify', ids: card.messageIds, addLabelIds: [label], removeLabelIds: [] });
    }
  }
  return actions;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Group expense messages into vendor cards for Docket.
 * Flags missing amounts and near-duplicates per the rule:
 * same vendor + currency, amount within 1 minor unit, within 48 hours,
 * different message id; monthly subscriptions are NOT duplicates.
 */
export function groupExpenseMessages(messages) {
  const cards = new Map();
  for (const msg of messages) {
    if (!msg.isExpense || !msg.labels.includes('INBOX')) continue;
    const vendor = msg.vendor || 'Unknown';
    const key = `expense|${vendor}`;
    if (!cards.has(key)) {
      cards.set(key, {
        key, vendor,
        category: msg.category || 'other',
        messages: [],
        messageIds: [],
        amounts: [],
        currencies: new Set(),
        dates: [],
        hasMissingAmount: false,
        hasNearDuplicate: false
      });
    }
    const card = cards.get(key);
    card.messages.push(msg);
    card.messageIds.push(msg.id);
    if (msg.amount !== null) card.amounts.push(msg.amount);
    card.currencies.add(msg.currency || 'USD');
    if (msg.date) card.dates.push(msg.date);
    if (msg.amount === null) card.hasMissingAmount = true;
  }

  for (const card of cards.values()) {
    outer:
    for (let i = 0; i < card.messages.length; i++) {
      for (let j = i + 1; j < card.messages.length; j++) {
        if (isNearDuplicate(card.messages[i], card.messages[j])) {
          card.hasNearDuplicate = true;
          break outer;
        }
      }
    }
  }

  const result = [];
  for (const card of cards.values()) {
    const sortedAmounts = [...card.amounts].sort((a, b) => a - b);
    const dates = [...card.dates].sort();
    result.push({
      key: card.key,
      vendor: card.vendor,
      category: card.category,
      count: card.messages.length,
      subjects: [...new Set(card.messages.map(m => m.subject))].slice(0, 3),
      dateRange: dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : '',
      displayAmount: sortedAmounts.length ? sortedAmounts[Math.floor(sortedAmounts.length / 2)] : null,
      displayCurrency: card.currencies.values().next().value || 'USD',
      hasMissingAmount: card.hasMissingAmount,
      hasNearDuplicate: card.hasNearDuplicate,
      messageIds: card.messageIds,
      messages: card.messages
    });
  }
  result.sort((a, b) => b.count - a.count);
  return result;
}

/**
 * Flush actions through the client in batches of at most 1000 IDs.
 * Every batchModify batch and every filter creation is recorded in the
 * undo log in order, together with the exact pre-batch label arrays so
 * undo can restore the inbox exactly (including label order).
 */
export async function flushActions(client, actions, undoLog) {
  const results = [];
  for (const action of actions) {
    if (action.type === 'batchModify') {
      for (let i = 0; i < action.ids.length; i += 1000) {
        const batch = action.ids.slice(i, i + 1000);
        const prevLabels = new Map();
        for (const id of batch) {
          const m = client.getMessage ? client.getMessage(id) : null;
          if (m) prevLabels.set(id, [...m.labels]);
        }
        await client.batchModify({
          ids: batch,
          addLabelIds: action.addLabelIds,
          removeLabelIds: action.removeLabelIds
        });
        undoLog.push({
          type: 'batchModify',
          ids: batch,
          addLabelIds: action.addLabelIds,
          removeLabelIds: action.removeLabelIds,
          prevLabels,
          timestamp: Date.now()
        });
      }
    } else if (action.type === 'createFilter') {
      const { id } = await client.createFilter(action.criteria, action.action);
      undoLog.push({ type: 'createFilter', filterId: id, timestamp: Date.now() });
      results.push({ filterId: id });
    }
  }
  return results;
}

/**
 * Undo a list of flushed entries in reverse order.
 * batchModify entries restore the exact pre-batch label arrays (which
 * re-adds INBOX and removes added labels in one step); filters are deleted.
 */
export async function undoEntries(client, entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type === 'batchModify') {
      if (e.prevLabels && client.restoreLabels) {
        client.restoreLabels(e.prevLabels);
      } else {
        await client.batchModify({
          ids: e.ids,
          addLabelIds: e.removeLabelIds,
          removeLabelIds: e.addLabelIds
        });
      }
    } else if (e.type === 'createFilter') {
      await client.deleteFilter(e.filterId);
    }
  }
  return entries.length;
}

/**
 * Undo: revert flushed entries in reverse order.
 * all=true reverts every flushed entry; otherwise only the most recent.
 * Returns how many entries were reverted.
 */
export async function undoLast(client, undoLog, all = false) {
  const entries = all ? undoLog.splice(0) : undoLog.splice(undoLog.length - 1);
  return undoEntries(client, entries);
}

export function calculateNaiveCalls(affectedMessages) {
  return 2 * affectedMessages;
}

const SYMBOLS = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', INR: '\u20B9', CAD: 'C$', AUD: 'A$' };

export function formatAmountDisplay(minorUnits, currency) {
  if (minorUnits === null || minorUnits === undefined) return '—';
  const major = minorUnits / 100;
  const formatted = major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (SYMBOLS[currency] || currency + ' ') + formatted;
}

/**
 * CSV export for Docket.
 * Header exactly: vendor,date,amount,currency,category,verdict,messageId
 * One row per reviewed expense message (approved and review alike),
 * amounts as integer minor units.
 * Escapes commas/quotes/newlines and neutralizes formula injection
 * (=, +, -, @ prefixes get a leading apostrophe).
 */
export function generateExpenseCSV(expenseCards, verdicts) {
  const rows = ['vendor,date,amount,currency,category,verdict,messageId'];
  for (const card of expenseCards) {
    const verdict = verdicts[card.key] || 'Review';
    for (const msg of card.messages) {
      const fields = [
        msg.vendor || '',
        msg.date ? msg.date.split('T')[0] : '',
        msg.amount !== null && msg.amount !== undefined ? String(msg.amount) : '',
        msg.currency || '',
        msg.category || '',
        verdict,
        msg.id
      ].map(escapeCsvField);
      rows.push(fields.join(','));
    }
  }
  return rows.join('\n');
}

function escapeCsvField(field) {
  let s = String(field ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Sum approved expense amounts per currency. Never sums across currencies.
 */
export function totalsPerCurrency(messages) {
  const totals = new Map();
  for (const m of messages) {
    if (m.amount === null || m.amount === undefined) continue;
    const c = m.currency || 'USD';
    totals.set(c, (totals.get(c) || 0) + m.amount);
  }
  return totals;
}

/**
 * Per-currency totals of APPROVED expense cards only (Review cards excluded).
 * Kept here rather than inline in the UI so it is directly testable.
 */
export function approvedTotals(expenseCards, verdicts) {
  const messages = [];
  for (const card of expenseCards) {
    if (verdicts[card.key] === 'Approve') messages.push(...card.messages);
  }
  return totalsPerCurrency(messages);
}