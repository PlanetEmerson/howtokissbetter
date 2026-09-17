import { guarded, jsonResponse, plainRequest } from "../src/http.js";
import { createVerifyHandler } from "../src/verify.js";

const MAX_BODY_BYTES = 2_048;

async function handle(request) {
  return guarded(
    async () => createVerifyHandler({ env: process.env })(await plainRequest(request, MAX_BODY_BYTES)),
    () => jsonResponse(500, { ok: false, error: "internal_error" }),
  );
}

export { handle as POST, handle as OPTIONS };
