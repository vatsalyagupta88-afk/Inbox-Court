// src/boot.js
import { MockGmailClient } from './client.js';
import { RealGmailClient } from './real-gmail-client.js';
import { InboxCourtUI } from './ui.js';

const root = document.getElementById('app');

async function loadStatus() {
  try {
    const res = await fetch('/api/gmail/status');
    if (!res.ok) return { available: false, authenticated: false };
    return await res.json();
  } catch {
    return { available: false, authenticated: false };
  }
}

async function main() {
  root.className = 'loading';
  root.textContent = 'Loading Inbox Court…';

  const realStatus = await loadStatus();
  const params = new URLSearchParams(location.search);
  const wantReal = params.get('real') === '1';

  let client;
  let live = false;

  if (wantReal && realStatus.authenticated) {
    try {
      client = new RealGmailClient({ maxMessages: 25 });
      await client.bootstrap();
      live = true;
    } catch {
      client = new MockGmailClient();
    }
  } else {
    client = new MockGmailClient();
  }

  root.className = '';
  root.replaceChildren();

  const ui = new InboxCourtUI(client, root, {
    realStatus,
    live
  });

  ui.init();
}

main();