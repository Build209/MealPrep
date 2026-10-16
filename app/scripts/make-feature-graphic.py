#!/usr/bin/env python3
"""Make the Google Play feature graphic (1024 x 500, RGB PNG, no alpha).

Run from the repository root:  python3 app/scripts/make-feature-graphic.py
Needs Pillow (pip install pillow). Writes:
  app/assets/store/feature-graphic.png      banana ground, app icon, two-colour wordmark (recommended)
  app/assets/store/feature-graphic-alt.png  ink ground, Forky from forky-idea.png, banana wordmark

Colours come from app/src/theme/tokens.ts (the live scheme). Fonts are the app's own, already in
app/assets/fonts: Bagel Fat One for the wordmark (as in the top bar) and Atkinson Hyperlegible Next
for the line under it. All content stays inside the centre 924 x 400 safe zone.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "app" / "assets"
OUT = ASSETS / "store"

W, H = 1024, 500
SAFE_X, SAFE_Y = 50, 50  # 924 x 400 centre zone

# tokens.ts
BANANA = "#FFD12E"
INK = "#1B1F3B"
TOMATO = "#D9301A"
WHITE = "#FFFFFF"

DISPLAY = ASSETS / "fonts" / "BagelFatOne-Latin.ttf"
BODY = ASSETS / "fonts" / "AtkinsonHyperlegibleNext-Variable-Latin.ttf"

TAGLINE = "Cook from what you already have."


def body_font(size: int, weight: int = 700) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(BODY), size)
    try:
        font.set_variation_by_axes([weight])
    except Exception:  # older FreeType without variation support: default instance
        pass
    return font


def rounded(img: Image.Image, size: int, radius: int) -> Image.Image:
    img = img.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    img.putalpha(mask)
    return img


def draw_wordmark(draw, x, y, font, parts):
    """parts: list of (text, colour). Draws on one baseline; returns end x."""
    for text, colour in parts:
        draw.text((x, y), text, font=font, fill=colour, anchor="ls")
        x += draw.textlength(text, font=font)
    return x


def fit_size(draw, text, font_path, max_w, start):
    size = start
    while size > 20:
        f = ImageFont.truetype(str(font_path), size)
        if draw.textlength(text, font=f) <= max_w:
            return size
        size -= 2
    return size


def compose(bg, art, art_box_h, word_parts, tag_colour, out_name):
    canvas = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(canvas)

    # Art on the left, text on the right; the pair is centred inside the safe zone.
    art_w, art_h = art.size
    gap = 56
    max_w = (W - 2 * SAFE_X - 40) - art_w - gap
    word = "".join(t for t, _ in word_parts)
    wsize = fit_size(draw, word, DISPLAY, max_w, 96)
    wfont = ImageFont.truetype(str(DISPLAY), wsize)

    tsize = 34
    tfont = body_font(tsize)
    while draw.textlength(TAGLINE, font=tfont) > max_w and tsize > 20:
        tsize -= 2
        tfont = body_font(tsize)

    text_w = max(draw.textlength(word, font=wfont), draw.textlength(TAGLINE, font=tfont) + 4)
    group_w = art_w + gap + text_w
    art_x = round((W - group_w) / 2)
    art_y = (H - art_h) // 2
    canvas.paste(art, (art_x, art_y), art)
    text_x = art_x + art_w + gap
    assert art_x >= SAFE_X and text_x + text_w <= W - SAFE_X, "content outside safe zone"

    w_asc, _ = wfont.getmetrics()
    t_asc, _ = tfont.getmetrics()
    line_gap = 22
    block_h = w_asc + line_gap + t_asc
    top = (H - block_h) // 2
    w_base = top + w_asc
    t_base = w_base + line_gap + t_asc

    draw_wordmark(draw, text_x, w_base, wfont, word_parts)
    draw.text((text_x + 4, t_base), TAGLINE, font=tfont, fill=tag_colour, anchor="ls")

    path = OUT / out_name
    canvas.save(path, "PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)}  wordmark {wsize}px, tagline {tsize}px, art {art_w}x{art_h}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # Main: the banana top bar look, with the store icon.
    icon = rounded(Image.open(ASSETS / "icon.png"), 300, 66)
    compose(
        BANANA,
        icon,
        300,
        [("Meal", INK), ("Plan", TOMATO), ("atic", INK)],
        INK,
        "feature-graphic.png",
    )

    # Alt: ink ground with the existing Forky drawing (forky-idea.png, reused as is).
    forky = Image.open(ASSETS / "forky" / "forky-idea.png").convert("RGBA")
    scale = 380 / forky.height
    forky = forky.resize((round(forky.width * scale), 380), Image.LANCZOS)
    compose(
        INK,
        forky,
        380,
        [("Meal", BANANA), ("Plan", WHITE), ("atic", BANANA)],
        WHITE,
        "feature-graphic-alt.png",
    )


if __name__ == "__main__":
    main()
