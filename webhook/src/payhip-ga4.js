import { createHash, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 65_536;
const MAX_ITEMS = 50;
const GA_ENDPOINT = "https://www.google-analytics.com/mp/collect";

class SaleValidationError extends Error {
  constructor(status) {
    super("Invalid Payhip sale");
    this.status = status;
  }
}

function isHexSignature(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function signatureMatches(actual, expected) {
  if (!isHexSignature(actual) || !isHexSignature(expected)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function requiredText(value, maxLength = 200) {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!text || text.length > maxLength) {
    throw new SaleValidationError(400);
  }
  return text;
}

function normalizeItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new SaleValidationError(400);
  }

  const quantity = Number(item.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000) {
    throw new SaleValidationError(400);
  }

  return {
    item_id: requiredText(item.product_id ?? item.product_key, 128),
    item_name: requiredText(item.product_name, 200),
    quantity,
  };
}

export function validatePayhipSale(payload, expectedSignature) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SaleValidationError(400);
  }
  if (!signatureMatches(payload.signature, expectedSignature)) {
    throw new SaleValidationError(401);
  }
  if (payload.type !== "paid") {
    throw new SaleValidationError(400);
  }

  const price = Number(payload.price);
  const date = Number(payload.date);
  const currency = typeof payload.currency === "string" ? payload.currency.trim().toUpperCase() : "";
  if (!Number.isInteger(price) || price <= 0 || !Number.isInteger(date) || date <= 0) {
    throw new SaleValidationError(400);
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new SaleValidationError(400);
  }
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > MAX_ITEMS) {
    throw new SaleValidationError(400);
  }

  return {
    id: requiredText(payload.id, 128),
    currency,
    price,
    date,
    items: payload.items.map(normalizeItem),
  };
}

function clientIdFor(transactionId) {
  const digest = createHash("sha256").update(transactionId, "utf8").digest();
  return `${digest.readUInt32BE(0)}.${digest.readUInt32BE(4)}`;
}

export function buildGaPurchase(sale) {
  return {
    client_id: clientIdFor(sale.id),
    timestamp_micros: sale.date * 1_000_000,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: sale.id,
          value: sale.price / 100,
          currency: sale.currency,
          engagement_time_msec: 1,
          items: sale.items,
        },
      },
    ],
  };
}

function validEnvironment(env) {
  return (
    env
    && /^G-[A-Z0-9]+$/.test(env.GA_MEASUREMENT_ID || "")
    && typeof env.GA_API_SECRET === "string"
    && env.GA_API_SECRET.length > 0
    && isHexSignature(env.PAYHIP_SIGNATURE_SHA256)
  );
}

export function createPayhipHandler({ env, fetchImpl = fetch }) {
  return async function handlePayhipRequest(request) {
    if (request.method !== "POST") {
      return { status: 405, body: { ok: false } };
    }
    if (!validEnvironment(env)) {
      return { status: 500, body: { ok: false } };
    }

    const bodyText = typeof request.bodyText === "string" ? request.bodyText : "";
    const statedLength = Number(request.contentLength || 0);
    if (statedLength > MAX_BODY_BYTES || Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
      return { status: 413, body: { ok: false } };
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return { status: 400, body: { ok: false } };
    }

    let sale;
    try {
      sale = validatePayhipSale(payload, env.PAYHIP_SIGNATURE_SHA256);
    } catch (error) {
      const status = error instanceof SaleValidationError ? error.status : 400;
      return { status, body: { ok: false } };
    }

    const query = new URLSearchParams({
      measurement_id: env.GA_MEASUREMENT_ID,
      api_secret: env.GA_API_SECRET,
    });

    try {
      const response = await fetchImpl(`${GA_ENDPOINT}?${query}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildGaPurchase(sale)),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        return { status: 502, body: { ok: false } };
      }
    } catch {
      return { status: 502, body: { ok: false } };
    }

    return { status: 200, body: { ok: true } };
  };
}
