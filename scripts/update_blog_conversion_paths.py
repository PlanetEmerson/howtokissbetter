#!/usr/bin/env python3
"""Apply the shared conversion blocks to existing generated blog posts."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BLOG = ROOT / "blog"

BREVO_FORM = """            <!-- Native Brevo email capture -->
            <div class="mt-10">
                <p class="text-gold font-sans text-xs font-semibold tracking-widest uppercase mb-3">Free chapter</p>
                <div class="brevo-form-wrap">
                    <iframe
                        class="brevo-form-frame"
                        data-brevo-form
                        title="Get The 10 Kiss Commandments by email"
                        src="https://6cc4ce1f.sibforms.com/v2/serve/MUIFAAlrmfq3XRaAilqRX-igrjTbbRedvh6Q6qI_KNuBpur_axZPoQkG8_uDgYw4XILy75YNSQN32CCcguba-5_Yek2i9gYelnuP_NeV7ZAWwa9Vir9bRyVYGgzxysO4uKBCS43OSxdB3n0qqT90lpkCrB8apiMJ9KvTUjXg7fV0sAM1Vm-IMdAyYgHvJ8OwzQhk4M9k_m74gaFb5w=="
                        width="540"
                        height="430"
                        loading="lazy"></iframe>
                </div>
            </div>

"""

FINAL_OFFER = """            <!-- CTA Box -->
            <div class="js-offer mt-10 p-8 bg-gradient-to-r from-wine/30 to-burgundy/20 border border-gold/30 rounded-xl text-center" data-offer-placement="post-cta">
                <h3 class="font-serif text-2xl text-cream mb-4">Put the Full System in Your Hands</h3>
                <p class="text-gray-400 mb-6">Go from one article to a clear guide for pressure, pace, hands, breath, confidence, and connection.</p>
                <a href="/book/?utm_source=howtokissbetter&amp;utm_medium=site&amp;utm_campaign=conversion_repair&amp;utm_content=post_cta" data-offer-link data-offer-placement="post-cta" class="inline-block bg-gradient-to-r from-gold to-gold-dark text-charcoal font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-lg text-sm sm:text-base hover:opacity-90 transition-opacity">
                    Get Kiss Perfect Now: $4.95
                </a>
            </div>
"""


def update_post(path: Path) -> bool:
    text = path.read_text()
    original = text

    conversion_css = '    <link rel="stylesheet" href="/assets/conversion.css">\n'
    if conversion_css not in text:
        text = text.replace(
            '    <link rel="stylesheet" href="/assets/app.css">\n',
            '    <link rel="stylesheet" href="/assets/app.css">\n' + conversion_css,
            1,
        )
    while conversion_css + conversion_css in text:
        text = text.replace(conversion_css + conversion_css, conversion_css, 1)
    text = text.replace(
        'href="/#preview" class="text-gray-400 hover:text-cream transition-colors text-sm sm:text-base hidden sm:inline">The Book</a>',
        'href="/book/" class="text-gray-400 hover:text-cream transition-colors text-sm sm:text-base hidden sm:inline">The Book</a>',
        1,
    )

    text = re.sub(
        r"\s*<!-- Email Capture -->.*?(?=\s*(?:<!-- CTA Box -->\s*)?<div class=\"mt-10 p-8 bg-gradient-to-r)",
        BREVO_FORM,
        text,
        count=1,
        flags=re.DOTALL,
    )
    text = re.sub(
        r"\s*(?:<!-- CTA Box -->\s*)?<div class=\"mt-10 p-8 bg-gradient-to-r.*?data-cta-location=\"post-cta\".*?</div>",
        FINAL_OFFER,
        text,
        count=1,
        flags=re.DOTALL,
    )

    def book_link(match: re.Match[str]) -> str:
        placement = match.group(1)
        content = placement.replace("-", "_")
        return (
            'href="/book/?utm_source=howtokissbetter&amp;utm_medium=site&amp;'
            f'utm_campaign=conversion_repair&amp;utm_content={content}" '
            f'data-offer-link data-offer-placement="{placement}"'
        )

    text = re.sub(
        r'href="https://payhip\.com/b/(?:YyLMc|dbMu6)" data-product="(?:YyLMc|dbMu6)" data-cta-location="([^"]+)"',
        book_link,
        text,
    )
    text = re.sub(
        r'    <script src="/assets/email-capture\.js" defer></script>.*?(?=</body>)',
        '    <script src="/assets/conversion.js" defer></script>\n',
        text,
        count=1,
        flags=re.DOTALL,
    )
    text = text.replace(
        '                        loading="lazy"\n'
        '                        scrolling="no"></iframe>',
        '                        loading="lazy"></iframe>',
    )
    text = text.replace(
        '</div>            <!-- Native Brevo email capture -->',
        '</div>\n\n            <!-- Native Brevo email capture -->',
    )
    text = text.replace(
        '</div>            <!-- CTA Box -->',
        '</div>\n\n            <!-- CTA Box -->',
    )

    required = (
        "/assets/conversion.css",
        "data-brevo-form",
        "data-offer-placement=\"post-cta\"",
        "/assets/conversion.js",
    )
    missing = [marker for marker in required if marker not in text]
    if missing:
        raise RuntimeError(f"{path}: missing markers after update: {missing}")

    if text != original:
        path.write_text(text)
        return True
    return False


def main() -> None:
    paths = sorted(BLOG.glob("*/index.html"))
    changed = [path for path in paths if update_post(path)]
    print(f"Updated {len(changed)} generated blog posts.")


if __name__ == "__main__":
    main()
