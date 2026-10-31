# Inbox Court

Swipe through sender cards to clean a mock Gmail inbox: Exile junk (archive + label + skip-inbox filter), Parole keepers, Archive the rest — and a Docket mode that reviews extracted expense receipts per vendor with approve/re-review flags. Everything runs locally on a seeded 5,000-message fake inbox; the same swipe mechanics drive both modes.

**Demo mode only — no real Gmail data is accessed.** The `GmailClient` interface in `src/client.js` documents what a real adapter would call; the app ships only with `MockGmailClient`.

## Run it

```
python3 -m http.server 8000     # (Windows: python -m http.server 8000)
```

Then open http://localhost:8000 — or use any static file server. No build step, no dependencies, no `npm install` required.

## Test it

```
npm test
```

(Requires Node >= 20; runs `node --test` against `tests/*.test.js`.)

## Gameplay

- **Court mode** — sender cards show volume, ignore ratio, sample subjects and a tier badge:
  - `protected` (starred/important/sent-contact/personal/safety-word subjects) → Parole only
  - `junk` (List-Unsubscribe/promo/noreply signal AND ≥90% ignored) → flick left to Exile
  - `ambiguous` (mixed signals) → requires a deliberate click/Enter, not a flick
- **Docket mode** — expense cards per vendor with extracted amount (integer minor units), currency, date, category, plus "missing amount" and "possible duplicate" badges. Approve labels by category and archives; Review labels only and keeps it in the inbox.
- **Stats panel** — live inbox count, emails affected, API calls vs naive (2 × affected), filters created, score and combo.
- **End screen** — before/after counts, time, per-currency approved totals (never summed across currencies), CSV export, and Undo Everything.

## Guarantees (all test-asserted)

- Protected mail never reaches `batchModify`
- Any single protection signal protects a sender
- No source path can trash, delete or forward messages
- `batchModify` never exceeds 1,000 IDs per call
- Undo restores the inbox and filters exactly (label-order preserving, reverse order, partial-flush aware)
- Expense cards can never receive an Exile verdict or create a filter
- Totals are never summed across currencies
- CSV header is exactly `vendor,date,amount,currency,category,verdict,messageId`

## Layout

```
index.html        # strict CSP, no inline handlers, no external scripts
css/style.css
src/boot.js       # entry point
src/client.js     # GmailClient interface + MockGmailClient (+ call counters)
src/engine.js     # grouping, tier scoring, verdicts, flush/undo, CSV
src/mock.js       # seeded deterministic 5,000-message inbox + expense parsing
src/ui.js         # DOM builder (textContent only — no innerHTML)
tests/            # node --test, zero dependencies
```
