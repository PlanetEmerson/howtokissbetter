import { guarded, jsonResponse, plainRequest } from "../src/http.js";
import { createStripeWebhookHandler } from "../src/stripe-webhook.js";

const MAX_BODY_BYTES = 65_536;

export async function POST(request) {
  return guarded(
    async () => createStripeWebhookHandler({ env: process.env })(await plainRequest(request, MAX_BODY_BYTES)),
    () => jsonResponse(500, { ok: false, error: "internal_error" }),
  );
}
