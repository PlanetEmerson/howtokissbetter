#!/usr/bin/env python3
"""Deterministic release checks for the article conversion surfaces (buy rail and Kiss Test hooks)."""

from __future__ import annotations

import html
import json
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
BLOG = ROOT / "blog"
CONVERSION_ASSET_VERSION = "20260922"
HOME_ASSET_VERSION = "20260922"
BOOK_PRICE = "9.99"
RETIRED_PRICE = "$4.95"
CHECKOUT_API = "https://api.howtokissbetter.com"
CHECKOUT_ACTION = f"{CHECKOUT_API}/api/checkout"
SUPPORT_EMAIL = "contact@howtokissbetter.com"
CONVERSION_CSS_TAG = f'<link rel="stylesheet" href="/assets/conversion.css?v={CONVERSION_ASSET_VERSION}">'
HOME_CSS_TAG = f'<link rel="stylesheet" href="/assets/home.css?v={HOME_ASSET_VERSION}">'
CONVERSION_JS_TAG = f'<script src="/assets/conversion.js?v={CONVERSION_ASSET_VERSION}" defer></script>'
PREVIEW_JS_TAG = '<script src="/assets/book-preview.js?v=20260814" defer></script>'
QUIZ_CSS_TAG = '<link rel="stylesheet" href="/assets/quiz.css?v=20260922">'
QUIZ_JS_TAG = '<script src="/assets/quiz.js?v=20260922c" defer></script>'
GUARANTEE_BADGE = '<p class="kiss-guarantee" data-guarantee>'
GUARANTEE_LINE = '<span class="kiss-guarantee--line"><strong>30-day guarantee.</strong> Not worth it? One email, full refund.</span>'
GUARANTEE_KEEP = '<span class="kiss-guarantee__keep">Keep it anyway. I can\'t take it back.</span>'
GUARANTEE_SENTENCE = "Thirty days to decide. If it is not for you, one email to me gets every cent back. No form, no interrogation."
PROCESS_LINE = "Pay on Stripe's page. PDF and EPUB on the next screen, plus an email with a link that stays yours."
RETIRED_REFUND_COPY = ("make it " + "right", "Not " + "satisfied")
BOOK_CREDS = ("183 pages", "16 chapters", "80+ free guides", "Thousands of readers a month", "Secure checkout by Stripe", "30-day guarantee")
RETURN_POLICY_FIELDS = (
    '"@type": "MerchantReturnPolicy"',
    '"applicableCountry": "US"',
    '"returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow"',
    '"merchantReturnDays": 30',
    '"refundType": "https://schema.org/FullRefund"',
    '"returnFees": "https://schema.org/FreeReturn"',
)
QUIZ_HOOK_ARCHETYPES = ("natural", "sprinter", "overthinker")
VALID_CLUSTERS = {
    "practice",
    "technique",
    "touch",
    "chemistry",
    "relationship",
    "boundaries",
    "complete-guide",
}
VALID_CHAPTERS = {f"chapter-{number:02d}" for number in range(1, 17)}
VALID_ANCHORS = VALID_CLUSTERS | {"look-inside"}
BOOK_ANCHORS = (VALID_CLUSTERS - {"complete-guide"}) | {"look-inside"}
HOME_ANCHORS = {"kiss-test", "book", "guides"}
BUY_PLACEMENTS = ("buy-article-quarter", "buy-article-final", "buy-mobile-bar")
QUIZ_PLACEMENTS = ("quiz-article-quarter", "quiz-article-final", "quiz-mobile-bar")
QUIZ_URL = "/kiss-test/"
QUIZ_PAGES = ("kiss-test/index.html", "kiss-test/result/index.html")
KISS_TEST_LOCKED_LINES = (
    "$4.99, one time, 30-day guarantee",
    "Retakes free for 30 days.",
    "<li>Honest, not magic. Same answers, same result.</li>",
    "<li>Private. Scored on your phone. Nothing is stored unless you buy the report.</li>",
    "<li>Never kissed anyone? Answer on instinct.</li>",
    "The scoring file runs in your browser and is public. The paid report uses the same file, byte for byte. Same answers, same number, nothing to fudge.",
)
# The arm split, restated independently of the builder: quiz categories, the self-assessment posts
# outside them, and the four crossed tests (two per arm).
QUIZ_CATEGORIES = {"relationships", "first-kiss", "mistakes"}
QUIZ_SLUGS = {"what-makes-a-good-kisser", "what-does-a-good-kiss-feel-like"}
CROSSED_SURFACES = {
    "how-to-practice-kissing": "buy",
    "signs-youre-a-bad-kisser": "buy",
    "how-to-kiss-slowly": "quiz",
    "kissing-positions": "quiz",
}
QUIZ_HOOK_FIELDS = (
    "question_id",
    "eyebrow",
    "title",
    "copy",
    "label",
    "final_eyebrow",
    "final_title",
    "final_copy",
    "final_label",
    "bar_title",
    "bar_copy",
    "bar_label",
)
QUIZ_OVERRIDE_FIELDS = set(QUIZ_HOOK_FIELDS) | {"pronoun"}
PRONOUN_TOKEN = re.compile(r"\{(?:he|him|his|He|His)\}")
BOOK_PLACEMENTS = {
    "book-nav",
    "book-hero",
    "book-after-look-inside",
    "book-chapter-map",
    "book-after-faq",
    "book-final",
    "book-mobile-sticky",
}
HOME_PLACEMENTS = {"home-nav", "home-book-facts"}
HOME_SURFACES = Counter({"home-hero": 1, "home-book-facts": 1, "home-final": 1, "home-mobile-sticky": 1})
HOME_ARCHETYPES = ("natural", "slow-burn", "sweetheart", "explorer", "sprinter", "statue", "overthinker")
HOME_HANDOFF = "/kiss-test/?from=homepage&amp;hook=complete-guide&amp;placement="
HOME_BANNED = (
    "conversion_repair",
    "exit-popup",
    "section-fade",
    "hero-bg-v2",
    "data:image/svg+xml",
    "hollywood's kissing coach",
    "reader said",
    "data-countdown",
    "homepage_moment_proof",
    "home-preview-card",
    "data-home-pathway",
    "moment-steps",
    "sibforms.com",
    "data-preview-viewer",
    "book-preview.js",
    "star rating",
    "faqpage",
    "customer",
)
BUY_HOOK_FIELDS = ("eyebrow", "title", "copy", "bar_title", "bar_copy")
REQUIRED_OFFER_ATTRIBUTES = (
    "data-offer-placement",
    "data-offer-key",
    "data-offer-variant",
    "data-article-slug",
    "data-chapter-id",
)
FORM_BLOCK = re.compile(r"<form\b[^>]*>.*?</form>", re.DOTALL)
# Sales copy ("Payhip delivery"), product links, and checkout hooks.
PAYHIP_COPY = re.compile(r"\bPayhip\b")


def mentions_payhip(page_html: str) -> bool:
    return (
        bool(PAYHIP_COPY.search(page_html))
        or "payhip.com/b/" in page_html
        or "data-payhip-checkout" in page_html
        or "payhip.js" in page_html
    )


