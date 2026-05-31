# WhatsApp Alerts

## Purpose

WhatsApp alerts are a demo bonus integration. They notify supervisors when field activity needs attention without requiring the supervisor to sit inside the dashboard.

## Current Alert Types

```mermaid
flowchart TD
  NewOutlet[New or ambiguous outlet]
  Fraud[Fraud signal detected]
  AlertService[WhatsApp alert wrapper]
  Twilio[Twilio WhatsApp]
  Supervisor[Supervisor phone]
  EventLog[(EventLog)]

  NewOutlet --> AlertService
  Fraud --> AlertService
  AlertService --> Twilio --> Supervisor
  Fraud --> EventLog
```

| Trigger | Purpose |
| --- | --- |
| New outlet approval needed | Rep creates or submits a new/ambiguous outlet |
| Fraud detected | Worker finds one or more actionable fraud signals |

## Implementation

| Area | Code |
| --- | --- |
| App-side outlet alert | `lib/outlet-approval-alerts.ts` |
| Worker fraud alert | `worker/src/services/whatsappAlerts.ts` |
| Twilio wrapper | `lib/whatsapp-alerts.ts` |
| Test scripts | `scripts/test-whatsapp-alert.ts`, `scripts/test-fraud-whatsapp-alert.ts` |

## Environment

```env
TWILIO_WHATSAPP_ENABLED=false
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
SUPERVISOR_WHATSAPP_TO=
APP_PUBLIC_URL=http://localhost:3000
```

If disabled or credentials are missing, alert calls should not block the core workflow.

## New Outlet Alert Flow

```text
Rep creates ambiguous/new outlet
  -> OutletSubmission NEW_OUTLET or PENDING_REVIEW
  -> notifyOutletApprovalNeeded
  -> Twilio WhatsApp message to supervisor
  -> Supervisor opens /supervisor/outlets
```

The outlet alert is intentionally fire-and-forget so outlet creation cannot fail due to Twilio downtime.

## Fraud Alert Flow

```text
Worker analyze_visit
  -> run fraud checks
  -> save fraud signals
  -> if signals exist and alert not already sent
  -> sendFraudAlert
  -> EventLog WHATSAPP_FRAUD_ALERT_SENT on success
```

Idempotency:

- Worker checks whether `WHATSAPP_FRAUD_ALERT_SENT` exists for the visit.
- This prevents duplicate alerts on retry/replay.

## Message Content

Fraud alert includes:

- store name
- rep name
- compliance score/status
- fraud signal summaries
- supervisor visit inspection URL

New outlet alert includes:

- store name
- submission status
- supervisor outlet verification URL

## Testing

```powershell
npm run test:whatsapp
npm run test:whatsapp:fraud
```

## Production Notes

- Twilio sandbox requires recipient opt-in.
- Store only message SID and operational metadata, not full PII-heavy message bodies.
- Consider alert throttling if fraud volume grows.
- Alerts should complement, not replace, dashboard/EventLog state.
