#!/usr/bin/env python3
"""
Blog Builder for howtokissbetter.com.

Usage:
    python3 build_blog.py path/to/post.json
    python3 build_blog.py --from-n8n '{"frontmatter": "...", "article": "..."}'
    python3 build_blog.py --rebuild-listings
"""

from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

# Configuration
ROOT_DIR = Path(__file__).parent
BLOG_DIR = ROOT_DIR / "blog"
POSTS_JSON = BLOG_DIR / "posts.json"
TEMPLATE_FILE = BLOG_DIR / "_template.html"
CATEGORY_DIR = BLOG_DIR / "category"

SITE_NAME = "How to Kiss Better"
SITE_URL = "https://howtokissbetter.com"
BOOK_URL = "/book/"
GA_MEASUREMENT_ID = "G-YNQ785TC90"

CATEGORY_CONFIG = {
    "techniques": {
        "name": "Techniques",
        "title": "Kissing Techniques | How to Kiss Better Blog",
        "description": (
            "Master proven kissing techniques from The Mirror Technique to more "
            "advanced moves that create chemistry and connection."
        ),
        "hero_title": 'Kissing <span class="gradient-text">Techniques</span>',
        "hero_description": (
            "Proven methods that transform how you kiss. From foundational rhythm "
            "to advanced moves that create instant chemistry."
        ),
        "cta_title": "Master Every Technique",
        "cta_description": (
            "These articles cover the fundamentals. The book goes deeper with the "
            "full system behind unforgettable kissing."
        ),
        "intro": ("""<p>Most kissing advice stops at "be gentle and use less tongue." True, but useless on its own. The guides in this section break technique into its actual parts: pressure, rhythm, hands, breathing, and the escalation from a soft first press to <a href="/blog/how-to-make-out/" class="text-gold hover:underline">a proper make-out</a>. Start with <a href="/blog/how-to-kiss/" class="text-gold hover:underline">the complete guide to kissing better</a> if you want the full map, or jump straight to a specific skill like <a href="/blog/how-to-french-kiss/" class="text-gold hover:underline">French kissing</a> or <a href="/blog/what-to-do-with-your-hands-while-kissing/" class="text-gold hover:underline">what to do with your hands</a>. Every article is written to be usable tonight, not someday.</p>"""),
    },
    "first-kiss": {
        "name": "First Kiss",
        "title": "First Kiss Tips & Advice | How to Kiss Better Blog",
        "description": (
            "Overcome first kiss anxiety with proven strategies. Learn when to go "
            "for the kiss, how to read signals, and how to make the moment count."
        ),
        "hero_title": 'First <span class="gradient-text">Kiss</span>',
        "hero_description": (
            "Conquer first kiss nerves, read the signals clearly, and make the "
            "moment feel confident instead of forced."
        ),
        "cta_title": "Never Fear the First Kiss Again",
        "cta_description": (
            "The book includes the complete confidence system, including scripts, "
            "timing cues, and practical ways to build the moment."
        ),
        "intro": ("""<p>A first kiss is mostly a timing and nerves problem, not a technique problem. The articles here deal with the parts people actually worry about: <a href="/blog/how-to-tell-if-someone-wants-to-kiss-you/" class="text-gold hover:underline">reading whether they want to be kissed</a>, picking the moment, and staying calm enough to enjoy it. If your hands shake at the thought, begin with <a href="/blog/first-kiss-nerves-what-actually-matters/" class="text-gold hover:underline">first kiss nerves and what actually matters</a>. If the mechanics worry you more than the moment, <a href="/blog/how-to-kiss-someone-for-the-first-time/" class="text-gold hover:underline">how to kiss someone for the first time</a> walks through every beat, from the lean-in to the pull-back. And yes, there is a guide for <a href="/blog/never-been-kissed/" class="text-gold hover:underline">never having been kissed</a>. No judgment, just a plan.</p>"""),
    },
    "relationships": {
        "name": "Relationships",
        "title": "Kissing in Relationships | How to Kiss Better Blog",
        "description": (
            "Keep chemistry alive in real relationships. Explore kissing, intimacy, "
            "reconnection, and what different kisses actually mean."
        ),
        "hero_title": 'Kissing in <span class="gradient-text">Relationships</span>',
        "hero_description": (
            "For couples, flings, and everything in between: how kissing shapes "
            "connection, trust, and long-term chemistry."
        ),
        "cta_title": "Keep the Spark Alive",
        "cta_description": (
            "The book expands these ideas into a full intimacy system designed to "
            "make connection feel alive again."
        ),
        "intro": ("""<p>Kissing changes after the first month. It stops being an event and starts being a language, and like any language it can go quiet without anyone deciding to stop speaking it. This section covers kissing inside real relationships: <a href="/blog/why-couples-stop-kissing/" class="text-gold hover:underline">why couples stop kissing</a> and how to restart, what different kisses mean (<a href="/blog/what-does-a-forehead-kiss-mean/" class="text-gold hover:underline">forehead</a>, cheek, hand), and the awkward conversations, like <a href="/blog/how-to-tell-someone-theyre-a-bad-kisser/" class="text-gold hover:underline">telling a partner they're a bad kisser</a> without wrecking their confidence. If you want the spark back, start with <a href="/blog/how-long-should-a-kiss-last/" class="text-gold hover:underline">how long a kiss should last</a>. The answer surprises most couples.</p>"""),
    },
    "mistakes": {
        "name": "Mistakes",
        "title": "Kissing Mistakes to Avoid | How to Kiss Better Blog",
        "description": (
            "Spot the habits that make kisses fall flat and learn how to correct "
            "them before they sabotage chemistry."
        ),
        "hero_title": 'Kissing <span class="gradient-text">Mistakes</span>',
        "hero_description": (
            "The turn-offs, misreads, and bad habits that quietly ruin a good kiss, "
            "plus how to fix them fast."
        ),
        "cta_title": "Stop Making Easy-to-Fix Mistakes",
        "cta_description": (
            "The book turns awkward habits into repeatable strengths with a step-by-step system."
        ),
        "intro": ("""<p>Almost nobody is told when they're a bad kisser. Partners just quietly kiss them less. That silence is why the mistakes in this section matter: they're common, fixable, and almost always invisible to the person making them. Start with <a href="/blog/signs-youre-a-bad-kisser/" class="text-gold hover:underline">the signs you're a bad kisser</a> for an honest self-check, then the specific fixes: <a href="/blog/too-much-saliva-when-kissing/" class="text-gold hover:underline">too much saliva</a>, <a href="/blog/why-kissing-feels-awkward/" class="text-gold hover:underline">kisses that feel awkward</a>, and <a href="/blog/how-to-stop-overthinking-when-you-kiss/" class="text-gold hover:underline">overthinking every second of it</a>. Each one traces the habit to its cause and gives you the correction, because a bad kisser is just a good kisser who never got feedback.</p>"""),
    },
    "anatomy": {
        "name": "Anatomy",
        "title": "Kissing Anatomy | How to Kiss Better Blog",
        "description": (
            "Understand the anatomy behind kissing, sensitive zones, and why "
            "certain touches feel so intense."
        ),
        "hero_title": 'Kissing <span class="gradient-text">Anatomy</span>',
        "hero_description": (
            "The nerve endings, pressure points, and sensory mechanics that make "
            "certain kisses hit harder than others."
        ),
        "cta_title": "Use the Body’s Wiring Better",
        "cta_description": (
            "The book shows how to turn anatomy and touch awareness into chemistry "
            "that feels natural rather than mechanical."
        ),
        "intro": ("""<p>Your lips have more nerve endings per square millimeter than almost anywhere else on your body, and most kissing advice ignores everything science knows about them. This section is the owner's manual: <a href="/blog/why-lips-are-so-sensitive/" class="text-gold hover:underline">why lips are so sensitive</a>, <a href="/blog/where-to-kiss-someone/" class="text-gold hover:underline">where to kiss someone</a> for the biggest response, and the mechanical questions everyone quietly Googles, like <a href="/blog/what-to-do-with-your-teeth-when-kissing/" class="text-gold hover:underline">what to do with your teeth</a> and <a href="/blog/what-to-do-with-your-nose-when-kissing/" class="text-gold hover:underline">where your nose goes</a>. Understanding the wiring is the difference between kissing harder and kissing better.</p>"""),
    },
    "science": {
        "name": "Science",
        "title": "The Science of Kissing | How to Kiss Better Blog",
        "description": (
            "Explore the neuroscience, chemistry, and psychology behind why kisses "
            "feel powerful and what that means for better technique."
        ),
        "hero_title": 'The <span class="gradient-text">Science</span> of Kissing',
        "hero_description": (
            "Brain chemistry, sensory amplification, attraction signals, and the "
            "research that explains why some kisses feel unforgettable."
        ),
        "cta_title": "Turn Science Into Better Chemistry",
        "cta_description": (
            "The book takes the research and translates it into practical kissing "
            "moves you can actually use."
        ),
        "intro": ("""<p>A good kiss triggers a measurable chemical event: dopamine, oxytocin, adrenaline, and a heart rate that can double in seconds. The articles here unpack that research in plain language: <a href="/blog/science-of-kissing/" class="text-gold hover:underline">what actually happens when lips touch</a>, <a href="/blog/why-some-kisses-feel-electric/" class="text-gold hover:underline">why some kisses feel electric</a> while others fall flat, and evolutionary puzzles like <a href="/blog/why-do-we-kiss/" class="text-gold hover:underline">why humans kiss at all</a> and <a href="/blog/why-we-close-our-eyes-when-kissing/" class="text-gold hover:underline">why we close our eyes</a>. None of it is trivia for its own sake. Every mechanism explained here maps to something you can do differently the next time you lean in.</p>"""),
    },
    "preparation": {
        "name": "Preparation",
        "title": "How to Prepare for a Better Kiss | How to Kiss Better Blog",
        "description": (
            "Fresh breath, confidence, braces, and the practical prep that makes "
            "kissing smoother before lips even meet."
        ),
        "hero_title": 'Kiss <span class="gradient-text">Preparation</span>',
        "hero_description": (
            "Everything that makes kissing easier before the first move: breath, "
            "comfort, confidence, and practical readiness."
        ),
        "cta_title": "Prepare Like It Matters",
        "cta_description": (
            "The book shows how preparation, timing, and confidence work together "
            "to make the kiss itself effortless."
        ),
        "intro": ("""<p>The kiss is decided before it starts. Chapped lips, worried breath, or the low-grade panic of not feeling ready will sabotage technique you already have. This section handles the prep work: <a href="/blog/how-to-make-your-lips-soft-for-kissing/" class="text-gold hover:underline">getting your lips genuinely soft</a>, <a href="/blog/fresh-breath-before-kissing/" class="text-gold hover:underline">fresh breath you don't have to think about</a>, and the situational fixes for <a href="/blog/how-to-kiss-with-braces/" class="text-gold hover:underline">braces</a>, <a href="/blog/how-to-kiss-with-chapped-lips/" class="text-gold hover:underline">chapped lips</a>, and lipstick. None of this is vanity. It's the difference between being in the kiss and being in your head about it.</p>"""),
    },
    "special-situations": {
        "name": "Special Situations",
        "title": "Special Situation Kissing Advice | How to Kiss Better Blog",
        "description": (
            "Height differences, friendship tension, awkward setups, and the "
            "unusual kissing situations that need better answers."
        ),
        "hero_title": 'Special <span class="gradient-text">Situations</span>',
        "hero_description": (
            "The odd, specific, and unexpectedly common kissing scenarios that "
            "deserve more than generic advice."
        ),
        "cta_title": "Handle the Tricky Situations Better",
        "cta_description": (
            "The book builds the underlying skills that make unusual situations "
            "feel less awkward and more intuitive."
        ),
        "intro": ("""<p>Real kisses rarely happen in ideal conditions. They happen in parked cars, against height differences, wearing glasses, in front of people, or with someone you were "just friends" with an hour ago. This section covers the scenarios standard advice skips: <a href="/blog/how-to-kiss-with-a-height-difference/" class="text-gold hover:underline">kissing with a height difference</a>, <a href="/blog/how-to-kiss-in-public/" class="text-gold hover:underline">public kisses that don't make anyone cringe</a>, <a href="/blog/how-to-kiss-a-friend/" class="text-gold hover:underline">crossing the friend line</a>, and more. The physics change, the logistics change, but the rules of a good kiss stay the same. These guides show you how to adapt.</p>"""),
    },
}

