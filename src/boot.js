// src/boot.js — entry point. Kept separate so ui.js stays import-safe in Node.
import { MockGmailClient } from './client.js';
import { InboxCourtUI } from './ui.js';

const container = document.getElementById('app');
const client = new MockGmailClient(1337);
const ui = new InboxCourtUI(client, container);
ui.init();