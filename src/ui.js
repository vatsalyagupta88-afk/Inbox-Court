// src/ui.js
// Inbox Court UI. Builds DOM with createElement/textContent only.
// No innerHTML. No inline event handlers. No setAttribute("style").

import {
  groupIntoSenderCards,
  scoreCard,
  applyCourtVerdict,
  applyDocketVerdict,
  groupExpenseMessages,
  flushActions,
  undoEntries,
  calculateNaiveCalls,
  formatAmountDisplay,
  generateExpenseCSV,
  totalsPerCurrency
} from './engine.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const AVATAR_COLORS = [
  '#7f1d1d',
  '#9a3412',
  '#854d0e',
  '#166534',
  '#155e75',
  '#1e3a8a',
  '#5b21b6',
  '#9d174d',
  '#3f3f46',
  '#111827'
];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;

    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, String(v));
  }

  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }

  return node;
}

function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);

  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    node.setAttribute(k, String(v));
  }

  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }

  return node;
}

function shieldIcon() {
  return svgEl(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: '14',
      height: '14',
      'aria-hidden': 'true',
      focusable: 'false'
    },
    svgEl('path', {
      d: 'M12 2l8 4v6c0 5-3.4 9.3-8 10-4.6-.7-8-5-8-10V6l8-4z',
      fill: 'currentColor'
    })
  );
}

export class InboxCourtUI {
  constructor(client, root, options = {}) {
    this.client = client;
    this.root = root;
    this.options = options;
    this.live = !!options.live;
    this.realStatus = options.realStatus || { available: false, authenticated: false };

    this.mode = 'court';
    this.cards = [];
    this.currentCardIndex = 0;
    this.verdicts = {};
    this.decidedStack = [];
    this.undoLog = [];

    this.isProcessing = false;
    this.combo = 0;
    this.score = 0;
    this.lastVerdictTime = 0;
    this.startTime = 0;

    this.totalInboxCount = 0;
    this.affectedCount = 0;
    this.filtersCreated = 0;
    this.expenseTotals = new Map();

    this.prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    this.pointerStart = null;
    this.pointerActive = false;
    this.currentCardNode = null;

    this.displayedInbox = 0;
    this.timerId = null;

    this.liveRegion = el('div', {
      class: 'sr-only',
      'aria-live': 'polite',
      'aria-atomic': 'true'
    });

    document.body.append(this.liveRegion);

    this.boundKeydown = (e) => this.handleKeydown(e);
    document.addEventListener('keydown', this.boundKeydown);

    this.prepareCards();
  }

  // ---------- data ----------

  prepareCards() {
    const all = this.client.getAllMessages();
    const inboxCount =
      typeof this.client.getInboxCount === 'function'
        ? this.client.getInboxCount()
        : all.filter(m => m.labels.includes('INBOX')).length;

    this.totalInboxCount = this.client.totalInboxCount ?? inboxCount;

    const courtCards = groupIntoSenderCards(all);
    for (const card of courtCards) {
      card.tier = scoreCard(card, this.client.sentContacts, this.client.contactDomains);
    }

    this.courtCards = courtCards;
    this.docketCards = groupExpenseMessages(all.filter(m => m.isExpense));
  }

  loadCardsForMode() {
    this.cards = this.mode === 'court' ? this.courtCards : this.docketCards;
    this.currentCardIndex = 0;
  }

  // ---------- screens ----------

  init() {
    this.stopTimer();
    this.root.replaceChildren();

    const badges = [
      el('span', { class: 'badge demo', text: 'Demo mode - sample inbox' })
    ];

    if (this.live) {
      badges.push(el('span', { class: 'badge live', text: 'Live Gmail connected' }));
    }

    this.root.append(
      el('header', {},
        el('div', { class: 'header-left' },
          el('h1', { text: 'Inbox Court' })
        ),
        el('div', { class: 'header-badges' }, ...badges)
      ),
      this.buildStartScreen(),
      this.buildGameScreen(),
      this.buildEndScreen()
    );

    this.showScreen('start');
  }

