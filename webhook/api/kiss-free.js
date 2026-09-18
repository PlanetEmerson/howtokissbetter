import { guarded, jsonResponse, plainRequest } from "../src/http.js";
import { createKissFreeHandler } from "../src/kiss-free.js";

const MAX_BODY_BYTES = 2_048;

async function handle(request) {
  return guarded(
    async () => createKissFreeHandler({ env: process.env })(await plainRequest(request, MAX_BODY_BYTES)),
    () => jsonResponse(500, { ok: false, error: "internal_error" }),
  );
}

export { handle as POST, handle as OPTIONS };
