"""Generates the pin icons in assets/. Run: python3 scripts/icons.py"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

SUPERSAMPLE = 16
"""Canvas upscale factor, downscaling to the final size gives antialiasing"""
ASSETS = Path(__file__).resolve().parent.parent / 'assets'


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def draw_pin(size, away):
    """Draws the pin on a size x size icon, with an orange dot when away"""
    canvas = Image.new('RGBA', (size * SUPERSAMPLE, size * SUPERSAMPLE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    scale = size * SUPERSAMPLE / 16
    cos = sin = math.sqrt(0.5)
    # Upright pin on a 16x16 grid, rotated 45 degrees around the center
    for part in (
        rect(4.4, 0.9, 11.6, 4.3),  # head
        [(6.0, 4.2), (10.0, 4.2), (10.9, 8.7), (5.1, 8.7)],  # body
        rect(3.0, 8.4, 13.0, 10.7),  # guard
        rect(7.1, 10.5, 8.9, 15.3),  # needle
    ):
        points = [((8 + (x - 8) * cos - (y - 8) * sin) * scale, (8 + (x - 8) * sin + (y - 8) * cos) * scale) for x, y in part]
        draw.polygon(points, fill=(0x7C, 0x85, 0x94, 255))
    if away:
        # A larger transparent circle cuts a gap between the pin and the dot, sizes in 16x16 grid units
        center = 12.3 * scale
        for radius, color in (((3.4 + 1.4) * scale, (0, 0, 0, 0)), (3.4 * scale, (0xEA, 0x58, 0x0C, 255))):
            draw.ellipse([center - radius, center - radius, center + radius, center + radius], fill=color)
    return canvas.resize((size, size), Image.LANCZOS)


def main():
    for size in (16, 24, 32, 48, 128):
        draw_pin(size, away=False).save(ASSETS / f'pin-home-{size}.png')
    for size in (16, 24, 32):
        draw_pin(size, away=True).save(ASSETS / f'pin-away-{size}.png')


if __name__ == '__main__':
    main()
