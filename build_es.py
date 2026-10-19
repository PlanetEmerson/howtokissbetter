#!/usr/bin/env python3
"""Build the Spanish edition: es/<slug>/index.html from es/<slug>/post.json, plus the /es/ hub.

    python3 build_es.py

A post.json holds the frontmatter (title, description, seo_title, seo_description, slug,
en_slug, date, dateModified, category, short_answer) and the article, in the markdown
build_blog.py reads, with the FAQ under "## Preguntas frecuentes". Each page pairs with its
English twin (en_slug) through hreflang, in the page head and in sitemap.xml (by hand, like
every sitemap URL). Images come from the twin's folder, so the edition needs none of its own.
"""
from __future__ import annotations

import html
import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path

from build_blog import ASSET_VERSION, SITE_URL, markdown_to_html, og_image_dimensions, parse_frontmatter

ROOT = Path(__file__).parent
ES_DIR = ROOT / "es"
TEMPLATE = ES_DIR / "_template.html"
FAQ_HEADING = "Preguntas frecuentes"
MONTHS = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
          "septiembre", "octubre", "noviembre", "diciembre")

FOOTER = """    <!-- FOOTER -->
    <footer class="py-12 px-4 sm:px-6 border-t border-gold/10">
        <div class="max-w-4xl mx-auto">
            <div class="flex flex-col md:flex-row justify-between items-center gap-6">
                <div class="text-center md:text-left">
                    <a href="/es/" class="font-serif text-xl text-cream hover:text-gold transition-colors">How to <span class="gradient-text">Kiss Better</span></a>
                </div>
                <nav class="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2 text-sm text-gray-500">
                    <a href="/es/" class="hover:text-gold transition-colors whitespace-nowrap">Guías en español</a>
                    <a href="/" hreflang="en" class="hover:text-gold transition-colors whitespace-nowrap">English</a>
                    <a href="/kiss-test/" hreflang="en" class="hover:text-gold transition-colors whitespace-nowrap">Kiss Test</a>
                    <a href="/privacy/" hreflang="en" class="hover:text-gold transition-colors whitespace-nowrap">Privacidad</a>
                    <a href="/terms/" hreflang="en" class="hover:text-gold transition-colors whitespace-nowrap">Términos</a>
                </nav>
            </div>
            <div class="site-footer-meta">
                <p class="site-footer-copyright">&copy; 2026 C.J. McKenna. Todos los derechos reservados.</p>
            </div>
        </div>
    </footer>"""


def spanish_date(date: str) -> str:
    day = datetime.strptime(date, "%Y-%m-%d")
    return f"{day.day} de {MONTHS[day.month - 1]} de {day.year}"


def heading_id(text: str) -> str:
    # build_blog drops every non-ASCII letter, so "Cuánto" would become "cunto".
    plain = unicodedata.normalize("NFKD", html.unescape(re.sub(r"<[^>]+>", "", text)))
    plain = plain.encode("ascii", "ignore").decode()
    return re.sub(r"\s+", "-", re.sub(r"[^a-zA-Z0-9\s]", "", plain).strip()).lower()


def render_article(markdown: str) -> str:
    content = markdown_to_html(markdown)
    return re.sub(r'<h2 id="[^"]*">(.+?)</h2>', lambda m: f'<h2 id="{heading_id(m.group(1))}">{m.group(1)}</h2>', content)


def faq_schema(content: str) -> str:
    """FAQPage JSON-LD from the visible FAQ, word for word, so seo_check's parity check holds."""
    start = content.find(f">{FAQ_HEADING}</h2>")
    if start < 0:
        return ""
    pairs = re.findall(r"<h3>(.+?)</h3>\s*<p>(.+?)</p>", content[start:], flags=re.S)
    plain = lambda fragment: html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()
    schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "inLanguage": "es",
        "mainEntity": [
            {"@type": "Question", "name": plain(q), "acceptedAnswer": {"@type": "Answer", "text": plain(a)}}
            for q, a in pairs
        ],
    }
    return f'    <script type="application/ld+json">\n{json.dumps(schema, ensure_ascii=False)}\n    </script>\n'


