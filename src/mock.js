// src/mock.js
// Seeded fake inbox generator for Inbox Court.
// Deterministic PRNG, pure module (no DOM), importable by Node for tests.

export const FREEMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'hotmail.com'];

export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

const EXPENSE_VENDORS = [
  { domain: 'uber.com', vendor: 'Uber', category: 'travel' },
  { domain: 'lyft.com', vendor: 'Lyft', category: 'travel' },
  { domain: 'doordash.com', vendor: 'DoorDash', category: 'food' },
  { domain: 'grubhub.com', vendor: 'Grubhub', category: 'food' },
  { domain: 'stripe.com', vendor: 'Stripe', category: 'software' },
  { domain: 'github.com', vendor: 'GitHub', category: 'software' },
  { domain: 'netflix.com', vendor: 'Netflix', category: 'software' },
  { domain: 'spotify.com', vendor: 'Spotify', category: 'software' },
  { domain: 'dropbox.com', vendor: 'Dropbox', category: 'software' },
  { domain: 'slack.com', vendor: 'Slack', category: 'software' },
  { domain: 'notion.so', vendor: 'Notion', category: 'software' },
  { domain: 'figma.com', vendor: 'Figma', category: 'software' },
  { domain: 'vercel.com', vendor: 'Vercel', category: 'software' },
  { domain: 'railway.app', vendor: 'Railway', category: 'software' },
  { domain: 'fly.io', vendor: 'Fly.io', category: 'software' },
  { domain: 'cloudflare.com', vendor: 'Cloudflare', category: 'software' },
  { domain: 'digitalocean.com', vendor: 'DigitalOcean', category: 'software' },
  { domain: 'aws.amazon.com', vendor: 'AWS', category: 'software' },
  { domain: 'google.com', vendor: 'Google Cloud', category: 'software' },
  { domain: 'microsoft.com', vendor: 'Microsoft', category: 'software' }
];

const HEAVY_PROMO_SENDERS = [
  { domain: 'marketing.amazon.com', volume: 600, unreadRatio: 0.95 },
  { domain: 'offers.uber.com', volume: 400, unreadRatio: 0.92 },
  { domain: 'deals.lyft.com', volume: 350, unreadRatio: 0.90 },
  { domain: 'promos.doordash.com', volume: 300, unreadRatio: 0.88 },
  { domain: 'news.netflix.com', volume: 280, unreadRatio: 0.91 },
  { domain: 'spotify-mail.com', volume: 250, unreadRatio: 0.93 },
  { domain: 'updates.dropbox.com', volume: 220, unreadRatio: 0.94 },
  { domain: 'slack-news.com', volume: 200, unreadRatio: 0.92 },
  { domain: 'notion-news.com', volume: 180, unreadRatio: 0.95 },
  { domain: 'figma-updates.com', volume: 170, unreadRatio: 0.90 },
  { domain: 'vercel-blog.com', volume: 160, unreadRatio: 0.96 },
  { domain: 'railway-news.com', volume: 150, unreadRatio: 0.91 },
  { domain: 'fly-announce.com', volume: 140, unreadRatio: 0.94 },
  { domain: 'cloudflare-blog.com', volume: 130, unreadRatio: 0.92 },
  { domain: 'do-blog.com', volume: 120, unreadRatio: 0.90 }
];

// Corporate domains that are NOT expense vendors
const CORPORATE_DOMAINS = [
  'atlassian.com', 'datadog.com', 'sentry.io', 'pagerduty.com', 'linear.app',
  'supabase.com', 'planetscale.com', 'neon.tech', 'turso.tech', 'upstash.com',
  'redis.io', 'mongodb.com', 'postgresql.org', 'sqlite.org', 'docker.com',
  'kubernetes.io', 'gitlab.com', 'jetbrains.com', 'okta.com', 'twilio.com',
  'sendgrid.com', 'mailchimp.com', 'zapier.com', 'heroku.com', 'render.com'
];

const EXTRA_PROMO_DOMAINS = [
  'deals-hub.net', 'savings-central.co', 'weekly-offers.com', 'promo-blast.io',
  'coupon-express.net', 'flash-sale-daily.com', 'bargain-letter.co', 'deal-digest.net',
  'offer-alerts.com', 'discount-weekly.co'
];

const KNOWN_CONTACT_DOMAINS = [
  'company.com', 'university.edu', 'startup.io', 'agency.co', 'studio.design',
  'labs.dev', 'ventures.vc', 'capital.fund', 'partners.llc', 'group.inc'
];

