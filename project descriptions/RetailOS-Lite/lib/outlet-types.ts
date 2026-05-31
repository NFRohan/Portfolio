export const OUTLET_VERIFICATION_STATUSES = ["VERIFIED", "UNVERIFIED", "REJECTED"] as const;

export type OutletVerificationStatus = (typeof OUTLET_VERIFICATION_STATUSES)[number];

export function parseOutletVerificationStatus(value: unknown): OutletVerificationStatus | null {
  if (typeof value === "string" && OUTLET_VERIFICATION_STATUSES.some((status) => status === value)) {
    return value as OutletVerificationStatus;
  }
  return null;
}
