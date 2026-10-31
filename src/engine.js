// src/engine.js
// Pure game/chore engine. No DOM. No network. No dependencies.

export const CLEARED_LABEL = 'InboxCourt/Cleared';
export const REVIEW_LABEL = 'InboxCourt/Review';

const SAFETY_WORDS = [
  'security code',
  'verification code',
  'two-factor',
  '2fa',
  'password',
  'login attempt',
  'account alert',
  'sign-in attempt',
  'personal message',
  'doctor',
  'legal',
  'contract'
];

const GENERIC_LOCALS = new Set([
  'noreply',
  'no-reply',
  'newsletter',
  'updates',
  'billing',
  'support',
  'team',
  'notifications',
  'hello',
  'mailer-daemon'
]);

const KNOWN_SYSTEM_LABELS = new Set([
  'INBOX',
  'STARRED',
  'IMPORTANT',
  'UNREAD',
  'SENT',
  'DRAFT',
  'SPAM',
  'TRASH',
  'CATEGORY_PERSONAL',
  'CATEGORY_PROMOTIONS',
  'CATEGORY_SOCIAL',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS'
]);

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function emailDomain(email) {
  const at = normalizeEmail(email).indexOf('@');
  return at === -1 ? '' : normalizeEmail(email).slice(at + 1);
}

function localPart(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf('@');
  return at === -1 ? normalized : normalized.slice(0, at);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDateRange(messages) {
  const dates = messages
    .map(m => m.date)
    .filter(Boolean)
    .map(d => {
      const parsed = new Date(d);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    })
    .filter(Boolean)
    .sort();

  if (!dates.length) return '—';
  const min = dates[0].slice(0, 10);
  const max = dates[dates.length - 1].slice(0, 10);
  return min === max ? min : `${min} → ${max}`;
}

export function groupIntoSenderCards(messages) {
  const byKey = new Map();

  for (const msg of messages) {
    const email = normalizeEmail(msg.email || msg.name || 'unknown');
    const key = email || String(msg.name || 'Unknown');
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name: msg.name || email.split('@')[0] || 'Unknown',
        email,
        messages: [],
        subjects: [],
        count: 0,
        ignoredCount: 0,
        hasListUnsubscribe: false,
        hasPromo: false,
        hasNoreply: false,
        hasProtectionSignal: false
      });
    }

    const card = byKey.get(key);
    card.messages.push(msg);
    card.count += 1;

    if (msg.ignored || !msg.labels.includes('INBOX')) {
      card.ignoredCount += 1;
    }

    if (msg.listUnsubscribe) card.hasListUnsubscribe = true;
    if (
      msg.labels.includes('CATEGORY_PROMOTIONS') ||
      msg.labels.includes('CATEGORY_SOCIAL') ||
      msg.category === 'promotions' ||
      msg.category === 'social'
    ) {
      card.hasPromo = true;
    }

    const local = localPart(msg.email || '');
    if (GENERIC_LOCALS.has(local) || normalizeEmail(msg.email || '').includes('noreply')) {
      card.hasNoreply = true;
    }

    if (
      msg.starred ||
      msg.important ||
      msg.labels.includes('STARRED') ||
      msg.labels.includes('IMPORTANT') ||
      msg.personal
    ) {
      card.hasProtectionSignal = true;
    }

    if (card.subjects.length < 8 && msg.subject) {
      card.subjects.push(msg.subject);
    }
  }

  const cards = Array.from(byKey.values()).map(card => {
    const subjectCounts = new Map();
    for (const s of card.subjects) {
      subjectCounts.set(s, (subjectCounts.get(s) || 0) + 1);
    }

    const topSubjects = Array.from(subjectCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s)
      .slice(0, 3);

    const nameCounts = new Map();
    for (const m of card.messages) {
      const n = m.name || card.email;
      nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
    }

    const bestName = Array.from(nameCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || card.email;

    return {
      ...card,
      name: bestName,
      subjects: topSubjects,
      ignoredRatio: card.count ? card.ignoredCount / card.count : 0,
      junkSignal: card.hasListUnsubscribe || card.hasPromo || card.hasNoreply
    };
  });

  cards.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return cards;
}

