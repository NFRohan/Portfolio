import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const aiServiceUrl = trimTrailingSlash(process.env.AI_SERVICE_URL || "http://127.0.0.1:8001");
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [
  { protocol: "http", hostname: "127.0.0.1", port: "8001" },
  { protocol: "http", hostname: "localhost", port: "8001" },
  { protocol: "http", hostname: "127.0.0.1", port: "9000" },
  { protocol: "http", hostname: "localhost", port: "9000" },
];

addRemotePattern(aiServiceUrl);
addRemotePattern(process.env.IMAGE_STORAGE_PUBLIC_BASE_URL);
addRemotePattern(process.env.S3_ENDPOINT);

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns,
  },
  async rewrites() {
    return [
      {
        source: "/artifacts/:path*",
        destination: `${aiServiceUrl}/artifacts/:path*`,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});

function addRemotePattern(rawUrl: string | undefined): void {
  if (!rawUrl) return;
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol.replace(":", "");
    if (protocol !== "http" && protocol !== "https") return;
    const candidate = {
      protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
    } as const;
    const exists = remotePatterns.some(
      (pattern) =>
        pattern.protocol === candidate.protocol &&
        pattern.hostname === candidate.hostname &&
        pattern.port === candidate.port,
    );
    if (!exists) remotePatterns.push(candidate);
  } catch {
    // Invalid URLs are ignored here; runtime config validation owns hard failures.
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}
