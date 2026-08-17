# Payhip Paid-Sale to GA4 Bridge Design

## Goal

Reliably record charged Payhip orders as GA4 `purchase` events without changing the storefront, checkout provider, price, payment settings, or existing browser funnel analytics.

## Chosen architecture

Deploy one dependency-free Node.js Vercel Function under the existing `planetemersons-projects` Pro team. Payhip sends only its `paid` webhook to the function. The function verifies Payhip's documented signature, validates a small allowlist of sale fields, constructs a privacy-minimized GA4 Measurement Protocol purchase, and forwards it to the existing GA4 web stream.

This uses an already-paid commercial Vercel team and adds no subscription, paid service, storage, database, scheduled task, or custom domain. Expected traffic is one invocation per charged sale, far below included usage.

## Endpoints

### `GET /api/health`

Returns `200` with `{"ok":true,"service":"payhip-ga4-bridge"}`. It exposes no configuration or account state.

### `POST /api/payhip-paid`

1. Reject request bodies over 64 KiB.
2. Parse JSON without logging the body.
3. Require `type: "paid"`, a non-empty transaction `id`, a three-letter currency, a positive integer `price` in cents, at least one item, and a 64-character hexadecimal signature.
4. Compare the supplied signature with `PAYHIP_SIGNATURE_SHA256` using a timing-safe comparison. The environment variable stores only the SHA-256 signature value, not the Payhip API key.
5. Build a GA4 purchase event containing only:
   - transaction ID
   - price converted from cents
   - currency
   - product ID/key/name
   - quantity
6. Derive a synthetic GA `client_id` from the transaction ID. This records revenue reliably but does not claim browser-session attribution that Payhip cannot supply.
7. Send the event to GA4 Measurement Protocol with `GA_MEASUREMENT_ID` and `GA_API_SECRET` held in Vercel Production environment variables.
8. Return `200` only when GA4 accepts the request. Return non-2xx for invalid or failed deliveries so Payhip performs its documented retries.

## Privacy and security boundary

- Never forward or retain buyer email, name, IP address, payment type, fees, consent flags, or raw webhook JSON.
- Never log request bodies, environment variables, transaction payloads, or GA request URLs.
- Do not enable Vercel source-log statements in application code.
- Use exact path and method checks; all other routes return `404` or `405`.
- Use GA transaction IDs for GA-side purchase deduplication when Payhip retries.
- Configure only the Payhip `paid` event. Free checkouts and refunds remain outside this bridge.

## Failure behavior

- Missing or invalid signature: `401`.
- Malformed JSON or invalid sale fields: `400`.
- Oversized body: `413`.
- GA4 network/non-2xx response: `502`.
- Valid GA4 response: `200` with a generic acknowledgement.

Responses contain no sale details.

## Verification

Automated tests use Node's built-in test runner and a local fetch double at the external GA boundary. They cover health, method/route rejection, body limits, malformed payloads, signature rejection, privacy stripping, exact currency/value conversion, item mapping, deterministic client IDs, and GA failure propagation.

Production verification uses the health endpoint and an invalid-signature request, which proves reachability and rejection without creating a fake purchase. The first real paid sale is the only valid end-to-end production proof and should be reconciled against Payhip and GA4 on the next operator run.

## Human-gated account actions

- Accept GA4 Measurement Protocol terms and create one API secret.
- Save three Production environment variables in Vercel.
- Save one Payhip webhook URL with only `paid` selected.

The account actions occur only after local tests, repository integration, and endpoint deployment are ready.