class LinkCollector(HTMLParser):
    """Collect document IDs and local URL-bearing attributes."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.urls: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        element_id = values.get("id")
        if element_id:
            self.ids.append(element_id)
        for attribute in ("href", "src"):
            value = values.get(attribute)
            if value:
                self.urls.append((attribute, value))
        srcset = values.get("srcset")
        if srcset:
            for candidate in srcset.split(","):
                url = candidate.strip().split()[0]
                if url:
                    self.urls.append(("srcset", url))


class Validation:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.checks = 0

    def require(self, condition: bool, message: str) -> None:
        self.checks += 1
        if not condition:
            self.errors.append(message)

    def equal(self, actual: object, expected: object, message: str) -> None:
        self.require(actual == expected, f"{message}: expected {expected!r}, got {actual!r}")

    def finish(self) -> None:
        if self.errors:
            print(f"FAILED: {len(self.errors)} error(s) across {self.checks} checks", file=sys.stderr)
            for error in self.errors:
                print(f"  - {error}", file=sys.stderr)
            raise SystemExit(1)
        print(f"PASS: {self.checks} conversion checks")


def load_build_blog():
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    import build_blog  # pylint: disable=import-outside-toplevel

    return build_blog


def load_catalog() -> dict[str, dict[str, object]]:
    return load_build_blog().build_offer_catalog()


def matching_div_close(html_text: str, opening_start: int) -> int:
    """Return the start offset of the div closing the opening tag at opening_start."""
    opening_end = html_text.find(">", opening_start)
    depth = 1
    for match in re.finditer(r"<div\b[^>]*>|</div>", html_text[opening_end + 1:], re.IGNORECASE):
        if match.group(0).lower().startswith("<div"):
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                return opening_end + 1 + match.start()
    return -1


def page_for_local_url(source_page: Path, raw_url: str) -> tuple[Path | None, str]:
    if raw_url.startswith(("mailto:", "tel:", "javascript:", "data:")):
        return None, ""
    parsed = urlparse(raw_url)
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        return None, ""
    if parsed.netloc and parsed.netloc not in {"howtokissbetter.com", "www.howtokissbetter.com"}:
        return None, ""
    path = unquote(parsed.path)
    if not path:
        return source_page, parsed.fragment
    if path.startswith("/"):
        target = ROOT / path.lstrip("/")
    else:
        target = source_page.parent / path
    if path.endswith("/") or target.is_dir():
        target /= "index.html"
    return target.resolve(), parsed.fragment


def validate_local_links(validation: Validation, pages: list[Path], pending: frozenset[Path] = frozenset()) -> None:
    """Check every local link target exists; targets in `pending` are pages another build step has not written yet."""
    anchor_cache: dict[Path, set[str]] = {}
    for page in pages:
        collector = LinkCollector()
        collector.feed(page.read_text())
        duplicates = [item for item, count in Counter(collector.ids).items() if count > 1]
        validation.require(not duplicates, f"{page.relative_to(ROOT)} has duplicate IDs: {duplicates}")
        anchor_cache[page.resolve()] = set(collector.ids)

        for attribute, raw_url in collector.urls:
            target, fragment = page_for_local_url(page, raw_url)
            if target is None or target in pending:
                continue
            validation.require(
                target.exists(),
                f"{page.relative_to(ROOT)} has broken {attribute} target: {raw_url}",
            )
            if (
                not target.exists()
                or not fragment
                or target.suffix.lower() not in {".html", ""}
                or target != (ROOT / "book/index.html").resolve()
            ):
                continue
            if target not in anchor_cache:
                target_collector = LinkCollector()
                target_collector.feed(target.read_text())
                anchor_cache[target] = set(target_collector.ids)
            validation.require(
                fragment in anchor_cache[target],
                f"{page.relative_to(ROOT)} links to missing anchor #{fragment} in {target.relative_to(ROOT)}",
            )


def validate_manifest_cardinality(
    validation: Validation,
    posts: list[dict[str, object]],
    catalog: dict[str, dict[str, object]],
) -> list[str]:
    routes = [f"/blog/{post['slug']}/" for post in posts]
    validation.require(bool(posts), "article manifest is empty")
    validation.equal(len(set(routes)), len(routes), "unique article route count")
    validation.equal(set(catalog), set(routes), "offer catalog route set")
    return routes


def checkout_forms(page_html: str) -> list[str]:
    """Return every checkout form block, opening tag through </form>."""
    return [block for block in FORM_BLOCK.findall(page_html) if "data-checkout-form" in block.split(">", 1)[0]]


def form_placement(block: str) -> str:
    match = re.search(r'data-offer-placement="([^"]+)"', block.split(">", 1)[0])
    return match.group(1) if match else ""


def validate_checkout_form(
    validation: Validation,
    label: str,
    block: str,
    src: str,
    placement: str,
    entry: str,
    cancel: str,
) -> None:
    """Assert one form matches the /api/checkout contract and works with JavaScript off."""
    opening = block.split(">", 1)[0] + ">"
    validation.require(opening.startswith(f'<form method="post" action="{CHECKOUT_ACTION}"'), f"{label} form method or action is wrong")
    validation.require('class="buy-form"' in opening, f"{label} form is missing the buy-form class")
    validation.require(f'data-price="{BOOK_PRICE}"' in opening, f"{label} form price attribute is wrong")
    validation.require("data-offer-link" in opening, f"{label} form is not tracked as an offer link")
    validation.require(f'data-offer-placement="{placement}"' in opening, f"{label} form placement is wrong")
    validation.require('data-offer-variant="not-applicable"' in opening, f"{label} form variant is not retired")
    for name, value in (("product", "book"), ("src", src), ("placement", placement), ("entry", entry), ("cancel", cancel)):
        validation.equal(
            block.count(f'<input type="hidden" name="{name}" value="{value}">'),
            1,
            f"{label} hidden field {name}",
        )
    validation.equal(block.count("<input"), 5, f"{label} hidden field count")
    validation.equal(block.count('<button type="submit"'), 1, f"{label} submit button count")
    validation.require(f"· ${BOOK_PRICE}</button>" in block, f"{label} button label is missing the price")
    validation.require("payhip.com" not in block and "data-payhip-checkout" not in block, f"{label} form still routes through Payhip")


def expected_surface(post: dict[str, object]) -> str:
    slug = str(post["slug"])
    if slug in CROSSED_SURFACES:
        return CROSSED_SURFACES[slug]
    if slug in QUIZ_SLUGS or str(post.get("category_slug")) in QUIZ_CATEGORIES:
        return "quiz"
    return "buy"


def validate_quarter_ratio(validation: Validation, slug: str, page_html: str, marker: str) -> None:
    """The quarter surface sits at 20 to 30.5 percent of the article body, whichever arm renders it."""
    start_marker = f"<!-- {marker}_START -->"
    end_marker = f"<!-- {marker}_END -->"
    content_open = page_html.find('<div class="article-content">')
    quarter_start = page_html.find(start_marker, content_open)
    quarter_end = page_html.find(end_marker, quarter_start)
    content_close = matching_div_close(page_html, content_open)
    validation.require(
        content_open >= 0 and quarter_start > content_open and quarter_end > quarter_start and content_close > quarter_end,
        f"{slug} article content bounds",
    )
    if content_open >= 0 and quarter_start > content_open and quarter_end > quarter_start:
        before = page_html[content_open:quarter_start]
        after = page_html[quarter_end + len(end_marker):content_close]
        base_length = len(before) + len(after)
        ratio = len(before) / base_length if base_length else 0
        validation.require(0.20 <= ratio <= 0.305, f"{slug} quarter card ratio is {ratio:.1%}")


def validate_no_retired_refund_copy(validation: Validation, label: str, text: str) -> None:
    for retired in RETIRED_REFUND_COPY:
        validation.require(retired not in text, f"{label} carries the retired refund line ({retired})")


def validate_card_copy(validation: Validation, slug: str, page_html: str, markers: tuple[str, ...]) -> None:
    """Card copy never says unlock and never carries the retired refund line."""
    for marker in markers:
        start = page_html.find(f"<!-- {marker}_START -->")
        end = page_html.find(f"<!-- {marker}_END -->")
        block = page_html[start:end] if 0 <= start < end else ""
        validation.require("unlock" not in block.lower(), f"{slug} {marker} copy says unlock")
        validate_no_retired_refund_copy(validation, f"{slug} {marker}", block)


def validate_quiz_article(validation: Validation, slug: str, page_html: str, offer: dict[str, object]) -> None:
    """Assert the Kiss Test hook contract on one quiz-arm article."""
    build_blog = load_build_blog()
    cluster = str(offer.get("offer_key"))
    chapter = str(offer.get("chapter_id"))
    hook = offer.get("quiz") or {}
    for marker in ("QUIZ_HOOK_QUARTER", "QUIZ_HOOK_FINAL", "QUIZ_HOOK_BAR"):
        validation.equal(page_html.count(f"<!-- {marker}_START -->"), 1, f"{slug} {marker} start marker count")
        validation.equal(page_html.count(f"<!-- {marker}_END -->"), 1, f"{slug} {marker} end marker count")
    validation.equal(page_html.count("BUY_RAIL_"), 0, f"{slug} quiz arm still carries buy-rail markers")
    validation.equal(page_html.count("PROOF_LED_"), 0, f"{slug} still carries proof-led markers")
    validation.equal(len(checkout_forms(page_html)), 0, f"{slug} quiz arm still carries checkout forms")
    validation.equal(page_html.count('id="article-kiss-test-hook"'), 1, f"{slug} quiz card ID count")
    validation.equal(page_html.count('id="article-kiss-test-hook-title"'), 1, f"{slug} quiz card title ID count")
    validation.equal(page_html.count('id="article-kiss-test-final-title"'), 1, f"{slug} quiz final title ID count")
    validation.equal(page_html.count('class="mobile-buy-bar mobile-buy-bar--quiz js-offer"'), 1, f"{slug} quiz bar surface count")
    validation.require(PRONOUN_TOKEN.search(page_html) is None, f"{slug} renders an unresolved pronoun token")
    validation.equal(page_html.count('<p class="quiz-hook__which">Which one are you?</p>'), 1, f"{slug} quiz card archetype heading count")
    validation.equal(page_html.count('<ul class="quiz-hook__archetypes" aria-hidden="true">'), 1, f"{slug} quiz card archetype strip count")
    for archetype in QUIZ_HOOK_ARCHETYPES:
        validation.equal(page_html.count(f'src="/assets/images/kiss-test/archetypes/{archetype}-mw-mini.webp"'), 1, f"{slug} quiz card {archetype} mini count")
    validate_card_copy(validation, slug, page_html, ("QUIZ_HOOK_QUARTER", "QUIZ_HOOK_FINAL", "QUIZ_HOOK_BAR"))

    question = build_blog.quiz_question(str(hook.get("question_id")))
    option_ids = [str(option["id"]) for option in question["options"]]
    bases = {placement: f"{QUIZ_URL}?from={slug}&amp;hook={cluster}&amp;placement={placement}" for placement in QUIZ_PLACEMENTS}
    for placement, base in bases.items():
        asides = re.findall(rf'<aside\b[^>]*data-offer-placement="{re.escape(placement)}"[^>]*>', page_html)
        links = re.findall(rf'<a\b[^>]*data-offer-placement="{re.escape(placement)}"[^>]*>', page_html)
        validation.equal(len(asides), 1, f"{slug} {placement} surface count")
        validation.equal(len(links), len(option_ids) + 1 if placement == "quiz-article-quarter" else 1, f"{slug} {placement} link count")
        for tag in asides + links:
            for attribute in REQUIRED_OFFER_ATTRIBUTES:
                validation.require(attribute in tag, f"{slug} {placement} tag missing {attribute}")
            validation.require('data-offer-variant="not-applicable"' in tag, f"{slug} {placement} variant is not retired")
            validation.require(f'data-offer-key="{cluster}"' in tag, f"{slug} {placement} cluster mismatch")
            validation.require(f'data-chapter-id="{chapter}"' in tag, f"{slug} {placement} chapter mismatch")
            validation.require(f'data-article-slug="{slug}"' in tag, f"{slug} {placement} article mismatch")
        for tag in links:
            validation.require('data-offer-link="true"' in tag, f"{slug} {placement} link is not tracked")
        hrefs = [match.group(1) for match in (re.search(r'href="([^"]+)"', tag) for tag in links) if match]
        validation.equal(len(hrefs), len(links), f"{slug} {placement} links carry an href")
        validation.require(all(href.startswith(base) for href in hrefs), f"{slug} {placement} link href contract")
        if placement == "quiz-article-quarter":
            expected_answers = sorted([""] + [f"&amp;q={question['id']}&amp;a={option_id}" for option_id in option_ids])
            validation.equal(sorted(href[len(base):] for href in hrefs), expected_answers, f"{slug} quarter answer links")
        else:
            validation.equal(hrefs, [base], f"{slug} {placement} link href")

    pronouns = build_blog.quiz_pronoun_set(str(hook.get("pronoun", build_blog.QUIZ_DEFAULT_PRONOUN)))
    prompt = html.escape(build_blog.quiz_text(str(question["prompt"]), pronouns))
    validation.equal(page_html.count(f'<p class="quiz-hook__question">{prompt}</p>'), 1, f"{slug} embedded question prompt")
    validation.equal(page_html.count('<a class="quiz-hook__option"'), len(option_ids), f"{slug} option link count")
    for option in question["options"]:
        text = html.escape(build_blog.quiz_text(str(option["text"]), pronouns))
        validation.equal(page_html.count(f">{text}</a></li>"), 1, f"{slug} option {option['id']} text")
    title = html.escape(str(hook.get("title", "")))
    validation.equal(
        page_html.count(f'<h2 class="conversion-offer__title" id="article-kiss-test-hook-title">{title}</h2>'),
        1,
        f"{slug} quiz card title",
    )
    label = html.escape(str(hook.get("label", "")))
    validation.equal(
        len(re.findall(rf'<a href="{re.escape(bases["quiz-article-quarter"])}" [^>]*>{re.escape(label)}</a> · 10 questions · free result</p>', page_html)),
        1,
        f"{slug} quiz card label link",
    )
    final_title = html.escape(str(hook.get("final_title", "")))
    validation.equal(
        page_html.count(f'<h2 class="conversion-final__title" id="article-kiss-test-final-title">{final_title}</h2>'),
        1,
        f"{slug} quiz final title",
    )
    final_label = html.escape(str(hook.get("final_label", "")))
    validation.equal(
        len(re.findall(rf'<a class="conversion-button" href="{re.escape(bases["quiz-article-final"])}" [^>]*>{re.escape(final_label)}</a>', page_html)),
        1,
        f"{slug} quiz final button",
    )
    validation.equal(
        page_html.count(f'<a href="/book/" data-offer-link="true" data-offer-placement="article-final-book">{html.escape(build_blog.QUIZ_BOOK_LINK_LABEL)}</a>'),
        1,
        f"{slug} final book link",
    )
    validation.equal(page_html.count('data-offer-placement="article-final-book"'), 1, f"{slug} final book link count")
    bar_title = html.escape(str(hook.get("bar_title", "")))
    bar_copy = html.escape(str(hook.get("bar_copy", "")))
    validation.equal(page_html.count(f"<strong>{bar_title}</strong><span>{bar_copy}</span>"), 1, f"{slug} quiz bar copy")
    bar_label = html.escape(str(hook.get("bar_label", "")))
    validation.equal(
        len(re.findall(rf'<a class="mobile-buy-bar__link" href="{re.escape(bases["quiz-mobile-bar"])}" tabindex="-1" [^>]*>{re.escape(bar_label)}</a>', page_html)),
        1,
        f"{slug} quiz bar link",
    )

    nav_match = re.search(r'<a\b[^>]*href="([^"]+)"[^>]*data-offer-placement="post-nav"[^>]*>', page_html)
    validation.require(nav_match is not None, f"{slug} post-nav link is missing")
    if nav_match:
        validation.equal(nav_match.group(1), f"{QUIZ_URL}?from={slug}&amp;hook={cluster}&amp;placement=post-nav", f"{slug} post-nav URL contract")
    validation.equal(page_html.count('data-offer-placement="post-nav"'), 1, f"{slug} post-nav link count")
    validation.require('<span class="hidden sm:inline">Take the Kiss Test</span>' in page_html, f"{slug} post-nav label is stale")
    validation.require('<span class="sm:hidden">Kiss Test</span>' in page_html, f"{slug} post-nav mobile label is stale")
    validate_quarter_ratio(validation, slug, page_html, "QUIZ_HOOK_QUARTER")


def validate_buy_article(validation: Validation, slug: str, page_html: str, offer: dict[str, object]) -> None:
    """Assert the buy-rail contract on one buy-arm article."""
    cluster = str(offer.get("offer_key"))
    chapter = str(offer.get("chapter_id"))
    anchor = str(offer.get("preview_anchor"))
    hook = offer.get("buy") or {}
    validation.equal(page_html.count("QUIZ_HOOK_"), 0, f"{slug} buy arm carries Kiss Test markers")
    validation.equal(page_html.count("<!-- BUY_RAIL_QUARTER_START -->"), 1, f"{slug} buy card count")
    validation.equal(page_html.count("<!-- BUY_RAIL_FINAL_START -->"), 1, f"{slug} final buy card count")
    validation.equal(page_html.count("<!-- BUY_RAIL_BAR_START -->"), 1, f"{slug} mobile buy bar count")
    validation.equal(page_html.count("PROOF_LED_"), 0, f"{slug} still carries proof-led markers")
    validation.equal(page_html.count('id="article-book-buy"'), 1, f"{slug} buy card ID count")
    validation.equal(page_html.count('id="article-book-buy-title"'), 1, f"{slug} buy card title ID count")
    validation.equal(page_html.count('id="article-book-final-title"'), 1, f"{slug} final card title ID count")
    validation.equal(page_html.count('class="mobile-buy-bar mobile-buy-bar--buy js-offer"'), 1, f"{slug} mobile bar surface count")

    forms = checkout_forms(page_html)
    validation.equal(len(forms), 3, f"{slug} checkout form count")
    for placement in BUY_PLACEMENTS:
        placement_matches = re.findall(
            rf'<(?:aside|form)\b[^>]*data-offer-placement="{re.escape(placement)}"[^>]*>',
            page_html,
            re.DOTALL,
        )
        validation.equal(len(placement_matches), 2, f"{slug} {placement} surface and form count")
        for tag in placement_matches:
            for attribute in REQUIRED_OFFER_ATTRIBUTES:
                validation.require(attribute in tag, f"{slug} {placement} tag missing {attribute}")
            validation.require('data-offer-variant="not-applicable"' in tag, f"{slug} {placement} variant is not retired")
            validation.require(f'data-offer-key="{cluster}"' in tag, f"{slug} {placement} cluster mismatch")
            validation.require(f'data-chapter-id="{chapter}"' in tag, f"{slug} {placement} chapter mismatch")
            validation.require(f'data-article-slug="{slug}"' in tag, f"{slug} {placement} article mismatch")

        placement_forms = [block for block in forms if form_placement(block) == placement]
        validation.equal(len(placement_forms), 1, f"{slug} {placement} checkout form count")
        for block in placement_forms:
            validate_checkout_form(
                validation,
                f"{slug} {placement}",
                block,
                src=slug,
                placement=placement,
                entry="article",
                cancel=f"/blog/{slug}/",
            )

    title = html.escape(str(hook.get("title", "")))
    validation.equal(
        page_html.count(f'<h2 class="conversion-offer__title" id="article-book-buy-title">{title}</h2>'),
        1,
        f"{slug} buy card title",
    )
    validation.equal(
        page_html.count(f'<h2 class="conversion-final__title" id="article-book-final-title">{title}</h2>'),
        1,
        f"{slug} final card title",
    )
    validation.equal(
        page_html.count(f"<strong>{html.escape(str(hook.get('bar_title', '')))}</strong><span>{html.escape(str(hook.get('bar_copy', '')))}</span>"),
        1,
        f"{slug} buy bar copy",
    )
    validation.equal(page_html.count(f"Get the book · ${BOOK_PRICE}</button>"), 2, f"{slug} buy button count")
    validation.equal(page_html.count(f"Get it · ${BOOK_PRICE}</button>"), 1, f"{slug} buy bar button count")
    validation.equal(page_html.count("Secure checkout by Stripe."), 2, f"{slug} checkout disclosure count")
    validation.equal(page_html.count('class="conversion-offer__cover"'), 1, f"{slug} buy card cover count")
    validation.equal(page_html.count('class="kiss-guarantee"'), 2, f"{slug} guarantee badge count")
    validation.equal(page_html.count(html.escape(PROCESS_LINE)), 2, f"{slug} checkout process line count")
    validation.equal(page_html.count("conversion-offer__proof"), 0, f"{slug} still carries the proof scan card")
    validate_card_copy(validation, slug, page_html, ("BUY_RAIL_QUARTER", "BUY_RAIL_FINAL", "BUY_RAIL_BAR"))

    nav_match = re.search(r'<a\b[^>]*href="([^"]+)"[^>]*data-offer-placement="post-nav"[^>]*>', page_html)
    validation.require(nav_match is not None, f"{slug} post-nav book link is missing")
    if nav_match:
        expected = (
            "/book/?utm_source=howtokissbetter&amp;utm_medium=site"
            "&amp;utm_campaign=proof_led_rebuild&amp;utm_content=post-nav"
            f"&amp;offer_key={cluster}#{anchor}"
        )
        validation.equal(nav_match.group(1), expected, f"{slug} post-nav URL contract")
    validation.equal(page_html.count('data-offer-placement="post-nav"'), 1, f"{slug} post-nav link count")
    validation.require('<span class="hidden sm:inline">Get the book</span>' in page_html, f"{slug} post-nav label is stale")

    validate_quarter_ratio(validation, slug, page_html, "BUY_RAIL_QUARTER")


def validate_articles(validation: Validation, catalog: dict[str, dict[str, object]]) -> list[Path]:
    posts = json.loads((BLOG / "posts.json").read_text())
    validate_manifest_cardinality(validation, posts, catalog)
    for post in posts:
        expected_category_slug = str(post["category"]).lower().replace(" ", "-")
        validation.equal(
            post.get("category_slug"),
            expected_category_slug,
            f"{post['slug']} manifest category slug",
        )

    article_pages: list[Path] = []
    surfaces: Counter[str] = Counter()
    for post in posts:
        slug = post["slug"]
        route = f"/blog/{slug}/"
        offer = catalog[route]
        page = ROOT / route.lstrip("/") / "index.html"
        article_pages.append(page)
        validation.require(page.exists(), f"missing article page for {route}")
        if not page.exists():
            continue
        page_html = page.read_text()
        cluster = str(offer.get("offer_key"))
        chapter = str(offer.get("chapter_id"))
        anchor = str(offer.get("preview_anchor"))
        surface = str(offer.get("surface"))
        surfaces[surface] += 1

        validation.require(cluster in VALID_CLUSTERS, f"{slug} has invalid cluster {cluster}")
        validation.require(chapter in VALID_CHAPTERS, f"{slug} has invalid chapter {chapter}")
        validation.require(anchor in VALID_ANCHORS, f"{slug} has invalid preview anchor {anchor}")
        validation.equal(offer.get("article_slug"), slug, f"{slug} catalog slug")
        validation.equal(surface, expected_surface(post), f"{slug} conversion surface")
        validation.equal(page_html.count("data-mobile-offer-title"), 0, f"{slug} still carries the retired mobile experiment hook")
        validation.require(RETIRED_PRICE not in page_html, f"{slug} still contains the retired {RETIRED_PRICE} price")
        validation.require(not mentions_payhip(page_html), f"{slug} still mentions Payhip")
        validation.require(
            f'data-page-kind="article" data-article-slug="{slug}" data-offer-key="{cluster}" data-chapter-id="{chapter}"'
            in page_html,
            f"{slug} body analytics attributes are incomplete",
        )
        validation.require(
            f'<link rel="canonical" href="https://howtokissbetter.com/blog/{slug}/">' in page_html,
            f"{slug} canonical URL changed",
        )
        validation.require('/assets/offer-catalog.js' not in page_html, f"{slug} still loads the retired runtime offer catalog")
        validation.require(CONVERSION_CSS_TAG in page_html, f"{slug} conversion stylesheet is missing or stale")
        validation.require(CONVERSION_JS_TAG in page_html, f"{slug} conversion script is incomplete or stale")

        if surface == "quiz":
            validate_quiz_article(validation, slug, page_html, offer)
        else:
            validate_buy_article(validation, slug, page_html, offer)

    validation.require(surfaces["quiz"] > 0 and surfaces["buy"] > 0, f"both arms must be live, got {dict(surfaces)}")
    print(f"Surface split: {surfaces['quiz']} Kiss Test, {surfaces['buy']} buy rail")
    return article_pages

def validate_buy_hooks(validation: Validation, catalog: dict[str, dict[str, object]]) -> None:
    build_blog = load_build_blog()
    validation.equal(set(build_blog.BUY_HOOKS), VALID_CLUSTERS, "buy hook cluster set")
    for cluster, hook in build_blog.BUY_HOOKS.items():
        validation.equal(set(hook), set(BUY_HOOK_FIELDS), f"{cluster} buy hook fields")
        for field, value in hook.items():
            validation.require(bool(value.strip()) and value == value.strip(), f"{cluster} buy hook {field} is empty or padded")
            validation.require("—" not in value, f"{cluster} buy hook {field} contains an em dash")
            validation.require("$" not in value, f"{cluster} buy hook {field} carries a price; the button owns the price")
    known_slugs = {str(offer["article_slug"]) for offer in catalog.values()}
    for slug, override in build_blog.BUY_HOOK_OVERRIDES.items():
        validation.require(slug in known_slugs, f"buy hook override targets unknown post {slug}")
        validation.require(set(override) <= set(BUY_HOOK_FIELDS), f"{slug} buy hook override has unknown fields")
        for field, value in override.items():
            validation.require("—" not in value and "$" not in value, f"{slug} buy hook override {field} breaks the copy rules")
    for name in ("BUY_META", "BUY_FINAL_COPY", "BUY_BUTTON_LABEL", "BUY_BAR_LABEL"):
        validation.require("—" not in getattr(build_blog, name), f"{name} contains an em dash")
    validation.require("Sold by Blynk Studio" in build_blog.BUY_META, "buy meta line is missing the seller disclosure")
    validation.require("30-day" not in build_blog.BUY_META, "buy meta line duplicates the guarantee badge")
    validation.require(build_blog.BUY_META.endswith(PROCESS_LINE), "buy meta line is missing the checkout process line")
    validate_no_retired_refund_copy(validation, "BUY_META", build_blog.BUY_META)


def validate_quiz_hooks(validation: Validation, catalog: dict[str, dict[str, object]]) -> None:
    build_blog = load_build_blog()
    validation.equal(set(build_blog.QUIZ_HOOKS), VALID_CLUSTERS, "quiz hook cluster set")
    for cluster, hook in build_blog.QUIZ_HOOKS.items():
        validation.equal(set(hook), set(QUIZ_HOOK_FIELDS), f"{cluster} quiz hook fields")
        for field, value in hook.items():
            validation.require(bool(value.strip()) and value == value.strip(), f"{cluster} quiz hook {field} is empty or padded")
            validation.require("—" not in value, f"{cluster} quiz hook {field} contains an em dash")
            validation.require("$" not in value, f"{cluster} quiz hook {field} carries a price")
        validation.require(re.fullmatch(r"q\d+", str(hook["question_id"])) is not None, f"{cluster} quiz hook question id is malformed")
    known_slugs = {str(offer["article_slug"]) for offer in catalog.values()}
    for slug, override in build_blog.QUIZ_HOOK_OVERRIDES.items():
        validation.require(slug in known_slugs, f"quiz hook override targets unknown post {slug}")
        validation.require(set(override) <= QUIZ_OVERRIDE_FIELDS, f"{slug} quiz hook override has unknown fields")
        for field, value in override.items():
            validation.require("—" not in value and "$" not in value, f"{slug} quiz hook override {field} breaks the copy rules")
    for name in ("QUIZ_FINAL_EYEBROW", "QUIZ_FINAL_COPY", "QUIZ_FINAL_LABEL", "QUIZ_META_SUFFIX", "QUIZ_BOOK_LINK_LABEL"):
        validation.require("—" not in getattr(build_blog, name), f"{name} contains an em dash")
    validation.require(f"${BOOK_PRICE}" in build_blog.QUIZ_BOOK_LINK_LABEL, "quiz final book link label is missing the book price")
    validation.equal(build_blog.QUIZ_URL, QUIZ_URL, "builder quiz URL")
    validation.equal(build_blog.BUY_SURFACE_OVERRIDES, {slug for slug, arm in CROSSED_SURFACES.items() if arm == "buy"}, "buy-arm crossed posts")
    validation.require(
        {slug for slug, arm in CROSSED_SURFACES.items() if arm == "quiz"} <= build_blog.QUIZ_SURFACE_OVERRIDES,
        "quiz-arm crossed posts are missing from the builder overrides",
    )
    for archetype in QUIZ_HOOK_ARCHETYPES:
        mini = ROOT / f"assets/images/kiss-test/archetypes/{archetype}-mw-mini.webp"
        validation.require(mini.exists() and mini.stat().st_size < 20_000, f"{archetype} archetype mini is missing or over 20 KB")


def validate_engine_sync(validation: Validation) -> None:
    """The article hooks embed engine questions, so the public engine must parse and carry them."""
    build_blog = load_build_blog()
    engine = ROOT / "assets" / "kiss-score.js"
    validation.require(engine.exists(), "public quiz engine assets/kiss-score.js is missing")
    if not engine.exists():
        return
    try:
        data = build_blog.load_quiz_data()
    except (ValueError, json.JSONDecodeError) as error:
        validation.require(False, f"QUIZ_DATA in assets/kiss-score.js does not parse: {error}")
        return
    questions = data.get("questions", [])
    validation.equal(len(questions), 10, "engine question count")
    question_ids = [str(question.get("id")) for question in questions]
    validation.equal(len(set(question_ids)), len(question_ids), "engine question ids are unique")
    for question in questions:
        options = question.get("options", [])
        validation.equal(len(options), 4, f"engine {question.get('id')} option count")
        option_ids = [str(option.get("id")) for option in options]
        validation.require(all(re.fullmatch(r"[a-z]", option_id) for option_id in option_ids), f"engine {question.get('id')} option ids are not single letters")
        validation.equal(len(set(option_ids)), len(option_ids), f"engine {question.get('id')} option ids are unique")
        validation.require(all(str(option.get("text", "")).strip() for option in options), f"engine {question.get('id')} has an empty option")
        validation.require(str(question.get("prompt", "")).strip() != "", f"engine {question.get('id')} has an empty prompt")
    hooks = list(build_blog.QUIZ_HOOKS.items()) + list(build_blog.QUIZ_HOOK_OVERRIDES.items())
    for name, hook in hooks:
        if "question_id" in hook:
            validation.require(hook["question_id"] in question_ids, f"{name} hook embeds unknown question {hook['question_id']}")
    pronoun_ids = {str(option.get("id")) for option in data.get("pronoun", {}).get("options", [])}
    validation.require(build_blog.QUIZ_DEFAULT_PRONOUN in pronoun_ids, "engine is missing the neutral pronoun set used by static hooks")
    for name, hook in hooks:
        if "pronoun" in hook:
            validation.require(hook["pronoun"] in pronoun_ids, f"{name} hook uses unknown pronoun set {hook['pronoun']}")


def validate_build_constants(validation: Validation) -> None:
    build_blog = load_build_blog()
    validation.equal(build_blog.ASSET_VERSION, CONVERSION_ASSET_VERSION, "builder asset version")
    validation.equal(build_blog.BOOK_PRICE, BOOK_PRICE, "builder book price")
    validation.equal(build_blog.CHECKOUT_API, CHECKOUT_API, "builder checkout API origin")
    validation.equal(build_blog.DEFAULT_SURFACE, "buy", "builder default surface")
    validation.equal(build_blog.QUIZ_HOOK_ARCHETYPES, QUIZ_HOOK_ARCHETYPES, "builder archetype strip")


def validate_book(validation: Validation) -> Path:
    page = ROOT / "book" / "index.html"
    page_html = page.read_text()
    collector = LinkCollector()
    collector.feed(page_html)
    anchors = set(collector.ids)

    for anchor in BOOK_ANCHORS:
        validation.require(anchor in anchors, f"book page is missing stable anchor #{anchor}")
    validation.equal(page_html.count('class="book-preview-card"'), 8, "real preview card count")
    validation.equal(page_html.count('data-pathway-panel="'), 6, "book pathway panel count")
    validation.equal(page_html.count('data-pathway="'), 6, "book pathway control count")
    validation.require('data-preview-viewer' in page_html, "book preview dialog is missing")
    validation.require('data-book-sticky' in page_html, "book mobile sticky purchase control is missing")
    validation.require('<button type="submit" class="conversion-button conversion-sheen" data-hero-checkout>' in page_html, "book hero checkout button is missing")
    validation.equal(page_html.count(GUARANTEE_BADGE), 3, "book guarantee badge count")
    validation.equal(page_html.count(GUARANTEE_KEEP), 1, "book guarantee keep line count")
    validation.equal(page_html.count('<ul class="kiss-creds">'), 1, "book credentials strip count")
    for item in BOOK_CREDS:
        validation.require(f"<li>{item}</li>" in page_html, f"book credentials strip is missing {item}")
    validation.require(len(json.loads((BLOG / "posts.json").read_text())) >= 80, "the 80+ free guides claim outruns blog/posts.json")
    validation.require(PROCESS_LINE in page_html, "book hero is missing the checkout process line")
    validation.require(f"{GUARANTEE_SENTENCE} You keep the files; I can't take them back." in page_html, "book FAQ is missing the guarantee sentence")
    for needle in RETURN_POLICY_FIELDS:
        validation.require(needle in page_html, f"book schema return policy is missing {needle}")
    validation.require('"returnMethod"' not in page_html, "book schema return policy names a return method")
    validate_no_retired_refund_copy(validation, "book page", page_html)
    validation.require('<link rel="canonical" href="https://howtokissbetter.com/book/">' in page_html, "book canonical URL changed")
    validation.require('"numberOfPages": 183' in page_html, "book page schema is missing 183 pages")
    validation.require(f'"price": "{BOOK_PRICE}"' in page_html, "book page schema has the wrong price")
    validation.require('"url": "https://howtokissbetter.com/book/"' in page_html, "book page schema offer URL is wrong")
    validation.require(RETIRED_PRICE not in page_html, f"book page contains the retired {RETIRED_PRICE} price")
    validation.require(not mentions_payhip(page_html), "book page still mentions Payhip")
    validation.require("Hollywood's kissing coach" not in page_html, "book page contains an unsupported authority claim")
    validation.require("star rating" not in page_html.lower(), "book page contains an unsupported rating claim")
    validation.require("countdown" not in page_html.lower(), "book page contains fake urgency")
    validation.require("Secure checkout by Stripe." in page_html, "book page is missing the Stripe disclosure")
    validation.require("Sold by Blynk Studio, the studio behind How to Kiss Better." in page_html, "book page is missing the seller disclosure")
    validation.require(CONVERSION_CSS_TAG in page_html, "book stylesheet is missing or stale")
    validation.require(PREVIEW_JS_TAG in page_html, "book preview script is missing")
    validation.require(CONVERSION_JS_TAG in page_html, "book conversion script is missing or stale")

    forms = checkout_forms(page_html)
    validation.equal({form_placement(block) for block in forms}, BOOK_PLACEMENTS, "book checkout placement set")
    validation.equal(len(forms), len(BOOK_PLACEMENTS), "book checkout form count")
    for block in forms:
        placement = form_placement(block)
        validate_checkout_form(validation, f"book {placement}", block, src="book", placement=placement, entry="book", cancel="/book/")

    hero_media = [
        ROOT / "assets/images/book-proof/cover-320.avif",
        ROOT / "assets/images/book-proof/commandments-title-480.avif",
        ROOT / "assets/images/book-proof/mirror-technique-480.avif",
    ]
    for asset in hero_media:
        validation.require(asset.exists(), f"missing hero proof asset {asset.relative_to(ROOT)}")
    existing = [asset for asset in hero_media if asset.exists()]
    validation.require(sum(asset.stat().st_size for asset in existing) < 500_000, "initial book proof media exceeds 500 KB")
    cover = ROOT / "assets/images/book-proof/cover-320.avif"
    if cover.exists():
        validation.require(cover.stat().st_size < 200_000, "mobile hero cover exceeds 200 KB")
    return page


def validate_home(validation: Validation) -> Path:
    page = ROOT / "index.html"
    page_html = page.read_text()
    lowered = page_html.lower()
    collector = LinkCollector()
    collector.feed(page_html)
    anchors = set(collector.ids)
    build_blog = load_build_blog()

    for anchor in HOME_ANCHORS:
        validation.require(anchor in anchors, f"homepage is missing stable anchor #{anchor}")
    validation.require(
        '<body class="home-shell" data-page-kind="home" data-article-slug="homepage" data-offer-key="chemistry" data-chapter-id="chapter-12">'
        in page_html,
        "homepage analytics body contract is incomplete",
    )
    for needle, label in (
        ("You think you're a good kisser.", "homepage H1 promise"),
        ("<span>Let's check.</span>", "homepage H1 emphasis"),
        ("Start the Kiss Test", "homepage final CTA"),
        ("Start from the top instead", "homepage hero CTA"),
        ("80+ free guides", "homepage guides claim"),
        ("Thousands of readers a month", "homepage readership line"),
    ):
        validation.require(needle in page_html, f"{label} changed")

    question = build_blog.quiz_question("q1")
    prompt = html.escape(str(question["prompt"]), quote=False)
    validation.equal(page_html.count(f'<p class="home-q1__prompt">{prompt}</p>'), 1, "homepage Q1 prompt")
    for option in question["options"]:
        text = html.escape(str(option["text"]), quote=False)
        validation.equal(page_html.count(f">{text}</a>"), 1, f"homepage Q1 option {option['id']} text")
        validation.equal(page_html.count(f'href="{HOME_HANDOFF}home-hero&amp;q=q1&amp;a={option["id"]}"'), 1, f"homepage Q1 option {option['id']} handoff")
    for placement in ("home-hero", "home-final", "home-mobile-sticky"):
        validation.equal(page_html.count(f'href="{HOME_HANDOFF}{placement}"'), 1, f"homepage {placement} handoff link")

    for needle, count, label in (
        ('class="home-q1__option"', 4, "homepage Q1 option count"),
        ('class="home-archetypes__card"', 7, "homepage archetype card count"),
        ('class="home-guides__chip"', 8, "homepage guide chip count"),
        ('class="home-share"', 1, "homepage share loop count"),
    ):
        validation.equal(page_html.count(needle), count, label)
    validation.require(page_html.count(GUARANTEE_BADGE) >= 2, "homepage guarantee badge count is below two")

    surfaces = Counter()
    for tag in re.findall(r"<(?:div|section|aside)\b[^>]*\bjs-offer\b[^>]*>", page_html):
        match = re.search(r'data-offer-placement="([^"]+)"', tag)
        surfaces[match.group(1) if match else ""] += 1
        validation.require(all(f'{attribute}="' in tag for attribute in REQUIRED_OFFER_ATTRIBUTES), f"homepage offer surface is missing tracking attributes: {tag[:60]}")
    validation.equal(surfaces, HOME_SURFACES, "homepage tracked offer surfaces")
    for marker, label in (
        ("data-home-sticky", "mobile sticky bar"),
        ("data-home-hero-cta", "hero CTA marker"),
        ("homepage_test_led", "conversion campaign"),
    ):
        validation.require(marker in page_html, f"homepage {label} is missing")
    validation.require("app.css" not in page_html, "homepage still loads app.css")
    for needle in HOME_BANNED:
        validation.require(needle not in lowered, f"homepage contains retired or unsupported content: {needle}")
    validation.require(RETIRED_PRICE not in page_html, f"homepage contains the retired {RETIRED_PRICE} price")
    validation.require(not mentions_payhip(page_html), "homepage still mentions Payhip")

    image_tags = re.findall(r"<img\b[^>]*>", page_html)
    for tag in image_tags:
        validation.require(' width="' in tag and ' height="' in tag, f"homepage image is missing its dimensions: {tag[:60]}")
    mini_tags = [tag for tag in image_tags if "-mw-mini.webp" in tag]
    validation.equal(len(mini_tags), len(HOME_ARCHETYPES), "homepage archetype image count")
    validation.equal(sum('loading="lazy"' in tag for tag in mini_tags), 4, "homepage archetype lazy-load split")

    validation.require("Secure checkout by Stripe" in page_html, "homepage is missing the Stripe disclosure")
    validation.require("Sold by Blynk Studio, the studio behind How to Kiss Better." in page_html, "homepage is missing the seller disclosure")
    validation.require('<link rel="canonical" href="https://howtokissbetter.com/">' in page_html, "homepage canonical URL changed")
    validation.require(f'"price": "{BOOK_PRICE}"' in page_html, "homepage schema has the wrong price")
    validation.require("PDF and EPUB" in page_html, "homepage is missing both delivery formats")
    validation.require(PROCESS_LINE in page_html, "homepage book block is missing the process line")
    validate_no_retired_refund_copy(validation, "homepage", page_html)
    validation.require(CONVERSION_CSS_TAG in page_html, "homepage conversion stylesheet is missing or stale")
    validation.require(HOME_CSS_TAG in page_html, "homepage stylesheet is missing or stale")
    validation.require(CONVERSION_JS_TAG in page_html, "homepage conversion script is missing or stale")

    forms = checkout_forms(page_html)
    validation.equal({form_placement(block) for block in forms}, HOME_PLACEMENTS, "homepage checkout placement set")
    validation.equal(len(forms), len(HOME_PLACEMENTS), "homepage checkout form count")
    for block in forms:
        placement = form_placement(block)
        validate_checkout_form(validation, f"homepage {placement}", block, src="homepage", placement=placement, entry="home", cancel="/")

    minis = [ROOT / f"assets/images/kiss-test/archetypes/{archetype}-mw-mini.webp" for archetype in HOME_ARCHETYPES]
    for asset in minis:
        validation.require(asset.exists(), f"missing homepage archetype mini {asset.relative_to(ROOT)}")
        validation.require(f"/{asset.relative_to(ROOT)}" in page_html, f"homepage does not show {asset.name}")
        if asset.exists():
            validation.require(asset.stat().st_size < 20_000, f"homepage archetype mini {asset.name} exceeds 20 KB")
    validation.require(sum(asset.stat().st_size for asset in minis if asset.exists()) < 120_000, "homepage archetype minis exceed 120 KB combined")
    cover = ROOT / "assets/images/book-proof/cover-320.avif"
    validation.require(cover.exists() and cover.stat().st_size < 200_000, "homepage book cover exceeds 200 KB")
    validation.require(len(json.loads((BLOG / "posts.json").read_text())) >= 80, "the homepage 80+ free guides claim outruns blog/posts.json")
    return page


def validate_thanks_page(validation: Validation) -> Path:
    page = ROOT / "book" / "thanks" / "index.html"
    validation.require(page.exists(), "book download page is missing")
    if not page.exists():
        return page
    page_html = page.read_text()
    validation.require('<meta name="robots" content="noindex, follow">' in page_html, "book download page must be noindex")
    validation.require('<link rel="canonical" href="https://howtokissbetter.com/book/thanks/">' in page_html, "book download page canonical is wrong")
    validation.require('data-page-kind="book-thanks"' in page_html, "book download page kind is missing")
    validation.require(f'data-kiss-api="{CHECKOUT_API}"' in page_html, "book download page API origin is missing or stale")
    validation.require("data-thanks-status" in page_html and "data-thanks-downloads" in page_html, "book download page is missing its status or download regions")
    validation.require(SUPPORT_EMAIL in page_html, "book download page is missing the support email")
    validation.require("Your copy of Kiss Perfect Now" in page_html, "book download page heading changed")
    validation.equal(page_html.count(GUARANTEE_BADGE), 1, "book download page guarantee badge count")
    validation.require(f"{GUARANTEE_SENTENCE} You keep the files; I can't take them back." in page_html, "book download page is missing the guarantee sentence")
    validate_no_retired_refund_copy(validation, "book download page", page_html)
    validation.require(RETIRED_PRICE not in page_html and not mentions_payhip(page_html), "book download page carries retired sales copy")
    validation.require(CONVERSION_CSS_TAG in page_html, "book download page stylesheet is missing or stale")
    validation.require(CONVERSION_JS_TAG in page_html, "book download page script is missing or stale")
    return page


def validate_faq_twins(validation: Validation, label: str, page_html: str) -> None:
    """Every FAQPage answer in the JSON-LD must appear verbatim as visible text."""
    faq = None
    for block in re.findall(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", page_html, re.S):
        data = json.loads(block)
        nodes = data.get("@graph", [data]) if isinstance(data, dict) else data
        for node in nodes:
            if isinstance(node, dict) and node.get("@type") == "FAQPage":
                faq = node
    validation.require(faq is not None, f"{label} has no FAQPage schema")
    if faq is None:
        return
    questions = faq.get("mainEntity", [])
    validation.require(len(questions) >= 5, f"{label} FAQPage lists fewer than five questions")
    for question in questions:
        answer = question.get("acceptedAnswer", {}).get("text", "")
        validation.require(bool(answer) and answer in page_html, f"{label} FAQ answer is not visible on the page: {question.get('name', '')[:48]}")


def validate_quiz_pages(validation: Validation) -> None:
    quiz_js = (ROOT / "assets/quiz.js").read_text()
    validation.require('el("span", "kiss-guarantee__keep", "Keep it anyway. I can\'t take it back.")' in quiz_js, "paywall badge keep line is missing from quiz.js")
    validation.require('"conversion-button conversion-sheen quiz-paywall__button"' in quiz_js, "paywall button is missing the sheen class")
    validate_no_retired_refund_copy(validation, "quiz.js", quiz_js)
    for relative in QUIZ_PAGES:
        page = ROOT / relative
        validation.require(page.exists(), f"{relative} is missing")
        if not page.exists():
            continue
        page_html = page.read_text()
        validation.require(CONVERSION_CSS_TAG in page_html and CONVERSION_JS_TAG in page_html, f"{relative} conversion assets are stale")
        validation.require(QUIZ_CSS_TAG in page_html, f"{relative} quiz stylesheet is stale")
        validation.require(QUIZ_JS_TAG in page_html, f"{relative} quiz script is stale")
        validate_no_retired_refund_copy(validation, relative, page_html)
    test_html = (ROOT / "kiss-test/index.html").read_text()
    validation.equal(test_html.count(GUARANTEE_BADGE), 1, "kiss test page guarantee badge count")
    for line in KISS_TEST_LOCKED_LINES:
        validation.equal(test_html.count(line), 1, f"kiss test page locked line count: {line[:40]}")
    validate_faq_twins(validation, "kiss test page", test_html)
    result_html = (ROOT / "kiss-test/result/index.html").read_text()
    validation.equal(result_html.count(GUARANTEE_BADGE), 1, "result page guarantee badge count")
    validation.equal(result_html.count(GUARANTEE_LINE), 1, "result page guarantee line count")
    validation.require(f"{GUARANTEE_SENTENCE} You keep the report; I can't take it back." in result_html, "result page footer is missing the guarantee sentence")


def validate_secondary_pages(validation: Validation) -> list[Path]:
    confirmed = ROOT / "free-chapter-confirmed/index.html"
    confirmed_html = confirmed.read_text()
    validation.require(RETIRED_PRICE not in confirmed_html, f"confirmed page contains the retired {RETIRED_PRICE} price")
    validation.require(f"See the full ${BOOK_PRICE} book" in confirmed_html, "confirmed page book link label is stale")
    validation.require(CONVERSION_CSS_TAG in confirmed_html and CONVERSION_JS_TAG in confirmed_html, "confirmed page assets are stale")

    template_html = (BLOG / "_template.html").read_text()
    validation.require(RETIRED_PRICE not in template_html, f"article template contains the retired {RETIRED_PRICE} price")
    validation.require("<!-- CTA Box -->" in template_html, "article template lost the first-build final offer anchor")
    validation.require(CONVERSION_CSS_TAG in template_html and CONVERSION_JS_TAG in template_html, "article template assets are stale")
    validation.require('<span class="hidden sm:inline">Get the book</span>' in template_html, "article template post-nav label is stale")

    privacy = ROOT / "privacy/index.html"
    privacy_html = privacy.read_text()
    for needle in ("Stripe", "Vercel", "local storage", "Brevo", "Google Analytics"):
        validation.require(needle in privacy_html, f"privacy policy does not mention {needle}")
    validation.require(CONVERSION_JS_TAG in privacy_html, "privacy page script is stale")

    terms = ROOT / "terms/index.html"
    terms_html = terms.read_text()
    for needle in ("Stripe", "one-time charge", "18 or older", "Thirty-Day Guarantee", "within 30 days of purchase", "full-refund guarantee", "nothing is revoked"):
        validation.require(needle in terms_html, f"terms of service do not mention {needle}")
    validation.require(CONVERSION_JS_TAG in terms_html, "terms page script is stale")
    for label, text in (("confirmed page", confirmed_html), ("article template", template_html), ("privacy page", privacy_html), ("terms page", terms_html)):
        validate_no_retired_refund_copy(validation, label, text)
    return [confirmed, privacy, terms]


def validate_tracking_contract(validation: Validation) -> None:
    source = (ROOT / "assets" / "conversion.js").read_text()
    builder_source = (ROOT / "build_blog.py").read_text()
    validation.require('id: "kiss-book"' in source, "tracking script has the wrong product item id")
    validation.require('id: "dbMu6"' not in source, "tracking script still carries the Payhip product ID")
    validation.require(f"price: {BOOK_PRICE}," in source, "tracking script has the wrong product price")
    for event in (
        "offer_view",
        "offer_click",
        "view_item",
        "preview_open",
        "book_pathway_select",
        "home_pathway_select",
        "begin_checkout",
        "generate_lead",
        "unlock_view",
    ):
        validation.require(f'"{event}"' in source, f"tracking script is missing {event}")
    for field in ("page", "article", "placement", "offer_key", "chapter_id", "variant"):
        validation.require(f"{field}:" in source, f"offer event payload is missing {field}")
    for retired in (
        '"kpn_mobile_offer_variant_v1"',
        "applyMobileOfferExperiment",
        "assignedVariant",
        '"183-page kissing guide"',
        "setupExitPopup",
        "data-payhip-checkout",
        "Payhip.Checkout",
        "payhip.js",
    ):
        validation.require(retired not in source, f"tracking script still contains retired code: {retired}")
    validation.require('element.dataset.offerVariant || "not-applicable"' in source, "offer variant fallback is wrong")
    validation.require('"form[data-checkout-form]"' in source, "checkout form binding is missing")
    validation.require("event_callback: submitOnce" in source, "begin_checkout does not gate the submit")
    validation.require('product: "book"' in source, "begin_checkout is missing the product dimension")
    validation.require('"ga_cid"' in source and '"ga_sid"' in source, "checkout forms do not carry the GA ids")
    validation.require('"/api/verify"' in source, "download page verify endpoint is missing")
    validation.require('"kt_book_token_v1"' in source, "download page unlock token key is missing")
    validation.require('"kpn_generate_lead_v2"' in source, "persistent lead guard key is missing")
    validation.require("VALUE_STACK_VARIANT" not in builder_source, "retired broad-test value stack is still generated")
    validation.require('"variant_b"' not in builder_source, "retired broad-test B variant is still generated")
    validation.require("PROOF_LED_" in builder_source, "builder no longer strips the proof-led markers on rebuild")
    validation.require('window.localStorage' in source, "persistent first-party storage is missing")
    validation.require('window.sessionStorage' in source, "session impression dedupe is missing")
    validation.require('classList.contains("mobile-buy-bar")' in source, "mobile buy bar impression branch is missing")
    validation.require('classList.contains("home-sticky-buy")' in source, "homepage sticky impression branch is missing")
    validation.require('document.body.classList.toggle("has-book-sticky", visible)' in source, "book sticky body state is missing")
    validation.require('document.body.classList.toggle("has-home-sticky", visible)' in source, "homepage sticky body state is missing")
    mobile_function = source[source.index("function setupMobileBuyBar"):source.index("function requestedOfferKey")]
    validation.require("has-book-sticky" not in mobile_function, "article mobile bar leaks the book sticky body state")
    validation.require('bar.querySelector("a, button")' in mobile_function, "article mobile bar does not manage the form button")


def validate_site_safety(validation: Validation) -> None:
    sitemap = (ROOT / "sitemap.xml").read_text()
    validation.require("/book/?" not in sitemap and "offer_key=" not in sitemap, "query-string book variants entered the sitemap")
    validation.equal(sitemap.count("https://howtokissbetter.com/book/"), 1, "canonical book sitemap entry count")
    validation.require("/book/thanks/" not in sitemap, "noindex download page entered the sitemap")
    validation.equal(sitemap.count("https://howtokissbetter.com/kiss-test/"), 1, "canonical kiss test sitemap entry count")
    validation.require("/kiss-test/result/" not in sitemap, "noindex quiz result page entered the sitemap")
    validation.require("<loc>https://howtokissbetter.com/kiss-test/</loc>" in sitemap, "kiss test sitemap entry is not a canonical loc")

    forbidden = (
        "xkey" + "sib-",
        "/Us" + "ers/",
        "/Us" + "ers/murph/howtokissbetter/" + "_pri" + "vate",
        "_pri" + "vate/keys.txt",
    )
    # Real Stripe keys and webhook secrets carry a long random tail; the short
    # fixtures in webhook/test (whsec_test, sk_test_checkout) do not.
    forbidden_shapes = tuple(
        re.compile(pattern)
        for pattern in (
            r"sk_(?:live|test)_[A-Za-z0-9]{20,}",
            r"rk_(?:live|test)_[A-Za-z0-9]{20,}",
            r"whsec_[A-Za-z0-9]{20,}",
        )
    )
    non_public_dirs = {".git", ".claude", ".codex", ".venv", "_private", "node_modules", "tmp"}
    public_files = [
        path
        for path in ROOT.rglob("*")
        if path.is_file()
        and not non_public_dirs.intersection(path.parts)
        and path.suffix.lower() in {".html", ".js", ".css", ".json", ".py", ".xml", ".txt", ".md"}
    ]
    for path in public_files:
        text = path.read_text(errors="ignore")
        for token in forbidden:
            validation.require(token not in text, f"{path.relative_to(ROOT)} contains forbidden private or credential material")
        for shape in forbidden_shapes:
            validation.require(not shape.search(text), f"{path.relative_to(ROOT)} contains a credential-shaped string")


def validate_override_failures(validation: Validation) -> None:
    build_blog = load_build_blog()

    invalid_cases = (
        {"cluster": "not-a-cluster"},
        {"cluster": "technique", "chapter_id": "chapter-99"},
        {"cluster": "touch", "preview_anchor": "missing"},
        {"cluster": "practice", "extra": "nope"},
    )
    for case in invalid_cases:
        try:
            build_blog.validate_conversion_override("test-post", case)
        except ValueError:
            validation.require(True, "invalid conversion override rejected")
        else:
            validation.require(False, f"invalid conversion override was accepted: {case}")


def main() -> None:
    validation = Validation()
    catalog = load_catalog()
    validation.require(not (ROOT / "assets" / "offer-catalog.js").exists(), "retired public offer catalog still exists")
    validation.require(not (ROOT / "scripts" / "test_conversion_mobile_offer.mjs").exists(), "retired mobile offer experiment test still exists")
    validate_build_constants(validation)
    validate_buy_hooks(validation, catalog)
    validate_quiz_hooks(validation, catalog)
    validate_engine_sync(validation)
    article_pages = validate_articles(validation, catalog)
    book_page = validate_book(validation)
    home_page = validate_home(validation)
    thanks_page = validate_thanks_page(validation)
    validate_quiz_pages(validation)
    secondary_pages = validate_secondary_pages(validation)
    validate_tracking_contract(validation)
    validate_site_safety(validation)
    validate_override_failures(validation)
    quiz_pages = [(ROOT / relative).resolve() for relative in QUIZ_PAGES]
    pending = frozenset(page for page in quiz_pages if not page.exists())
    for page in pending:
        print(f"NOTICE: {page.relative_to(ROOT)} is not built yet; links into it are not checked")
    validate_local_links(
        validation,
        article_pages
        + [
            book_page,
            home_page,
            thanks_page,
            ROOT / "blog/index.html",
        ]
        + secondary_pages
        + [page for page in quiz_pages if page.exists()],
        pending,
    )
    validation.finish()


if __name__ == "__main__":
    main()