def short_answer(text: str) -> str:
    if not text:
        return ""
    answer = markdown_to_html(text).removeprefix("<p>").removesuffix("</p>")
    return f"""<!-- Answer-First Summary -->
            <div class="mb-10 p-6 bg-wine/10 border-l-4 border-gold rounded-r-lg">
                <p class="text-gold font-sans text-xs font-semibold tracking-widest uppercase mb-2">La respuesta corta</p>
                <p class="text-cream text-lg leading-relaxed">
                    {answer}
                </p>
            </div>

            """


def card(post: dict, heading: str = "h3") -> str:
    title, en = html.escape(post["title"]), html.escape(post["en_slug"])
    return f"""                <a href="/es/{html.escape(post['slug'])}/" class="block bg-wine/20 border border-gold/20 rounded-xl overflow-hidden hover:border-gold/40 transition-colors group">
                    <div class="aspect-video overflow-hidden">
                        <img src="/blog/{en}/thumb.webp" alt="{title}" loading="lazy" width="400" height="225" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                    </div>
                    <div class="p-5">
                        <p class="text-gold text-xs font-medium uppercase tracking-wider mb-2">{html.escape(post['category'])}</p>
                        <{heading} class="font-serif text-lg text-cream group-hover:text-gold transition-colors leading-snug mb-2">{title}</{heading}>
                        <p class="text-gray-400 text-sm line-clamp-2">{html.escape(post['description'])}</p>
                    </div>
                </a>"""


def read_posts() -> list[dict]:
    posts = []
    for source in sorted(ES_DIR.glob("*/post.json")):
        data = json.loads(source.read_text())
        post = parse_frontmatter(data["frontmatter"])
        post["article"] = data["article"]
        if post["slug"] != source.parent.name:
            raise SystemExit(f"{source}: slug {post['slug']!r} does not match its folder")
        if not (ROOT / "blog" / post["en_slug"] / "index.html").exists():
            raise SystemExit(f"{source}: no English twin at blog/{post['en_slug']}/")
        posts.append(post)
    return sorted(posts, key=lambda post: post["date"], reverse=True)


def build_post(post: dict, posts: list[dict]) -> None:
    content = render_article(post["article"])
    toc = "\n                            ".join(
        f'<li><a href="#{anchor}">{text}</a></li>' for anchor, text in re.findall(r'<h2 id="([^"]+)">(.+?)</h2>', content)
    )
    others = [other for other in posts if other["slug"] != post["slug"]]
    social_title = post.get("seo_title") or post["title"]
    replacements = {
        "{{SEO_TITLE}}": html.escape(social_title),
        "{{SOCIAL_TITLE}}": html.escape(social_title),
        "{{SEO_DESCRIPTION}}": html.escape(post.get("seo_description") or post["description"]),
        "{{TITLE}}": html.escape(post["title"]),
        "{{DESCRIPTION}}": html.escape(post["description"]),
        "{{SLUG}}": post["slug"],
        "{{EN_SLUG}}": post["en_slug"],
        "{{DATE}}": post["date"],
        "{{DATE_MODIFIED}}": post.get("dateModified") or post["date"],
        "{{DATE_FORMATTED}}": spanish_date(post["date"]),
        "{{CATEGORY}}": html.escape(post["category"]),
        "{{OG_IMAGE_DIMENSIONS}}": og_image_dimensions(post["en_slug"]),
        "{{SHORT_ANSWER}}": short_answer(post.get("short_answer", "")),
        "{{CONTENT}}": content,
        "{{TOC_ITEMS}}": toc,
        "{{FAQ_SCHEMA}}": faq_schema(content),
        "{{RELATED_POSTS}}": "\n".join(card(other) for other in others[:6]),
        "{{FOOTER}}": FOOTER,
        "{{ASSET_VERSION}}": ASSET_VERSION,
    }
    page = TEMPLATE.read_text()
    for placeholder, value in replacements.items():
        page = page.replace(placeholder, value)
    leftover = re.findall(r"\{\{[A-Z_]+\}\}", page)
    if leftover:
        raise SystemExit(f"es/{post['slug']}: unfilled {sorted(set(leftover))}")
    (ES_DIR / post["slug"] / "index.html").write_text(page)
    print(f"Built: es/{post['slug']}/index.html")


