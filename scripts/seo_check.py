#!/usr/bin/env python3
"""SEO release gate for howtokissbetter.com. Exits 1 on any error; warnings are debt to pay down.

Usage:
    python3 scripts/seo_check.py            # summary plus every error
    python3 scripts/seo_check.py --verbose  # also list every warning
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = "https://howtokissbetter.com"
SKIP_DIRS = {".git", "_private", "webhook", "node_modules", "docs", "scripts", "public", "screenshots"}
SKIP_FILES = {"blog/_template.html"}
TITLE_LIMIT = 60
DESCRIPTION_LIMIT = 160
MIN_HOME_POST_LINKS = 8
MIN_INBOUND_BODY_LINKS = 3
# Publishing rule: every post gets 3+ links from other posts, body plus Keep Reading.
# build_blog.py --rebuild-related guarantees it, so a shortfall means the grid broke.
MIN_INBOUND_POST_LINKS = 3
RELATED_GRID = '<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6" id="related-posts">'
POST_PATH = re.compile(r"^/blog/(?!category/)([a-z0-9-]+)/$")


class Report:
    def __init__(self) -> None:
        self.errors: dict[str, list[str]] = defaultdict(list)
        self.warnings: dict[str, list[str]] = defaultdict(list)

    def error(self, check: str, detail: str) -> None:
        self.errors[check].append(detail)

    def warn(self, check: str, detail: str) -> None:
        self.warnings[check].append(detail)


def site_pages() -> dict[str, Path]:
    """Map every served page's URL path to its file."""
    pages = {}
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT)
        if rel.parts[0] in SKIP_DIRS or rel.as_posix() in SKIP_FILES or "*" in rel.as_posix():
            continue
        if rel.name == "index.html":
            url_path = "/" if rel.parent == Path(".") else f"/{rel.parent.as_posix()}/"
        else:
            url_path = f"/{rel.as_posix()}"
        pages[url_path] = path
    return pages


def norm_text(text: str) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", text).strip()


def visible_text(page_html: str) -> str:
    body = re.sub(r"<(script|style|template)[^>]*>.*?</\1>", " ", page_html, flags=re.S | re.I)
    body = re.sub(r"<head>.*?</head>", " ", body, flags=re.S | re.I)
    return norm_text(body)


def div_inner(page_html: str, opening: str) -> str:
    """The inner HTML of the first div that starts with `opening`, matched by depth."""
    start = page_html.find(opening)
    if start < 0:
        return ""
    depth = 0
    for match in re.finditer(r"<div\b|</div>", page_html[start:]):
        depth += 1 if match.group(0) == "<div" else -1
        if depth == 0:
            return page_html[start + len(opening) : start + match.start()]
    return ""


def json_ld_blocks(page_html: str) -> list[str]:
    return re.findall(r'<script type="application/ld\+json">(.*?)</script>', page_html, flags=re.S)


def walk_nodes(data):
    if isinstance(data, dict):
        yield data
        for value in data.values():
            yield from walk_nodes(value)
    elif isinstance(data, list):
        for value in data:
            yield from walk_nodes(value)


def resolve_link(url_path: str, href: str, pages: dict[str, Path]) -> tuple[str, str] | None:
    """Turn an internal href into (target URL path, fragment); None for external or non-page links."""
    if re.match(r"^(?:[a-z]+:|//|#|\{|\$)", href, flags=re.I):
        return None
    href = html.unescape(href)
    fragment = href.split("#", 1)[1] if "#" in href else ""
    target = href.split("#", 1)[0].split("?", 1)[0]
    if not target.startswith("/"):
        base = url_path if url_path.endswith("/") else url_path.rsplit("/", 1)[0] + "/"
        target = base + target
    return target, fragment


def served_files() -> set[str]:
    """Files GitHub Pages will serve: tracked or about to be committed, never ignored.

    Looking in git instead of on disk keeps the check case-exact; macOS finds
    Featured.JPG when asked for featured.jpg, Pages does not.
    """
    listing = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout
    return {f"/{line}" for line in listing.splitlines() if (ROOT / line).is_file()}