export function scoreCard(card, sentContacts = new Set(), contactDomains = new Set()) {
  const emails = card.messages.map(m => normalizeEmail(m.email || ''));
  const domains = emails.map(emailDomain);

  const protectedByLabel = card.messages.some(m =>
    m.starred ||
    m.important ||
    m.labels.includes('STARRED') ||
    m.labels.includes('IMPORTANT')
  );

  const protectedByContact = emails.some(e => sentContacts.has(e));
  const protectedByDomain = domains.some(d => contactDomains.has(d));
  const protectedBySubject = card.messages.some(m => {
    const subject = String(m.subject || '').toLowerCase();
    return SAFETY_WORDS.some(word => subject.includes(word));
  });

  if (protectedByLabel || protectedByContact || protectedByDomain || protectedBySubject) {
    return 'protected';
  }

  if (card.junkSignal && card.ignoredRatio >= 0.9) {
    return 'junk';
  }

  return 'ambiguous';
}

export function applyCourtVerdict(cards, verdicts) {
  const actions = [];

  for (const card of cards) {
    const verdict = verdicts[card.key];
    if (!verdict) continue;

    // Hard safety rail: protected mail never reaches backend mutation actions.
    if (card.tier === 'protected' && verdict !== 'Parole') {
      continue;
    }

    const ids = card.messages.map(m => m.id).filter(Boolean);
    if (!ids.length) continue;

    if (verdict === 'Archive') {
      actions.push({
        kind: 'batchModify',
        ids,
        addLabels: [CLEARED_LABEL],
        removeLabels: ['INBOX']
      });
    } else if (verdict === 'Exile') {
      actions.push({
        kind: 'batchModify',
        ids,
        addLabels: [CLEARED_LABEL],
        removeLabels: ['INBOX']
      });

      actions.push({
        kind: 'createFilter',
        filter: {
          from: card.email || card.name,
          addLabels: [CLEARED_LABEL],
          removeLabels: ['INBOX']
        }
      });
    }
    // Parole intentionally creates no action.
  }

  return actions;
}

export function expenseLabelForCategory(category) {
  const safe = String(category || 'other')
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'other';
  return `InboxCourt/Expense/${safe}`;
}

export function applyDocketVerdict(cards, verdicts) {
  const actions = [];

  for (const card of cards) {
    const verdict = verdicts[card.key];
    if (!verdict) continue;

    // Expense cards can never be Exiled and can never create filters.
    if (verdict !== 'Approve' && verdict !== 'Review') {
      continue;
    }

    const ids = card.messages.map(m => m.id).filter(Boolean);
    if (!ids.length) continue;

    if (verdict === 'Approve') {
      actions.push({
        kind: 'batchModify',
        ids,
        addLabels: [CLEARED_LABEL, expenseLabelForCategory(card.category)],
        removeLabels: ['INBOX']
      });
    } else if (verdict === 'Review') {
      actions.push({
        kind: 'batchModify',
        ids,
        addLabels: [REVIEW_LABEL],
        removeLabels: []
      });
    }
  }

  return actions;
}

export async function flushActions(client, actions, undoLog = []) {
  for (const action of actions) {
    if (action.kind === 'batchModify') {
      const chunks = chunk(action.ids, 1000);

      for (const ids of chunks) {
        const messageMap = new Map(client.getAllMessages().map(m => [m.id, m]));
        const items = ids.map(id => ({
          id,
          labels: (messageMap.get(id)?.labels || []).slice()
        }));

        await client.batchModify(ids, action.addLabels || [], action.removeLabels || []);
        undoLog.push({ kind: 'restoreLabels', items });
      }
    } else if (action.kind === 'createFilter') {
      const res = await client.createFilter(action.filter);
      undoLog.push({ kind: 'deleteFilter', id: res.id });
    }
  }
}

export async function undoEntries(client, entries) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];

    if (entry.kind === 'restoreLabels') {
      await client.restoreLabels(entry.items);
    } else if (entry.kind === 'deleteFilter') {
      await client.deleteFilter(entry.id);
    }
  }
}

export function calculateNaiveCalls(affectedCount) {
  // Naive model: one modify + one filter/label operation per affected email.
  return Math.max(0, affectedCount) * 2;
}

