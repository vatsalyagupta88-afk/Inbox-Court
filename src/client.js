// src/client.js
// GmailClient interface + deterministic mock implementation.
//
// A real adapter must implement:
// - getAllMessages()
// - getCallCounts()
// - batchModify(ids, addLabelNames, removeLabelNames)
// - restoreLabels(items)
// - createFilter(filter)
// - deleteFilter(id)

import { generateMockInbox, generateSentContacts, generateContactDomains } from './mock.js';

export class MockGmailClient {
  constructor() {
    this.messages = generateMockInbox();
    this.sentContacts = generateSentContacts();
    this.contactDomains = generateContactDomains();

    this.calls = {
      batchModify: 0,
      createFilter: 0,
      deleteFilter: 0,
      restoreLabels: 0
    };

    this.filters = new Map();
    this.filterSeq = 0;
    this.batchSizes = [];
  }

  getAllMessages() {
    return this.messages;
  }

  getInboxCount() {
    return this.messages.filter(m => m.labels.includes('INBOX')).length;
  }

  getCallCounts() {
    return { ...this.calls };
  }

  async batchModify(ids, addLabelNames = [], removeLabelNames = []) {
    this.calls.batchModify += 1;
    this.batchSizes.push(ids.length);

    const idSet = new Set(ids);
    const add = Array.from(new Set(addLabelNames.filter(Boolean)));
    const remove = Array.from(new Set(removeLabelNames.filter(Boolean)));

    for (const msg of this.messages) {
      if (!idSet.has(msg.id)) continue;

      for (const label of remove) {
        msg.labels = msg.labels.filter(l => l !== label);
      }

      for (const label of add) {
        if (!msg.labels.includes(label)) msg.labels.push(label);
      }
    }

    return { updatedIds: ids.slice() };
  }

  async restoreLabels(items) {
    this.calls.restoreLabels += 1;
    const map = new Map(this.messages.map(m => [m.id, m]));

    for (const item of items) {
      const msg = map.get(item.id);
      if (msg) msg.labels = [...item.labels];
    }
  }

  async createFilter(filter) {
    this.calls.createFilter += 1;
    const id = `mock-filter-${++this.filterSeq}`;
    this.filters.set(id, filter);
    return { id };
  }

  async deleteFilter(id) {
    this.calls.deleteFilter += 1;
    this.filters.delete(id);
    return { ok: true };
  }
}