def build_hub(posts: list[dict]) -> None:
    title = "Cómo besar mejor: guías en español"
    description = "Guías sinceras para besar mejor: cuánto dura un beso, cómo practicar, cómo besar lento y más. Por C.J. McKenna, excoreógrafo de besos en Hollywood."
    schema = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "inLanguage": "es",
        "name": title,
        "description": description,
        "url": f"{SITE_URL}/es/",
        "isPartOf": {"@id": f"{SITE_URL}/#organization"},
        "hasPart": [{"@type": "BlogPosting", "headline": post["title"], "url": f"{SITE_URL}/es/{post['slug']}/"} for post in posts],
    }
    template = TEMPLATE.read_text()
    head = template[: template.index("<title>")]
    styles = template[template.index("    <!-- Favicon -->") : template.index("    <style>")]
    cards = "\n".join(card(post, heading="h2") for post in posts)
    page = f"""{head.replace('    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2523241663582064" crossorigin="anonymous"></script>\n', '')}<title>{html.escape(title)}</title>
    <meta name="description" content="{html.escape(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
    <link rel="canonical" href="{SITE_URL}/es/">
    <link rel="alternate" hreflang="es" href="{SITE_URL}/es/">
    <link rel="alternate" hreflang="en" href="{SITE_URL}/blog/">
    <link rel="alternate" hreflang="x-default" href="{SITE_URL}/blog/">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="How to Kiss Better">
    <meta property="og:locale" content="es_ES">
    <meta property="og:url" content="{SITE_URL}/es/">
    <meta property="og:title" content="{html.escape(title)}">
    <meta property="og:description" content="{html.escape(description)}">
    <meta property="og:image" content="{SITE_URL}/blog/{posts[0]['en_slug']}/featured.jpg">

{styles.replace('{{ASSET_VERSION}}', ASSET_VERSION)}    <style>
        .gradient-text {{
            background: linear-gradient(135deg, #D4AF37, #B8860B);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }}
    </style>
    <script type="application/ld+json">
{json.dumps(schema, ensure_ascii=False, indent=4)}
    </script>
</head>

<body class="bg-charcoal text-off-white font-sans antialiased">

    <!-- HEADER -->
    <header class="py-4 sm:py-6 px-4 sm:px-6 border-b border-gold/10">
        <div class="max-w-6xl mx-auto flex justify-between items-center gap-4">
            <a href="/es/" class="font-serif text-lg sm:text-2xl text-cream hover:text-gold transition-colors whitespace-nowrap">
                <span class="sm:hidden">Kiss <span class="gradient-text">Better</span></span>
                <span class="hidden sm:inline">How to <span class="gradient-text">Kiss Better</span></span>
            </a>
            <nav class="flex gap-4 sm:gap-8 items-center">
                <a href="/blog/" hreflang="en" lang="en" class="text-gray-400 hover:text-cream transition-colors text-sm sm:text-base">English</a>
            </nav>
        </div>
    </header>

    <section class="py-16 px-6">
        <div class="max-w-6xl mx-auto">
            <p class="text-gold font-sans text-xs font-semibold tracking-widest uppercase mb-4 text-center">Guías en español</p>
            <h1 class="font-serif text-4xl sm:text-5xl font-bold text-cream mb-6 text-center leading-tight">Cómo besar <span class="gradient-text">mejor</span></h1>
            <p class="text-xl text-gray-400 leading-relaxed max-w-3xl mx-auto text-center mb-12">Lo que de verdad funciona al besar, sin rodeos y sin vergüenza. Soy C.J. McKenna: pasé más de una década coreografiando besos para el cine y ahora enseño a besar. Estas guías son las primeras en español.</p>
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
{cards}
            </div>
        </div>
    </section>

{FOOTER}
</body>
</html>
"""
    (ES_DIR / "index.html").write_text(page)
    print("Built: es/index.html")


def main() -> None:
    posts = read_posts()
    if not posts:
        raise SystemExit("No es/*/post.json found")
    for post in posts:
        build_post(post, posts)
    build_hub(posts)


if __name__ == "__main__":
    main()
