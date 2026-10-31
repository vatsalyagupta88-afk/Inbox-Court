# Inbox Court

Swipe through sender cards to clean a mock Gmail inbox: Exile junk (archive + label + skip-inbox filter), Parole keepers, Archive the rest — and a Docket mode that reviews extracted expense receipts per vendor with approve/re-review flags.

The hackathon version includes:

- Courtroom-at-night UI
- Parchment cards, brass/gold accents, wax-seal avatars
- Visible backend trace
- Combo meter, score, timer, animated inbox counter
- Mock API calls vs naive bars
- Strict CSP, no external fonts/scripts/styles/images
- No build step
- Optional same-origin Gmail OAuth proxy for real inbox testing

## Run locally

```bash
npm start
```

Then open:

```text
http://localhost:8080
```

Or run only the static demo with any file server:

```bash
python3 -m http.server 8000
```

## Run tests

```bash
npm test
```

## Real Gmail mode

Real Gmail requires OAuth. This app uses a same-origin backend proxy so the frontend remains strict-CSP compliant.

### 1. Google Cloud setup

1. Create a Google Cloud project.
2. Enable **Gmail API**.
3. Configure OAuth consent screen.
4. Create an OAuth client ID of type **Web application**.
5. Add authorized origins:
   - `http://localhost:8080`
   - your Cloud Run URL
6. Add authorized redirect URI:
   - `http://localhost:8080/oauth2callback`
   - `https://YOUR_CLOUD_RUN_URL/oauth2callback`

### 2. Local environment

```bash
export GOOGLE_CLIENT_ID=your_client_id
export GOOGLE_CLIENT_SECRET=your_client_secret
npm start
```

Open:

```text
http://localhost:8080/?real=1
```

### 3. Deploy to Cloud Run

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

gcloud run deploy inbox-court \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars GOOGLE_CLIENT_ID=your_client_id \
  --update-secrets GOOGLE_CLIENT_SECRET=your-secret-name:latest
```

After deploy, copy the Cloud Run URL, add it to Google OAuth redirect URIs, then open:

```text
https://YOUR_CLOUD_RUN_URL/?real=1
```

## Guarantees

- Protected mail never reaches `batchModify`
- Any single protection signal protects a sender
- No source path can trash, delete, or forward messages
- `batchModify` never exceeds 1,000 IDs per call
- Undo restores labels and filters in reverse order
- Expense cards can never receive Exile or create filters
- Totals are never summed across currencies
- CSV header is exactly:

```text
vendor,date,amount,currency,category,verdict,messageId
```