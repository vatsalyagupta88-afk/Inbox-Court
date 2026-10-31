// src/ui.js
// Inbox Court UI. Builds DOM with createElement/textContent only —
// no innerHTML/outerHTML anywhere (email subjects are untrusted input).

import {
  groupIntoSenderCards, scoreCard, applyCourtVerdict, applyDocketVerdict,
  groupExpenseMessages, flushActions, calculateNaiveCalls,
  formatAmountDisplay, generateExpenseCSV, approvedTotals
} from './engine.js';

const CLEARED = 'InboxCourt/Cleared';

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

const AVATAR_COLORS = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#ff9800', '#ff5722'];
const GENERIC_LOCALS = new Set(['noreply', 'no-reply', 'newsletter', 'updates', 'billing', 'support', 'team', 'notifications', 'hello']);

export class InboxCourtUI {
  constructor(client, root) {
    this.client = client;
    this.root = root;
    this.mode = 'court';
    this.cards = [];
    this.currentCardIndex = 0;
    this.verdicts = {};
    this.decidedStack = []; // { card, undoStart } in decision order
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
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pointerStart = null;

    this.liveRegion = el('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.append(this.liveRegion);

    this.boundKeydown = (e) => this.handleKeydown(e);
    document.addEventListener('keydown', this.boundKeydown);

    this.prepareCards();
  }

  // ---------- data ----------

  prepareCards() {
    const all = this.client.getAllMessages();
    this.totalInboxCount = all.filter(m => m.labels.includes('INBOX')).length;

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
    this.root.replaceChildren();
    this.root.append(
      el('header', {},
        el('h1', { text: 'Inbox Court' }),
        el('span', { class: 'badge demo', text: 'Demo mode - sample inbox' })
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
    modeToggle.addEventListener('change', () => {
      this.mode = modeToggle.checked ? 'docket' : 'court';
      desc.textContent = this.mode === 'court'
        ? 'Sender cleanup: Exile junk, Parole keepers, Archive the rest'
        : 'Expense review: Approve receipts, flag the rest for Review';
      previewCount.textContent = String(this.mode === 'court' ? courtCount : docketCount);
      previewLabel.textContent = this.mode === 'court' ? 'senders to review' : 'vendors to review';
    });

    const desc = el('p', {
      class: 'mode-desc',
      text: 'Sender cleanup: Exile junk, Parole keepers, Archive the rest'
    });

    const previewCount = el('span', { class: 'stat-value', text: String(courtCount) });
    const previewLabel = el('span', { class: 'stat-label', text: 'senders to review' });

    const screen = el('section', { class: 'screen', id: 'start-screen' },
      el('main', {},
        el('p', { class: 'tagline', text: 'Swipe to clean your inbox. Fast.' }),
        el('div', { class: 'mode-selector' },
          el('label', { class: 'mode-toggle' },
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
        el('button', {
          id: 'start-btn', class: 'btn primary', text: 'Start',
          onclick: () => this.startGame()
        }),
        el('p', { class: 'controls-hint' },
          el('kbd', { text: '\u2190' }), ' Exile/Approve ',
          el('kbd', { text: '\u2192' }), ' Parole/Review ',
          el('kbd', { text: '\u2191' }), ' Archive ',
          el('kbd', { text: 'Z' }), ' Undo'
        )
      )
    );
    return screen;
  }

  buildGameScreen() {
    const screen = el('section', { class: 'screen', id: 'game-screen' });

    const statsPanel = el('div', { class: 'stats-panel', id: 'stats-panel' });
    const stat = (id, label, cls) => el('div', { class: cls ? `stat ${cls}` : 'stat' },
      el('span', { class: 'stat-value', id }, '\u2014'),
      el('span', { class: 'stat-label', text: label }));
    statsPanel.append(
      stat('stat-inbox', 'Inbox'),
      stat('stat-affected', 'Affected'),
      stat('stat-api', 'API calls'),
      stat('stat-naive', 'Naive'),
      stat('stat-filters', 'Filters'),
      stat('stat-score', 'Score'),
      stat('stat-combo', 'Combo'),
      stat('stat-expense', 'Approved', 'expense-total')
    );

    this.cardStack = el('div', { class: 'card-stack', id: 'card-stack' });
    this.cardStack.addEventListener('pointerdown', (e) => {
      this.pointerStart = { x: e.clientX, y: e.clientY };
    });
    this.cardStack.addEventListener('pointerup', (e) => {
      if (!this.pointerStart) return;
      const dx = e.clientX - this.pointerStart.x;
      const dy = e.clientY - this.pointerStart.y;
      this.pointerStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 60) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.userAction(dx < 0 ? 'left' : 'right');
      } else if (dy < 0) {
        this.userAction('up');
      }
    });

    this.verdictButtons = el('div', { class: 'verdict-buttons', id: 'verdict-buttons' });

    const undoBar = el('div', { class: 'undo-bar' },
      el('button', { id: 'undo-btn', class: 'btn secondary', text: 'Undo (Z)', onclick: () => this.handleUndo() }),
      el('button', { id: 'undo-all-btn', class: 'btn secondary', text: 'Undo All', onclick: () => this.handleUndoAll() })
    );

    screen.append(statsPanel, el('main', { class: 'game-area' }, this.cardStack, this.verdictButtons, undoBar));
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

    this.showScreen('game');
    this.renderVerdictButtons();
    this.renderCurrentCard();
    this.updateStats();
  }

  renderVerdictButtons() {
    this.verdictButtons.replaceChildren();
    if (this.mode === 'court') {
      this.verdictButtons.append(
        el('button', { id: 'exile-btn', class: 'verdict-btn exile', text: 'Exile', 'aria-label': 'Exile - archive all, label Cleared, create skip-inbox filter', onclick: () => this.userAction('exile') }),
        el('button', { id: 'parole-btn', class: 'verdict-btn parole', text: 'Parole', 'aria-label': 'Parole - keep in inbox', onclick: () => this.userAction('parole') }),
        el('button', { id: 'archive-btn', class: 'verdict-btn archive', text: 'Archive', 'aria-label': 'Archive - remove from inbox, label Cleared', onclick: () => this.userAction('archive') })
      );
    } else {
      this.verdictButtons.append(
        el('button', { id: 'approve-btn', class: 'verdict-btn approve', text: 'Approve', 'aria-label': 'Approve - label by category and archive', onclick: () => this.userAction('approve') }),
        el('button', { id: 'review-btn', class: 'verdict-btn review', text: 'Review', 'aria-label': 'Review - label only, stays in inbox', onclick: () => this.userAction('review') })
      );
    }
  }

  getCurrentCard() {
    return this.cards[this.currentCardIndex] || null;
  }

  renderCurrentCard() {
    const card = this.getCurrentCard();
    this.cardStack.replaceChildren();
    if (!card) return;

    let article;
    if (this.mode === 'court') {
      const isAmbiguous = card.tier === 'ambiguous';
      const isProtected = card.tier === 'protected';
      const avatar = el('div', {
        class: 'avatar',
        style: `background:${AVATAR_COLORS[card.name.charCodeAt(0) % AVATAR_COLORS.length]}`
      }, document.createTextNode(card.name.charAt(0).toUpperCase()));

      const content = el('div', { class: 'card-content' },
        el('div', { class: 'card-header' },
          el('h2', { class: 'card-name', text: card.name }),
          el('span', { class: `tier-badge ${card.tier}`, text: card.tier })
        ),
        el('div', { class: 'card-meta', text: `~${card.count} emails` }),
        el('div', { class: 'card-meta ignored', text: `You ignored ${Math.round(card.ignoredRatio * 100)}%` }),
        el('div', { class: 'card-subjects' },
          ...card.subjects.map(s => el('span', { class: 'subject', text: s }))
        ),
        isProtected ? el('div', { class: 'protection-note', text: '\u{1F512} Protected - Parole only' }) : null,
        isAmbiguous ? el('div', { class: 'ambiguous-note', text: '\u26A0\uFE0F Ambiguous - click a button or press Enter to decide' }) : null
      );

      article = el('article', {
        class: `card current ${card.tier}`,
        'data-key': card.key,
        tabindex: '0',
        role: 'group',
        'aria-label': this.courtAriaLabel(card)
      }, el('div', { class: 'card-avatar' }, avatar), content);

      if (isProtected) {
        const exileBtn = this.verdictButtons.querySelector('#exile-btn');
        const archiveBtn = this.verdictButtons.querySelector('#archive-btn');
        if (exileBtn) exileBtn.disabled = true;
        if (archiveBtn) archiveBtn.disabled = true;
      }
      if (isAmbiguous) {
        const firstBtn = this.verdictButtons.querySelector('button:not([disabled])');
        if (firstBtn) firstBtn.focus();
      }
    } else {
      const categoryInitial = (card.category || 'other').charAt(0).toUpperCase();
      const avatar = el('div', { class: 'avatar expense-icon' },
        document.createTextNode(categoryInitial));

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
          el('div', { class: 'card-subjects' },
            ...card.subjects.map(s => el('span', { class: 'subject', text: s }))
          )
        )
      );
    }

    this.cardStack.append(article);
  }

  courtAriaLabel(card) {
    let label = `${card.name}, ${card.count} emails, ${card.tier} tier, you ignored ${Math.round(card.ignoredRatio * 100)}%`;
    if (card.tier === 'protected') label += ', protected, Parole only';
    if (card.tier === 'ambiguous') label += ', ambiguous, press Enter then choose a button';
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
      const map = { left: 'Exile', right: 'Parole', up: 'Archive', exile: 'Exile', parole: 'Parole', archive: 'Archive' };
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
      const map = { left: 'Approve', right: 'Review', approve: 'Approve', review: 'Review' };
      const verdict = map[input];
      if (verdict) this.decide(card, verdict);
    }
  }