GA_SNIPPET = f"""    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id={GA_MEASUREMENT_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){{dataLayer.push(arguments);}}
      gtag('js', new Date());
      gtag('config', '{GA_MEASUREMENT_ID}');
    </script>
"""

FONT_AND_TAILWIND_SNIPPET = """    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/assets/app.css">
    <link rel="stylesheet" href="/assets/conversion.css">
"""

ARCHIVE_STYLES = """    <style>
        html { scroll-behavior: smooth; }
        .gradient-text {
            background: linear-gradient(135deg, #D4AF37, #B8860B);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .post-card {
            transition: all 0.3s ease;
        }
        .post-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .post-card:hover .post-image {
            transform: scale(1.05);
        }
        .post-image {
            transition: transform 0.5s ease;
        }
        .category-pill {
            transition: all 0.2s ease;
        }
        .category-pill:hover {
            border-color: rgba(212, 175, 55, 0.55);
            color: #FDF8F3;
        }
    </style>
"""

CONVERSION_SNIPPET = """    <script src="/assets/conversion.js" defer></script>
"""


def parse_frontmatter(frontmatter_str: str) -> dict[str, Any]:
    """Parse a constrained YAML frontmatter string into a dict."""
    result: dict[str, Any] = {}
    for line in frontmatter_str.strip().split("\n"):
        if line.startswith("---"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            value = [v.strip().strip('"\'') for v in value[1:-1].split(",") if v.strip()]
        elif value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        result[key] = value
    return result


def markdown_to_html(markdown: str) -> str:
    """Convert markdown to HTML for the blog template."""
    html_text = markdown

    html_text = re.sub(r"^# .+\n", "", html_text, flags=re.MULTILINE)
    html_text = re.sub(r"^## (.+)$", r'<h2 id="\1">\1</h2>', html_text, flags=re.MULTILINE)
    html_text = re.sub(r"^### (.+)$", r"<h3>\1</h3>", html_text, flags=re.MULTILINE)

    def clean_id(match: re.Match[str]) -> str:
        text = match.group(1)
        id_text = re.sub(r"[^a-zA-Z0-9\s]", "", text).lower().replace(" ", "-")
        return f'<h2 id="{id_text}">{text}</h2>'

    html_text = re.sub(r'<h2 id="[^"]+">(.+)</h2>', clean_id, html_text)
    html_text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html_text)
    html_text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", html_text)
    html_text = re.sub(r"^> (.+)$", r"<blockquote>\1</blockquote>", html_text, flags=re.MULTILINE)

    def replace_link(match: re.Match[str]) -> str:
        text, url = match.group(1), match.group(2)
        if url.startswith("/") or url.startswith("#"):
            return f'<a href="{url}">{text}</a>'
        return f'<a href="{url}" target="_blank" rel="noopener">{text}</a>'

    html_text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", replace_link, html_text)

    lines = html_text.split("\n")
    in_list = False
    result: list[str] = []
    for line in lines:
        if line.strip().startswith("- "):
            if not in_list:
                result.append("<ul>")
                in_list = True
            result.append(f"<li>{line.strip()[2:]}</li>")
        else:
            if in_list:
                result.append("</ul>")
                in_list = False
            result.append(line)
    if in_list:
        result.append("</ul>")
    html_text = "\n".join(result)

    paragraphs: list[str] = []
    current: list[str] = []
    block_tags = ["h2", "h3", "ul", "ol", "blockquote", "aside"]
    for line in html_text.split("\n"):
        line = line.strip()
        if not line:
            if current:
                text = " ".join(current)
                if not any(text.startswith(f"<{tag}") for tag in block_tags):
                    text = f"<p>{text}</p>"
                paragraphs.append(text)
                current = []
            continue
        if (
            line.startswith("<h")
            or line.startswith("<ul")
            or line.startswith("<ol")
            or line.startswith("<blockquote")
            or line.startswith("</")
        ):
            if current:
                text = " ".join(current)
                if not any(text.startswith(f"<{tag}") for tag in ["h2", "h3", "ul", "ol", "blockquote"]):
                    text = f"<p>{text}</p>"
                paragraphs.append(text)
                current = []
            paragraphs.append(line)
        else:
            current.append(line)

    if current:
        text = " ".join(current)
        if not any(text.startswith(f"<{tag}") for tag in ["h2", "h3", "ul", "ol", "blockquote"]):
            text = f"<p>{text}</p>"
        paragraphs.append(text)

    return "\n\n".join(paragraphs)


