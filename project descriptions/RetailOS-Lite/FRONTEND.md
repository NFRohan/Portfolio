# RetailOS Lite — Frontend Demo

## Quick start (localhost)

### 1. Infrastructure

```powershell
cd RetailOS-Lite
docker compose -f docker-compose.worker.yml up -d
```

### 2. Environment

```powershell
copy .env.example .env
```

Edit `.env` — set `AUTH_SECRET` to any random 32+ char string.

### 3. Install & database

```powershell
npm install
npm run db:push
npm run db:seed
```

### 4. Run the stack

Terminal 1 — Next.js (port 3000):

```powershell
npm run dev
```

Terminal 2 — AI service (port 8001):

```powershell
$env:PYTHONUTF8='1'
pip install -r ai_service/requirements.txt
uvicorn ai_service.app.main:app --reload --port 8001
```

Terminal 3 — BullMQ worker:

```powershell
npm run worker
```

### 5. Demo login

| Role | Email | Password |
|------|-------|----------|
| Rep | rep@demo.com | demo123 |
| Supervisor | supervisor@demo.com | demo123 |

### Demo flow

1. Login as **rep** → New visit → select outlet → capture GPS → upload shelf photo → Submit
2. Watch analyzing pipeline on visit detail
3. Login as **supervisor** → Dashboard → open visit → compare raw vs YOLO overlay

### WhatsApp supervisor alerts (Twilio sandbox)

RetailOS sends WhatsApp alerts to the supervisor number configured in `.env`:

| Alert | Trigger |
|-------|---------|
| Store approval | Rep adds a store that needs supervisor review |
| Fraud detection | Worker finds fraud signals during visit analysis |

**Setup**

1. Create a Twilio trial account and open **Messaging → Try it out → Send a WhatsApp message**.
2. Join the sandbox from the supervisor phone: send `join <your-code>` to `+1 415 523 8886`.
3. Send `hi` to the sandbox number to open the **24-hour free-form message window** (required for custom alert text).
4. Add to `.env`:

```env
TWILIO_WHATSAPP_ENABLED=true
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
SUPERVISOR_WHATSAPP_TO=whatsapp:+8801XXXXXXXXX
APP_PUBLIC_URL=http://localhost:3000
```

5. Restart **Next.js** and the **worker** after changing `.env`.

**Test scripts**

```powershell
npm run test:whatsapp
npm run test:whatsapp:fraud
```

**Demo notes**

- Trial accounts have a **daily message cap** (error 63038). Save sends for the live demo.
- If WhatsApp fails, pending stores and flagged visits still appear in the supervisor UI.
- Re-send `hi` to the sandbox before demo day to refresh the 24h window.

## Routes

- `/login` — authentication
- `/rep/visits` — rep visit list
- `/rep/visits/new` — visit wizard
- `/rep/visits/[id]` — visit detail + AI results
- `/supervisor` — command center dashboard
- `/supervisor/visits/[id]` — full visit intelligence

## Architecture

Next.js API routes → PostgreSQL (Prisma) → BullMQ enqueue on submit → Worker → FastAPI `/analyze-shelf`

See [docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md) for integration contract.