const PERSONAL_NAMES = [
  'alex', 'sam', 'jordan', 'taylor', 'morgan', 'casey', 'riley', 'avery',
  'quinn', 'blake', 'drew', 'cam', 'dana', 'elliot', 'finley', 'harper',
  'reese', 'sage', 'marlow', 'kai'
];

const HALF_READ_DOMAIN = 'mail.bluetreeconsulting.com';
const HALF_READ_VOLUME = 40;

const PROMO_SUBJECTS = [
  'Exclusive offer just for you',
  'Limited time: 50% off everything',
  'New arrivals you will love',
  'Your weekly digest',
  'Do not miss out on these deals',
  'Flash sale ends tonight',
  'Special discount inside',
  'We have something for you',
  'New features announced',
  'Product update: what is new'
];

const SOCIAL_SUBJECTS = [
  'You have new notifications',
  'Someone mentioned you',
  'New follower alert',
  'Your weekly social summary',
  'People you may know',
  'Trending in your network',
  'You appeared in a post',
  'New comment on your photo',
  'New like on your post',
  'New share of your content'
];

const UPDATES_SUBJECTS = [
  'Your account activity report',
  'Service maintenance notice',
  'Security alert for your account',
  'New sign-in to your account',
  'Policy update notice',
  'Terms of service change',
  'Privacy policy update',
  'Your weekly product digest',
  'Feature announcement',
  'Scheduled maintenance window'
];

const PERSONAL_SUBJECTS = [
  'Quick question',
  'Thoughts on this?',
  'Meeting tomorrow',
  'Lunch next week?',
  'Saw this and thought of you',
  'Weekend plans',
  'Project update',
  'Thanks for the help',
  'Following up',
  'Catch up soon?'
];

// Subjects for the half-read sender: deliberately free of protection words
// (receipt/invoice/OTP/bank/statement/password/order)
const HALF_READ_SUBJECTS = [
  'Design review notes',
  'Sprint retro summary',
  'Roadmap planning thread',
  'New starter onboarding docs',
  'Team offsite agenda',
  'Vendor evaluation notes',
  'Quarterly business review deck',
  'Hiring loop feedback',
  'Conference talk outline',
  'Documentation sprint notes'
];

const EXPENSE_SUBJECTS = [
  'Your receipt from {vendor}',
  'Invoice #{id} from {vendor}',
  'Order confirmation - {vendor}',
  'Payment received - {vendor}',
  'Your {vendor} receipt',
  'Receipt: {vendor}',
  'Invoice for your {vendor} purchase',
  'Order #{id} confirmed - {vendor}'
];

const SUBSCRIPTION_SUBJECTS = [
  'Your {vendor} subscription receipt',
  'Monthly invoice from {vendor}',
  'Recurring charge: {vendor}',
  'Subscription renewal - {vendor}',
  'Monthly billing statement from {vendor}'
];

export function formatAmount(minorUnits, currency) {
  const major = minorUnits / 100;
  const formatted = major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbols = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', INR: '\u20B9', CAD: 'C$', AUD: 'A$' };
  return (symbols[currency] || currency + ' ') + formatted;
}

function expenseSubjectText(subject, snippet, vendor, amount, currency, date) {
  // Include a parseable amount + date in subject/snippet when present
  const amountStr = amount !== null ? formatAmount(amount, currency) : '';
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return { subject, snippet: `${snippet} ${amountStr} ${dateStr}`.trim() };
}

