import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, "ai_service", ".env") });

const pineconeHost = requiredEnv("PINECONE_HOST").replace(/\/$/, "");
const pineconeApiKey = requiredEnv("PINECONE_API_KEY");
const namespace = process.env.PINECONE_NAMESPACE?.trim() || "retailos-visit-reports";
const execute = process.argv.includes("--execute");

async function main() {
  const payload = { namespace, deleteAll: true };
  if (!execute) {
    console.log(
      JSON.stringify({
        event: "pinecone_namespace_clear_dry_run",
        namespace,
        host: pineconeHost,
        executeHint: "rerun with --execute to delete vectors",
      }),
    );
    return;
  }

  const response = await fetch(`${pineconeHost}/vectors/delete`, {
    method: "POST",
    headers: {
      "Api-Key": pineconeApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Pinecone delete failed (${response.status}): ${await response.text()}`);
  }

  console.log(JSON.stringify({ event: "pinecone_namespace_cleared", namespace }));
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
