import { createPayhipHandler } from "../src/payhip-ga4.js";

async function requestBodyText(request) {
  if (typeof request.body === "string") {
    return request.body;
  }
  if (Buffer.isBuffer(request.body)) {
    return request.body.toString("utf8");
  }
  if (request.body && typeof request.body === "object") {
    return JSON.stringify(request.body);
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function payhipPaidHandler(request, response) {
  response.setHeader("cache-control", "no-store");
  if (request.method !== "POST") {
    return response.status(405).json({ ok: false });
  }

  const bodyText = await requestBodyText(request);
  const handler = createPayhipHandler({
    env: {
      GA_API_SECRET: process.env.GA_API_SECRET,
      GA_MEASUREMENT_ID: process.env.GA_MEASUREMENT_ID,
      PAYHIP_SIGNATURE_SHA256: process.env.PAYHIP_SIGNATURE_SHA256,
    },
  });
  const result = await handler({
    method: request.method,
    bodyText,
    contentLength: request.headers?.["content-length"],
  });

  return response.status(result.status).json(result.body);
}
