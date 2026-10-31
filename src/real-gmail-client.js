// src/real-gmail-client.js
// Same-origin backend adapter. The browser never sees Google tokens.

export class RealGmailClient {
  constructor({ maxMessages = 25 } = {}) {
    this.maxMessages = maxMessages;
    this.messages = [];
    this.sentContacts = new Set();
    this.contactDomains = new Set();
    this.totalInboxCount = 0;
    this.inboxCount = 0;
    this.profile = null;

    this.calls = {
      batchModify: 0,
      createFilter: 0,
      deleteFilter: 0,
      restoreLabels: 0,
      messages: 0,
      sentContacts: 0
    };
  }

  async bootstrap() {
    const status = await this.request('/status');
    if (!status.authenticated) {
      throw new Error('LOGIN_REQUIRED');
    }

    this.profile = status;
    this.totalInboxCount = Number(status.inboxCount || 0);
    this.inboxCount = this.totalInboxCount;

    const messageRes = await this.request(`/messages?maxResults=${this.maxMessages}`);
    this.messages = messageRes.messages || [];
    this.addCalls(messageRes.apiCalls);

    const contactRes = await this.request('/sent-contacts?maxResults=50');
    this.sentContacts = new Set(contactRes.contacts || []);
    this.contactDomains = new Set(contactRes.domains || []);
    this.addCalls(contactRes.apiCalls);
  }

  getAllMessages() {
    return this.messages;
  }

  getInboxCount() {
    return Math.max(0, this.inboxCount);
  }

  applyInboxDelta(delta) {
    this.inboxCount = Math.max(0, this.inboxCount + Number(delta || 0));
  }

  getCallCounts() {
    return { ...this.calls };
  }

  async batchModify(ids, addLabelNames = [], removeLabelNames = []) {
    const res = await this.request('/batchModify', {
      method: 'POST',
      body: JSON.stringify({
        ids,
        addLabelNames,
        removeLabelNames
      })
    });

    this.updateLocalLabels(ids, addLabelNames, removeLabelNames);
    this.addCalls(res.apiCalls);
    return res;
  }

  async restoreLabels(items) {
    const res = await this.request('/restoreLabels', {
      method: 'POST',
      body: JSON.stringify({ items })
    });

    const map = new Map(this.messages.map(m => [m.id, m]));
    for (const item of items) {
      const msg = map.get(item.id);
      if (msg) msg.labels = [...item.labels];
    }

    this.addCalls(res.apiCalls);
    return res;
  }

  async createFilter(filter) {
    const res = await this.request('/filters', {
      method: 'POST',
      body: JSON.stringify(filter)
    });

    this.addCalls(res.apiCalls);
    return res;
  }

  async deleteFilter(id) {
    const res = await this.request(`/filters/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });

    this.addCalls(res.apiCalls);
    return res;
  }

  updateLocalLabels(ids, addLabelNames = [], removeLabelNames = []) {
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
  }

  addCalls(apiCalls) {
    if (!apiCalls) return;
    for (const [key, value] of Object.entries(apiCalls)) {
      this.calls[key] = (this.calls[key] || 0) + Number(value || 0);
    }
  }

  async request(path, init = {}) {
    const res = await fetch(`/api/gmail${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {})
      }
    });

    if (res.status === 401) {
      const err = new Error('LOGIN_REQUIRED');
      err.loginUrl = '/api/auth/login';
      throw err;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Gmail proxy request failed: ${res.status}`);
    }

    return res.json();
  }
}