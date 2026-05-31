import type { FraudSignal } from "../types/domain.js";

export type WhatsAppSendResult = {
  ok: boolean;
  messageSid?: string;
  error?: string;
};

export type SendFraudAlertInput = {
  visitId: string;
  storeName: string;
  repName: string;
  complianceScore: number;
  complianceStatus: string;
  fraudSignals: Array<Pick<FraudSignal, "type" | "message">>;
};

type TwilioWhatsAppConfig = {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  appPublicUrl: string;
};

function env(name: string, fallback = ""): string {
  const raw = process.env[name];
  return raw?.trim() ? raw.trim() : fallback;
}

function isEnabled(): boolean {
  const raw = process.env.TWILIO_WHATSAPP_ENABLED;
  if (raw === undefined || raw.trim() === "") return true;
  return raw.toLowerCase() !== "false" && raw !== "0";
}

function getTwilioWhatsAppConfig(): TwilioWhatsAppConfig | null {
  if (!isEnabled()) return null;

  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
  const to = env("SUPERVISOR_WHATSAPP_TO", "whatsapp:+8801303320518");
  const appPublicUrl = env("APP_PUBLIC_URL", "http://localhost:3000").replace(/\/$/, "");

  if (!accountSid || !authToken || !from || !to) {
    return null;
  }

  return { accountSid, authToken, from, to, appPublicUrl };
}

function formatTwilioError(message: string, code?: number): string {
  if (code === 63038) {
    return `${message} (Twilio trial daily cap reached — wait for the 24h window to reset or upgrade the account.)`;
  }
  if (code === 63015) {
    return `${message} (Recipient has not joined the WhatsApp sandbox — send join code to +1 415 523 8886.)`;
  }
  return code ? `${message} (${code})` : message;
}

function formatFraudAlertBody(input: SendFraudAlertInput, appPublicUrl: string): string {
  const signalLines = input.fraudSignals
    .slice(0, 2)
    .map((signal) => `- ${signal.type}: ${signal.message}`)
    .join("\n");

  return [
    "RetailOS Fraud Alert",
    "",
    `Store: ${input.storeName}`,
    `Submitted by: ${input.repName}`,
    `Score: ${input.complianceScore} (${input.complianceStatus})`,
    "",
    "Detected:",
    signalLines || "- Suspicious activity detected",
    "",
    "Review visit:",
    `${appPublicUrl}/supervisor/visits/${input.visitId}`,
  ].join("\n");
}

async function sendWhatsAppMessage(body: string): Promise<WhatsAppSendResult> {
  const config = getTwilioWhatsAppConfig();
  if (!config) {
    console.info("[whatsapp-alerts] Skipped: Twilio WhatsApp is disabled or not configured.");
    return { ok: false, error: "not_configured" };
  }

  const params = new URLSearchParams({
    To: config.to,
    From: config.from,
    Body: body,
  });

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = (await response.json()) as { sid?: string; message?: string; code?: number };

    if (!response.ok) {
      const error = formatTwilioError(data.message ?? `Twilio HTTP ${response.status}`, data.code);
      console.error("[whatsapp-alerts] Send failed:", error);
      return { ok: false, error };
    }

    return { ok: true, messageSid: data.sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[whatsapp-alerts] Send failed:", message);
    return { ok: false, error: message };
  }
}

export async function sendFraudAlert(input: SendFraudAlertInput): Promise<WhatsAppSendResult> {
  const config = getTwilioWhatsAppConfig();
  if (!config) {
    console.info("[whatsapp-alerts] Skipped: Twilio WhatsApp is disabled or not configured.");
    return { ok: false, error: "not_configured" };
  }

  console.info("[fraud-whatsapp-alerts] Attempting WhatsApp alert", {
    visitId: input.visitId,
    storeName: input.storeName,
    repName: input.repName,
    fraudSignalCount: input.fraudSignals.length,
    to: config.to,
  });

  return sendWhatsAppMessage(formatFraudAlertBody(input, config.appPublicUrl));
}

export function queueFraudWhatsAppAlert(input: SendFraudAlertInput): void {
  void sendFraudAlert(input)
    .then((result) => {
      if (result.ok) {
        console.info("[fraud-whatsapp-alerts] Sent:", result.messageSid);
        return;
      }
      console.error("[fraud-whatsapp-alerts] Send failed:", result.error ?? "unknown error");
    })
    .catch((error) => {
      console.error("[fraud-whatsapp-alerts] Failed:", error);
    });
}
