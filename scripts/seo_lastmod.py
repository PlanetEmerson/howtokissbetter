#!/usr/bin/env python3
"""Mark pages that really changed as modified: JSON-LD dateModified, article:modified_time and sitemap lastmod.

Usage:
    python3 scripts/seo_lastmod.py blog/how-to-give-a-hickey/ book/ index.html
    python3 scripts/seo_lastmod.py --date 2026-09-23 blog/kissing-positions/index.html

Pass only pages whose content, title, structured data or links changed. A
blanket bump across the site is a fake freshness signal that search engines
learn to ignore, which is why the old seo_refresh.py was removed.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = "https://howtokissbetter.com"
SITEMAP = ROOT / "sitemap.xml"


def page_file(arg: str) -> Path:
    path = Path(arg.lstrip("/"))
    if path.name != "index.html":
        path = path / "index.html"
    if not (ROOT / path).exists():
        raise SystemExit(f"No page at {path}")
    return path


def page_url(path: Path) -> str:
    folder = path.parent.as_posix()
    return f"{SITE_URL}/" if folder == "." else f"{SITE_URL}/{folder}/"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("pages", nargs="+", help="Page folders or index.html paths, relative to the repo root")
    parser.add_argument("--date", default=date.today().isoformat(), help="Modification date (default: today)")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.date):
        raise SystemExit("--date must be YYYY-MM-DD")

    sitemap = SITEMAP.read_text()
    missing = []
    for path in [page_file(arg) for arg in args.pages]:
        url = page_url(path)
        page = ROOT / path
        text = page.read_text()
        text, schema_hits = re.subn(r'("dateModified":\s*")[^"]*(")', rf"\g<1>{args.date}\g<2>", text)
        text, meta_hits = re.subn(
            r'(<meta property="article:modified_time" content=")[^"]*(")', rf"\g<1>{args.date}\g<2>", text
        )
        page.write_text(text)
        # Keep post.json in step so a later single-post build keeps the date.
        post_json = page.parent / "post.json"
        if post_json.exists():
            source = post_json.read_text()
            data = json.loads(source)
            frontmatter, hits = re.subn(r"^dateModified: .*$", f"dateModified: {args.date}", data["frontmatter"], count=1, flags=re.M)
            if not hits:
                frontmatter = re.sub(r"^(date: .*)$", rf"\g<1>\ndateModified: {args.date}", frontmatter, count=1, flags=re.M)
            data["frontmatter"] = frontmatter
            indent = 4 if '\n    "' in source else 2
            ending = "\n" if source.endswith("\n") else ""
            post_json.write_text(json.dumps(data, indent=indent, ensure_ascii="\\u" in source) + ending)

        loc = re.escape(f"<loc>{url}</loc>")
        sitemap, sitemap_hits = re.subn(
            rf"({loc}\s*<lastmod>)[^<]*(</lastmod>)", rf"\g<1>{args.date}\g<2>", sitemap
        )
        if not sitemap_hits:
            missing.append(url)
        print(f"{url}: dateModified x{schema_hits}, modified_time x{meta_hits}, sitemap x{sitemap_hits}")

    SITEMAP.write_text(sitemap)
    if missing:
        print("Not in sitemap.xml (add a <url> by hand): " + ", ".join(missing), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