export function generateMockInbox(seed = 1337) {
  const rng = mulberry32(seed);

  // Fixed reference time keeps generation fully deterministic for tests.
  const NOW = Date.parse('2025-06-15T12:00:00Z');

  // ---- Sender configs ----
  const configs = [];
  const add = (cfg) => configs.push(cfg);

  for (const s of HEAVY_PROMO_SENDERS) {
    add({
      domain: s.domain, fromLocal: 'newsletter', volume: s.volume,
      hasListUnsubscribe: true, baseUnreadRatio: s.unreadRatio,
      kind: 'promo'
    });
  }

  CORPORATE_DOMAINS.forEach((domain, i) => {
    add({
      domain,
      fromLocal: pick(rng, ['team', 'updates', 'notifications', 'hello']),
      volume: Math.max(20, Math.floor(60 - i * 1.5)),
      hasListUnsubscribe: rng() < 0.6,
      baseUnreadRatio: 0.3 + rng() * 0.5,
      kind: ['promotions', 'updates', 'social'][i % 3]
    });
  });

  for (const v of EXPENSE_VENDORS) {
    add({
      domain: v.domain, fromLocal: 'billing', volume: 7 + Math.floor(rng() * 3),
      hasListUnsubscribe: false, baseUnreadRatio: 0.25,
      kind: 'expense', vendor: v.vendor, expenseCategory: v.category
    });
  }

  KNOWN_CONTACT_DOMAINS.forEach((domain, i) => {
    add({
      domain, fromLocal: PERSONAL_NAMES[i % PERSONAL_NAMES.length],
      volume: 3, hasListUnsubscribe: false, baseUnreadRatio: 0.15,
      kind: 'contact', contactName: PERSONAL_NAMES[i % PERSONAL_NAMES.length]
    });
  });

  for (let i = 0; i < 40; i++) {
    const domain = pick(rng, FREEMAIL_DOMAINS);
    add({
      domain, fromLocal: pick(rng, PERSONAL_NAMES) + Math.floor(rng() * 100),
      volume: 2 + Math.floor(rng() * 2), hasListUnsubscribe: false,
      baseUnreadRatio: 0.15 + rng() * 0.25, kind: 'personal'
    });
  }

  for (const domain of EXTRA_PROMO_DOMAINS) {
    add({
      domain, fromLocal: 'newsletter', volume: 10,
      hasListUnsubscribe: true, baseUnreadRatio: 0.92, kind: 'promo'
    });
  }

  add({
    domain: HALF_READ_DOMAIN, fromLocal: 'team', volume: HALF_READ_VOLUME,
    hasListUnsubscribe: false, baseUnreadRatio: 0.5,
    kind: 'halfread', isHalfRead: true
  });

  // Scale volumes to hit exactly 5000 total
  const rawTotal = configs.reduce((sum, s) => sum + s.volume, 0);
  const scale = 5000 / rawTotal;
  for (const s of configs) s.volume = Math.max(1, Math.round(s.volume * scale));
  let total = configs.reduce((sum, s) => sum + s.volume, 0);
  let i = 0;
  while (total < 5000) { configs[i % configs.length].volume++; total++; i++; }
  while (total > 5000) {
    const c = configs[i % configs.length];
    if (c.volume > 1) { c.volume--; total--; }
    i++;
  }

  // ---- Generate messages ----
  const messages = [];
  const senderVolumes = new Map(configs.map(c => [c.domain, c.volume]));
  let msgId = 0;
  const DAY = 86400000;
  let expenseIdx = 0;
  const now = NOW;

  for (const sender of configs) {
    const from = `${sender.fromLocal}@${sender.domain}`;
    for (let k = 0; k < sender.volume; k++) {
      const date = new Date(now - Math.floor(rng() * 365) * DAY - Math.floor(rng() * DAY));
      const isUnread = rng() < sender.baseUnreadRatio;
      const isPromo = sender.kind === 'promo' || (sender.kind === 'promotions');
      const isExpense = sender.kind === 'expense';
      const isContact = sender.kind === 'contact';

      const msg = {
        id: `msg_${msgId++}`,
        threadId: `thread_${Math.floor(msgId / 2)}`,
        from,
        senderDomain: sender.domain,
        hasListUnsubscribe: sender.hasListUnsubscribe,
        subject: '',
        snippet: '',
        date: date.toISOString(),
        dateEpoch: date.getTime(),
        labels: ['INBOX'],
        isUnread,
        isStarred: false,
        isImportant: false,
        isPromo,
        isExpense,
        isSubscription: false,
        vendor: null,
        amount: null,
        currency: null,
        category: null,
        isContact,
        specialTag: null
      };

      if (isUnread) msg.labels.push('UNREAD');

      if (isExpense) {
        // Deterministic sprinkles across the global expense stream
        const isSubscription = expenseIdx % 6 === 5;
        let amount = expenseIdx % 7 === 2 ? null : Math.floor((1500 + rng() * 150000));
        let currency = 'USD';
        if (expenseIdx % 5 === 1) currency = 'EUR';
        else if (expenseIdx % 5 === 3) currency = 'INR';
        else if (expenseIdx % 13 === 7) currency = 'GBP';

        const vendor = sender.vendor;
        msg.isSubscription = isSubscription;
        msg.vendor = vendor;
        msg.amount = amount;
        msg.currency = currency;
        msg.category = sender.expenseCategory;

        const subjTemplate = isSubscription
          ? pick(rng, SUBSCRIPTION_SUBJECTS)
          : pick(rng, EXPENSE_SUBJECTS);
        const subj = subjTemplate
          .replaceAll('{vendor}', vendor)
          .replaceAll('{id}', String(10000 + Math.floor(rng() * 90000)));
        const text = expenseSubjectText(subj, `Receipt from ${vendor}`, vendor, amount, currency, date);
        msg.subject = text.subject;
        msg.snippet = text.snippet;
        expenseIdx++;
      } else if (sender.kind === 'promo' || sender.kind === 'promotions') {
        msg.subject = pick(rng, PROMO_SUBJECTS);
        msg.snippet = 'Check out our latest offers and promotions.';
        msg.labels.push('CATEGORY_PROMOTIONS');
      } else if (sender.kind === 'social') {
        msg.subject = pick(rng, SOCIAL_SUBJECTS);
        msg.snippet = 'You have new activity on your account.';
        msg.labels.push('CATEGORY_SOCIAL');
      } else if (sender.kind === 'updates') {
        msg.subject = pick(rng, UPDATES_SUBJECTS);
        msg.snippet = 'Important update regarding your account.';
        msg.labels.push('CATEGORY_UPDATES');
      } else if (sender.kind === 'halfread') {
        msg.subject = pick(rng, HALF_READ_SUBJECTS);
        msg.snippet = 'Notes from the team.';
        msg.labels.push('CATEGORY_UPDATES');
      } else {
        // contact + personal
        msg.subject = pick(rng, PERSONAL_SUBJECTS);
        msg.snippet = 'Hey, just wanted to touch base.';
      }

      if (!isExpense && !isPromo && sender.kind !== 'halfread' && !isUnread) {
        if (rng() < 0.04) { msg.isStarred = true; msg.labels.push('STARRED'); }
        else if (rng() < 0.03) { msg.isImportant = true; msg.labels.push('IMPORTANT'); }
      }

      messages.push(msg);
    }
  }

  // ---- Post-pass 1: guarantee ~60 starred / ~60 important (excluding special-tagged
  //      msgs and the half-read sender, whose tier must stay ambiguous) ----
  let starredCount = messages.filter(m => m.isStarred).length;
  const unstarred = messages.filter(m => !m.isStarred && !m.isPromo && !m.isExpense && !m.specialTag && m.senderDomain !== HALF_READ_DOMAIN);
  let ui = 0;
  while (starredCount < 60 && ui < unstarred.length) {
    const m = unstarred[ui++];
    m.isStarred = true;
    m.labels.push('STARRED');
    starredCount++;
  }
  let importantCount = messages.filter(m => m.isImportant).length;
  const unimportant = messages.filter(m => !m.isImportant && !m.isStarred && !m.isPromo && !m.isExpense && !m.specialTag && m.senderDomain !== HALF_READ_DOMAIN);
  ui = 0;
  while (importantCount < 60 && ui < unimportant.length) {
    const m = unimportant[ui++];
    m.isImportant = true;
    m.labels.push('IMPORTANT');
    importantCount++;
  }

  // ---- Post-pass 2: tricky case 1 — promo with "receipt" in subject ----
  // Pick from a SMALL promo sender so the heavy hitters stay junk and playable.
  const smallPromo = messages.find(m =>
    m.isPromo && m.labels.includes('CATEGORY_PROMOTIONS') &&
    !m.specialTag && !m.isStarred && !m.isImportant &&
    (senderVolumes.get(m.senderDomain) || 0) < 100);
  if (smallPromo) {
    smallPromo.subject = 'Your receipt for order #12345';
    smallPromo.snippet = 'Thank you for your purchase. Your receipt is attached.';
    smallPromo.specialTag = 'receipt-promo';
  }

  // ---- Post-pass 3: tricky case 2 — newsletter from a known contact's domain ----
  const contactMsg = messages.find(m =>
    m.isContact && !m.isStarred && !m.specialTag && !FREEMAIL_DOMAINS.includes(m.senderDomain));
  if (contactMsg) {
    contactMsg.from = `newsletter@${contactMsg.senderDomain}`;
    contactMsg.subject = 'Weekly newsletter from our team';
    contactMsg.snippet = 'Here is your weekly update from the team.';
    contactMsg.specialTag = 'contact-newsletter';
  }

  // ---- Post-pass 4: tricky case 3 marker — first half-read message ----
  const halfReadMsg = messages.find(m => m.senderDomain === HALF_READ_DOMAIN);
  if (halfReadMsg) halfReadMsg.specialTag = 'half-read';

  // ---- Post-pass 5: near-duplicates (~5% of non-subscription expenses) ----
  // Clone: same vendor + currency, amount within 1 minor unit (exact copy),
  // within 48 hours, different message id, never a subscription.
  const dupSources = messages.filter(m =>
    m.isExpense && !m.isSubscription && m.amount !== null);
  const clones = [];
  for (let d = 0; d < dupSources.length; d += 20) {
    const src = dupSources[d];
    const clone = {
      ...src,
      id: `msg_dup_${clones.length}`,
      threadId: `thread_dup_${clones.length}`,
      date: new Date(src.dateEpoch + 6 * 3600000).toISOString(),
      dateEpoch: src.dateEpoch + 6 * 3600000,
      labels: [...src.labels],
      specialTag: null
    };
    // 6h offset keeps it within the 48h window; amount/currency/vendor identical
    clones.push(clone);
  }
  messages.push(...clones);

  // Trim back to exactly 5000 by removing non-special promo messages from the tail
  let over = messages.length - 5000;
  for (let idx = messages.length - 1; idx >= 0 && over > 0; idx--) {
    const m = messages[idx];
    if (m.isPromo && !m.specialTag && !m.isStarred && !m.isImportant) {
      messages.splice(idx, 1);
      over--;
    }
  }
  // Fallback trim (should not trigger): remove unmarked updates messages
  for (let idx = messages.length - 1; idx >= 0 && over > 0; idx--) {
    const m = messages[idx];
    if (!m.specialTag && !m.isStarred && !m.isImportant && !m.isExpense) {
      messages.splice(idx, 1);
      over--;
    }
  }

  // ---- Shuffle deterministically ----
  for (let s = messages.length - 1; s > 0; s--) {
    const j = Math.floor(rng() * (s + 1));
    [messages[s], messages[j]] = [messages[j], messages[s]];
  }

  // ---- Sent contacts + contact domains ----
  const sentContacts = new Set();
  const contactDomains = new Set(KNOWN_CONTACT_DOMAINS);
  for (const m of messages) {
    if (m.isContact) {
      sentContacts.add(m.from.toLowerCase());
      contactDomains.add(m.senderDomain);
    }
  }
  // Extra sent addresses: 3 domain variants per name from the second half of
  // the name pool, so they never collide with the contact sender addresses.
  for (let n = 10; n < PERSONAL_NAMES.length; n++) {
    for (let d = 0; d < 3; d++) {
      sentContacts.add(`${PERSONAL_NAMES[n]}@${KNOWN_CONTACT_DOMAINS[(n + d) % KNOWN_CONTACT_DOMAINS.length]}`);
    }
  }

  return {
    messages,
    sentContacts,
    contactDomains,
    senderConfigs: configs,
    senderVolumes,
    halfReadDomain: HALF_READ_DOMAIN,
    stats: {
      total: messages.length,
      unread: messages.filter(m => m.isUnread).length,
      starred: messages.filter(m => m.isStarred).length,
      important: messages.filter(m => m.isImportant).length,
      expense: messages.filter(m => m.isExpense).length,
      contacts: messages.filter(m => m.isContact).length
    }
  };
}

