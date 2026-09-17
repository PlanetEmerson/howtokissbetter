import { issueSignedToken, presignUrl } from "@vercel/blob";

const DOWNLOAD_TTL_MS = 60 * 60 * 1_000;
const DEFAULT_PDF_PATH = "kiss-perfect-now/kiss-perfect-now.pdf";
const DEFAULT_EPUB_PATH = "kiss-perfect-now/kiss-perfect-now.epub";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SENDER_EMAIL = "contact@howtokissbetter.com";

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
    "Not satisfied? Email me. I will make it right.",
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
    "<p>Not satisfied? Email me. I will make it right.</p>",
    "<p>C.J. McKenna<br>howtokissbetter.com</p>",
  ].join("\n");
}

export async function sendBookEmail(env, fetchImpl, { to, thanksUrl }) {
  const message = {
    sender: { name: "C.J. McKenna", email: env.BREVO_SENDER_EMAIL || DEFAULT_SENDER_EMAIL },
    to: [{ email: to }],
    subject: "Your copy of Kiss Perfect Now",
    textContent: bookEmailText(thanksUrl),
    htmlContent: bookEmailHtml(thanksUrl),
  };

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
    return response.ok;
  } catch {
    return false;
  }
}