def extract_toc(html_content: str) -> str:
    """Extract TOC items from H2 tags with IDs."""
    toc_items = []
    for match in re.finditer(r'<h2 id="([^"]+)">(.+?)</h2>', html_content):
        toc_items.append(f'<li><a href="#{match.group(1)}">{match.group(2)}</a></li>')
    return "\n                            ".join(toc_items)


def slugify_category(category: str) -> str:
    """Convert category name to a URL-friendly slug."""
    return re.sub(r"[^a-z0-9]+", "-", category.lower()).strip("-")


def parse_date(date_str: str) -> datetime:
    """Parse either ISO or display dates used by the blog."""
    for fmt in ("%Y-%m-%d", "%B %d, %Y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return datetime.min


def format_date(date_str: str) -> str:
    """Format an ISO date as 'December 21, 2025'."""
    parsed = parse_date(date_str)
    if parsed == datetime.min:
        return date_str
    return parsed.strftime("%B %d, %Y")


def read_posts() -> list[dict[str, Any]]:
    """Load and normalize the posts manifest."""
    posts = json.loads(POSTS_JSON.read_text()) if POSTS_JSON.exists() else []
    for post in posts:
        post["category_slug"] = slugify_category(post["category"])
    posts.sort(key=lambda item: parse_date(item["date"]), reverse=True)
    return posts


def render_post_card(post: dict[str, Any], include_date: bool = True) -> str:
    """Render a static blog card."""
    title = html.escape(post["title"])
    description = html.escape(post["description"])
    slug = html.escape(post["slug"])
    category = html.escape(post["category"])
    date_row = ""
    if include_date:
        date_row = (
            f'<div class="flex justify-between items-center text-sm text-gray-500">'
            f"<span>{html.escape(post['date'])}</span>"
            f'<span class="text-gold">Read more &rarr;</span>'
            f"</div>"
        )
    else:
        date_row = '<span class="text-gold text-sm">Read more &rarr;</span>'

    return f"""                <article class="post-card bg-wine/20 border border-gold/20 rounded-xl overflow-hidden">
                    <a href="/blog/{slug}/">
                        <div class="aspect-video overflow-hidden">
                            <img src="/blog/{slug}/thumb.webp" alt="{title}"
                                 class="post-image w-full h-full object-cover" loading="lazy" width="400" height="225">
                        </div>
                        <div class="p-6">
                            <p class="text-gold text-sm font-medium uppercase tracking-wider mb-2">{category}</p>
                            <h2 class="font-serif text-xl lg:text-2xl font-bold text-cream mb-3 leading-tight">{title}</h2>
                            <p class="text-gray-400 text-sm line-clamp-2 mb-4">{description}</p>
                            {date_row}
                        </div>
                    </a>
                </article>"""


def render_related_posts(posts: list[dict[str, Any]], slug: str, category: str) -> str:
    """Render a static related-posts grid for new posts.

    Picks up to 6 related posts — 4 from same category first, then fill with
    other categories. More links = more crawl paths for Google.
    """
    same_category = [post for post in posts if post["slug"] != slug and post["category"] == category]
    others = [post for post in posts if post["slug"] != slug and post["category"] != category]
    related = (same_category[:4] + others)[:6]
    if not related:
        return ""

    cards = []
    for post in related:
        cards.append(
            f"""                <a href="/blog/{html.escape(post['slug'])}/" class="block bg-wine/20 border border-gold/20 rounded-xl overflow-hidden hover:border-gold/40 transition-colors group">
                    <div class="aspect-video overflow-hidden">
                        <img src="/blog/{html.escape(post['slug'])}/thumb.webp" alt="{html.escape(post['title'])}" loading="lazy" width="400" height="225" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                    </div>
                    <div class="p-5">
                        <p class="text-gold text-xs font-medium uppercase tracking-wider mb-2">{html.escape(post['category'])}</p>
                        <h3 class="font-serif text-lg text-cream group-hover:text-gold transition-colors leading-snug mb-2">{html.escape(post['title'])}</h3>
                        <p class="text-gray-400 text-sm line-clamp-2">{html.escape(post.get('description', ''))}</p>
                    </div>
                </a>"""
        )
    return "\n".join(cards)


def category_metadata(category_slug: str) -> dict[str, str]:
    """Return the configured metadata for a category page."""
    if category_slug in CATEGORY_CONFIG:
        return CATEGORY_CONFIG[category_slug]
    category_name = category_slug.replace("-", " ").title()
    return {
        "name": category_name,
        "title": f"{category_name} | {SITE_NAME} Blog",
        "description": f"Read {category_name.lower()} articles from {SITE_NAME}.",
        "hero_title": html.escape(category_name),
        "hero_description": f"Browse {category_name.lower()} articles from {SITE_NAME}.",
        "cta_title": "Get the Complete System",
        "cta_description": "The book expands the best lessons from the blog into a complete, structured framework.",
    }


def build_archive_head(title: str, description: str, canonical: str, schema: dict[str, Any]) -> str:
    """Render the shared head for archive pages."""
    title_attr = html.escape(title)
    description_attr = html.escape(description, quote=True)
    canonical_attr = html.escape(canonical, quote=True)
    schema_json = json.dumps(schema, ensure_ascii=False, indent=4)
    return f"""<head>
    <meta charset="UTF-8">
{GA_SNIPPET}    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Primary Meta Tags -->
    <title>{title_attr}</title>
    <meta name="description" content="{description_attr}">
    <meta name="author" content="C.J. McKenna">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{canonical_attr}">
    <link rel="alternate" type="application/rss+xml" title="How to Kiss Better Blog" href="/blog/feed.xml">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="{canonical_attr}">
    <meta property="og:title" content="{title_attr}">
    <meta property="og:description" content="{description_attr}">
    <meta property="og:image" content="{SITE_URL}/assets/images/hero-bg-v2.png">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title_attr}">
    <meta name="twitter:description" content="{description_attr}">
    <meta name="twitter:image" content="{SITE_URL}/assets/images/hero-bg-v2.png">

    <!-- Favicon -->
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💋</text></svg>">

{FONT_AND_TAILWIND_SNIPPET}{ARCHIVE_STYLES}
    <!-- JSON-LD Schema -->
    <script type="application/ld+json">
{schema_json}
    </script>
</head>"""


def render_site_header(active_blog: bool = False) -> str:
    """Render the shared archive-page header."""
    blog_class = "text-gold font-medium" if active_blog else "text-gray-400 hover:text-cream"
    return f"""    <!-- HEADER -->
    <header class="py-4 sm:py-6 px-4 sm:px-6 border-b border-gold/10">
        <div class="max-w-6xl mx-auto flex justify-between items-center gap-4">
            <a href="/" class="font-serif text-lg sm:text-2xl text-cream hover:text-gold transition-colors whitespace-nowrap">
                <span class="sm:hidden">Kiss <span class="gradient-text">Better</span></span>
                <span class="hidden sm:inline">How to <span class="gradient-text">Kiss Better</span></span>
            </a>
            <nav class="flex gap-4 sm:gap-8 items-center">
                <a href="/blog/" class="{blog_class} transition-colors text-sm sm:text-base">Blog</a>
                <a href="{BOOK_URL}" class="text-gray-400 hover:text-cream transition-colors text-sm sm:text-base hidden sm:inline">The Book</a>
                <a href="{BOOK_URL}?utm_source=howtokissbetter&utm_medium=site&utm_campaign=conversion_repair&utm_content=archive_nav" data-offer-link data-offer-placement="archive-nav" class="bg-gold text-charcoal font-semibold py-2 px-4 sm:px-6 rounded-lg hover:bg-gold-dark transition-colors text-sm sm:text-base whitespace-nowrap">
                    <span class="sm:hidden">Get Book</span>
                    <span class="hidden sm:inline">Get the Book</span>
                </a>
            </nav>
        </div>
    </header>"""


def render_footer() -> str:
    """Render the shared footer."""
    return """    <!-- FOOTER -->
    <footer class="py-12 px-6 border-t border-gold/10">
        <div class="max-w-4xl mx-auto">
            <div class="flex flex-col md:flex-row justify-between items-center gap-6">
                <div class="text-center md:text-left">
                    <a href="/" class="font-serif text-xl text-cream hover:text-gold transition-colors">How to <span class="gradient-text">Kiss Better</span></a>
                </div>
                <div class="flex gap-6 text-sm text-gray-500">
                    <a href="/" class="hover:text-gold transition-colors">Home</a>
                    <a href="/blog/" class="hover:text-gold transition-colors">Blog</a>
                    <a href="/privacy/" class="hover:text-gold transition-colors">Privacy Policy</a>
                    <a href="/terms/" class="hover:text-gold transition-colors">Terms of Service</a>
                </div>
            </div>
            <div class="site-footer-meta">
                <p class="site-footer-copyright">&copy; 2026 C.J. McKenna. All rights reserved.</p>
                <a class="blynk-footer-badge"
                    href="https://www.blynk.studio/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Visit Blynk Studio, the team that crafted this website (opens in a new tab)">
                    <span class="blynk-footer-copy">
                        <span class="blynk-footer-kicker">Proudly crafted by</span>
                        <span class="blynk-footer-services">Strategy · design · development</span>
                    </span>
                    <span class="blynk-footer-brand" aria-hidden="true">
                        <img class="blynk-footer-logo" src="/assets/images/blynk-wordmark-nav.avif" alt="" width="96" height="41" loading="lazy" decoding="async">
                        <span class="blynk-footer-arrow">↗</span>
                    </span>
                </a>
            </div>
        </div>
    </footer>"""


def render_category_nav(posts: list[dict[str, Any]]) -> str:
    """Render static category pills for the main blog index."""
    counts: dict[str, int] = {}
    labels: dict[str, str] = {}
    for post in posts:
        slug = post["category_slug"]
        counts[slug] = counts.get(slug, 0) + 1
        labels.setdefault(slug, post["category"])

    ordered_slugs = [slug for slug in CATEGORY_CONFIG if slug in counts]
    pills = []
    for slug in ordered_slugs:
        label = html.escape(labels[slug])
        count = counts[slug]
        pills.append(
            f'<a href="/blog/category/{slug}/" class="category-pill border border-gold/20 rounded-full px-4 py-2 text-sm text-gray-300">'
            f"{label} <span class=\"text-gold\">({count})</span></a>"
        )
    return "\n                ".join(pills)


def render_blog_index(posts: list[dict[str, Any]]) -> str:
    """Render a fully static blog index from posts.json."""
    cards = "\n".join(render_post_card(post) for post in posts)
    category_nav = render_category_nav(posts)
    schema = {
        "@context": "https://schema.org",
        "@type": "Blog",
        "name": f"{SITE_NAME} Blog",
        "description": "Expert kissing advice, techniques, and tips from C.J. McKenna.",
        "url": f"{SITE_URL}/blog/",
        "author": {
            "@type": "Person",
            "name": "C.J. McKenna",
            "url": SITE_URL,
            "jobTitle": "Author and Intimacy Expert",
            "knowsAbout": [
                "Kissing Techniques",
                "Intimacy",
                "Relationship Science",
                "Body Language",
                "Physical Chemistry",
            ],
            "description": "Author of Kiss Perfect Now and intimacy expert specializing in the art of kissing.",
        },
        "publisher": {
            "@type": "Organization",
            "name": SITE_NAME,
            "url": SITE_URL,
        },
    }
    post_count = len(posts)
    head = build_archive_head(
        f"Kissing Advice Blog: All {post_count} Guides | How to Kiss Better",
        "Browse every kissing guide from C.J. McKenna in one place: first kisses, technique, practice methods, and the science behind a great kiss.",
        f"{SITE_URL}/blog/",
        schema,
    )
    return f"""<!DOCTYPE html>
<html lang="en">
{head}
<body class="bg-charcoal text-off-white font-sans antialiased">

{render_site_header(active_blog=True)}

    <!-- HERO -->
    <section class="py-16 sm:py-20 px-6">
        <div class="max-w-4xl mx-auto text-center">
            <p class="text-gold font-medium tracking-widest uppercase text-sm mb-4">The Blog</p>
            <h1 class="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                Kissing Tips & <span class="gradient-text">Techniques</span>
            </h1>
            <p class="text-xl text-gray-300 max-w-2xl mx-auto mb-6">
                {post_count} long-form articles from C.J. McKenna on the technique, science, and emotional logic of kissing well. Research-backed, experience-tested, and written for the parts most tips skip.
            </p>
            <p class="text-base text-gray-500 max-w-2xl mx-auto">
                Start with the fundamentals or jump straight to whatever is on your mind — first kiss nerves, practice methods, height differences, making out, or the neuroscience of why kisses feel the way they do.
            </p>
        </div>
    </section>

    <!-- START HERE -->
    <section class="px-6 pb-6">
        <div class="max-w-4xl mx-auto">
            <div class="bg-wine/20 border border-gold/20 rounded-2xl p-6 sm:p-8">
                <p class="text-gold font-medium tracking-widest uppercase text-xs mb-4 text-center">New Here? Start With These</p>
                <div class="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[0.98rem]">
                    <a href="/blog/how-to-kiss/" class="text-gray-200 hover:text-gold transition-colors">→ How to Kiss Better: The Complete Guide</a>
                    <a href="/blog/how-to-be-a-better-kisser/" class="text-gray-200 hover:text-gold transition-colors">→ How to Be a Better Kisser: 7 Techniques That Actually Work</a>
                    <a href="/blog/how-to-kiss-someone-for-the-first-time/" class="text-gray-200 hover:text-gold transition-colors">→ How to Kiss Someone for the First Time</a>
                    <a href="/blog/how-to-practice-kissing/" class="text-gray-200 hover:text-gold transition-colors">→ How to Practice Kissing: 7 Methods That Actually Work</a>
                    <a href="/blog/science-of-kissing/" class="text-gray-200 hover:text-gold transition-colors">→ The Science of Kissing: What Actually Happens When Lips Touch</a>
                    <a href="/blog/what-makes-a-good-kisser/" class="text-gray-200 hover:text-gold transition-colors">→ What Makes a Good Kisser: The Honest Answer</a>
                    <a href="/blog/how-to-french-kiss/" class="text-gray-200 hover:text-gold transition-colors">→ How to French Kiss: A Complete Guide</a>
                </div>
            </div>
        </div>
    </section>

    <!-- CATEGORY NAV -->
    <section class="px-6 pb-8">
        <div class="max-w-6xl mx-auto flex flex-wrap gap-3 justify-center">
                {category_nav}
        </div>
    </section>

    <!-- BLOG POSTS GRID -->
    <section class="py-12 px-6">
        <div class="max-w-6xl mx-auto">
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8" id="posts-grid">
{cards}
            </div>
        </div>
    </section>

    <!-- AUTHOR / E-E-A-T -->
    <section class="py-16 px-6 bg-wine/5 border-t border-gold/10">
        <div class="max-w-4xl mx-auto">
            <div class="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8">
                <img src="/assets/images/author-silhouette.png" alt="C.J. McKenna" class="w-24 h-24 md:w-28 md:h-28 rounded-full border-2 border-gold/30 flex-shrink-0">
                <div class="text-center md:text-left">
                    <p class="text-gold font-medium text-xs uppercase tracking-widest mb-2">About the Author</p>
                    <h2 class="font-serif text-2xl sm:text-3xl text-cream mb-3">C.J. McKenna</h2>
                    <p class="text-gray-300 leading-relaxed mb-3">
                        Author of <em class="text-cream">Kiss Perfect Now: A Master Class in Kissology</em>, an intimacy expert whose work focuses on the mechanics, neuroscience, and emotional practice of kissing well. Every article here reflects first-hand coaching experience and peer-reviewed research — the goal is advice that holds up under a microscope and still works at dinner.
                    </p>
                    <p class="text-gray-400 text-sm">
                        Topics of focus: kissing techniques, intimacy, relationship science, body language, physical chemistry.
                    </p>
                </div>
            </div>
        </div>
    </section>

{render_footer()}
{CONVERSION_SNIPPET}
</body>
</html>
"""


def render_category_page(category_slug: str, category_posts: list[dict[str, Any]]) -> str:
    """Render a fully static category page."""
    metadata = category_metadata(category_slug)
    cards = "\n".join(render_post_card(post) for post in category_posts)
    schema = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": metadata["name"],
        "description": metadata["description"],
        "url": f"{SITE_URL}/blog/category/{category_slug}/",
        "isPartOf": {
            "@type": "Blog",
            "name": f"{SITE_NAME} Blog",
            "url": f"{SITE_URL}/blog/",
        },
    }
    head = build_archive_head(
        metadata["title"],
        metadata["description"],
        f"{SITE_URL}/blog/category/{category_slug}/",
        schema,
    )
    hero_title = metadata["hero_title"]
    hero_description = html.escape(metadata["hero_description"])
    cta_title = html.escape(metadata["cta_title"])
    cta_description = html.escape(metadata["cta_description"])
    intro_html = ""
    if metadata.get("intro"):
        intro_html = f"""
    <!-- CATEGORY INTRO -->
    <section class="px-6 pb-4">
        <div class="max-w-3xl mx-auto">
            <div class="text-gray-300 leading-relaxed space-y-4 text-lg">
                {metadata["intro"]}
            </div>
        </div>
    </section>
"""
    return f"""<!DOCTYPE html>
<html lang="en">
{head}
<body class="bg-charcoal text-off-white font-sans antialiased">

{render_site_header(active_blog=True)}

    <!-- HERO -->
    <section class="py-20 px-6">
        <div class="max-w-4xl mx-auto text-center">
            <a href="/blog/" class="text-gold text-sm font-medium tracking-widest uppercase mb-4 inline-block hover:underline">&larr; All Posts</a>
            <h1 class="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                {hero_title}
            </h1>
            <p class="text-xl text-gray-400 max-w-2xl mx-auto">
                {hero_description}
            </p>
        </div>
    </section>
{intro_html}
    <!-- POSTS GRID -->
    <section class="py-12 px-6">
        <div class="max-w-6xl mx-auto">
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8" id="posts-grid">
{cards}
            </div>
        </div>
    </section>

    <!-- CTA SECTION -->
    <section class="py-24 px-6 bg-gradient-to-b from-wine/20 to-charcoal">
        <div class="max-w-2xl mx-auto text-center">
            <h2 class="font-serif text-3xl sm:text-4xl font-bold mb-6">{cta_title}</h2>
            <p class="text-gray-400 text-lg mb-8">
                {cta_description}
            </p>
            <a href="{BOOK_URL}?utm_source=howtokissbetter&utm_medium=site&utm_campaign=conversion_repair&utm_content=category_cta" data-offer-link data-offer-placement="category-cta" class="bg-gradient-to-r from-gold to-gold-dark text-charcoal font-bold py-4 px-10 rounded-lg text-lg inline-block hover:opacity-90 transition-opacity">
                Get Kiss Perfect Now
            </a>
        </div>
    </section>

{render_footer()}
{CONVERSION_SNIPPET}
</body>
</html>
"""


