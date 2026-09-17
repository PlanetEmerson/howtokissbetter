import { createCheckoutHandler } from "../src/checkout.js";
import { guarded, plainRequest, redirect, siteOrigin } from "../src/http.js";

const MAX_BODY_BYTES = 4_096;

async function handle(request) {
  return guarded(
    async () => createCheckoutHandler({ env: process.env })(await plainRequest(request, MAX_BODY_BYTES)),
    () => redirect(`${siteOrigin(process.env)}/book/?checkout=failed`),
  );
}

export { handle as POST, handle as OPTIONS };