export function formatAmountDisplay(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '—';

  const curr = String(currency || 'USD').toUpperCase();
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(Math.round(amount));
  const major = Math.floor(abs / 100);
  const minor = String(abs % 100).padStart(2, '0');

  const symbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    JPY: '¥',
    CAD: 'C$',
    AUD: 'A$'
  };

  const symbol = symbols[curr] || `${curr} `;
  return `${sign}${symbol}${major}.${minor}`;
}

export function totalsPerCurrency(messages) {
  const totals = new Map();

  for (const msg of messages) {
    if (msg.amount === null || msg.amount === undefined) continue;
    const currency = String(msg.currency || 'USD').toUpperCase();
    totals.set(currency, (totals.get(currency) || 0) + msg.amount);
  }

  return totals;
}

export function groupExpenseMessages(expenseMessages) {
  const byVendor = new Map();

  for (const msg of expenseMessages) {
    const vendor = String(msg.vendor || msg.name || 'Unknown vendor').trim() || 'Unknown vendor';
    const key = vendor.toLowerCase();

    if (!byVendor.has(key)) {
      byVendor.set(key, {
        key,
        vendor,
        category: msg.category || 'other',
        messages: [],
        subjects: [],
        count: 0,
        hasMissingAmount: false,
        hasNearDuplicate: false
      });
    }

    const card = byVendor.get(key);
    card.messages.push(msg);
    card.count += 1;

    if (msg.amount === null || msg.amount === undefined) {
      card.hasMissingAmount = true;
    }

    if (card.subjects.length < 8 && msg.subject) {
      card.subjects.push(msg.subject);
    }

    if (msg.category && !card.category) {
      card.category = msg.category;
    }
  }

  const cards = Array.from(byVendor.values()).map(card => {
    const currencyCounts = new Map();
    const currencyTotals = new Map();

    for (const msg of card.messages) {
      if (msg.amount === null || msg.amount === undefined) continue;
      const curr = String(msg.currency || 'USD').toUpperCase();
      currencyCounts.set(curr, (currencyCounts.get(curr) || 0) + 1);
      currencyTotals.set(curr, (currencyTotals.get(curr) || 0) + msg.amount);
    }

    const displayCurrency =
      Array.from(currencyCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'USD';

    const displayAmount = currencyTotals.get(displayCurrency) ?? null;

    const fingerprintCounts = new Map();
    for (const msg of card.messages) {
      if (msg.amount === null || msg.amount === undefined) continue;
      const fp = [
        msg.amount,
        String(msg.currency || 'USD').toUpperCase(),
        String(msg.date || '').slice(0, 10),
        msg.category || 'other'
      ].join('|');
      fingerprintCounts.set(fp, (fingerprintCounts.get(fp) || 0) + 1);
    }

    const hasNearDuplicate = Array.from(fingerprintCounts.values()).some(n => n > 1);

    const subjectCounts = new Map();
    for (const s of card.subjects) {
      subjectCounts.set(s, (subjectCounts.get(s) || 0) + 1);
    }

    const topSubjects = Array.from(subjectCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s)
      .slice(0, 3);

    return {
      ...card,
      subjects: topSubjects,
      displayAmount,
      displayCurrency,
      dateRange: formatDateRange(card.messages),
      hasNearDuplicate
    };
  });

  cards.sort((a, b) => b.count - a.count || a.vendor.localeCompare(b.vendor));
  return cards;
}

export function generateExpenseCSV(cards, verdicts) {
  const header = 'vendor,date,amount,currency,category,verdict,messageId';
  const rows = [header];

  for (const card of cards) {
    const verdict = verdicts[card.key];
    if (!verdict) continue;

    for (const msg of card.messages) {
      const amount =
        msg.amount === null || msg.amount === undefined
          ? ''
          : (msg.amount / 100).toFixed(2);

      const date = msg.date ? new Date(msg.date).toISOString().slice(0, 10) : '';
      const currency = String(msg.currency || card.displayCurrency || 'USD').toUpperCase();
      const category = msg.category || card.category || 'other';

      rows.push([
        escapeCsv(card.vendor),
        escapeCsv(date),
        escapeCsv(amount),
        escapeCsv(currency),
        escapeCsv(category),
        escapeCsv(verdict),
        escapeCsv(msg.id)
      ].join(','));
    }
  }

  return rows.join('\n');
}

export const __internals = {
  KNOWN_SYSTEM_LABELS,
  GENERIC_LOCALS,
  SAFETY_WORDS
};