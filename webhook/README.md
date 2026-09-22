# howtokissbetter.com functions

Vercel Functions (Node 24, ESM, one dependency) behind howtokissbetter.com's
payment rail: Stripe Checkout for the book and the Kiss Test report, payment
verification and delivery, the Stripe webhook that reports purchases to GA4,
plus the older Payhip bridge. Nothing is stored server side; Stripe holds the
order and the Vercel Blob store holds the book files.

Layout: `api/*.js` are thin adapters (Web `Request` in, `Response` out),
`src/*.js` holds the logic as factories that take `{ env, fetchImpl }` so tests
run with no network.

## Routes

### `POST /api/checkout`

Plain HTML form post (`application/x-www-form-urlencoded`, 4 KiB cap). The
`Origin` header must be an allowlisted origin; with no `Origin`, the `Referer`
must start with one. Otherwise `403 {"ok":false,"error":"bad_origin"}`.

| Field | Rule | Notes |
|---|---|---|
| `product` | `book` or `report` | required |
| `src` | `^[a-z0-9-]{0,100}$` | post slug; empty means `direct` |
| `placement` | `^[a-z0-9-]{0,40}$` | optional; omitted from metadata when empty |
| `entry` | `^[a-z0-9-]{0,20}$` | optional; omitted from metadata when empty |
| `cancel` | site path: starts with one `/`, no `//`, `\` or `#`, max 200 chars | default `/` |
| `ga_cid` | `^\d{1,12}\.\d{1,12}$` | optional, from `gtag('get', ..., 'client_id')` |
| `ga_sid` | `^\d{1,16}$` | optional, from `gtag('get', ..., 'session_id')` |
| `answers`, `v` | validated by `src/kiss-score.cjs` | report only |

Outcomes are all redirects (a form cannot consume JSON):

- `303` to the Stripe Checkout URL on success.
- `303 {site}{cancel}?checkout=invalid` for any field that fails validation
  (`&` is used when the cancel path already has a query).
- `303 {site}{cancel}?checkout=unavailable` for `product=report` while
  `src/kiss-score.cjs` is not deployed.
- `303 {site}{cancel}?checkout=failed` when Stripe refuses or times out.
- `500 {"ok":false,"error":"server_config"}` when `STRIPE_SECRET_KEY` is missing.
- `405`, `413` as JSON. `OPTIONS` answers `204`.

The session is created with `mode=payment`, `submit_type=pay`, `locale=auto`,
`customer_creation=if_required`, `excluded_payment_method_types` `klarna`,
`amazon_pay`, `crypto` (card with Apple Pay and Google Pay, Link and Cash App
stay available from the Dashboard settings), one `price_data` line item ($9.99 book with
the cover image, $4.99 report), `success_url={site}{successPath}?session_id={CHECKOUT_SESSION_ID}`
(`/book/thanks/` or `/kiss-test/result/`), `cancel_url={site}{cancel}?checkout=canceled`,
`client_reference_id=hkb_{product}_{src}_{8 hex}`, `metadata` (`kind`
`kiss_ebook`|`kiss_report`, `site=howtokissbetter`, `product`, `src`,
`placement`, `entry`, `ga_cid`, `ga_sid`, `answers`, `v`),
`payment_intent_data` (description, `statement_descriptor_suffix` `KISSBOOK`
or `KISSTEST`, metadata `kind` and `site`), the 18+ submit message, and
per-session `branding_settings` (display name "How to Kiss Better", colours,
rounded, Inter, icon `https://howtokissbetter.com/assets/images/kiss-icon-512.png`).
Never `payment_method_types`, `allow_promotion_codes`, `automatic_tax`,
`expires_at`, `businessId`, or `kind=tour` (the Stripe account is shared with
Blynk Studio, whose handler keys on those).

### `POST /api/verify`

JSON body, sent by the browser as `text/plain` to avoid a preflight (the
server parses the text regardless), 2 KiB cap. CORS headers are returned for
allowlisted origins; any other `Origin` gets `403`. `OPTIONS` answers `204`.

Request, one of:

- `{ "session_id": "cs_live_..." }`: the session is retrieved from Stripe and
  must be `complete`, `paid` (or our own $0 test session: `no_payment_required`,
  `amount_total` 0, `metadata.test` `"1"`), `metadata.site=howtokissbetter`
  and `metadata.kind` `kiss_ebook` or `kiss_report`.
- `{ "token": "kt1...", "answers"?: "..." }`: an unlock token issued earlier;
  no Stripe call. Report tokens accept new `answers` (a retake) for 30 days
  after they were issued. Book tokens never expire.

Response `200 { ok: true, product, token, payload }`:

- book: `payload = { downloads: [{ label: "PDF", url, expires }, { label: "EPUB", url, expires }], thanks_url }`.
  URLs are presigned Blob links valid for one hour and regenerated on every
  call. If presigning fails, `downloads` is `[]` and `downloads_error` is
  `true` (the email still carries the permanent `thanks_url`).
- report: `payload = { report }` from `src/kiss-report.js`.

Errors (`{ ok: false, error }`): `400 bad_request`, `401 bad_token`,
`402 not_paid`, `404 not_found` (unknown session, wrong site or kind),
`409 engine_mismatch`, `500 server_config`, `501 report_unavailable` (report
modules not deployed), `502 stripe_unavailable`.

### `POST /api/stripe-webhook`

Raw body (64 KiB cap) verified against `STRIPE_WEBHOOK_SECRET` with the
`Stripe-Signature` header (`t` and every `v1`, 300 s tolerance). Bad or stale
signature: `400`.