  buildStartScreen() {
    const courtCount = this.courtCards.length;
    const docketCount = this.docketCards.length;

    const modeToggle = el('input', { type: 'checkbox', id: 'mode-toggle' });

    const desc = el('p', {
      class: 'mode-desc',
      text: 'Sender cleanup: Exile junk, Parole keepers, Archive the rest'
    });

    const previewCount = el('span', { class: 'stat-value', text: String(courtCount) });
    const previewLabel = el('span', { class: 'stat-label', text: 'senders to review' });

    modeToggle.addEventListener('change', () => {
      this.mode = modeToggle.checked ? 'docket' : 'court';
      desc.textContent = this.mode === 'court'
        ? 'Sender cleanup: Exile junk, Parole keepers, Archive the rest'
        : 'Expense review: Approve receipts, flag the rest for Review';
      previewCount.textContent = String(this.mode === 'court' ? courtCount : docketCount);
      previewLabel.textContent = this.mode === 'court' ? 'senders to review' : 'vendors to review';
    });

    const connectRow = el('div', { class: 'connect-row' });

    if (this.realStatus.available && !this.live) {
      connectRow.append(
        el('a', {
          class: 'btn secondary',
          href: '/api/auth/login',
          text: 'Connect Real Gmail'
        })
      );
    }

    if (this.live) {
      connectRow.append(
        el('a', {
          class: 'btn secondary',
          href: '/api/auth/logout',
          text: 'Disconnect Gmail'
        })
      );
    }

    return el('section', { class: 'screen', id: 'start-screen' },
      el('main', {},
        el('p', { class: 'tagline', text: 'Clean the docket before the bailiff calls.' }),
        el('p', {
          class: 'subline',
          text: 'A fast-paced inbox court where every swipe executes a real chore in the background. Protected senders cannot be exiled. Batched API calls are visible. Undo is exact.'
        }),
        el('div', { class: 'mode-selector' },
          el('label', { class: 'mode-toggle', for: 'mode-toggle' },
            modeToggle,
            el('span', { class: 'toggle-slider' }),
            el('span', { class: 'mode-label court', text: 'Court' }),
            el('span', { class: 'mode-label docket', text: 'Docket' })
          ),
          desc
        ),
        el('div', { class: 'stats-preview' },
          el('div', { class: 'stat' },
            el('span', { class: 'stat-value', text: this.totalInboxCount.toLocaleString() }),
            el('span', { class: 'stat-label', text: 'emails in inbox' })
          ),
          el('div', { class: 'stat' }, previewCount, previewLabel)
        ),
        connectRow.childNodes.length ? connectRow : null,
        el('button', {
          id: 'start-btn',
          class: 'btn primary large',
          text: 'Begin Session',
          onclick: () => this.startGame()
        }),
        el('p', { class: 'controls-hint' },
          el('span', { class: 'keycap', text: '\u2190' }), ' Exile / Approve ',
          el('span', { class: 'keycap', text: '\u2192' }), ' Parole / Review ',
          el('span', { class: 'keycap', text: '\u2191' }), ' Archive ',
          el('span', { class: 'keycap', text: 'Z' }), ' Undo'
        )
      )
    );
  }

