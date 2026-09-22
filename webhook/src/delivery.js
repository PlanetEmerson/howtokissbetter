import { issueSignedToken, presignUrl } from "@vercel/blob";

const DOWNLOAD_TTL_MS = 60 * 60 * 1_000;
const DEFAULT_PDF_PATH = "kiss-perfect-now/kiss-perfect-now.pdf";
const DEFAULT_EPUB_PATH = "kiss-perfect-now/kiss-perfect-now.epub";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SENDER_EMAIL = "contact@howtokissbetter.com";
const FEEDBACK_RECIPIENT = "contact@howtokissbetter.com";

async function presignPrivateGet({ pathname, validUntil }) {
  const signed = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(signed, {
    operation: "get",
    pathname,
    validUntil,
    access: "private",
  });
  return presignedUrl;
}

export async function bookDownloads(env, presignImpl = presignPrivateGet) {
  const validUntil = Date.now() + DOWNLOAD_TTL_MS;
  const expires = new Date(validUntil).toISOString();
  const files = [
    { label: "PDF", pathname: env.KISS_BOOK_PDF_PATH || DEFAULT_PDF_PATH },
    { label: "EPUB", pathname: env.KISS_BOOK_EPUB_PATH || DEFAULT_EPUB_PATH },
  ];

  try {
    const downloads = await Promise.all(
      files.map(async ({ label, pathname }) => ({
        label,
        url: await presignImpl({ pathname, validUntil }),
        expires,
      })),
    );
    return { downloads };
  } catch {
    return { downloads: [], error: true };
  }
}

function bookEmailText(thanksUrl) {
  return [
    "Thank you for getting Kiss Perfect Now.",
    "",
    "Your download page is here, and this link stays yours:",
    thanksUrl,
    "",
    "It has the PDF and the EPUB. Save a copy to your phone so it is there tonight.",
    "",
    "Not worth it? Email me within 30 days for a full refund. You keep the files either way.",
    "",
    "C.J. McKenna",
    "howtokissbetter.com",
  ].join("\n");
}

function bookEmailHtml(thanksUrl) {
  return [
    "<p>Thank you for getting Kiss Perfect Now.</p>",
    `<p>Your download page is here, and this link stays yours:<br><a href="${thanksUrl}">${thanksUrl}</a></p>`,
    "<p>It has the PDF and the EPUB. Save a copy to your phone so it is there tonight.</p>",
    "<p>Not worth it? Email me within 30 days for a full refund. You keep the files either way.</p>",
    "<p>C.J. McKenna<br>howtokissbetter.com</p>",
  ].join("\n");
}

// One Brevo call for every email the functions send.
async function sendBrevoEmail(env, fetchImpl, message) {
  try {
    const response = await fetchImpl(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      // Provider status and error code only; never the recipient or the key.
      let code = "";
      let detail = "";
      try {
        const body = await response.json();
        code = String(body?.code ?? "");
        // Provider messages can echo the recipient or the caller's address.
        detail = String(body?.message ?? "")
          .replace(/[^\s@]+@[^\s@]+/g, "[email]")
          .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b|[0-9a-f:]{2,}:[0-9a-f:]+/gi, "[ip]")
          .slice(0, 120);
      } catch {
        code = "";
      }
      console.warn("brevo_send_failed", response.status, code, detail);
    }
    return response.ok;
  } catch (error) {
    console.warn("brevo_send_failed", "network", error?.name ?? "");
    return false;
  }
}

function sender(env) {
  return { name: "C.J. McKenna", email: env.BREVO_SENDER_EMAIL || DEFAULT_SENDER_EMAIL };
}

export async function sendBookEmail(env, fetchImpl, { to, thanksUrl }) {
  return sendBrevoEmail(env, fetchImpl, {
    sender: sender(env),
    to: [{ email: to }],
    subject: "Your copy of Kiss Perfect Now",
    textContent: bookEmailText(thanksUrl),
    htmlContent: bookEmailHtml(thanksUrl),
  });
}

// Post-purchase feedback reaches the owner as plain text: the five form
// fields and nothing about the sender.
export async function sendFeedbackEmail(env, fetchImpl, { product, worth, note, quoteOk, name }) {
  return sendBrevoEmail(env, fetchImpl, {
    sender: sender(env),
    to: [{ email: FEEDBACK_RECIPIENT }],
    subject: `Feedback: ${product} · ${worth}`,
    textContent: [
      `worth: ${worth}`,
      `note: ${note}`,
      `quote consent: ${quoteOk ? "yes" : "no"}`,
      `name: ${name}`,
      `product: ${product}`,
    ].join("\n"),
  });
}
