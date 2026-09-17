import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "kt1";
const MAX_TOKEN_LENGTH = 2_048;
const ANSWERS = /^[a-z]{1,64}$/;

export const SESSION_ID_PATTERN = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;
// The copy promises "your unlock lasts 30 days on this device"; the receipt
// link (session_id) re-issues a token after that. Book tokens never expire.
export const REPORT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function signature(secret, encodedPayload) {
  return createHmac("sha256", secret).update(`${PREFIX}.${encodedPayload}`).digest();
}

export function signToken(secret, payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${PREFIX}.${encoded}.${signature(secret, encoded).toString("base64url")}`;
}

function validVersion(value) {
  return (Number.isInteger(value) && value >= 0) || (typeof value === "string" && /^\d{1,9}$/.test(value));
}

function cleanPayload(payload, nowSeconds) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const { s, p, t, a, v } = payload;
  if (typeof s !== "string" || !SESSION_ID_PATTERN.test(s)) {
    return null;
  }
  if (p !== "book" && p !== "report") {
    return null;
  }
  if (!Number.isInteger(t) || t <= 0) {
    return null;
  }
  if (p === "book") {
    return { s, p, t };
  }
  if (typeof a !== "string" || !ANSWERS.test(a) || !validVersion(v)) {
    return null;
  }
  if (nowSeconds - t > REPORT_TOKEN_TTL_SECONDS) {
    return null;
  }
  return { s, p, t, a, v };
}

export function verifyToken(secret, token, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== "string" || !secret || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return null;
  }
  const [, encoded, provided] = parts;
  const actual = Buffer.from(provided, "base64url");
  const expected = signature(secret, encoded);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  return cleanPayload(payload, nowSeconds);
}
