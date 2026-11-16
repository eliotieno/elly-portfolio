"""Build the logo files from one set of shapes, so every SVG and PNG matches.

    py data-build/make_brand.py

The mark is the nursery model drawn as a symbol: one site (green circle) joined to the farm plots
(small squares) it serves. The wordmark is "Elly Otieno" in Bricolage Grotesque, the site typeface,
converted to outlines so the files need no font installed. Needs fontTools, brotli, skia-pathops, numpy and Pillow.
"""
from __future__ import annotations

import math
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import OverlapMode, instantiateVariableFont
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "brand"
FONT = ROOT / "node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2"

# Two schemes, matching the site tokens: dark (the site) and light (CVs, documents, white backgrounds).
DARK = {"bg": "#0b0d0b", "ink": "#edece6", "accent": "#63c283"}
LIGHT = {"bg": "#f6f5f0", "ink": "#121412", "accent": "#1c6b3c"}

# Mark on a 64 unit grid. Site circle, then plots as (x, y, rotation in degrees).
SITE = (31.0, 33.0, 9.5)
PLOTS = [(12, 14, 9), (50, 10, -6), (56, 40, 12), (40, 56, -9), (9, 47, 4)]
PLOT = 10.0  # side of a plot square
LINE = 2.6  # stroke width of the links


def square(x, y, rot, side=PLOT):
    a = math.radians(rot)
    h = side / 2
    return [(x + px * math.cos(a) - py * math.sin(a), y + px * math.sin(a) + py * math.cos(a))
            for px, py in ((-h, -h), (h, -h), (h, h), (-h, h))]


def links():
    """Line segments from the circle's edge to each plot's edge."""
    sx, sy, r = SITE
    out = []
    for x, y, _ in PLOTS:
        d = math.hypot(x - sx, y - sy)
        ux, uy = (x - sx) / d, (y - sy) / d
        out.append(((sx + ux * r, sy + uy * r), (x, y)))
    return out


def mark_svg(c, ox=0.0, oy=0.0, s=1.0):
    """SVG elements for the mark, placed at (ox, oy) and scaled by s."""
    f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
    sx, sy, r = SITE
    parts = [
        f'<g stroke="{c["ink"]}" stroke-width="{f(LINE * s)}" stroke-linecap="round" fill="none">'
        + "".join(f'<line x1="{f(ox + a[0] * s)}" y1="{f(oy + a[1] * s)}" x2="{f(ox + b[0] * s)}" y2="{f(oy + b[1] * s)}"/>' for a, b in links())
        + "</g>",
        f'<g fill="{c["ink"]}">'
        + "".join('<polygon points="' + " ".join(f"{f(ox + px * s)},{f(oy + py * s)}" for px, py in square(*p)) + '"/>' for p in PLOTS)
        + "</g>",
        f'<circle cx="{f(ox + sx * s)}" cy="{f(oy + sy * s)}" r="{f(r * s)}" fill="{c["accent"]}"/>',
    ]
    return "".join(parts)


def draw_mark(img, c, ox, oy, s):
    d = ImageDraw.Draw(img)
    for a, b in links():
        p, q = (ox + a[0] * s, oy + a[1] * s), (ox + b[0] * s, oy + b[1] * s)
        d.line([p, q], fill=c["ink"], width=round(LINE * s))
        for e in (p, q):  # round caps
            d.ellipse([e[0] - LINE * s / 2, e[1] - LINE * s / 2, e[0] + LINE * s / 2, e[1] + LINE * s / 2], fill=c["ink"])
    for p in PLOTS:
        d.polygon([(ox + x * s, oy + y * s) for x, y in square(*p)], fill=c["ink"])
    sx, sy, r = SITE
    d.ellipse([ox + (sx - r) * s, oy + (sy - r) * s, ox + (sx + r) * s, oy + (sy + r) * s], fill=c["accent"])


# Wordmark --------------------------------------------------------------------------------------

def load_font():
    font = TTFont(FONT)
    # REMOVE merges overlapping and self-crossing outlines, so any fill rule draws the letters correctly.
    return instantiateVariableFont(font, {"wght": 650}, overlap=OverlapMode.REMOVE)


def word_outlines(font, text, tracking=-0.012):
    """Glyph outlines for `text` as a list of (contours, x offset), in font units, baseline at y=0."""
    cmap, glyphs, hmtx = font.getBestCmap(), font.getGlyphSet(), font["hmtx"]
    upm = font["head"].unitsPerEm
    x, out = 0.0, []
    for ch in text:
        name = cmap[ord(ch)]
        pen = DecomposingRecordingPen(glyphs)
        glyphs[name].draw(pen)
        out.append((name, pen, x))
        x += hmtx[name][0] + tracking * upm
    return out, x - tracking * upm, upm


class _Flatten(BasePen):
    """Collects contours as point lists. BasePen resolves implied on-curve points and closed all-off-curve
    quadratics; we only sample each simple curve segment."""

    def __init__(self, steps=16):
        super().__init__(None)
        self.steps, self.contours, self.cur = steps, [], []

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _qCurveToOne(self, b, e):
        a = self._getCurrentPoint()
        for k in range(1, self.steps + 1):
            t = k / self.steps
            self.cur.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * e[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * e[1]))

    def _curveToOne(self, b, c, e):
        a = self._getCurrentPoint()
        for k in range(1, self.steps + 1):
            t = k / self.steps
            m = 1 - t
            self.cur.append((m ** 3 * a[0] + 3 * m * m * t * b[0] + 3 * m * t * t * c[0] + t ** 3 * e[0],
                             m ** 3 * a[1] + 3 * m * m * t * b[1] + 3 * m * t * t * c[1] + t ** 3 * e[1]))

    def _closePath(self):
        if len(self.cur) > 2:
            self.contours.append(self.cur)
        self.cur = []

    _endPath = _closePath


