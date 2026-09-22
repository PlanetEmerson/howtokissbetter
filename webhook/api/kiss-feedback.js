import { guarded, jsonResponse, plainRequest } from "../src/http.js";
import { createKissFeedbackHandler } from "../src/kiss-feedback.js";

// 500 characters of a three-byte script percent-encode to about 4.5 KB.
const MAX_BODY_BYTES = 8_192;
// One handler per instance so the rate map outlives a single request.
const handler = createKissFeedbackHandler({ env: process.env });

async function handle(request) {
  return guarded(
    async () => handler(await plainRequest(request, MAX_BODY_BYTES)),
    () => jsonResponse(500, { ok: false, error: "internal_error" }),
  );
}

export { handle as POST, handle as OPTIONS };