const VENDOR_PATTERNS = [
  { name: 'Uber', patterns: [/uber/i] },
  { name: 'Lyft', patterns: [/lyft/i] },
  { name: 'DoorDash', patterns: [/doordash/i, /door dash/i] },
  { name: 'Grubhub', patterns: [/grubhub/i] },
  { name: 'Stripe', patterns: [/stripe/i] },
  { name: 'GitHub', patterns: [/github/i] },
  { name: 'Netflix', patterns: [/netflix/i] },
  { name: 'Spotify', patterns: [/spotify/i] },
  { name: 'Dropbox', patterns: [/dropbox/i] },
  { name: 'Slack', patterns: [/slack/i] },
  { name: 'Notion', patterns: [/notion/i] },
  { name: 'Figma', patterns: [/figma/i] },
  { name: 'Vercel', patterns: [/vercel/i] },
  { name: 'Railway', patterns: [/railway/i] },
  { name: 'Fly.io', patterns: [/fly\.io/i, /fly io/i] },
  { name: 'Cloudflare', patterns: [/cloudflare/i] },
  { name: 'DigitalOcean', patterns: [/digitalocean/i, /digital ocean/i] },
  { name: 'AWS', patterns: [/aws/i, /amazon web services/i] },
  { name: 'Google Cloud', patterns: [/google cloud/i, /\bgcp\b/i] },
  { name: 'Microsoft', patterns: [/microsoft/i, /azure/i] },
  { name: 'Delta', patterns: [/\bdelta\b/i] },
  { name: 'United', patterns: [/united airlines?/i] },
  { name: 'American Airlines', patterns: [/american airlines?/i] },
  { name: 'Southwest', patterns: [/southwest/i] },
  { name: 'Booking.com', patterns: [/booking\.com/i] },
  { name: 'Airbnb', patterns: [/airbnb/i] }
];

