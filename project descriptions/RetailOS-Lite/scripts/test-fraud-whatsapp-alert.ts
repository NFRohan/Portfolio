import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendFraudAlert } from "../worker/src/services/whatsappAlerts.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(rootDir, ".env") });

async function main() {
  const result = await sendFraudAlert({
    visitId: "demo-visit-id",
    storeName: "Maa Enterprise",
    repName: "Ayesha Rahman",
    complianceScore: 38,
    complianceStatus: "critical",
    fraudSignals: [
      {
        type: "GPS_MISMATCH",
        message: "Check-in GPS is far from outlet location.",
      },
    ],
  });

  if (result.ok) {
    console.log("Fraud WhatsApp alert sent:", result.messageSid);
    return;
  }

  console.error("Fraud WhatsApp alert failed:", result.error);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
