import { createHmac, timingSafeEqual } from "node:crypto";

// branding_settings needs 2025-09-30.clover or later; this is the newest GA version.
export const STRIPE_API_VERSION = "2026-08-26.dahlia";
const STRIPE_API = "https://api.stripe.com/v1";
const HEX_SHA256 = /^[a-f0-9]{64}$/i;

export class StripeError extends Error {
  constructor(status, code) {
    super(`Stripe request failed: ${status} ${code}`);
    this.name = "StripeError";
    this.status = status;
    this.code = code;
  }
}

export function encodeForm(params) {
  const pairs = [];
  const walk = (value, key) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${key}[${index}]`));
    } else if (typeof value === "object") {
      for (const [name, item] of Object.entries(value)) {
        walk(item, key ? `${key}[${name}]` : name);
      }
    } else {
      pairs.push([key, String(value)]);
    }
  };
  walk(params, "");
  return new URLSearchParams(pairs).toString();
}

export async function stripeRequest({ env, fetchImpl = fetch }, method, path, params) {
  const encoded = params ? encodeForm(params) : "";
  const url = method === "GET" && encoded ? `${STRIPE_API}${path}?${encoded}` : `${STRIPE_API}${path}`;

  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": STRIPE_API_VERSION,
      },
      body: method === "GET" ? undefined : encoded,
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new StripeError(0, "network_error");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new StripeError(response.status, payload?.error?.code || payload?.error?.type || "unknown");
  }
  if (!payload || typeof payload !== "object") {
    throw new StripeError(response.status, "bad_response");
  }
  return payload;
}

export function verifyStripeSignature(header, rawBody, secret, nowSeconds, toleranceSeconds = 300) {
  if (typeof header !== "string" || typeof rawBody !== "string" || typeof secret !== "string" || !secret) {
    return false;
  }

  let timestamp = null;
  const signatures = [];
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") {
      timestamp = value;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }
  if (timestamp === null || !/^\d{1,16}$/.test(timestamp) || signatures.length === 0) {
    return false;
  }
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  return signatures.some(
    (signature) => HEX_SHA256.test(signature) && timingSafeEqual(Buffer.from(signature, "hex"), expected),
  );
}

// A $0 session only counts when we marked it as a test ourselves.
export function sessionSettled(session) {
  if (session?.payment_status === "paid") {
    return true;
  }
  return (
    session?.payment_status === "no_payment_required"
    && session.amount_total === 0
    && session.metadata?.test === "1"
  );
}