def flatten(pen):
    """Recorded glyph drawing -> list of contours (lists of points)."""
    f = _Flatten()
    pen.replay(f)
    return f.contours


def word_svg(font, glyph_runs, upm, ox, baseline, size, colour):
    s = size / upm
    paths = []
    for name, pen, x in glyph_runs:
        sp = SVGPathPen(None)
        pen.replay(sp)
        if sp.getCommands():
            paths.append(f'<path transform="translate({ox + x * s:.2f} {baseline:.2f}) scale({s:.5f} {-s:.5f})" d="{sp.getCommands()}"/>')
    return f'<g fill="{colour}">' + "".join(paths) + "</g>"


def draw_word(img, glyph_runs, upm, ox, baseline, size, colour):
    """Fill glyph outlines with the nonzero winding rule, as fonts and SVG do.

    Each contour adds +1 or -1 over its interior depending on its direction; pixels with a nonzero total are
    ink. Works for overlapping outlines and for either contour direction convention."""
    s = size / upm
    area = lambda c: sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(c, c[1:] + c[:1]))
    winding = np.zeros((img.height, img.width), np.int16)
    for name, pen, x in glyph_runs:
        for contour in flatten(pen):
            m = Image.new("1", img.size, 0)
            ImageDraw.Draw(m).polygon([(ox + (x + px) * s, baseline - py * s) for px, py in contour], fill=1)
            winding += np.where(np.asarray(m), 1 if area(contour) > 0 else -1, 0).astype(np.int16)
    img.paste(Image.new("RGBA", img.size, colour), (0, 0), Image.fromarray(((winding != 0) * 255).astype(np.uint8)))


# Files ------------------------------------------------------------------------------------------

def lockup_geometry(word_width, upm, mark_h=64.0):
    """Mark beside the name, name optically centred on the mark. Returns sizes in SVG units."""
    size = mark_h * 0.62  # font size so the capitals sit within the mark's height
    gap = mark_h * 0.28
    width = mark_h + gap + word_width * size / upm
    baseline = mark_h / 2 + size * 0.36
    return size, gap, width, baseline


def svg_file(w, h, body, bg=None):
    rect = f'<rect width="{w:.2f}" height="{h:.2f}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" role="img" aria-label="Elly Otieno">{rect}{body}</svg>\n'


def png(w, h, scale, paint, bg=None):
    """Paint at 4x the target scale, then downsample for smooth edges."""
    ss = 4
    img = Image.new("RGBA", (round(w * scale * ss), round(h * scale * ss)), bg or (0, 0, 0, 0))
    paint(img, scale * ss)
    return img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    font = load_font()
    runs, word_w, upm = word_outlines(font, "Elly Otieno")
    size, gap, width, baseline = lockup_geometry(word_w, upm)
    pad = 6.0  # breathing room inside the files
    W, H = width + 2 * pad, 64 + 2 * pad

    for scheme, c in (("dark", DARK), ("light", LIGHT)):
        # Mark alone, transparent, for use on a background of that scheme.
        (OUT / f"mark-on-{scheme}.svg").write_text(svg_file(64, 64, mark_svg(c)), encoding="utf-8")
        for px in (512, 1024):
            png(64, 64, px / 64, lambda im, s: draw_mark(im, c, 0, 0, s)).save(OUT / f"mark-on-{scheme}-{px}.png")
        # Mark beside the name.
        body = mark_svg(c, pad, pad) + word_svg(font, runs, upm, pad + 64 + gap, pad + baseline, size, c["ink"])
        (OUT / f"logo-on-{scheme}.svg").write_text(svg_file(W, H, body), encoding="utf-8")
        png(W, H, 2400 / W, lambda im, s: (draw_mark(im, c, pad * s, pad * s, s),
                                           draw_word(im, runs, upm, (pad + 64 + gap) * s, (pad + baseline) * s, size * s, c["ink"]))
            ).save(OUT / f"logo-on-{scheme}.png")

    # Square with the background filled: profile pictures and app icons.
    for name, px, inset in (("avatar", 1024, 0.18), ("apple-touch-icon", 180, 0.14)):
        tile = 64 / (1 - 2 * inset)
        img = png(tile, tile, px / tile, lambda im, s: draw_mark(im, DARK, inset * tile * s, inset * tile * s, s), bg=DARK["bg"])
        img.convert("RGB").save(OUT / f"{name}.png" if name == "avatar" else ROOT / "public" / f"{name}.png")

    # Favicon: follows the browser's light or dark setting.
    fav = mark_svg({"ink": "var(--i)", "accent": "var(--a)"}).replace('"var(--i)"', '"currentColor"')
    fav = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 68 68">'
        f'<style>svg{{color:{LIGHT["ink"]};--a:{LIGHT["accent"]}}}'
        f'@media (prefers-color-scheme:dark){{svg{{color:{DARK["ink"]};--a:{DARK["accent"]}}}}}</style>'
        + fav.replace('fill="var(--a)"', 'style="fill:var(--a)"')
        + "</svg>\n"
    )
    (ROOT / "public" / "favicon.svg").write_text(fav, encoding="utf-8")

    for f in sorted([*OUT.iterdir(), ROOT / "public/favicon.svg", ROOT / "public/apple-touch-icon.png"]):
        print(f"{f.relative_to(ROOT)}  {f.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