def target_exists(target: str, pages: dict[str, Path], files: set[str]) -> bool:
    if target in pages or target in files:
        return True
    return not target.endswith(".html") and f"{target.rstrip('/')}/index.html" in files


def main() -> None:
    parser = argparse.ArgumentParser(description="SEO release gate")
    parser.add_argument("--verbose", action="store_true", help="List every warning")
    args = parser.parse_args()

    report = Report()
    pages = site_pages()
    files = served_files()
    sources = {url_path: path.read_text() for url_path, path in pages.items()}
    indexable = {
        url_path
        for url_path, page_html in sources.items()
        if not re.search(r'<meta name="robots" content="[^"]*noindex', page_html) and url_path != "/404.html"
    }
    post_paths = {url_path for url_path in indexable if POST_PATH.match(url_path)}

    inbound: dict[str, set[str]] = defaultdict(set)
    linked: dict[str, set[str]] = defaultdict(set)
    for url_path, page_html in sources.items():
        # JSON-LD must parse, or the page silently loses every rich result.
        for block in json_ld_blocks(page_html):
            try:
                json.loads(block)
            except json.JSONDecodeError as exc:
                report.error("json-ld parses", f"{url_path}: {exc}")

        if url_path in indexable:
            title_match = re.search(r"<title>(.*?)</title>", page_html, flags=re.S)
            title = html.unescape(title_match.group(1).strip()) if title_match else ""
            if not title:
                report.error("title present", url_path)
            elif len(title) > TITLE_LIMIT:
                report.warn(f"title over {TITLE_LIMIT} chars", f"{url_path} ({len(title)}): {title}")
            desc_match = re.search(r'<meta name="description" content="([^"]*)"', page_html)
            description = html.unescape(desc_match.group(1)) if desc_match else ""
            if not description:
                report.error("meta description present", url_path)
            elif len(description) > DESCRIPTION_LIMIT:
                report.warn(f"description over {DESCRIPTION_LIMIT} chars", f"{url_path} ({len(description)})")
            canonical = re.search(r'<link rel="canonical" href="([^"]+)"', page_html)
            if not canonical or canonical.group(1) != SITE_URL + url_path:
                found = canonical.group(1) if canonical else "missing"
                report.error("canonical is self-referencing", f"{url_path}: {found}")

        # Internal links and assets must resolve; scripts are stripped so template strings don't count.
        markup = re.sub(r"(<script[^>]*>).*?(</script>)", r"\1\2", page_html, flags=re.S)
        refs = re.findall(r'\s(?:href|src)="([^"]+)"', markup)
        for srcset in re.findall(r'\ssrcset="([^"]+)"', markup):
            refs += [candidate.split()[0] for candidate in srcset.split(",") if candidate.strip()]
        for attr_value in refs:
            if attr_value.startswith("#") and len(attr_value) > 1:
                if f'id="{attr_value[1:]}"' not in page_html:
                    report.error("link anchors exist", f"{url_path} -> {attr_value}")
                continue
            resolved = resolve_link(url_path, attr_value, pages)
            if not resolved:
                continue
            target, fragment = resolved
            if not target_exists(target, pages, files):
                report.error("internal links resolve", f"{url_path} -> {attr_value}")
            elif fragment and target in sources and f'id="{fragment}"' not in sources[target]:
                report.error("link anchors exist", f"{url_path} -> {attr_value}")

        if url_path in post_paths:
            body = div_inner(page_html, '<div class="article-content">')
            for href in re.findall(r'href="([^"]+)"', body):
                resolved = resolve_link(url_path, href, pages)
                if resolved and resolved[0] in post_paths and resolved[0] != url_path:
                    inbound[resolved[0]].add(url_path)
                    linked[resolved[0]].add(url_path)
            for href in re.findall(r'href="([^"]+)"', div_inner(page_html, RELATED_GRID)):
                resolved = resolve_link(url_path, href, pages)
                if resolved and resolved[0] in post_paths and resolved[0] != url_path:
                    linked[resolved[0]].add(url_path)

        # FAQ answers in JSON-LD must be readable on the page, word for word.
        faq_answers = []
        for block in json_ld_blocks(page_html):
            try:
                data = json.loads(block)
            except json.JSONDecodeError:
                continue
            for node in walk_nodes(data):
                if node.get("@type") == "Answer" and isinstance(node.get("text"), str):
                    faq_answers.append(node["text"])
        if faq_answers:
            text = visible_text(page_html)
            drifted = sum(1 for answer in faq_answers if norm_text(answer) not in text)
            if drifted:
                report.warn("FAQ answers verbatim on page", f"{url_path}: {drifted} of {len(faq_answers)} answers drift")

    # Sitemap: every URL is a live, indexable page, and every indexable page is listed.
    sitemap = (ROOT / "sitemap.xml").read_text()
    try:
        ET.fromstring(sitemap)
    except ET.ParseError as exc:
        report.error("sitemap is valid XML", str(exc))
    locs = re.findall(r"<loc>([^<]+)</loc>", sitemap)
    listed = set()
    for loc in locs:
        if not loc.startswith(SITE_URL + "/"):
            report.error("sitemap URLs on this site", loc)
            continue
        url_path = loc[len(SITE_URL):]
        entry = sitemap[sitemap.find(f"<loc>{loc}</loc>"):]
        entry = entry[: entry.find("</url>")]
        if POST_PATH.match(url_path) and f"<image:loc>{loc}featured.jpg</image:loc>" not in entry:
            report.warn("sitemap posts list their featured image", loc)
        if url_path in listed:
            report.error("sitemap has no duplicates", loc)
        listed.add(url_path)
        if url_path not in pages:
            report.error("sitemap URLs exist on disk", loc)
        elif url_path not in indexable:
            report.error("sitemap has no noindex pages", loc)
    for url_path in sorted(indexable - listed):
        report.error("indexable pages are in the sitemap", url_path)

    home_links = {
        resolved[0]
        for href in re.findall(r'href="([^"]+)"', sources["/"])
        if (resolved := resolve_link("/", href, pages)) and resolved[0] in post_paths
    }
    if len(home_links) < MIN_HOME_POST_LINKS:
        report.warn(
            f"homepage links at least {MIN_HOME_POST_LINKS} posts", f"/ links {len(home_links)} posts"
        )

    for url_path in sorted(post_paths):
        count = len(inbound[url_path])
        if count < MIN_INBOUND_BODY_LINKS:
            report.warn(f"posts have {MIN_INBOUND_BODY_LINKS}+ in-body inbound links", f"{url_path}: {count}")
        if len(linked[url_path]) < MIN_INBOUND_POST_LINKS:
            report.error(
                f"posts have {MIN_INBOUND_POST_LINKS}+ inbound links from other posts",
                f"{url_path}: {len(linked[url_path])}",
            )

    # Keep Reading is generated, never hand-written: a grid that drifts from the
    # builder's pick is an edit the bot gate would otherwise wave through.
    related = subprocess.run(
        [sys.executable, "build_blog.py", "--rebuild-related", "--check"], cwd=ROOT, capture_output=True, text=True
    )
    if related.returncode:
        report.error("Keep Reading matches build_blog.py", (related.stderr or related.stdout).strip())

    print(f"SEO check: {len(pages)} pages, {len(indexable)} indexable, {len(post_paths)} posts, {len(locs)} sitemap URLs")
    for check, details in sorted(report.warnings.items()):
        print(f"WARN  {check}: {len(details)}")
        for detail in details if args.verbose else []:
            print(f"      {detail}")
    for check, details in sorted(report.errors.items()):
        print(f"ERROR {check}: {len(details)}")
        for detail in details:
            print(f"      {detail}")
    if report.errors:
        print("FAIL")
        sys.exit(1)
    print("PASS")


if __name__ == "__main__":
    main()
