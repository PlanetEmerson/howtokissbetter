import { createHash } from "node:crypto";

export const GA_ENDPOINT = "https://www.google-analytics.com/mp/collect";

export function clientIdFor(transactionId) {
  const digest = createHash("sha256").update(transactionId, "utf8").digest();
  return `${digest.readUInt32BE(0)}.${digest.readUInt32BE(4)}`;
}

export function validGaEnvironment(env) {
  return Boolean(
    env
    && /^G-[A-Z0-9]+$/.test(env.GA_MEASUREMENT_ID || "")
    && typeof env.GA_API_SECRET === "string"
    && env.GA_API_SECRET.length > 0,
  );
}

export async function postGaEvents(env, fetchImpl, body) {
  const query = new URLSearchParams({
    measurement_id: env.GA_MEASUREMENT_ID,
    api_secret: env.GA_API_SECRET,
  });

  try {
    const response = await fetchImpl(`${GA_ENDPOINT}?${query}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