def rebuild_archive_pages() -> None:
    """Generate the blog index and all category pages from posts.json."""
    posts = read_posts()
    BLOG_DIR.joinpath("index.html").write_text(render_blog_index(posts))

    grouped: dict[str, list[dict[str, Any]]] = {}
    for post in posts:
        grouped.setdefault(post["category_slug"], []).append(post)

    for category_slug, category_posts in grouped.items():
        category_path = CATEGORY_DIR / category_slug
        category_path.mkdir(parents=True, exist_ok=True)
        category_path.joinpath("index.html").write_text(render_category_page(category_slug, category_posts))

    print("Rebuilt blog index and category pages.")


def build_post(data: dict[str, Any]) -> None:
    """Build a blog post from n8n data."""
    fm = parse_frontmatter(data["frontmatter"])

    title = fm.get("title", "Untitled")
    description = fm.get("description", "")
    slug = fm.get("slug", title.lower().replace(" ", "-"))
    date = fm.get("date", datetime.now().strftime("%Y-%m-%d"))
    date_formatted = format_date(date)
    date_modified = fm.get("dateModified") or fm.get("date_modified") or datetime.now().strftime("%Y-%m-%d")
    category = fm.get("category", "General")
    tags = fm.get("tags", [])
    keyword = data.get("keyword", title)

    content = markdown_to_html(data["article"])
    template = TEMPLATE_FILE.read_text()

    existing_posts = read_posts()
    related_posts = render_related_posts(existing_posts, slug, category)

    page_html = template
    replacements = {
        "{{TITLE}}": title,
        "{{DESCRIPTION}}": description,
        "{{SLUG}}": slug,
        "{{DATE}}": date,
        "{{DATE_MODIFIED}}": date_modified,
        "{{DATE_FORMATTED}}": date_formatted,
        "{{CATEGORY}}": category,
        "{{KEYWORD}}": keyword,
        "{{CONTENT}}": content,
        "{{TOC_ITEMS}}": extract_toc(content),
        "{{CATEGORY_SLUG}}": slugify_category(category),
        "{{RELATED_POSTS}}": related_posts,
    }
    for placeholder, value in replacements.items():
        page_html = page_html.replace(placeholder, value)

    post_dir = BLOG_DIR / slug
    post_dir.mkdir(exist_ok=True)
    post_dir.joinpath("index.html").write_text(page_html)
    print(f"Created: {post_dir / 'index.html'}")

    posts = [post for post in existing_posts if post.get("slug") != slug]
    posts.insert(
        0,
        {
            "title": title,
            "description": description,
            "slug": slug,
            "date": date_formatted,
            "category": category,
            "tags": tags if isinstance(tags, list) else [tags],
        },
    )
    posts.sort(key=lambda item: parse_date(item["date"]), reverse=True)
    POSTS_JSON.write_text(json.dumps(posts, indent=4))
    print(f"Updated: {POSTS_JSON}")

    rebuild_archive_pages()

    print(f"\n✅ Post created: /blog/{slug}/")
    print(f"📸 Remember to add featured image: /blog/{slug}/featured.jpg")


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Build posts and static listings for howtokissbetter.com")
    parser.add_argument("path", nargs="?", help="Path to a post JSON file")
    parser.add_argument("--from-n8n", dest="from_n8n", help="Raw n8n JSON payload")
    parser.add_argument("--rebuild-listings", action="store_true", help="Regenerate /blog/ and /blog/category/* pages from posts.json")
    parser.add_argument("--rebuild-all", action="store_true", help="Rebuild all posts from their post.json files with fresh dateModified")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.rebuild_all:
        post_jsons = sorted(BLOG_DIR.glob("*/post.json"))
        print(f"Rebuilding {len(post_jsons)} posts from post.json files...")
        for post_json in post_jsons:
            data = json.loads(post_json.read_text())
            build_post(data)
        rebuild_archive_pages()
        print("Done.")
        return

    if args.rebuild_listings:
        rebuild_archive_pages()
        return

    if args.from_n8n:
        build_post(json.loads(args.from_n8n))
        return

    if args.path:
        with open(args.path) as file_handle:
            build_post(json.load(file_handle))
        return

    raise SystemExit("Usage: python3 build_blog.py path/to/post.json | --from-n8n '{...}' | --rebuild-listings")


if __name__ == "__main__":
    main()
