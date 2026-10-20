#!/usr/bin/env python3
"""
Generates the OneTake brand assets in assets/:
  icon.svg            the mark (viewfinder + cursor + record dot) on an indigo tile
  logo.svg            mark + wordmark, for light backgrounds
  logo-dark.svg       mark + wordmark, for dark backgrounds
  wordmark paths are outlined from Inter Display (SIL Open Font License), so the
  logo renders identically everywhere without the font installed.
Run:  python3 scripts/brand.py      (needs fontTools: pip install fonttools)
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'assets')
FONT = '/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'

INDIGO_1, INDIGO_2 = '#6366f1', '#4338ca'   # tile gradient
INK, PAPER = '#111827', '#f9fafb'
ACCENT_LIGHT, ACCENT_DARK = '#4f46e5', '#a5b4fc'  # "Take" on light / dark
RECORD = '#ef4444'


def text_path(text, size, tracking=-0.02):
    """Outline `text` with the font; returns (svg path d, advance width) at `size` px, baseline at y=0."""
    font = TTFont(FONT)
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    upm = font['head'].unitsPerEm
    scale = size / upm
    x, ds = 0.0, []
    hmtx = font['hmtx']
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        ds.append(pen.getCommands())
        x += hmtx[name][0] * scale + tracking * size
    return ' '.join(ds), x - tracking * size


def mark(size=64, tile=True):
    """The mark in a `size` box: viewfinder corners (the camera / zoom), a cursor, and a record dot."""
    s = size / 64.0
    g = []
    if tile:
        g.append(f'<defs><linearGradient id="ot-g" x1="0" y1="0" x2="1" y2="1">'
                 f'<stop offset="0" stop-color="{INDIGO_1}"/><stop offset="1" stop-color="{INDIGO_2}"/></linearGradient></defs>')
        g.append(f'<rect width="{64*s:g}" height="{64*s:g}" rx="{15*s:g}" fill="url(#ot-g)"/>')
    w = 4.2 * s
    # viewfinder corner brackets
    c = [(13, 23, 13, 13, 23, 13), (41, 13, 51, 13, 51, 23), (51, 41, 51, 51, 41, 51), (23, 51, 13, 51, 13, 41)]
    for x1, y1, x2, y2, x3, y3 in c:
        g.append(f'<path d="M{x1*s:g} {y1*s:g}L{x2*s:g} {y2*s:g}L{x3*s:g} {y3*s:g}" fill="none" stroke="#fff" '
                 f'stroke-width="{w:g}" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>')
    # cursor (arrow), slightly left of centre so the frame reads as "pointing at something"
    arrow = [(24, 20), (24, 43.5), (30.2, 37.6), (34.4, 46.6), (38.6, 44.8), (34.5, 35.9), (42.6, 35.6)]
    d = 'M' + 'L'.join(f'{x*s:g} {y*s:g}' for x, y in arrow) + 'Z'
    g.append(f'<path d="{d}" fill="#fff" stroke="#1e1b4b" stroke-opacity=".18" stroke-width="{1*s:g}" stroke-linejoin="round"/>')
    # record dot
    g.append(f'<circle cx="{42.5*s:g}" cy="{21.5*s:g}" r="{4*s:g}" fill="{RECORD}" stroke="#fff" stroke-width="{1.8*s:g}"/>')
    return '\n  '.join(g)


def write(name, svg):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(svg)
    print('wrote assets/' + name)


def logo(dark):
    H = 64
    one, w1 = text_path('One', 40)
    take, w2 = text_path('Take', 40)
    gap, x0, base = 0.6, 80, 46
    width = x0 + w1 + gap + w2 + 2
    ink = PAPER if dark else INK
    accent = ACCENT_DARK if dark else ACCENT_LIGHT
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {H}" width="{width:.0f}" height="{H}" role="img" aria-label="OneTake">\n'
            f'  <title>OneTake</title>\n  {mark(64)}\n'
            f'  <g transform="translate({x0} {base})" fill="{ink}"><path d="{one}"/></g>\n'
            f'  <g transform="translate({x0 + w1 + gap:.2f} {base})" fill="{accent}"><path d="{take}"/></g>\n</svg>\n')


if __name__ == '__main__':
    write('icon.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="OneTake">\n'
                      f'  <title>OneTake</title>\n  {mark(64)}\n</svg>\n')
    write('logo.svg', logo(dark=False))
    write('logo-dark.svg', logo(dark=True))