const VENDOR_CATEGORIES = {
  Uber: 'travel', Lyft: 'travel', Delta: 'travel', United: 'travel',
  'American Airlines': 'travel', Southwest: 'travel', 'Booking.com': 'travel', Airbnb: 'travel',
  DoorDash: 'food', Grubhub: 'food',
  Stripe: 'software', GitHub: 'software', Netflix: 'software', Spotify: 'software',
  Dropbox: 'software', Slack: 'software', Notion: 'software', Figma: 'software',
  Vercel: 'software', Railway: 'software', 'Fly.io': 'software', Cloudflare: 'software',
  DigitalOcean: 'software', AWS: 'software', 'Google Cloud': 'software', Microsoft: 'software'
};

export function parseExpense(subject, snippet) {
  const text = `${subject} ${snippet}`;

  let vendor = null;
  for (const v of VENDOR_PATTERNS) {
    if (v.patterns.some(p => p.test(text))) { vendor = v.name; break; }
  }
  if (!vendor) vendor = 'Unknown';

  let amount = null;
  let currency = 'USD';

  const money = (raw) => Math.round(parseFloat(raw.replace(/,/g, '')) * 100);

  const dollar = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  const euro = text.match(/\u20AC\s*([\d,]+(?:\.\d+)?)/);
  const pound = text.match(/\u00A3\s*([\d,]+(?:\.\d+)?)/);
  const rupee = text.match(/\u20B9\s*([\d,]+(?:\.\d+)?)/);
  const usd = text.match(/\bUSD\s*([\d,]+(?:\.\d+)?)/i);
  const eur = text.match(/\bEUR\s*([\d,]+(?:\.\d+)?)/i);
  const gbp = text.match(/\bGBP\s*([\d,]+(?:\.\d+)?)/i);
  const inr = text.match(/\bINR\s*([\d,]+(?:\.\d+)?)/i);

  if (dollar) { amount = money(dollar[1]); currency = 'USD'; }
  else if (usd) { amount = money(usd[1]); currency = 'USD'; }
  else if (rupee) { amount = money(rupee[1]); currency = 'INR'; }
  else if (inr) { amount = money(inr[1]); currency = 'INR'; }
  else if (euro) { amount = money(euro[1]); currency = 'EUR'; }
  else if (eur) { amount = money(eur[1]); currency = 'EUR'; }
  else if (pound) { amount = money(pound[1]); currency = 'GBP'; }
  else if (gbp) { amount = money(gbp[1]); currency = 'GBP'; }

  let date = null;
  const datePatterns = [
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i,
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/
  ];
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const d = new Date(match[0].replace(/(\w+)\.(\s+)/, '$1$2'));
      if (!isNaN(d.getTime())) { date = d.toISOString().split('T')[0]; break; }
    }
  }

  const category = (vendor && VENDOR_CATEGORIES[vendor]) || 'other';
  return { vendor, amount, currency, date, category };
}

export function isNearDuplicate(msg1, msg2) {
  if (!msg1.vendor || !msg2.vendor) return false;
  if (msg1.vendor !== msg2.vendor) return false;
  if (msg1.currency !== msg2.currency) return false;
  if (msg1.amount === null || msg2.amount === null) return false;
  if (msg1.isSubscription || msg2.isSubscription) return false;
  if (Math.abs(msg1.amount - msg2.amount) > 1) return false;
  if (Math.abs(msg1.dateEpoch - msg2.dateEpoch) > 48 * 3600000) return false;
  return msg1.id !== msg2.id;
}