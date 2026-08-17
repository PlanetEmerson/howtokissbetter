export default function healthHandler(request, response) {
  response.setHeader("cache-control", "no-store");
  if (request.method !== "GET") {
    return response.status(405).json({ ok: false });
  }
  return response.status(200).json({ ok: true, service: "payhip-ga4-bridge" });
}
