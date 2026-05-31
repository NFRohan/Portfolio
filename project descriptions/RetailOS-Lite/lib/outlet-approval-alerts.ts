import { prisma } from "@/lib/prisma";
import {
  sendOutletApprovalAlert,
  type OutletApprovalAlertType,
} from "@/lib/whatsapp-alerts";

type SubmissionStatus = "NEW_OUTLET" | "PENDING_REVIEW";

export type NotifyOutletApprovalInput = {
  repId: string;
  storeName: string;
  submissionStatus?: SubmissionStatus;
};

function resolveAlertType(submissionStatus?: SubmissionStatus): OutletApprovalAlertType {
  if (submissionStatus === "PENDING_REVIEW") return "pending_review";
  return "new_outlet";
}

export async function notifyOutletApprovalNeeded(input: NotifyOutletApprovalInput): Promise<void> {
  console.info("[outlet-approval-alerts] Attempting WhatsApp alert", {
    storeName: input.storeName,
    repId: input.repId,
    submissionStatus: input.submissionStatus ?? "new_outlet",
  });

  const rep = await prisma.user.findUnique({
    where: { id: input.repId },
    select: { name: true },
  });

  const repName = rep?.name ?? "Unknown rep";
  const result = await sendOutletApprovalAlert({
    storeName: input.storeName,
    repName,
    alertType: resolveAlertType(input.submissionStatus),
  });

  if (result.ok) {
    console.info("[outlet-approval-alerts] WhatsApp sent:", result.messageSid);
    return;
  }

  console.error("[outlet-approval-alerts] WhatsApp send failed:", result.error ?? "unknown error");
}
