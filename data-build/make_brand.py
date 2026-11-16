"""Build the logo, icons and link-preview image from one set of shapes, so every file matches.

    py data-build/make_brand.py

The mark is a map tile: contour lines around a summit, cropped by the tile's edge the way a map sheet crops the
ground. The wordmark is "Elly Otieno" in Newsreader, the site's heading face, converted to outlines so the files
need no font installed. Needs fontTools, brotli, skia-pathops, numpy and Pillow.
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
FONTS = ROOT / "node_modules/@fontsource-variable"
SERIF = FONTS / "newsreader/files/newsreader-latin-opsz-normal.woff2"
SANS = FONTS / "libre-franklin/files/libre-franklin-latin-wght-normal.woff2"

# Two schemes, matching the site tokens: dark (the site) and light (CVs, documents, white backgrounds).
# tile and line are the mark; ink is the name beside it; bg is what the scheme sits on.
DARK = {"bg": "#0c1311", "ink": "#f1ecde", "tile": "#8fd18a", "line": "#0c1311"}
LIGHT = {"bg": "#f6f2e6", "ink": "#121a16", "tile": "#1f5f3a", "line": "#f6f2e6"}

# Mark on a 64 unit grid: a rounded tile, a summit off-centre, and contour rings around it.
RADIUS = 14.0  # tile corner
SUMMIT = (39.0, 27.0, 4.6)  # x, y, dot radius
RINGS = [13.5, 23.5, 34.5, 46.5]  # ring radii; the outer ones run off the tile
LINE = 3.5  # contour stroke width


def ring(k, n=96, off=0.0, r=None):
    """Points of contour ring k: a circle with two slow wobbles, so it reads as terrain, not a target.
    `off` moves the line in or out by that many units; `r` overrides the radius."""
    sx, sy, _ = SUMMIT
    r = RINGS[k] if r is None else r
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        w = 1 + 0.085 * math.cos(2 * t + 0.7 + 0.35 * k) + 0.05 * math.cos(3 * t + 2.1 - 0.5 * k)
        pts.append((sx + (r * w + off) * math.cos(t), sy + (r * w + off) * math.sin(t)))
    return pts


def mark_svg(c, ox=0.0, oy=0.0, s=1.0, uid="t", radius=RADIUS):
    """SVG elements for the mark, placed at (ox, oy) and scaled by s."""
    f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
    sx, sy, r = SUMMIT
    tile = f'x="{f(ox)}" y="{f(oy)}" width="{f(64 * s)}" height="{f(64 * s)}" rx="{f(radius * s)}"'
    rings = "".join('<path d="M' + "L".join(f"{f(ox + x * s)} {f(oy + y * s)}" for x, y in ring(k)) + 'Z"/>' for k in range(len(RINGS)))
    return (
        f'<clipPath id="{uid}"><rect {tile}/></clipPath><rect {tile} fill="{c["tile"]}"/>'
        f'<g clip-path="url(#{uid})"><g fill="none" stroke="{c["line"]}" stroke-width="{f(LINE * s)}" stroke-linejoin="round">{rings}</g>'
        f'<circle cx="{f(ox + sx * s)}" cy="{f(oy + sy * s)}" r="{f(r * s)}" fill="{c["line"]}"/></g>'
    )


def draw_mark(img, c, ox, oy, s, radius=RADIUS):
    """Paint the mark onto img at (ox, oy), 64*s pixels square."""
    n = round(64 * s)
    layer = Image.new("RGBA", (n, n), c["tile"])
    d = ImageDraw.Draw(layer)
    # Each ring is a filled shape with a smaller tile-coloured shape on top, outermost first. Clean edges at any size.
    for k in reversed(range(len(RINGS))):
        for off, colour in ((LINE / 2, c["line"]), (-LINE / 2, c["tile"])):
            d.polygon([(x * s, y * s) for x, y in ring(k, 240, off)], fill=colour)
    sx, sy, r = SUMMIT
    d.ellipse([(sx - r) * s, (sy - r) * s, (sx + r) * s, (sy + r) * s], fill=c["line"])
    mask = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=radius * s, fill=255)
    img.paste(layer, (round(ox), round(oy)), mask)


# Wordmark --------------------------------------------------------------------------------------

def load_font(path=SERIF, **axes):
    font = TTFont(path)
    # REMOVE merges overlapping and self-crossing outlines, so any fill rule draws the letters correctly.
    return instantiateVariableFont(font, axes or {"wght": 500, "opsz": 72}, overlap=OverlapMode.REMOVE)


def word_outlines(font, text, tracking=-0.01):
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
    size = mark_h * 0.7  # font size so the capitals sit within the mark's height
    gap = mark_h * 0.3
    width = mark_h + gap + word_width * size / upm
    baseline = mark_h / 2 + size * 0.32
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


def blend(a, b, t):
    """Hex colour t of the way from a to b."""
    pa, pb = (tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in (a, b))
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(pa, pb))


def social_card(serif):
    """1200 x 630 image that chat apps and LinkedIn show beside a link to the site."""
    c = DARK
    sans = load_font(SANS, wght=500)

    def paint(im, s):
        d = ImageDraw.Draw(im)
        # Faint contour rings filling the right half, drawn from the same function as the mark.
        k = 9.0 * s
        for i in range(9):
            pts = [(890 * s + (x - SUMMIT[0]) * k, 300 * s + (y - SUMMIT[1]) * k) for x, y in ring(i % 4, 360, r=9.0 + 9.5 * i)]
            d.line(pts + pts[:2], fill=blend(c["bg"], c["tile"], 0.3), width=round(2.2 * s), joint="curve")
        d.ellipse([(890 - 9) * s, (300 - 9) * s, (890 + 9) * s, (300 + 9) * s], fill=c["tile"])
        draw_mark(im, c, 80 * s, 78 * s, 1.5 * s)
        for font, text, size, y, colour in (
            (serif, "Elly Otieno", 104, 372, c["ink"]),
            (sans, "GIS and data analyst, Nairobi", 34, 440, blend(c["bg"], c["ink"], 0.72)),
            (sans, "Maps, spatial models and Power BI you can open and use", 26, 548, c["tile"]),
        ):
            runs, _, upm = word_outlines(font, text, tracking=-0.012 if font is serif else 0.0)
            draw_word(im, runs, upm, 80 * s, y * s, size * s, colour)

    png(1200, 630, 1, paint, bg=c["bg"]).convert("RGB").save(ROOT / "public" / "social-card.png", optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    font = load_font()
    runs, word_w, upm = word_outlines(font, "Elly Otieno")
    size, gap, width, baseline = lockup_geometry(word_w, upm)
    pad = 6.0  # breathing room inside the files
    W, H = width + 2 * pad, 64 + 2 * pad

    for scheme, c in (("dark", DARK), ("light", LIGHT)):
        # Mark alone, for use on a background of that scheme.
        (OUT / f"mark-on-{scheme}.svg").write_text(svg_file(64, 64, mark_svg(c)), encoding="utf-8")
        for px in (512, 1024):
            png(64, 64, px / 64, lambda im, s: draw_mark(im, c, 0, 0, s)).save(OUT / f"mark-on-{scheme}-{px}.png")
        # Mark beside the name.
        body = mark_svg(c, pad, pad) + word_svg(font, runs, upm, pad + 64 + gap, pad + baseline, size, c["ink"])
        (OUT / f"logo-on-{scheme}.svg").write_text(svg_file(W, H, body), encoding="utf-8")
        png(W, H, 2400 / W, lambda im, s: (draw_mark(im, c, pad * s, pad * s, s),
                                           draw_word(im, runs, upm, (pad + 64 + gap) * s, (pad + baseline) * s, size * s, c["ink"]))
            ).save(OUT / f"logo-on-{scheme}.png")

    pub = ROOT / "public"
    # Square, edge to edge, no rounded corners: phones and profile pictures cut their own shape.
    square = lambda px: png(64, 64, px / 64, lambda im, s: draw_mark(im, DARK, 0, 0, s, radius=0)).convert("RGB")
    square(1024).save(OUT / "avatar.png")
    square(180).save(pub / "apple-touch-icon.png")
    # Browser tab and home-screen icons. The .ico is for anything that still asks for /favicon.ico.
    (pub / "favicon.svg").write_text(svg_file(64, 64, mark_svg(DARK)), encoding="utf-8")
    png(64, 64, 4, lambda im, s: draw_mark(im, DARK, 0, 0, s)).save(pub / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    for px in (192, 512):
        png(64, 64, px / 64, lambda im, s: draw_mark(im, DARK, 0, 0, s)).save(pub / f"icon-{px}.png")
    social_card(font)

    for f in sorted([*OUT.iterdir(), *(pub / n for n in ("favicon.svg", "favicon.ico", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "social-card.png"))]):
        print(f"{f.relative_to(ROOT)}  {f.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
