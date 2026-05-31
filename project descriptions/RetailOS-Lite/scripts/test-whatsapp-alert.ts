import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendOutletApprovalAlert } from "../lib/whatsapp-alerts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(rootDir, ".env") });

async function main() {
  const result = await sendOutletApprovalAlert({
    storeName: "Test Store Dhaka",
    repName: "Ayesha Rahman",
    alertType: "new_outlet",
  });

  if (result.ok) {
    console.log("WhatsApp alert sent:", result.messageSid);
    return;
  }

  console.error("WhatsApp alert failed:", result.error);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
