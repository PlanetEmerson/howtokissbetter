#!/usr/bin/env python3
"""
SEO Refresh Script for howtokissbetter.com.

Updates dateModified across all blog post HTML files, refreshes sitemap.xml
lastmod dates, removes noindexed pages from sitemap, and pings Google.

Usage:
    python3 seo_refresh.py              # Update everything, ping Google
    python3 seo_refresh.py --date 2026-03-26  # Specific date
    python3 seo_refresh.py --no-ping    # Skip Google ping
"""

import argparse
import re
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent
BLOG_DIR = ROOT / "blog"
SITEMAP_PATH = ROOT / "sitemap.xml"
TODAY = datetime.now().strftime("%Y-%m-%d")

SITEMAP_URL = "https://howtokissbetter.com/sitemap.xml"


def update_post_dates(date_str: str) -> int:
    """Update article:modified_time and dateModified in all blog post HTML files."""
    count = 0
    for html_path in sorted(BLOG_DIR.glob("*/index.html")):
        if html_path.parent.name == "category":
            continue
        text = html_path.read_text()
        original = text

        # Pattern 1: OG meta tag
        text = re.sub(
            r'(<meta property="article:modified_time" content=")[\d-]+(")',
            rf"\g<1>{date_str}\g<2>",
            text,
        )

        # Pattern 2: JSON-LD dateModified (handles pretty-printed and minified)
        text = re.sub(
            r'("dateModified"\s*:\s*")[\d-]+(")',
            rf"\g<1>{date_str}\g<2>",
            text,
        )

        if text != original:
            html_path.write_text(text)
            count += 1
            print(f"  Updated: {html_path.parent.name}")

    return count


def update_sitemap(date_str: str) -> int:
    """Update lastmod dates in sitemap.xml and remove noindexed pages."""
    text = SITEMAP_PATH.read_text()
    count = 0

    # Remove the terms page URL block entirely
    text = re.sub(
        r"\s*<url>\s*<loc>https://howtokissbetter\.com/terms/</loc>.*?</url>",
        "",
        text,
        flags=re.DOTALL,
    )

    # Update lastmod for all remaining URLs except privacy
    def replace_lastmod(match: re.Match) -> str:
        nonlocal count
        loc = match.group(1)
        if "/privacy/" in loc:
            return match.group(0)
        block = re.sub(
            r"<lastmod>[\d-]+</lastmod>",
            f"<lastmod>{date_str}</lastmod>",
            match.group(0),
        )
        count += 1
        return block

    text = re.sub(
        r"<url>\s*<loc>([^<]+)</loc>.*?</url>",
        replace_lastmod,
        text,
        flags=re.DOTALL,
    )

    SITEMAP_PATH.write_text(text)
    return count


def ping_google() -> None:
    """Ping Google with updated sitemap URL."""
    url = f"https://www.google.com/ping?sitemap={SITEMAP_URL}"
    try:
        resp = urllib.request.urlopen(url)
        print(f"  Google ping: HTTP {resp.status}")
    except Exception as e:
        print(f"  Google ping failed: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="SEO refresh for howtokissbetter.com")
    parser.add_argument("--date", default=TODAY, help=f"Date to set (default: {TODAY})")
    parser.add_argument("--no-ping", action="store_true", help="Skip Google sitemap ping")
    args = parser.parse_args()

    date_str = args.date
    print(f"SEO Refresh — setting date to {date_str}\n")

    print("1. Updating blog post dateModified...")
    post_count = update_post_dates(date_str)
    print(f"   {post_count} posts updated.\n")

    print("2. Updating sitemap.xml...")
    sitemap_count = update_sitemap(date_str)
    print(f"   {sitemap_count} URLs updated, terms page removed.\n")

    if not args.no_ping:
        print("3. Pinging Google...")
        ping_google()
        print()

    print("Done.")


if __name__ == "__main__":
    main()
