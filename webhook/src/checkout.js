import { randomBytes } from "node:crypto";

import {
  corsHeaders,
  emptyResponse,
  jsonResponse,
  originAllowed,
  redirect,
  refererAllowed,
  siteOrigin,
} from "./http.js";
import { loadKissScore } from "./kiss-engine.js";
import { SITE_TAG, productByKey } from "./products.js";
import { stripeRequest } from "./stripe.js";

const FIELD_RULES = {
  src: /^[a-z0-9-]{0,100}$/,
  placement: /^[a-z0-9-]{0,40}$/,
  entry: /^[a-z0-9-]{0,20}$/,
  ga_cid: /^(\d{1,12}\.\d{1,12})?$/,
  ga_sid: /^(\d{1,16})?$/,
};
const CANCEL_PATH = /^\/[^\s\\#]{0,199}$/;
// Payment methods come from the shared account's Dashboard settings; BNPL,
// Amazon Pay and crypto add steps a $9.99 impulse buy does not need.
const EXCLUDED_PAYMENT_METHODS = ["klarna", "amazon_pay", "crypto"];
const SUBMIT_MESSAGE =
  "One-time payment. You confirm you are 18 or older. Not happy? Email contact@howtokissbetter.com and I will make it right.";
// Per-session branding: the Stripe account belongs to Blynk Studio, so the
// Checkout page has to carry this site's name and colours itself.
const BRANDING = {
  display_name: "How to Kiss Better",
  background_color: "#2D2D2D",
  button_color: "#D4AF37",
  border_style: "rounded",
  font_family: "inter",
  icon: { type: "url", url: "https://howtokissbetter.com/assets/images/kiss-icon-512.png" },
};

function withQuery(url, query) {
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function cancelPath(form) {
  const value = form.get("cancel") || "/";
  return CANCEL_PATH.test(value) && !value.includes("//") ? value : null;
}

function parseFields(form) {
  const fields = {};
  for (const [name, rule] of Object.entries(FIELD_RULES)) {
    const value = form.get(name) ?? "";
    if (!rule.test(value)) {
      return null;
    }
    fields[name] = value;
  }
  fields.src ||= "direct";
  return fields;
}

function sessionParams({ product, site, cancel, fields }) {
  return {
    mode: "payment",
    submit_type: "pay",
    locale: "auto",
    customer_creation: "if_required",
    excluded_payment_method_types: EXCLUDED_PAYMENT_METHODS,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: product.unit_amount,
          product_data: {
            name: product.name,
            description: product.description,
            images: product.image ? [product.image] : undefined,
          },
        },
      },
    ],
    success_url: `${site}${product.success_path}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: withQuery(`${site}${cancel}`, "checkout=canceled"),
    client_reference_id: `hkb_${product.key}_${fields.src}_${randomBytes(4).toString("hex")}`,
    metadata: {
      kind: product.kind,
      site: SITE_TAG,
      product: product.key,
      src: fields.src,
      placement: fields.placement || undefined,
      entry: fields.entry || undefined,
      ga_cid: fields.ga_cid || undefined,
      ga_sid: fields.ga_sid || undefined,
      answers: fields.answers,
      v: fields.v,
    },
    payment_intent_data: {
      description: product.payment_description,
      statement_descriptor_suffix: product.statement_suffix,
      metadata: { kind: product.kind, site: SITE_TAG },
    },
    custom_text: { submit: { message: SUBMIT_MESSAGE } },
    branding_settings: BRANDING,
  };
}

export function createCheckoutHandler({ env, fetchImpl = fetch, loadScore = loadKissScore }) {
  return async function handleCheckout(request) {
    const origin = request.headers?.origin;
    if (request.method === "OPTIONS") {
      return emptyResponse(204, corsHeaders(origin, env));
    }
    if (request.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    }
    if (!(origin ? originAllowed(origin, env) : refererAllowed(request.headers?.referer, env))) {
      return jsonResponse(403, { ok: false, error: "bad_origin" });
    }
    if (request.bodyText === null) {
      return jsonResponse(413, { ok: false, error: "too_large" });
    }
    if (!env.STRIPE_SECRET_KEY) {
      return jsonResponse(500, { ok: false, error: "server_config" });
    }

    // A form post cannot consume JSON, so every outcome is a redirect back to the site.
    const site = siteOrigin(env);
    const form = new URLSearchParams(request.bodyText);
    const cancel = cancelPath(form);
    const back = `${site}${cancel || "/"}`;
    const product = productByKey(form.get("product"));
    const fields = parseFields(form);
    if (!cancel || !product || !fields) {
      return redirect(withQuery(back, "checkout=invalid"));
    }

    if (product.key === "report") {
      const engine = await loadScore();
      if (!engine) {
        return redirect(withQuery(back, "checkout=unavailable"));
      }
      const answers = (form.get("answers") || "").trim().toLowerCase();
      if (!engine.isValidAnswers(answers) || form.get("v") !== String(engine.VERSION)) {
        return redirect(withQuery(back, "checkout=invalid"));
      }
      fields.answers = answers;
      fields.v = String(engine.VERSION);
    }

    let session;
    try {
      session = await stripeRequest(
        { env, fetchImpl },
        "POST",
        "/checkout/sessions",
        sessionParams({ product, site, cancel, fields }),
      );
    } catch {
      return redirect(withQuery(back, "checkout=failed"));
    }
    if (typeof session.url !== "string" || !session.url.startsWith("https://")) {
      return redirect(withQuery(back, "checkout=failed"));
    }
    return redirect(session.url);
  };
}
