import { guarded, jsonResponse, plainRequest } from "../src/http.js";
import { createKissEmailHandler } from "../src/kiss-email.js";

const MAX_BODY_BYTES = 2_048;
// One handler per instance so the rate map outlives a single request.
const handler = createKissEmailHandler({ env: process.env });

async function handle(request) {
  return guarded(
    async () => handler(await plainRequest(request, MAX_BODY_BYTES)),
    () => jsonResponse(500, { ok: false, error: "internal_error" }),
  );
}

export { handle as POST, handle as OPTIONS };
