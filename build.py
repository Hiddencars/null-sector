#!/usr/bin/env python3
"""Собирает src/* в один автономный index.html (file:// и GitHub Pages)."""
import re, pathlib, sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
dev = (SRC / "index.html").read_text(encoding="utf-8")

css = (SRC / "style.css").read_text(encoding="utf-8")
dev = re.sub(r'<link rel="stylesheet" href="style.css">',
             "<style>\n" + css + "\n</style>", dev)

def inline(m):
    src = m.group(1)
    js = (SRC / src).read_text(encoding="utf-8")
    return "<script>\n/* ==== " + src + " ==== */\n" + js + "\n</script>"

dev = re.sub(r'<script src="([^"]+)"></script>', inline, dev)
dev = dev.replace("<title>НОЛЬ-СЕКТОР · экшен-гача</title>",
                  "<title>НОЛЬ-СЕКТОР · экшен-гача</title>")
out = ROOT / "index.html"
out.write_text(dev, encoding="utf-8")
print(f"index.html: {len(dev)/1024:.1f} KB")
