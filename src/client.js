// src/client.js
// GmailClient interface + MockGmailClient implementation.
// Pure module, importable by Node for tests.

import { generateMockInbox } from './mock.js';

/**
 * TODO: Real Gmail adapter.
 *
 * A real GmailClient would implement listInbox / getMetadata / batchModify /
 * createFilter / deleteFilter / createLabel against the Gmail REST API:
 *   - OAuth2 via Google Identity Services (script from accounts.google.com)
 *   - users.messages.list (labelIds: INBOX), users.messages.batchModify
 *   - users.settings.filters.create / delete, users.labels.create
 *   - batch limits: batchModify accepts at most 1000 ids per call
 *
 * CSP note: loading the GIS script requires relaxing script-src to allow
 * https://accounts.google.com — keep demo mode strict-CSP by default and do
 * auth in a separate document if you ever add real Gmail support.
 */

export class GmailClient {
  async listInbox(pageToken) { throw new Error('Not implemented - use MockGmailClient'); }
  async getMetadata(ids) { throw new Error('Not implemented'); }
  async batchModify({ ids, addLabelIds, removeLabelIds }) { throw new Error('Not implemented'); }
  async createFilter(criteria, action) { throw new Error('Not implemented'); }
  async deleteFilter(id) { throw new Error('Not implemented'); }
  async createLabel(name) { throw new Error('Not implemented'); }
}

export class MockGmailClient extends GmailClient {
  constructor(seed = 1337) {
    super();
    this.seed = seed;
    const inbox = generateMockInbox(seed);
    this.messages = new Map(inbox.messages.map(m => [m.id, { ...m, labels: [...m.labels] }]));
    this.sentContacts = inbox.sentContacts;
    this.contactDomains = inbox.contactDomains;
    this.filters = new Map();
    this.nextFilterId = 1;
    this.calls = { listInbox: 0, getMetadata: 0, batchModify: 0, createFilter: 0, deleteFilter: 0, createLabel: 0 };
  }

  getAllMessages() {
    return Array.from(this.messages.values());
  }

  getMessage(id) {
    return this.messages.get(id);
  }

  async listInbox(pageToken = null) {
    this.calls.listInbox++;
    const all = Array.from(this.messages.values())
      .filter(m => m.labels.includes('INBOX'))
      .sort((a, b) => b.dateEpoch - a.dateEpoch);
    const pageSize = 500;
    const start = pageToken ? parseInt(pageToken, 10) : 0;
    const page = all.slice(start, start + pageSize);
    return {
      messages: page.map(m => ({ id: m.id, threadId: m.threadId })),
      nextPageToken: start + pageSize < all.length ? String(start + pageSize) : null
    };
  }

  async getMetadata(ids) {
    this.calls.getMetadata += ids.length;
    return ids.map(id => {
      const msg = this.messages.get(id);
      if (!msg) return null;
      return {
        id: msg.id,
        threadId: msg.threadId,
        labelIds: [...msg.labels],
        payload: {
          headers: [
            { name: 'From', value: msg.from },
            { name: 'Subject', value: msg.subject },
            { name: 'Date', value: new Date(msg.dateEpoch).toUTCString() },
            { name: 'List-Unsubscribe', value: msg.hasListUnsubscribe ? '<mailto:unsub@example.com>' : '' }
          ]
        }
      };
    }).filter(Boolean);
  }

  async batchModify({ ids, addLabelIds = [], removeLabelIds = [] }) {
    this.calls.batchModify++;
    if (ids.length > 1000) {
      throw new Error('batchModify exceeds 1000 IDs limit');
    }
    for (const id of ids) {
      const msg = this.messages.get(id);
      if (!msg) continue;
      for (const label of removeLabelIds) {
        const idx = msg.labels.indexOf(label);
        if (idx >= 0) msg.labels.splice(idx, 1);
      }
    }
    for (const id of ids) {
      const msg = this.messages.get(id);
      if (!msg) continue;
      for (const label of addLabelIds) {
        if (!msg.labels.includes(label)) msg.labels.push(label);
      }
    }
  }

  async createFilter(criteria, action) {
    this.calls.createFilter++;
    const id = `filter_${this.nextFilterId++}`;
    this.filters.set(id, { criteria: { ...criteria }, action: { addLabelIds: [...(action.addLabelIds || [])], removeLabelIds: [...(action.removeLabelIds || [])] } });
    return { id };
  }

  async deleteFilter(id) {
    this.calls.deleteFilter++;
    this.filters.delete(id);
  }

  async createLabel(name) {
    this.calls.createLabel++;
    return { id: `label_${name}`, name };
  }

  getCallCounts() {
    return { ...this.calls };
  }

  getFilters() {
    return Array.from(this.filters.entries()).map(([id, f]) => ({ id, ...f }));
  }

  reset() {
    const inbox = generateMockInbox(this.seed);
    this.messages = new Map(inbox.messages.map(m => [m.id, { ...m, labels: [...m.labels] }]));
    this.filters.clear();
    this.nextFilterId = 1;
    this.calls = { listInbox: 0, getMetadata: 0, batchModify: 0, createFilter: 0, deleteFilter: 0, createLabel: 0 };
  }

  snapshot() {
    const messages = {};
    for (const [id, msg] of this.messages) messages[id] = { ...msg, labels: [...msg.labels] };
    const filters = {};
    for (const [id, f] of this.filters) filters[id] = { ...f, criteria: { ...f.criteria }, action: { ...f.action } };
    return { messages, filters };
  }

  restore(snapshot) {
    this.messages = new Map(Object.entries(snapshot.messages).map(([id, m]) => [id, { ...m, labels: [...m.labels] }]));
    this.filters = new Map(Object.entries(snapshot.filters).map(([id, f]) => [id, { ...f, criteria: { ...f.criteria }, action: { ...f.action } }]));
  }

  /**
   * Restore exact label arrays (used by undo to preserve label order).
   * @param {Map<string, string[]>} prevLabels - id -> labels before the batch
   */
  restoreLabels(prevLabels) {
    for (const [id, labels] of prevLabels) {
      const msg = this.messages.get(id);
      if (msg) msg.labels = [...labels];
    }
  }
}