On `checkout.session.completed` or `checkout.session.async_payment_succeeded`
for a settled session with `metadata.site=howtokissbetter` and a `kiss_`
kind, it posts a GA4 `purchase` through the Measurement Protocol
(`client_id` = `metadata.ga_cid` or a hash of the session id, `session_id` =
`metadata.ga_sid`, `transaction_id` = session id, value and currency, params
`product`, `kind`, `article`, `placement`, `entry`, one item
`kiss-book` or `kiss-report`, `timestamp_micros` from `created` when under 72 h)
and, for the book, sends the delivery email through Brevo to the checkout
email with the permanent link `{site}/book/thanks/?session_id=...`. A GA4 or
Brevo failure answers `502` so Stripe retries. Everything else (Blynk
Studio's tour and subscription events, unpaid sessions, other event types)
answers `200 { ok: true, ignored: true }`. No email, name, or IP is logged
or forwarded anywhere except the Brevo send.

Subscribe the endpoint to exactly those two events, with its own signing
secret (never Blynk Studio's).

### `POST /api/kiss-feedback`

Plain HTML form post (`application/x-www-form-urlencoded`, 4 KiB cap) from
the book download page and the paid Kiss Test report, forwarded to the owner
as one plain-text email through Brevo: to `contact@howtokissbetter.com`,
subject `Feedback: {product} · {worth}`, body lines `worth`, `note`,
`quote consent`, `name`, `product`. Nothing is stored, the sender's email
address is never known, and the IP lives only in a per-instance rate map.
The `Origin` and `Referer` rule is the one `/api/checkout` uses.

| Field | Rule |
|---|---|
| `product` | `book` or `report` |
| `back` | `/book/thanks/` or `/kiss-test/result/` |
| `worth` | `yes` or `no` |
| `note` | up to 500 characters, optional |
| `quote_ok` | `1` when the buyer allows a quote; anything else means no |
| `name` | up to 40 characters of `[A-Za-z .'-]`, optional |
| `website` | honeypot; must stay empty |

Outcomes, in the order they are checked:

- `405`, `403 bad_origin`, `413` as JSON. `OPTIONS` answers `204`.
- Honeypot filled: `303 {site}{back}?feedback=sent`, no email.
- Any field invalid: `303 {site}{back}?feedback=invalid`, no email. When
  `back` itself is invalid the redirect lands on `{site}/`.
- More than 5 posts from one IP (`x-forwarded-for`, first hop) in 10
  minutes: `303 {site}{back}?feedback=sent`, no email. The counter is per
  function instance, so a cold start forgets it; a courtesy limit, not a wall.
- Otherwise the email is sent and the answer is `303 {site}{back}?feedback=sent`
  whether or not Brevo accepted it (a refusal is logged as `brevo_send_failed`
  with the provider status and error code only).

### `POST /api/payhip-paid` and `GET /api/health`

The Payhip to GA4 bridge (unchanged; see `src/payhip-ga4.js`) and a fixed
availability check returning `{ ok: true, service: "howtokissbetter-functions" }`.

## Environment variables (Vercel, Production)

| Name | Used by | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | checkout, verify | Stripe secret (or restricted) key; needs Checkout Sessions write and read |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook | Signing secret of this project's own webhook endpoint |
| `KISS_UNLOCK_SECRET` | verify | HMAC key for unlock tokens; `openssl rand -hex 32` |
| `KISS_SITE_ORIGIN` | all | Site origin for success, cancel and thanks URLs; default `https://howtokissbetter.com` |
| `KISS_EXTRA_ORIGINS` | checkout, verify, kiss-feedback | Comma-separated extra allowed origins for QA (for example `http://localhost:8000`); leave unset in production |
| `KISS_BOOK_PDF_PATH` | verify | Blob pathname of the PDF; default `kiss-perfect-now/kiss-perfect-now.pdf` |
| `KISS_BOOK_EPUB_PATH` | verify | Blob pathname of the EPUB; default `kiss-perfect-now/kiss-perfect-now.epub` |
| `BREVO_API_KEY` | stripe-webhook, kiss-feedback | Brevo transactional key (the book delivery email and the feedback email) |
| `BREVO_SENDER_EMAIL` | stripe-webhook, kiss-feedback | Verified sender; default `contact@howtokissbetter.com` |
| `GA_MEASUREMENT_ID` | stripe-webhook, payhip-paid | GA4 measurement id (`G-...`) |
| `GA_API_SECRET` | stripe-webhook, payhip-paid | GA4 Measurement Protocol secret |
| `PAYHIP_SIGNATURE_SHA256` | payhip-paid | Payhip webhook signature |
| `BLOB_READ_WRITE_TOKEN` | verify (via `@vercel/blob`) | Injected by Vercel when the Blob store is connected to the project |
| `VERCEL_OIDC_TOKEN`, `BLOB_STORE_ID` | verify (via `@vercel/blob`) | Alternative credentials the SDK reads when OIDC is used instead of a token |

The allowlisted origins are always `https://howtokissbetter.com` and
`https://www.howtokissbetter.com` plus `KISS_EXTRA_ORIGINS`.

## Book files

Create a private Blob store and connect it to this project, then upload the
two files at the pathnames above with `access: private` (they never enter
the repo). `verify` presigns them with `issueSignedToken` plus `presignUrl`
(`operation: "get"`, one hour), so the 34 MB PDF never streams through a
function.

## Tests

```
cd webhook
npm install
npm test
```

`node --test` runs everything under `test/`. Stripe, GA4, Brevo and Blob are
stubbed through the `fetchImpl` and `presignImpl` parameters; no test touches
the network or needs a secret. `src/kiss-score.cjs` and `src/kiss-report.js`
are supplied by the quiz workstream; the handlers answer `checkout=unavailable`
and `501 report_unavailable` while they are absent.
