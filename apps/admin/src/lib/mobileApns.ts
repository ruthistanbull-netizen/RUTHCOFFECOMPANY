import { createPrivateKey, sign } from "node:crypto";
import { connect, constants } from "node:http2";

export type MobilePushDevice = {
  id: string;
  device_token: string;
  apns_environment: "sandbox" | "production";
  bundle_id: string;
};

export class APNsError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "APNsError";
  }
}

export function mobileAPNsConfigured(): boolean {
  return Boolean(
    process.env.RR_HUB_APNS_TEAM_ID?.trim()
      && process.env.RR_HUB_APNS_KEY_ID?.trim()
      && process.env.RR_HUB_APNS_PRIVATE_KEY?.trim()
      && process.env.RR_HUB_APNS_BUNDLE_ID?.trim(),
  );
}

export function mobileDevicesFrom(value: unknown): MobilePushDevice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const token = typeof row.device_token === "string" ? row.device_token : "";
    const id = typeof row.id === "string" ? row.id : "";
    const bundle = typeof row.bundle_id === "string" ? row.bundle_id : "";
    const environment = row.apns_environment;
    if (!id || !/^[0-9a-f]{48,256}$/.test(token)
      || !bundle || (environment !== "sandbox" && environment !== "production")) return [];
    return [{ id, device_token: token, bundle_id: bundle, apns_environment: environment }];
  });
}

function jwt() {
  const team = process.env.RR_HUB_APNS_TEAM_ID!.trim();
  const keyID = process.env.RR_HUB_APNS_KEY_ID!.trim();
  let pem = process.env.RR_HUB_APNS_PRIVATE_KEY!.trim();
  // Accept a PEM with literal \n environment variable escaping.
  if (pem.includes("\\n")) pem = pem.replace(/\\n/g, "\n");
  const privateKey = createPrivateKey({ key: pem, format: "pem" });
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = part({ alg: "ES256", kid: keyID });
  const claims = part({ iss: team, iat: Math.floor(Date.now() / 1000) });
  const unsigned = head + "." + claims;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return unsigned + "." + signature;
}

export async function sendNativeAPNs(
  device: MobilePushDevice,
  message: { title: string; body: string; url: string; kind: string; brand: string },
): Promise<void> {
  if (!mobileAPNsConfigured()) throw new APNsError(0, "APNs credentials are not configured.");
  const expectedBundle = process.env.RR_HUB_APNS_BUNDLE_ID!.trim();
  if (device.bundle_id !== expectedBundle) throw new APNsError(400, "APNs topic mismatch.");
  const provider = device.apns_environment === "sandbox"
    ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  const payload = JSON.stringify({
    aps: {
      alert: { title: message.title.slice(0, 140), body: message.body.slice(0, 240) },
      sound: "default",
      "thread-id": "RRHub." + message.brand,
    },
    brand: message.brand,
    kind: message.kind,
    route: message.url.startsWith("/") ? message.url : "/notifications",
  });
  const token = jwt();
  return new Promise<void>((resolve, reject) => {
    const session = connect(provider);
    let resolved = false;
    let responseCode = 0;
    const parts: Buffer[] = [];
    const cleanup = (failure?: Error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      session.destroy();
      if (failure) reject(failure);
      else resolve();
    };
    const timer = setTimeout(() => cleanup(new APNsError(0, "Apple APNs timeout.")), 8_000);
    session.on("error", (error) => cleanup(error));
    try {
      const request = session.request({
        [constants.HTTP2_HEADER_METHOD]: "POST",
        [constants.HTTP2_HEADER_PATH]: "/3/device/" + device.device_token,
        authorization: "bearer " + token,
        "apns-topic": device.bundle_id,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
        "content-type": "application/json",
      });
      request.on("response", (headers) => {
        responseCode = Number(headers[constants.HTTP2_HEADER_STATUS] ?? 0);
      });
      request.on("data", (chunk: Buffer) => {
        if (parts.reduce((length, item) => length + item.length, 0) < 2_000) {
          parts.push(Buffer.from(chunk));
        }
      });
      request.on("error", (error) => cleanup(error));
      request.on("end", () => {
        if (responseCode === 200) return cleanup();
        const messageText = Buffer.concat(parts).toString("utf8").slice(0, 500);
        cleanup(new APNsError(responseCode, messageText || "Apple APNs rejected request."));
      });
      request.end(payload);
    } catch (error) {
      cleanup(error instanceof Error ? error : new APNsError(0, "APNs send failed."));
    }
  });
}
