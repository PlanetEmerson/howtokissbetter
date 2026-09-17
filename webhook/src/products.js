export const SITE_TAG = "howtokissbetter";

export const PRODUCTS = {
  book: {
    key: "book",
    kind: "kiss_ebook",
    item_id: "kiss-book",
    name: "Kiss Perfect Now (PDF + EPUB)",
    description: "The 183-page kissing playbook. Instant download after payment.",
    unit_amount: 999,
    image: "https://howtokissbetter.com/assets/images/book-cover.png",
    success_path: "/book/thanks/",
    statement_suffix: "KISSBOOK",
    payment_description: "Kiss Perfect Now ebook (howtokissbetter.com)",
  },
  report: {
    key: "report",
    kind: "kiss_report",
    item_id: "kiss-report",
    name: "Kiss Test: your full report",
    description: "Your score, the three habits costing you most, the fixes, and your 7-day plan.",
    unit_amount: 499,
    image: null,
    success_path: "/kiss-test/result/",
    statement_suffix: "KISSTEST",
    payment_description: "Kiss Test full report (howtokissbetter.com)",
  },
};

export function productByKey(key) {
  return typeof key === "string" && Object.hasOwn(PRODUCTS, key) ? PRODUCTS[key] : null;
}

export function productForKind(kind) {
  return Object.values(PRODUCTS).find((product) => product.kind === kind) || null;
}

// The Stripe account is shared with Blynk Studio; only sessions carrying both
// markers are ours, and Blynk's handler ignores them the same way.
export function isKissSession(session) {
  const metadata = session?.metadata;
  return (
    session?.object === "checkout.session"
    && metadata?.site === SITE_TAG
    && typeof metadata.kind === "string"
    && metadata.kind.startsWith("kiss_")
  );
}