  async decide(card, verdict) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    this.verdicts[card.key] = verdict;

    // combo + score
    const now = Date.now();
    this.combo = now - this.lastVerdictTime < 3000 ? this.combo + 1 : 1;
    this.lastVerdictTime = now;
    this.score += 10 + Math.min(this.combo, 10);

    const actions = this.mode === 'court'
      ? applyCourtVerdict([card], { [card.key]: verdict })
      : applyDocketVerdict([card], { [card.key]: verdict });

    const undoStart = this.undoLog.length;
    await flushActions(this.client, actions, this.undoLog);
    this.decidedStack.push({ card, undoStart });

    if (verdict === 'Exile' || verdict === 'Archive' || verdict === 'Approve') {
      this.affectedCount += card.count;
      if (verdict === 'Exile') this.filtersCreated += 1;
    }
    if (verdict === 'Approve') {
      for (const m of card.messages) {
        if (m.amount !== null) {
          const c = m.currency || 'USD';
          this.expenseTotals.set(c, (this.expenseTotals.get(c) || 0) + m.amount);
        }
      }
    }

    this.announce(`${verdict}: ${this.mode === 'court' ? card.name : card.vendor}, ${card.count} emails`);
    this.animateCardOut(card, verdict);
    this.updateStats();
    this.isProcessing = false;
  }

  animateCardOut(card, verdict) {
    const node = this.cardStack.querySelector(`[data-key="${CSS.escape(card.key)}"]`);
    if (!node || this.prefersReducedMotion) {
      this.nextCard();
      return;
    }
    const dir = (verdict === 'Exile' || verdict === 'Approve') ? -1 : 1;
    node.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
    node.style.transform = `translateX(${dir * 120}%) rotate(${dir * 12}deg)`;
    node.style.opacity = '0';
    setTimeout(() => this.nextCard(), 250);
  }

  nextCard() {
    this.currentCardIndex++;
    if (this.currentCardIndex >= this.cards.length) {
      this.endGame();
    } else {
      this.renderCurrentCard();
    }
  }

  // ---------- undo ----------

  async revertEntries(startIndex) {
    const { undoEntries } = await import('./engine.js');
    const entries = this.undoLog.splice(startIndex);
    await undoEntries(this.client, entries);
    return entries.length;
  }

  async handleUndo() {
    const last = this.decidedStack.pop();
    if (!last) {
      this.announce('Nothing to undo');
      return;
    }
    this.isProcessing = true;
    await this.revertEntries(last.undoStart);

    const card = last.card;
    const verdict = this.verdicts[card.key];
    delete this.verdicts[card.key];

    if (verdict === 'Exile' || verdict === 'Archive' || verdict === 'Approve') {
      this.affectedCount = Math.max(0, this.affectedCount - card.count);
      if (verdict === 'Exile') this.filtersCreated = Math.max(0, this.filtersCreated - 1);
    }
    if (verdict === 'Approve') {
      for (const m of card.messages) {
        if (m.amount !== null) {
          const c = m.currency || 'USD';
          this.expenseTotals.set(c, Math.max(0, (this.expenseTotals.get(c) || 0) - m.amount));
        }
      }
    }

    this.combo = 0;
    this.currentCardIndex = this.decidedStack.length;
    this.renderCurrentCard();
    this.updateStats();
    this.announce('Undid last decision');
    this.isProcessing = false;
  }

  async handleUndoAll() {
    this.isProcessing = true;
    await this.revertEntries(0);
    this.isProcessing = false;
    this.verdicts = {};
    this.decidedStack = [];
    this.affectedCount = 0;
    this.filtersCreated = 0;
    this.expenseTotals = new Map();
    this.combo = 0;
    this.score = 0;
    this.currentCardIndex = 0;
    this.prepareCards();
    this.init();
    this.showScreen('start');
    this.announce('Undid everything');
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
      case 'ArrowLeft': e.preventDefault(); this.userAction('left'); break;
      case 'ArrowRight': e.preventDefault(); this.userAction('right'); break;
      case 'ArrowUp': e.preventDefault(); this.userAction('up'); break;
      case 'Enter': {
        if (ambiguous) {
          const focused = document.activeElement;
          if (focused && focused.classList.contains('verdict-btn')) {
            e.preventDefault();
            focused.click();
          }
        }
        break;
      }
      default: break;
    }
  }

  // ---------- stats ----------

  updateStats() {
    const set = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };
    set('stat-inbox', String(this.client.getAllMessages().filter(m => m.labels.includes('INBOX')).length));

    const calls = this.client.getCallCounts();
    const totalCalls = Object.values(calls).reduce((a, b) => a + b, 0);
    set('stat-affected', String(this.affectedCount));
    set('stat-api', String(totalCalls));
    set('stat-naive', String(calculateNaiveCalls(this.affectedCount)));
    set('stat-filters', String(this.filtersCreated));
    set('stat-score', String(this.score));
    set('stat-combo', this.combo > 1 ? `\u00D7${this.combo}` : '\u2014');

    if (this.mode === 'docket') {
      const parts = [];
      for (const [curr, amount] of this.expenseTotals) {
        parts.push(formatAmountDisplay(amount, curr));
      }
      set('stat-expense', parts.length ? parts.join(' + ') : '\u2014');
    } else {
      set('stat-expense', '\u2014');
    }
  }

  announce(message) {
    this.liveRegion.textContent = message;
  }

  // ---------- end screen ----------

  async endGame() {
    // Decisions flush as they are made, so there is nothing left to flush here.
    const timeTaken = Date.now() - this.startTime;
    const finalCount = this.client.getAllMessages().filter(m => m.labels.includes('INBOX')).length;
    const calls = this.client.getCallCounts();
    const totalCalls = Object.values(calls).reduce((a, b) => a + b, 0);

    this.endScreen.replaceChildren();
    const main = el('main', {});
    main.append(el('h2', { text: 'Session Complete' }));

    const comparison = el('div', { class: 'comparison' },
      el('div', { class: 'stat-box before' },
        el('span', { class: 'stat-value', text: this.totalInboxCount.toLocaleString() }),
        el('span', { class: 'stat-label', text: 'Inbox before' })
      ),
      el('div', { class: 'arrow', text: '\u2192' }),
      el('div', { class: 'stat-box after' },
        el('span', { class: 'stat-value', text: finalCount.toLocaleString() }),
        el('span', { class: 'stat-label', text: 'Inbox after' })
      )
    );
    main.append(comparison);

    main.append(el('div', { class: 'stat-row' },
      el('span', { text: `Time: ${(timeTaken / 1000).toFixed(1)}s` }),
      el('span', { text: `Emails affected: ${this.affectedCount}` }),
      el('span', { text: `API calls: ${totalCalls} (naive: ${calculateNaiveCalls(this.affectedCount)})` }),
      el('span', { text: `Filters created: ${this.filtersCreated}` }),
      el('span', { text: `Score: ${this.score}` })
    ));

    if (this.mode === 'docket') {
      const totals = approvedTotals(this.docketCards, this.verdicts);
      if (totals.size) {
        const wrap = el('div', { class: 'expense-summary' },
          el('h3', { text: 'Approved expenses' }),
          el('div', { class: 'currency-totals' }));
        for (const [curr, amount] of totals) {
          wrap.lastChild.append(el('div', { class: 'currency-total', text: formatAmountDisplay(amount, curr) }));
        }
        main.append(wrap);
      }
    } else {
      const counts = { Exile: 0, Parole: 0, Archive: 0 };
      for (const v of Object.values(this.verdicts)) counts[v] = (counts[v] || 0) + 1;
      main.append(el('div', { class: 'stat-row' },
        el('span', { text: `Exiled: ${counts.Exile} senders` }),
        el('span', { text: `Paroled: ${counts.Parole} senders` }),
        el('span', { text: `Archived: ${counts.Archive} senders` })
      ));
    }

    const actions = el('div', { class: 'actions' });
    if (this.mode === 'docket') {
      actions.append(el('button', { id: 'export-btn', class: 'btn primary', text: 'Export CSV', onclick: () => this.exportCSV() }));
    }
    actions.append(
      el('button', { id: 'end-undo-all-btn', class: 'btn secondary', text: 'Undo Everything', onclick: () => this.handleUndoAll() }),
      el('button', { id: 'restart-btn', class: 'btn primary', text: 'Play Again', onclick: () => { this.prepareCards(); this.init(); } })
    );
    main.append(actions);
    this.endScreen.append(main);
    this.showScreen('end');
    this.announce('Session complete');
  }

  exportCSV() {
    const csv = generateExpenseCSV(this.docketCards, this.verdicts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `inbox-court-expenses-${new Date().toISOString().split('T')[0]}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.announce('CSV exported');
  }
}