  buildGameScreen() {
    const screen = el('section', { class: 'screen', id: 'game-screen' });

    const hud = el('div', { class: 'hud', id: 'hud' },
      el('div', { class: 'hud-cell inbox-meter' },
        el('span', { class: 'hud-label', text: 'Inbox' }),
        el('strong', { class: 'inbox-count', id: 'hud-inbox', text: '0' })
      ),
      el('div', { class: 'hud-cell combo-meter' },
        el('span', { class: 'hud-label', text: 'Combo' }),
        el('strong', { id: 'stat-combo', text: '\u2014' }),
        el('div', { class: 'combo-track' },
          el('div', { class: 'combo-fill', id: 'combo-fill' })
        )
      ),
      el('div', { class: 'hud-cell' },
        el('span', { class: 'hud-label', text: 'Score' }),
        el('strong', { id: 'stat-score', text: '0' })
      ),
      el('div', { class: 'hud-cell' },
        el('span', { class: 'hud-label', text: 'Time' }),
        el('strong', { id: 'stat-time', text: '0.0s' })
      ),
      el('div', { class: 'api-bars' },
        el('div', { class: 'bar-row' },
          el('span', { class: 'bar-label', text: 'Mock API' }),
          el('div', { class: 'bar-track' },
            el('div', { class: 'bar-fill mock', id: 'api-bar' })
          ),
          el('span', { class: 'bar-value', id: 'api-bar-value', text: '0' })
        ),
        el('div', { class: 'bar-row' },
          el('span', { class: 'bar-label', text: 'Naive' }),
          el('div', { class: 'bar-track' },
            el('div', { class: 'bar-fill naive', id: 'naive-bar' })
          ),
          el('span', { class: 'bar-value', id: 'naive-bar-value', text: '0' })
        ),
        el('div', { class: 'saving', id: 'stat-saving', text: 'Saving 0% vs naive' })
      )
    );

    const statsPanel = el('div', { class: 'stats-panel', id: 'stats-panel' });

    const stat = (id, label, cls) => el('div', { class: cls ? `stat ${cls}` : 'stat' },
      el('span', { class: 'stat-value', id }, '\u2014'),
      el('span', { class: 'stat-label', text: label })
    );

    this.activityLog = el('div', {
      class: 'activity-log',
      id: 'activity-log',
      role: 'log',
      'aria-live': 'off'
    });

    statsPanel.append(
      stat('stat-inbox', 'Inbox'),
      stat('stat-affected', 'Affected'),
      stat('stat-api', 'API calls'),
      stat('stat-naive', 'Naive'),
      stat('stat-filters', 'Filters'),
      stat('stat-expense', 'Approved', 'expense-total'),
      el('div', { class: 'panel-section' },
        el('h3', { class: 'panel-title', text: 'Backend trace' }),
        this.activityLog
      )
    );

    this.cardStack = el('div', { class: 'card-stack', id: 'card-stack' });

    this.cardStack.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.pointerActive = true;
      this.pointerStart = { x: e.clientX, y: e.clientY };
      if (this.cardStack.setPointerCapture) {
        this.cardStack.setPointerCapture(e.pointerId);
      }
    });

    this.cardStack.addEventListener('pointermove', (e) => {
      if (!this.pointerActive || !this.pointerStart || this.prefersReducedMotion) return;
      const node = this.currentCardNode;
      if (!node) return;

      const dx = e.clientX - this.pointerStart.x;
      const dy = e.clientY - this.pointerStart.y;
      const rot = Math.max(-12, Math.min(12, dx * 0.05));
      const tx = dx * 0.35;
      const ty = dy * 0.18;
      node.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
    });

    const endPointer = (e) => {
      if (!this.pointerStart) return;
      this.pointerActive = false;

      if (this.cardStack.releasePointerCapture && e.pointerId !== undefined) {
        try {
          this.cardStack.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }

      const dx = e.clientX - this.pointerStart.x;
      const dy = e.clientY - this.pointerStart.y;
      this.pointerStart = null;

      const node = this.currentCardNode;
      if (node && !this.prefersReducedMotion) {
        node.style.transform = '';
      }

      if (Math.max(Math.abs(dx), Math.abs(dy)) < 60) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.userAction(dx < 0 ? 'left' : 'right');
      } else if (dy < 0) {
        this.userAction('up');
      }
    };

    this.cardStack.addEventListener('pointerup', endPointer);
    this.cardStack.addEventListener('pointercancel', () => {
      this.pointerActive = false;
      this.pointerStart = null;
      if (this.currentCardNode) this.currentCardNode.style.transform = '';
    });

    this.verdictButtons = el('div', { class: 'verdict-buttons court', id: 'verdict-buttons' });

    const undoBar = el('div', { class: 'undo-bar' },
      el('button', {
        id: 'undo-btn',
        class: 'btn secondary',
        text: 'Undo (Z)',
        onclick: () => this.handleUndo()
      }),
      el('button', {
        id: 'undo-all-btn',
        class: 'btn secondary',
        text: 'Undo All',
        onclick: () => this.handleUndoAll()
      })
    );

    const layout = el('div', { class: 'game-layout' },
      el('main', { class: 'game-area' }, this.cardStack, this.verdictButtons, undoBar),
      statsPanel
    );

    screen.append(hud, layout);
    return screen;
  }

  buildEndScreen() {
    this.endScreen = el('section', { class: 'screen', id: 'end-screen' });
    return this.endScreen;
  }

  showScreen(name) {
    for (const section of this.root.querySelectorAll('.screen')) {
      section.classList.toggle('active', section.id === `${name}-screen`);
    }
    if (name !== 'game') this.stopTimer();
  }

  // ---------- game flow ----------

  startGame() {
    this.loadCardsForMode();
    this.verdicts = {};
    this.decidedStack = [];
    this.undoLog = [];
    this.affectedCount = 0;
    this.filtersCreated = 0;
    this.expenseTotals = new Map();
    this.combo = 0;
    this.score = 0;
    this.lastVerdictTime = 0;
    this.startTime = Date.now();
    this.displayedInbox = this.getCurrentInboxCount();

    this.showScreen('game');
    this.startTimer();
    this.renderVerdictButtons();
    this.renderCurrentCard();
    this.updateStats();
  }

  renderVerdictButtons() {
    this.verdictButtons.replaceChildren();
    this.verdictButtons.className = `verdict-buttons ${this.mode}`;

    const btn = (id, cls, label, key, aria) => el('button', {
      id,
      class: `verdict-btn ${cls}`,
      'aria-label': aria,
      onclick: () => this.userAction(cls)
    },
      el('span', { class: 'btn-text', text: label }),
      el('span', { class: 'keycap', text: key })
    );

    if (this.mode === 'court') {
      this.verdictButtons.append(
        btn('exile-btn', 'exile', 'Exile', '\u2190', 'Exile - archive all, label Cleared, create skip-inbox filter'),
        btn('parole-btn', 'parole', 'Parole', '\u2192', 'Parole - keep in inbox'),
        btn('archive-btn', 'archive', 'Archive', '\u2191', 'Archive - remove from inbox, label Cleared')
      );
    } else {
      this.verdictButtons.append(
        btn('approve-btn', 'approve', 'Approve', '\u2190', 'Approve - label by category and archive'),
        btn('review-btn', 'review', 'Review', '\u2192', 'Review - label only, stays in inbox')
      );
    }
  }

  getCurrentCard() {
    return this.cards[this.currentCardIndex] || null;
  }

  renderCurrentCard() {
    const card = this.getCurrentCard();
    this.cardStack.replaceChildren();
    this.currentCardNode = null;
    this.updateVerdictControls(card);

    if (!card) return;

    let article;

    if (this.mode === 'court') {
      const isAmbiguous = card.tier === 'ambiguous';
      const isProtected = card.tier === 'protected';
      const ignoredPct = Math.round(card.ignoredRatio * 100);

      const avatar = el('div', { class: 'avatar seal' },
        document.createTextNode(card.name.charAt(0).toUpperCase())
      );
      avatar.style.backgroundColor = AVATAR_COLORS[card.name.charCodeAt(0) % AVATAR_COLORS.length];

      const ignoreFill = el('div', { class: 'ignore-fill' });
      ignoreFill.style.width = `${ignoredPct}%`;

      const content = el('div', { class: 'card-content' },
        el('div', { class: 'card-header' },
          el('h2', { class: 'card-name', text: card.name }),
          this.tierBadge(card.tier)
        ),
        el('div', { class: 'card-meta', text: `~${card.count} emails` }),
        el('div', { class: 'ignore-meter' },
          el('div', { class: 'ignore-figure' },
            el('span', { class: 'ignore-number', text: `${ignoredPct}%` }),
            el('span', { class: 'ignore-label', text: 'ignored' })
          ),
          el('div', { class: 'ignore-track' }, ignoreFill)
        ),
        el('ul', { class: 'subject-list' },
          ...card.subjects.map(s => el('li', { class: 'subject', text: s }))
        ),
        isProtected ? el('div', { class: 'protection-note', text: 'Protected \u2014 Parole only' }) : null,
        isAmbiguous ? el('div', { class: 'ambiguous-note', text: 'Ambiguous \u2014 choose deliberately' }) : null
      );

      article = el('article', {
        class: `card current ${card.tier}`,
        'data-key': card.key,
        tabindex: '0',
        role: 'group',
        'aria-label': this.courtAriaLabel(card)
      },
        el('div', { class: 'card-avatar' }, avatar),
        content,
        el('div', { class: 'stamp-layer', 'aria-hidden': 'true' })
      );
    } else {
      const categoryInitial = (card.category || 'other').charAt(0).toUpperCase();
      const avatar = el('div', { class: 'avatar expense-icon' },
        document.createTextNode(categoryInitial)
      );
      avatar.style.backgroundColor = '#b08d57';

      const badges = el('div', { class: 'card-badges' });
      if (card.hasMissingAmount) badges.append(el('span', { class: 'badge missing', text: 'Missing amount' }));
      if (card.hasNearDuplicate) badges.append(el('span', { class: 'badge duplicate', text: 'Possible duplicate' }));

      article = el('article', {
        class: 'card current expense',
        'data-key': card.key,
        tabindex: '0',
        role: 'group',
        'aria-label': this.docketAriaLabel(card)
      },
        el('div', { class: 'card-avatar' }, avatar),
        el('div', { class: 'card-content' },
          el('div', { class: 'card-header' },
            el('h2', { class: 'card-name', text: card.vendor }),
            el('span', { class: 'category-badge', text: card.category })
          ),
          el('div', { class: 'card-meta amount', text: formatAmountDisplay(card.displayAmount, card.displayCurrency) }),
          el('div', { class: 'card-meta date', text: card.dateRange }),
          badges.childNodes.length ? badges : null,
          el('ul', { class: 'subject-list' },
            ...card.subjects.map(s => el('li', { class: 'subject', text: s }))
          )
        ),
        el('div', { class: 'stamp-layer', 'aria-hidden': 'true' })
      );
    }

    this.cardStack.append(article);
    this.currentCardNode = article;
  }

  tierBadge(tier) {
    if (tier === 'protected') {
      return el('span', { class: 'tier-badge protected' },
        shieldIcon(),
        el('span', { text: 'protected' })
      );
    }
    return el('span', { class: `tier-badge ${tier}`, text: tier });
  }

  updateVerdictControls(card) {
    const buttons = this.verdictButtons
      ? Array.from(this.verdictButtons.querySelectorAll('button'))
      : [];

    buttons.forEach(b => {
      b.disabled = false;
    });

    if (!card) return;

    if (this.mode === 'court') {
      if (card.tier === 'protected') {
        const exileBtn = this.verdictButtons.querySelector('#exile-btn');
        const archiveBtn = this.verdictButtons.querySelector('#archive-btn');
        if (exileBtn) exileBtn.disabled = true;
        if (archiveBtn) archiveBtn.disabled = true;
      }

      if (card.tier === 'ambiguous') {
        const firstBtn = this.verdictButtons.querySelector('button:not([disabled])');
        if (firstBtn) firstBtn.focus({ preventScroll: true });
      }
    }
  }

  courtAriaLabel(card) {
    let label = `${card.name}, ${card.count} emails, ${card.tier} tier, you ignored ${Math.round(card.ignoredRatio * 100)}%`;
    if (card.tier === 'protected') label += ', protected, Parole only';
    if (card.tier === 'ambiguous') label += ', ambiguous, choose deliberately';
    return label;
  }

  docketAriaLabel(card) {
    let label = `${card.vendor}, ${card.count} expenses, ${formatAmountDisplay(card.displayAmount, card.displayCurrency)}`;
    if (card.hasMissingAmount) label += ', missing amount';
    if (card.hasNearDuplicate) label += ', possible duplicate';
    return label;
  }

  // ---------- decisions ----------

  userAction(input) {
    if (this.isProcessing) return;
    const card = this.getCurrentCard();
    if (!card) return;

    if (this.mode === 'court') {
      const map = {
        left: 'Exile',
        right: 'Parole',
        up: 'Archive',
        exile: 'Exile',
        parole: 'Parole',
        archive: 'Archive'
      };

      const verdict = map[input];
      if (!verdict) return;

      if (card.tier === 'ambiguous' && (input === 'left' || input === 'right' || input === 'up')) {
        this.announce('Ambiguous sender. Click a button or press Enter to decide.');
        return;
      }

      if (card.tier === 'protected' && verdict !== 'Parole') {
        this.announce('Protected sender can only be Paroled.');
        return;
      }

      this.decide(card, verdict);
    } else {
      const map = {
        left: 'Approve',
        right: 'Review',
        approve: 'Approve',
        review: 'Review'
      };

      const verdict = map[input];
      if (verdict) this.decide(card, verdict);
    }
  }

  async decide(card, verdict) {
    if (this.isProcessing || this.verdicts[card.key]) return;

    this.isProcessing = true;
    this.verdicts[card.key] = verdict;

    const now = Date.now();
    this.combo = now - this.lastVerdictTime < 3000 ? this.combo + 1 : 1;
    this.lastVerdictTime = now;
    this.score += 10 + Math.min(this.combo, 10);

    const actions = this.mode === 'court'
      ? applyCourtVerdict([card], { [card.key]: verdict })
      : applyDocketVerdict([card], { [card.key]: verdict });

    const undoStart = this.undoLog.length;

    try {
      await flushActions(this.client, actions, this.undoLog);
    } catch (err) {
      delete this.verdicts[card.key];
      this.isProcessing = false;
      this.announce('Backend action failed');
      console.error(err);
      return;
    }

    this.decidedStack.push({ card, undoStart });

    const displayName = this.mode === 'court' ? card.name : card.vendor;

    if (verdict === 'Exile' || verdict === 'Archive' || verdict === 'Approve') {
      this.affectedCount += card.count;
      if (verdict === 'Exile') this.filtersCreated += 1;
      if (this.client.applyInboxDelta) this.client.applyInboxDelta(-card.count);
    }

    if (verdict === 'Approve') {
      for (const m of card.messages) {
        if (m.amount !== null && m.amount !== undefined) {
          const c = m.currency || 'USD';
          this.expenseTotals.set(c, (this.expenseTotals.get(c) || 0) + m.amount);
        }
      }
    }

    this.addTrace(verdict, displayName, card.count, verdict === 'Exile' ? 1 : 0);
    this.announce(`${verdict}: ${displayName}, ${card.count} emails`);
    this.updateStats();
    this.animateCardOut(card, verdict);
  }

  addTrace(verdict, name, count, filters) {
    if (!this.activityLog) return;

    const batches = Math.max(0, Math.ceil(count / 1000));
    const metaParts = [`${count} emails`, `${batches} batchModify`];
    if (filters) metaParts.push('1 skip-inbox filter');

    const entry = el('div', { class: `trace-entry ${verdict.toLowerCase()}` },
      el('span', { class: 'trace-title', text: `${verdict} \u00B7 ${name}` }),
      el('span', { class: 'trace-meta', text: metaParts.join(' \u2192 ') })
    );

    this.activityLog.prepend(entry);

    while (this.activityLog.childNodes.length > 25) {
      this.activityLog.removeChild(this.activityLog.lastChild);
    }
  }

  animateCardOut(card, verdict) {
    const node =
      this.currentCardNode ||
      this.cardStack.querySelector(`[data-key="${CSS.escape(card.key)}"]`);

    if (!node || this.prefersReducedMotion) {
      this.nextCard();
      return;
    }

    const stampCopy = {
      Exile: 'EXILED',
      Parole: 'PAROLED',
      Archive: 'ARCHIVED',
      Approve: 'APPROVED',
      Review: 'REVIEWED'
    };

    const stampClass = {
      Exile: 'exile',
      Parole: 'parole',
      Archive: 'archive',
      Approve: 'approve',
      Review: 'review'
    };

    const flyClass =
      verdict === 'Exile' || verdict === 'Approve' ? 'fly-left' :
      verdict === 'Archive' ? 'fly-up' :
      'fly-right';

    const stampLayer = node.querySelector('.stamp-layer');
    let stamp = null;

    if (stampLayer) {
      stamp = el('div', {
        class: `verdict-stamp ${stampClass[verdict]}`,
        text: stampCopy[verdict]
      });
      stampLayer.append(stamp);
      this.raf(() => stamp.classList.add('show'));
    }

    setTimeout(() => {
      node.style.transform = '';
      node.classList.add(flyClass);
      setTimeout(() => this.nextCard(), 220);
    }, stamp ? 150 : 0);
  }

  nextCard() {
    this.currentCardIndex++;
    this.currentCardNode = null;

    if (this.currentCardIndex >= this.cards.length) {
      this.endGame();
    } else {
      this.renderCurrentCard();
      this.isProcessing = false;
    }
  }

  // ---------- undo ----------

  async revertEntries(startIndex) {
    const entries = this.undoLog.splice(startIndex);
    await undoEntries(this.client, entries);
    return entries.length;
  }

  async handleUndo() {
    if (this.isProcessing) return;

    const last = this.decidedStack.pop();
    if (!last) {
      this.announce('Nothing to undo');
      return;
    }

    this.isProcessing = true;

    try {
      await this.revertEntries(last.undoStart);
    } catch (err) {
      console.error(err);
      this.announce('Undo failed');
      this.isProcessing = false;
      return;
    }

    const card = last.card;
    const verdict = this.verdicts[card.key];
    delete this.verdicts[card.key];

    if (verdict === 'Exile' || verdict === 'Archive' || verdict === 'Approve') {
      this.affectedCount = Math.max(0, this.affectedCount - card.count);
      if (verdict === 'Exile') this.filtersCreated = Math.max(0, this.filtersCreated - 1);
      if (this.client.applyInboxDelta) this.client.applyInboxDelta(card.count);
    }

    if (verdict === 'Approve') {
      for (const m of card.messages) {
        if (m.amount !== null && m.amount !== undefined) {
          const c = m.currency || 'USD';
          this.expenseTotals.set(c, Math.max(0, (this.expenseTotals.get(c) || 0) - m.amount));
        }
      }
    }

    this.combo = 0;
    this.lastVerdictTime = 0;
    this.currentCardIndex = this.decidedStack.length;
    this.renderCurrentCard();
    this.updateStats();
    this.announce('Undid last decision');
    this.isProcessing = false;
  }

  async handleUndoAll() {
    if (this.isProcessing) return;

    this.stopTimer();
    this.isProcessing = true;

    const totalAffected = this.affectedCount;

    try {
      await this.revertEntries(0);
      if (this.client.applyInboxDelta && totalAffected > 0) {
        this.client.applyInboxDelta(totalAffected);
      }
    } catch (err) {
      console.error(err);
      this.announce('Undo all failed');
      this.isProcessing = false;
      return;
    }

    this.verdicts = {};
    this.decidedStack = [];
    this.affectedCount = 0;
    this.filtersCreated = 0;
    this.expenseTotals = new Map();
    this.combo = 0;
    this.score = 0;
    this.lastVerdictTime = 0;
    this.currentCardIndex = 0;
    this.displayedInbox = 0;

    this.prepareCards();
    this.init();
    this.showScreen('start');
    this.announce('Undid everything');
    this.isProcessing = false;
  }

  // ---------- keyboard ----------

  handleKeydown(e) {
    if (!this.root.querySelector('#game-screen.active')) return;

    const card = this.getCurrentCard();
    if (!card) return;

    if (e.key === 'z' || e.key === 'Z') {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.handleUndo();
      }
      return;
    }

    const ambiguous = this.mode === 'court' && card.tier === 'ambiguous';

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.userAction('left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.userAction('right');
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.userAction('up');
        break;
      case 'Enter': {
        if (ambiguous) {
          const focused = document.activeElement;
          if (focused && focused.classList.contains('verdict-btn')) {
            e.preventDefault();
            focused.click();
          } else {
            const firstBtn = this.verdictButtons.querySelector('button:not([disabled])');
            if (firstBtn) firstBtn.focus({ preventScroll: true });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  // ---------- stats ----------

  getCurrentInboxCount() {
    if (typeof this.client.getInboxCount === 'function') {
      return this.client.getInboxCount();
    }
    return this.client.getAllMessages().filter(m => m.labels.includes('INBOX')).length;
  }

  updateStats() {
    const inboxCount = this.getCurrentInboxCount();

    const hudInbox = document.getElementById('hud-inbox');
    const panelInbox = document.getElementById('stat-inbox');

    this.animateNumber(hudInbox, this.displayedInbox, inboxCount, 250, v => Math.round(v).toLocaleString());
    if (panelInbox) panelInbox.textContent = String(inboxCount);
    this.displayedInbox = inboxCount;

    const calls = this.client.getCallCounts();
    const totalCalls = Object.values(calls).reduce((a, b) => a + b, 0);
    const naiveCalls = calculateNaiveCalls(this.affectedCount);

    const set = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };

    set('stat-affected', String(this.affectedCount));
    set('stat-api', String(totalCalls));
    set('stat-naive', String(naiveCalls));
    set('api-bar-value', String(totalCalls));
    set('naive-bar-value', String(naiveCalls));
    set('stat-filters', String(this.filtersCreated));
    set('stat-score', String(this.score));

    const mockPercent = naiveCalls > 0 ? Math.min(100, (totalCalls / naiveCalls) * 100) : 0;
    const saving = naiveCalls > 0 ? Math.max(0, Math.round((1 - totalCalls / naiveCalls) * 100)) : 0;

    const apiBar = document.getElementById('api-bar');
    const naiveBar = document.getElementById('naive-bar');

    if (apiBar) apiBar.style.width = `${mockPercent}%`;
    if (naiveBar) naiveBar.style.width = naiveCalls > 0 ? '100%' : '0%';
    set('stat-saving', `Saving ${saving}% vs naive`);

    if (this.mode === 'docket') {
      const parts = [];
      for (const [curr, amount] of this.expenseTotals) {
        parts.push(formatAmountDisplay(amount, curr));
      }
      set('stat-expense', parts.length ? parts.join(' + ') : '\u2014');
    } else {
      set('stat-expense', '\u2014');
    }

    this.updateComboMeter();
  }

  updateComboMeter() {
    const comboFill = document.getElementById('combo-fill');
    const comboText = document.getElementById('stat-combo');

    if (!this.combo || !this.lastVerdictTime) {
      if (comboText) comboText.textContent = '\u2014';
      if (comboFill) comboFill.style.width = '0%';
      return;
    }

    const elapsed = Date.now() - this.lastVerdictTime;
    const remaining = 3000 - elapsed;

    if (remaining <= 0) {
      if (this.combo > 1) this.shakeScreen();
      this.combo = 0;
      if (comboText) comboText.textContent = '\u2014';
      if (comboFill) comboFill.style.width = '0%';
      return;
    }

    if (comboText) comboText.textContent = `\u00D7${this.combo}`;
    if (comboFill) comboFill.style.width = `${(remaining / 3000) * 100}%`;
  }

  shakeScreen() {
    if (this.prefersReducedMotion) return;
    const node = document.getElementById('game-screen') || this.root;
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
    setTimeout(() => node.classList.remove('shake'), 180);
  }

  startTimer() {
    this.stopTimer();
    this.timerId = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      const timeNode = document.getElementById('stat-time');
      if (timeNode) timeNode.textContent = `${(elapsed / 1000).toFixed(1)}s`;
      this.updateComboMeter();
    }, 100);
  }

  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  raf(cb) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb);
    else setTimeout(cb, 16);
  }

  animateNumber(node, from, to, duration, formatter = v => String(Math.round(v))) {
    if (!node) return;

    if (this.prefersReducedMotion || duration <= 0 || from === to) {
      node.textContent = formatter(to);
      return;
    }

    const start = performance.now();

    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = from + (to - from) * eased;
      node.textContent = formatter(value);
      if (p < 1) this.raf(step);
    };

    this.raf(step);
  }

  announce(message) {
    this.liveRegion.textContent = message;
  }

  // ---------- end screen ----------

  async endGame() {
    this.stopTimer();
    this.isProcessing = true;

    const timeTaken = Date.now() - this.startTime;
    const finalCount = this.getCurrentInboxCount();
    const calls = this.client.getCallCounts();
    const totalCalls = Object.values(calls).reduce((a, b) => a + b, 0);
    const naiveCalls = calculateNaiveCalls(this.affectedCount);

    this.endScreen.replaceChildren();

    const main = el('main', {});
    main.append(el('h2', { text: 'Session Complete' }));

    const afterValue = el('span', {
      class: 'stat-value',
      id: 'end-after',
      text: this.totalInboxCount.toLocaleString()
    });

    const comparison = el('div', { class: 'comparison' },
      el('div', { class: 'stat-box before' },
        el('span', { class: 'stat-value', text: this.totalInboxCount.toLocaleString() }),
        el('span', { class: 'stat-label', text: 'Inbox before' })
      ),
      el('div', { class: 'arrow', text: '\u2192' }),
      el('div', { class: 'stat-box after' },
        afterValue,
        el('span', { class: 'stat-label', text: 'Inbox after' })
      )
    );

    main.append(comparison);

    const timeValue = el('span', { id: 'end-time', text: 'Time: 0.0s' });

    main.append(el('div', { class: 'stat-row' },
      timeValue,
      el('span', { text: `Emails affected: ${this.affectedCount}` }),
      el('span', { text: `API calls: ${totalCalls} (naive: ${naiveCalls})` }),
      el('span', { text: `Filters created: ${this.filtersCreated}` }),
      el('span', { text: `Score: ${this.score}` })
    ));

    if (this.mode === 'docket') {
      const approvedMessages = this.docketCards
        .filter(c => this.verdicts[c.key] === 'Approve')
        .flatMap(c => c.messages);

      const totals = totalsPerCurrency(approvedMessages);

      if (totals.size) {
        const wrap = el('div', { class: 'expense-summary' },
          el('h3', { text: 'Approved expenses' }),
          el('div', { class: 'currency-totals' })
        );

        for (const [curr, amount] of totals) {
          wrap.lastChild.append(el('div', {
            class: 'currency-total',
            text: formatAmountDisplay(amount, curr)
          }));
        }

        main.append(wrap);
      }
    } else {
      const counts = { Exile: 0, Parole: 0, Archive: 0 };
      for (const v of Object.values(this.verdicts)) {
        if (v in counts) counts[v] += 1;
      }

      main.append(el('div', { class: 'stat-row' },
        el('span', { text: `Exiled: ${counts.Exile} senders` }),
        el('span', { text: `Paroled: ${counts.Paroie} senders` }),
        el('span', { text: `Archived: ${counts.Archive} senders` })
      ));
    }

    const actions = el('div', { class: 'actions' });

    if (this.mode === 'docket') {
      actions.append(el('button', {
        id: 'export-btn',
        class: 'btn primary large',
        text: 'Export CSV',
        onclick: () => this.exportCSV()
      }));
    }

    actions.append(
      el('button', {
        id: 'end-undo-all-btn',
        class: 'btn secondary large',
        text: 'Undo Everything',
        onclick: () => this.handleUndoAll()
      }),
      el('button', {
        id: 'restart-btn',
        class: 'btn primary large',
        text: 'Play Again',
        onclick: () => {
          this.prepareCards();
          this.init();
        }
      })
    );

    main.append(actions);
    this.endScreen.append(main);
    this.showScreen('end');

    this.animateNumber(afterValue, this.totalInboxCount, finalCount, 700, v => Math.round(v).toLocaleString());
    this.animateNumber(timeValue, 0, timeTaken, 600, v => `Time: ${(v / 1000).toFixed(1)}s`);

    this.announce('Session complete');
    this.isProcessing = false;
  }

  exportCSV() {
    const csv = generateExpenseCSV(this.docketCards, this.verdicts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = el('a', {
      href: url,
      download: `inbox-court-expenses-${new Date().toISOString().split('T')[0]}.csv`
    });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.announce('CSV exported');
  }
}