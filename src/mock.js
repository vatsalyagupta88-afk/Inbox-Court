// src/mock.js
// Deterministic seeded 5,000-message mock inbox.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function isoDaysAgo(days, hours = 0) {
  const base = Date.UTC(2026, 9, 31, 12, 0, 0);
  return new Date(base - days * 86400000 - hours * 3600000).toISOString();
}

const PROTECTED_SENDERS = [
  { name: 'Mom', email: 'mom@gmail.com' },
  { name: 'Dr. Alvarez', email: 'clinic@brighthealth.example' },
  { name: 'Bank Security', email: 'security@mybank.example' },
  { name: 'Alex Rivera', email: 'alex@riverstudio.example' },
  { name: 'Legal Team', email: 'legal@firm.example' },
  { name: 'Sam Chen', email: 'sam.chen@icloud.com' },
  { name: 'Passport Office', email: 'appointments@gov.example' },
  { name: 'Insurance', email: 'claims@safeinsure.example' }
];

const PROTECTED_SUBJECTS = [
  'Your security code is 448192',
  'Important account alert',
  'Doctor appointment confirmation',
  'Personal: quick question',
  'Verification code for login',
  'Contract signature requested',
  'Two-factor recovery notice',
  'Family dinner tonight?'
];

const JUNK_SENDERS = [
  { name: 'Daily Deals', email: 'news@dailydeals.example' },
  { name: 'Mega Savings', email: 'offers@megasavings.example' },
  { name: 'Tech Newsletter', email: 'updates@techletter.example' },
  { name: 'Fashion Warehouse', email: 'sale@fashionwarehouse.example' },
  { name: 'Travel Club', email: 'deals@travelclub.example' },
  { name: 'Gadget Planet', email: 'noreply@gadgetplanet.example' },
  { name: 'Home Depot Deals', email: 'promos@homedeals.example' },
  { name: 'Fitness Plus', email: 'news@fitnessplus.example' },
  { name: 'Crypto Weekly', email: 'alerts@cryptoweekly.example' },
  { name: 'Book Club', email: 'recommendations@bookclub.example' },
  { name: 'Food Box', email: 'menu@foodbox.example' },
  { name: 'Game Store', email: 'sales@gamestore.example' },
  { name: 'Office Supplies', email: 'catalog@officesupplies.example' },
  { name: 'Beauty Box', email: 'hello@beautybox.example' },
  { name: 'Auto Parts', email: 'offers@autoparts.example' },
  { name: 'Pet Store', email: 'news@petstore.example' },
  { name: 'Music Stream', email: 'promo@musicstream.example' },
  { name: 'Video Store', email: 'updates@videostore.example' },
  { name: 'Shoe Warehouse', email: 'clearance@shewarehouse.example' },
  { name: 'Gardening Co', email: 'tips@gardeningco.example' },
  { name: 'Finance Daily', email: 'newsletter@financedaily.example' },
  { name: 'Shopping Alerts', email: 'deals@shoppingalerts.example' },
  { name: 'App Updates', email: 'notifications@appupdates.example' },
  { name: 'Retail Club', email: 'members@retailclub.example' },
  { name: 'Deal Factory', email: 'blast@dealfactory.example' }
];

const JUNK_SUBJECTS = [
  '80% off ends tonight',
  'Your weekly digest',
  'Exclusive member offer',
  'Last chance clearance',
  'New arrivals you may like',
  'Flash sale starts now',
  'Unlock your reward points',
  'Don’t miss this bundle',
  'Your cart is waiting',
  'Subscribe and save',
  'Limited-time promo',
  'Trending in your area',
  'Free shipping today',
  'Bonus credits inside',
  'Weekend special deal'
];

const AMBIGUOUS_SENDERS = [
  { name: 'Community Forum', email: 'notify@forum.example' },
  { name: 'Course Updates', email: 'alerts@learning.example' },
  { name: 'Neighborhood Group', email: 'posts@hood.example' },
  { name: 'Project Tool', email: 'notifications@project.example' },
  { name: 'Reading List', email: 'updates@reading.example' },
  { name: 'Event Platform', email: 'info@events.example' },
  { name: 'Cloud Storage', email: 'share@cloud.example' },
  { name: 'Recipe Club', email: 'weekly@recipes.example' },
  { name: ' Hobby Shop', email: 'news@hobbyshop.example' },
  { name: 'Local News', email: 'brief@localnews.example' },
  { name: 'Podcast Network', email: 'episodes@podcasts.example' },
  { name: 'Charity Update', email: 'support@charity.example' },
  { name: 'Alumni Assoc', email: 'news@alumni.example' },
  { name: 'Software Beta', email: 'beta@software.example' },
  { name: 'Design Community', email: 'digest@design.example' },
  { name: 'Sports Alerts', email: 'scores@sports.example' },
  { name: 'Weather Co', email: 'warnings@weather.example' },
  { name: 'Book Forum', email: 'threads@bookforum.example' },
  { name: 'Job Board', email: 'matches@jobboard.example' },
  { name: 'Travel Forum', email: 'posts@travelforum.example' }
];

const AMBIGUOUS_SUBJECTS = [
  'Someone replied to your thread',
  'Weekly summary',
  'Your reminder is ready',
  'New mention',
  'Account activity',
  'Shared a file with you',
  'Upcoming event details',
  'Recommendations for you',
  'Status update',
  'Please review when convenient'
];

