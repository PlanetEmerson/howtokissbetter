# Payhip Paid-Sale to GA4 Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a privacy-minimized signed Payhip `paid` webhook that records charged orders as GA4 purchases.

**Architecture:** A dependency-free Node.js Vercel Function validates Payhip JSON and signature data, maps an allowlisted sale shape to GA4 Measurement Protocol, and returns retryable failures. A separate health function exposes only service availability.

**Tech Stack:** Node.js 24, ECMAScript modules, Node built-in test runner, Vercel Functions, GA4 Measurement Protocol.

## Global Constraints

- Do not change payment settings, product price, checkout provider, or storefront analytics.
- Do not spend money or add a paid service.
- Do not log, store, or forward buyer email, name, IP address, or raw webhook payloads.
- Keep all credentials in Vercel Production environment variables and out of git, command output, screenshots, and chat.
- Configure only Payhip's `paid` webhook event.
- Produce one coherent final commit and integrate through local `main`.

---

### Task 1: Webhook contract and privacy mapper

**Files:**
- Create: `webhook/package.json`
- Create: `webhook/src/payhip-ga4.js`
- Create: `webhook/test/payhip-ga4.test.js`

**Interfaces:**
- Produces: `validatePayhipSale(payload, expectedSignature)`, `buildGaPurchase(payload)`, `createPayhipHandler({ env, fetchImpl })`.

- [ ] **Step 1: Write failing behavior tests**

Create table-driven tests with hand-written expected responses for malformed JSON, wrong event type, non-positive price, missing items, and wrong signature. Add a valid payload containing buyer email/IP and assert the outgoing GA JSON contains only the approved transaction, value, currency, product, and quantity fields.

- [ ] **Step 2: Verify RED**

Run `cd webhook && node --test` and confirm failure because `src/payhip-ga4.js` does not exist.

- [ ] **Step 3: Implement the minimal mapper and handler**

Use `node:crypto` timing-safe comparison, a 64 KiB limit, integer-cent validation, a deterministic hashed `client_id`, and an injected `fetchImpl`. Send GA JSON shaped as:

```json
{
  "client_id": "<deterministic pseudonymous id>",
  "timestamp_micros": "<Payhip date in microseconds>",
  "events": [{
    "name": "purchase",
    "params": {
      "transaction_id": "<Payhip id>",
      "value": 4.95,
      "currency": "USD",
      "engagement_time_msec": 1,
      "items": [{"item_id":"<id>","item_name":"<name>","quantity":1}]
    }
  }]
}
```

- [ ] **Step 4: Verify GREEN and mutation boundaries**

Run `cd webhook && node --test`. Confirm tests fail if signature verification, cent conversion, privacy stripping, or GA failure propagation is removed.

### Task 2: Vercel route adapters

**Files:**
- Create: `webhook/api/health.js`
- Create: `webhook/api/payhip-paid.js`
- Create: `webhook/test/routes.test.js`
- Create: `webhook/vercel.json`
- Create: `webhook/.gitignore`

**Interfaces:**
- Consumes: `createPayhipHandler`.
- Produces: deployable `/api/health` and `/api/payhip-paid` functions.

- [ ] **Step 1: Write failing adapter tests**

Assert `GET /api/health` returns the fixed public health JSON and that the webhook adapter delegates a request without reading or logging sensitive fields.

- [ ] **Step 2: Verify RED**

Run `cd webhook && node --test` and confirm route imports fail because the adapters do not exist.

- [ ] **Step 3: Implement minimal adapters and deployment config**

Export Vercel request handlers, use Node.js 24, disable framework/build assumptions, and ignore `.vercel`, `.env*`, coverage, and local artifacts.

- [ ] **Step 4: Verify GREEN**

Run `cd webhook && npm test` and `vercel build --scope planetemersons-projects` from `webhook/` after the project is linked.

### Task 3: Repository validation and production deployment

**Files:**
- Modify only generated Vercel link metadata outside git: `webhook/.vercel/`

**Interfaces:**
- Produces: one production Vercel URL and three Production environment variables.

- [ ] **Step 1: Run local release checks**

Run `python3 scripts/validate_conversion_rebuild.py`, `cd webhook && npm test`, `git diff --check`, and a secret-pattern scan limited to the intentional environment-variable names.

- [ ] **Step 2: Commit and integrate**

Stage only the design, plan, webhook source, tests, and config. Create one coherent commit, fetch `origin`, merge into local `main` with Worktrunk, verify the final diff, and push `main` normally.

- [ ] **Step 3: Link and deploy without new spend**

Create a new project under the existing `planetemersons-projects` Pro team, set `GA_MEASUREMENT_ID`, `GA_API_SECRET`, and `PAYHIP_SIGNATURE_SHA256` only for Production, then deploy the committed artifact to production.

- [ ] **Step 4: Verify non-mutating production paths**

Confirm `/api/health` returns `200`, an invalid-signature webhook returns `401`, Vercel reports the deployment READY, and recent error logs contain no application errors or payload data.

### Task 4: Account wiring and cleanup

**Files:**
- No repository files.

**Interfaces:**
- Consumes: production webhook URL.
- Produces: GA4 Measurement Protocol secret and Payhip paid webhook configuration.

- [ ] **Step 1: Obtain action-time confirmation**

Immediately before credential creation and Payhip save, state that GA4 will create one persistent API secret and Payhip will transmit charged-sale webhook payloads to the new Vercel endpoint.

- [ ] **Step 2: Create and store credentials without exposing values**

Create the GA4 secret, copy it directly to Vercel Production environment configuration, and set the Payhip expected signature hash from the existing local API key without printing either value.

- [ ] **Step 3: Save Payhip webhook configuration**

Set the production endpoint URL and select only `paid`. Do not select refunds/subscriptions or touch payment, price, tax, checkout, or product settings.

- [ ] **Step 4: Final verification and cleanup**

Recheck GA4 stream/key-event state, Payhip webhook URL presence and paid-only selection, Vercel health/rejection behavior, git refs, and production deployment. Remove the clean inactive Worktrunk lane only after its commit is on local/remote `main`.
