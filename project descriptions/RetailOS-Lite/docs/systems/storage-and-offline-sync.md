# Storage And Offline Sync

## Purpose

Storage and offline sync keep the rep workflow resilient: images persist outside form state, and visits can be queued when connectivity is unreliable.

## Image Storage

Code: `lib/storage.ts`

```mermaid
flowchart TD
  Browser[Browser upload]
  Presign[POST /api/visits/:id/images/presign]
  Complete[POST /api/visits/:id/images/complete]
  API[Legacy POST /api/visits/:id/images]
  Driver{IMAGE_STORAGE_DRIVER}
  Local[public/uploads]
  S3[S3 compatible bucket]
  DB[(VisitImage)]
  Worker[Worker reads imagePath or imageUrl]

  Browser --> Presign
  Presign --> S3
  Browser -->|PUT signed URL| S3
  Browser --> Complete --> DB
  Browser --> API --> Driver
  Driver -- local --> Local --> DB
  Driver -- s3 fallback --> S3 --> DB
  DB --> Worker
```

Supported drivers:

| Driver | Env | Use case |
| --- | --- | --- |
| Local | `IMAGE_STORAGE_DRIVER=local` | Fast local demo |
| S3-compatible | `IMAGE_STORAGE_DRIVER=s3` | MinIO, R2, S3, Supabase S3 |

## Local Storage

Default env:

```env
IMAGE_STORAGE_DRIVER=local
IMAGE_STORAGE_LOCAL_DIR=public/uploads
IMAGE_STORAGE_LOCAL_PUBLIC_BASE=/uploads
```

Behavior:

- Writes file under `public/uploads`.
- Stores local path in `VisitImage.localPath`.
- Returns public URL under `/uploads/...`.

Local mode is not serverless-safe. It is fine for Docker/local demo.

## S3-Compatible Storage

Env:

```env
IMAGE_STORAGE_DRIVER=s3
S3_ENDPOINT=http://127.0.0.1:19000
S3_PRESIGN_ENDPOINT=http://127.0.0.1:19000
S3_REGION=us-east-1
S3_BUCKET=retailos-images
S3_ACCESS_KEY_ID=retailos
S3_SECRET_ACCESS_KEY=retailos-secret
S3_FORCE_PATH_STYLE=true
S3_PREFIX=uploads
IMAGE_STORAGE_PUBLIC_BASE_URL=http://127.0.0.1:19000/retailos-images
IMAGE_STORAGE_INTERNAL_BASE_URL=http://127.0.0.1:19000/retailos-images
```

Behavior:

- The app signs short-lived PUT URLs server-side.
- The browser uploads directly to MinIO/S3 using the signed URL.
- The browser then calls `/api/visits/:id/images/complete`.
- The completion route verifies the object with `HeadObject` before creating `VisitImage`.
- Stores storage metadata on `VisitImage.metadata`.
- Returns public object URL without exposing S3/MinIO credentials to the frontend.

Demo compose uses MinIO, bucket initialization, public-read object URLs, and CORS for browser PUT uploads.

## Upload Constraints

- One shelf image per visit.
- Server validates visit ownership.
- Upload emits `UPLOAD_STORED` EventLog.
- Optional client `imageHash` is stored for duplicate detection optimization.

## Offline Sync

Code:

```mermaid
sequenceDiagram
  participant Browser as Rep Browser
  participant IDB as IndexedDB
  participant API as Next.js API
  participant Queue as BullMQ

  Browser->>IDB: save queued visit and one photo
  Browser->>Browser: wait for online
  Browser->>API: POST /api/visits
  Browser->>API: POST /api/visits/:id/images/presign
  Browser->>API: PUT signed MinIO/S3 URL
  Browser->>API: POST /api/visits/:id/images/complete
  Browser->>API: POST /api/visits/:id/submit
  API->>Queue: enqueue analyze_visit
  Browser->>IDB: delete synced item
```

- `lib/offline-visits.ts`
- `components/offline-visit-sync-provider.tsx`
- `components/offline-sync-status.tsx`

IndexedDB:

```text
DB: retailos-lite-offline
Store: visitSubmissions
```

Queued record:

- offline id/client visit id
- payload
- one photo
- status
- attempt count
- last error
- timestamps

Outlet resolution:

- Offline records do not create canonical outlets on-device.
- The browser stores the typed outlet name, captured GPS, optional selected outlet id, and `forceNewOutlet: false`.
- When sync resumes, `/api/visits` reruns server-side outlet resolution against the latest master data.
- Strong matches auto-link existing outlets; ambiguous or unknown shops enter supervisor review.

## Sync Order

```text
If online:
  POST /api/visits
  POST /api/visits/:id/images/presign
  PUT signed object URL
  POST /api/visits/:id/images/complete
  POST /api/visits/:id/submit
  delete offline queue item
```

If any step fails:

- Retryable errors keep item for retry.
- Failed items retain `lastError`.
- User can retry later.

Retryable:

- network errors
- `408`
- `429`
- `5xx`

Non-retryable:

- validation errors
- authorization errors
- bad payloads

## Idempotency

`clientVisitId` prevents duplicate visit creation during retry.

If a visit already exists for the same rep and client id:

- `POST /api/visits` returns existing visit.
- Upload step checks existing image hashes.
- Submit step is idempotent if status is no longer `PENDING`.

## Production Notes

- Direct-to-bucket signed uploads are implemented for S3/MinIO mode; local multipart upload remains as a dev fallback.
- Multi-image offline sync is intentionally out of scope.
- Image compression/thumbnail generation should be added before real deployment.
- IndexedDB data is not secure storage; do not store secrets there.
