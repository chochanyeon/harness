#!/usr/bin/env python3
"""Export workflow harness current-state docs for Tistory posting.

Creates:
- docs/blog/workflow-harness-current-state.tistory.md
- docs/blog/workflow-harness-current-state.tistory.html
- docs/blog/assets/workflow-harness-current-state/*.svg
- docs/blog/workflow-harness-current-state.svg-review.md

Requires pandoc on PATH for HTML conversion.
"""
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SRC_MD = ROOT / "docs" / "workflow-harness-current-state.md"
SRC_ASSETS = ROOT / "docs" / "assets" / "workflow-harness-current-state"
OUT_DIR = ROOT / "docs" / "blog"
OUT_ASSETS = OUT_DIR / "assets" / "workflow-harness-current-state"

OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_ASSETS.mkdir(parents=True, exist_ok=True)

for svg in SRC_ASSETS.glob("*.svg"):
    shutil.copy2(svg, OUT_ASSETS / svg.name)

front = """<!--
Tistory posting bundle
1. Upload the files under docs/blog/assets/workflow-harness-current-state/ to Tistory.
2. Replace local image paths in this file/HTML with the Tistory CDN URLs if the editor does not preserve relative assets.
3. If SVG rendering is blocked by the skin/editor, convert the SVG files to PNG and replace .svg with .png.
-->

"""
text = SRC_MD.read_text(encoding="utf-8")
(OUT_DIR / "workflow-harness-current-state.tistory.md").write_text(front + text, encoding="utf-8")
html_out = OUT_DIR / "workflow-harness-current-state.tistory.html"
subprocess.run(["pandoc", str(OUT_DIR / "workflow-harness-current-state.tistory.md"), "-f", "gfm", "-t", "html", "-o", str(html_out)], check=True)
html_text = html_out.read_text(encoding="utf-8")
html_out.write_text("""<!--
Tistory HTML fragment. Paste into Tistory HTML mode.
Upload docs/blog/assets/workflow-harness-current-state/* first, then replace local image src values with uploaded URLs if needed.
-->
""" + html_text, encoding="utf-8")

rows = []
for svg in sorted(OUT_ASSETS.glob("*.svg")):
    s = svg.read_text(encoding="utf-8")
    width = int(re.search(r'width="(\d+)"', s).group(1)) if re.search(r'width="(\d+)"', s) else 0
    height = int(re.search(r'height="(\d+)"', s).group(1)) if re.search(r'height="(\d+)"', s) else 0
    label_match = re.search(r'aria-label="([^"]+)"', s)
    label = label_match.group(1) if label_match else svg.stem
    texts = re.findall(r'<text\b[^>]*>(.*?)</text>', s, flags=re.S)
    plain = [re.sub(r'<[^>]+>', '', t).strip() for t in texts]
    font_sizes = [float(x) for x in re.findall(r'font:\s*([0-9.]+)px', s)]
    min_font = min(font_sizes) if font_sizes else 0
    issues = []
    if width >= 900:
        issues.append("wide: good for desktop, may shrink on mobile")
    if min_font and min_font < 12:
        issues.append(f"small text {min_font:g}px")
    if len(plain) > 35:
        issues.append(f"high text density {len(plain)}")
    if max((len(t) for t in plain), default=0) > 80:
        issues.append("long label")
    verdict = "양호" if len([i for i in issues if not i.startswith('wide')]) < 2 else "개선 권장"
    rows.append((svg.name, label, f"{width}×{height}", len(plain), min_font, verdict, ", ".join(issues) or "특이사항 없음"))

lines = ["# Workflow Harness SVG 가독성 검토", "", "| 파일 | 의미 | 크기 | 텍스트 | 최소 폰트 | 판정 | 비고 |", "|---|---|---:|---:|---:|---|---|"]
for name, label, size, count, min_font, verdict, notes in rows:
    lines.append(f"| `{name}` | {label} | {size} | {count} | {min_font:g}px | {verdict} | {notes} |")
lines += ["", "PNG가 필요하면 Inkscape 등으로 1600px 폭 변환을 권장한다."]
(OUT_DIR / "workflow-harness-current-state.svg-review.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("Exported Tistory bundle to docs/blog")