const EXPENSE_VENDORS = [
  { vendor: 'Adobe', category: 'software', currency: 'USD' },
  { vendor: 'AWS', category: 'software', currency: 'USD' },
  { vendor: 'Uber', category: 'travel', currency: 'USD' },
  { vendor: 'Delta', category: 'travel', currency: 'USD' },
  { vendor: 'Starbucks', category: 'food', currency: 'USD' },
  { vendor: 'Apple', category: 'shopping', currency: 'USD' },
  { vendor: 'Netflix', category: 'software', currency: 'USD' },
  { vendor: 'Spotify', category: 'software', currency: 'EUR' },
  { vendor: 'Staples', category: 'office', currency: 'USD' },
  { vendor: 'Walgreens', category: 'health', currency: 'USD' }
];

const EXPENSE_SUBJECTS = [
  'Your receipt from %VENDOR%',
  'Invoice %NUM% from %VENDOR%',
  'Order confirmation: %VENDOR%',
  'Payment received: %VENDOR%',
  '%VENDOR% booking confirmation',
  'Your %VENDOR% statement'
];

export function generateMockInbox() {
  const rand = mulberry32(1337);
  const messages = [];
  let seq = 1;

  const add = (msg) => {
    messages.push({
      id: `mock-${String(seq++).padStart(5, '0')}`,
      labels: ['INBOX'],
      starred: false,
      important: false,
      personal: false,
      listUnsubscribe: false,
      ignored: false,
      isExpense: false,
      amount: null,
      currency: null,
      category: null,
      snippet: '',
      ...msg
    });
  };

  // 250 protected messages.
  for (let i = 0; i < 250; i += 1) {
    const sender = PROTECTED_SENDERS[i % PROTECTED_SENDERS.length];
    const subject = PROTECTED_SUBJECTS[i % PROTECTED_SUBJECTS.length];
    add({
      name: sender.name,
      email: sender.email,
      subject,
      date: isoDaysAgo(i % 180, i % 24),
      labels: ['INBOX', ...(i % 5 === 0 ? ['STARRED'] : []), ...(i % 7 === 0 ? ['IMPORTANT'] : [])],
      starred: i % 5 === 0,
      important: i % 7 === 0,
      personal: sender.email.includes('gmail.com') || sender.email.includes('icloud.com'),
      ignored: false,
      snippet: subject
    });
  }

  // 3,500 junk messages.
  for (let i = 0; i < 3500; i += 1) {
    const sender = JUNK_SENDERS[i % JUNK_SENDERS.length];
    const subject = JUNK_SUBJECTS[i % JUNK_SUBJECTS.length];
    add({
      name: sender.name,
      email: sender.email,
      subject,
      date: isoDaysAgo(i % 365, i % 24),
      labels: ['INBOX', ...(i % 4 === 0 ? ['CATEGORY_PROMOTIONS'] : [])],
      listUnsubscribe: true,
      ignored: i % 100 < 94,
      category: 'promotions',
      snippet: subject
    });
  }

  // 1,000 ambiguous messages.
  for (let i = 0; i < 1000; i += 1) {
    const sender = AMBIGUOUS_SENDERS[i % AMBIGUOUS_SENDERS.length];
    const subject = AMBIGUOUS_SUBJECTS[i % AMBIGUOUS_SUBJECTS.length];
    add({
      name: sender.name,
      email: sender.email,
      subject,
      date: isoDaysAgo(i % 240, i % 24),
      labels: ['INBOX', ...(i % 6 === 0 ? ['CATEGORY_SOCIAL'] : [])],
      listUnsubscribe: i % 3 === 0,
      ignored: i % 100 < 65,
      category: i % 6 === 0 ? 'social' : 'updates',
      snippet: subject
    });
  }

  // 250 expense messages.
  for (let i = 0; i < 250; i += 1) {
    const meta = EXPENSE_VENDORS[i % EXPENSE_VENDORS.length];
    const amountBase = 1000 + Math.floor(rand() * 25000);
    const isMissing = i % 17 === 0;
    const isDuplicate = i % 12 === 0 && i > 0;
    const amount = isMissing ? null : (isDuplicate ? 4999 : amountBase);
    const currency = i % 23 === 0 ? 'EUR' : meta.currency;
    const subjectTemplate = EXPENSE_SUBJECTS[i % EXPENSE_SUBJECTS.length];
    const subject = subjectTemplate
      .replace('%VENDOR%', meta.vendor)
      .replace('%NUM%', String(100000 + i));

    add({
      name: meta.vendor,
      email: `billing@${meta.vendor.toLowerCase()}.example`,
      vendor: meta.vendor,
      subject,
      date: isoDaysAgo(isDuplicate ? (i - 1) % 120 : i % 120, i % 24),
      labels: ['INBOX'],
      isExpense: true,
      amount,
      currency,
      category: meta.category,
      ignored: false,
      snippet: `${meta.vendor} receipt ${amount ? (amount / 100).toFixed(2) : ''} ${currency}`
    });
  }

  // Safety: exact 5,000.
  if (messages.length > 5000) messages.length = 5000;

  while (messages.length < 5000) {
    add({
      name: 'Misc List',
      email: 'noreply@misc.example',
      subject: 'General notification',
      date: isoDaysAgo(messages.length % 300, messages.length % 24),
      labels: ['INBOX'],
      listUnsubscribe: true,
      ignored: messages.length % 100 < 91,
      category: 'updates',
      snippet: 'General notification'
    });
  }

  return messages;
}

export function generateSentContacts() {
  return new Set([
    'mom@gmail.com',
    'sam.chen@icloud.com',
    'alex@riverstudio.example',
    'clinic@brighthealth.example',
    'legal@firm.example'
  ]);
}

export function generateContactDomains() {
  return new Set([
    'gmail.com',
    'icloud.com',
    'outlook.com'
  ]);
}