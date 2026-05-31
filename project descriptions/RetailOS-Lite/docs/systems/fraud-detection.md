# Fraud Detection

## Purpose

Fraud detection identifies suspicious visit submissions while avoiding overzealous false positives. The sprint implementation prioritizes signals that are explainable and cheap to compute.

## Execution Point

Fraud runs inside the worker during `analyze_visit`, before AI service analysis:

```mermaid
flowchart TD
  Visit[Visit with image, GPS, timestamp]
  Hash[SHA-256 exact hash]
  PHash[Perceptual dHash]
  GPS[Outlet vs check-in GPS]
  Time[Client/server timestamp]
  EXIF[EXIF GPS and capture time]
  Signals[FraudSignal rows]
  Metadata[VisitImage metadata]
  Risk[Dashboard risk status]

  Visit --> Hash --> Signals
  Visit --> PHash --> Signals
  Visit --> GPS --> Signals
  Visit --> Time --> Signals
  Visit --> EXIF --> Signals
  Hash --> Metadata
  PHash --> Metadata
  EXIF --> Metadata
  Signals --> Risk
```

```text
Worker analyze_visit
  -> runContextualFraudChecks
  -> save fraud metadata on VisitImage
  -> persist actionable FraudSignal rows
```

Code: `worker/src/services/fraud.ts`

## Signals

| Signal | Severity | Purpose |
| --- | --- | --- |
| `DUPLICATE_IMAGE` | `HIGH` | Exact same image hash was used in another visit |
| `PERCEPTUAL_DUPLICATE_IMAGE` | `MEDIUM` or `HIGH` | Visually near-duplicate image using perceptual hash |
| `GPS_MISMATCH` | `MEDIUM` or `HIGH` | Check-in GPS too far from outlet coordinates |
| `TIMESTAMP_ANOMALY` | `MEDIUM` or `HIGH` | Client timestamp future-dated or delayed beyond threshold |
| `EXIF_GPS_MISMATCH` | `MEDIUM` or `HIGH` | Embedded image GPS conflicts with check-in/outlet GPS |
| `EXIF_TIMESTAMP_ANOMALY` | `MEDIUM` or `HIGH` | Embedded capture time conflicts with visit timestamp |
| `IMAGE_HASHED` | informational | Metadata record, not shown as fraud |

`IMAGE_HASHED` is intentionally filtered out of dashboards and risk calculations.

## Exact Duplicate Detection

Input:

- image bytes
- existing `VisitImage.imageHash`

Process:

- Compute SHA-256 when missing.
- Store hash on `VisitImage`.
- Query other images with same hash.
- Emit `DUPLICATE_IMAGE` if found.

This is the strongest fraud signal and is marked `HIGH`.

## Perceptual Duplicate Detection

Input:

- image bytes
- image metadata
- existing perceptual hashes

Process:

- Generate `dhash-8x8`.
- Store under image metadata.
- Compare Hamming distance against previous image hashes.

Severity:

| Hamming distance | Severity |
| ---: | --- |
| `0-4` | `HIGH` |
| `5-8` | `MEDIUM` |

Purpose:

- Detect reused screenshots or lightly transformed images.
- Avoid relying only on exact file hashes.

## GPS Mismatch

Input:

- `Visit.checkInLat`
- `Visit.checkInLng`
- `Outlet.latitude`
- `Outlet.longitude`

Default threshold:

```env
FRAUD_GPS_THRESHOLD_METERS=200
```

Severity is based on distance over threshold.

## Timestamp Anomaly

Input:

- `Visit.clientTimestamp`
- server-created timestamp

Default threshold:

```env
FRAUD_TIMESTAMP_DELAY_HOURS=6
```

Flags:

- future-dated client timestamp
- large delay between client timestamp and server creation

## EXIF Analysis

EXIF fraud runs worker-side because it needs the stored image file/buffer and should not block upload.

Signals:

- `EXIF_GPS_MISMATCH`
- `EXIF_TIMESTAMP_ANOMALY`

Thresholds:

```env
FRAUD_EXIF_GPS_THRESHOLD_METERS=300
FRAUD_EXIF_TIMESTAMP_DRIFT_HOURS=24
```

Notes:

- Many mobile/browser uploads strip EXIF.
- Missing EXIF is not considered fraud.
- EXIF is used as corroborating evidence, not a required proof.

## Risk Status

Dashboard risk is derived in `lib/visits.ts`:

| Condition | Risk |
| --- | --- |
| High fraud or compliance below `50` | `HIGH_RISK` |
| Any actionable fraud, missing POSM, flagged status, or compliance below `70` | `REVIEW_NEEDED` |
| Otherwise | `SAFE` |

Visit final status is set by the worker:

- `FLAGGED` for high fraud or critical compliance.
- `COMPLETE` otherwise.

## Deliberately Skipped

Blur detection is not implemented.

Reason:

- Low-end phones and small movement can produce blur.
- A naive Laplacian threshold would create noisy false positives.
- For the demo, duplicate/image reuse, GPS, timestamp, and EXIF provide cleaner explainability.

## Production Notes

- Add fraud severity rollup if supervisors need one badge.
- Add replayable fraud test fixtures.
- Consider device fingerprinting only with explicit privacy review.
- Persist raw signal computation details in `metadata`, not in user-facing text only.
