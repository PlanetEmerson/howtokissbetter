#!/usr/bin/env python3
"""Unit checks for the header-only image size reader behind the share-image markup."""

import unittest
from pathlib import Path

import build_blog

ROOT = Path(__file__).resolve().parents[1]


class ImageSizeTests(unittest.TestCase):
    def test_png_header(self):
        self.assertEqual(build_blog.image_size(ROOT / "apple-touch-icon.png"), (180, 180))

    def test_progressive_jpeg_frame(self):
        self.assertEqual(build_blog.image_size(ROOT / "assets/images/og/home.jpg"), (1200, 630))

    def test_baseline_jpeg_frame(self):
        self.assertEqual(build_blog.image_size(ROOT / "blog/how-to-french-kiss/featured.jpg"), (1200, 800))

    def test_post_dimension_lines(self):
        self.assertEqual(
            build_blog.og_image_dimensions("how-to-french-kiss"),
            '\n    <meta property="og:image:width" content="1200">\n    <meta property="og:image:height" content="800">',
        )

    def test_missing_image_adds_nothing(self):
        self.assertEqual(build_blog.og_image_dimensions("no-such-post"), "")


if __name__ == "__main__":
    unittest.main()
