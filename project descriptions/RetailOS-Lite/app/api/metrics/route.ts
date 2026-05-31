import { metrics } from "@/lib/observability/metrics";

export async function GET() {
  return new Response(await metrics.registry.metrics(), {
    headers: {
      "Content-Type": metrics.registry.contentType,
    },
  });
}
