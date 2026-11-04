"""Generate Windows ICO and PNG icons from the supplied Onboard Corrugated emblem.
The six flat-color polygon panels are traced from the original logo.
"""
from pathlib import Path
from PIL import Image, ImageDraw

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / "build"
OUT.mkdir(parents=True, exist_ok=True)

SCALE = 4
SIZE = 512
img = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Logo coordinates on the original 360 x 360 artwork, with original panel colours.
polygons = [
    ([(50, 98), (132, 55), (215, 99), (132, 142)], "#dce191"),
    ([(133, 143), (215, 100), (215, 191), (133, 234)], "#fe7d15"),
    ([(217, 99), (300, 55), (300, 146), (217, 190)], "#c7d100"),
    ([(133, 235), (215, 193), (215, 283), (133, 326)], "#c7d100"),
    ([(50, 285), (131, 243), (131, 326)], "#69a714"),
]
# Scale artwork to a square icon canvas with enough padding for Windows shortcuts.
def transform(points):
    return [(round(((x - 24) / 312) * SIZE * SCALE),
             round(((y - 24) / 312) * SIZE * SCALE)) for x, y in points]

for points, color in polygons:
    draw.polygon(transform(points), fill=color)

img = img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
img.save(OUT / "icon.png")
img.save(OUT / "icon.ico", format="ICO", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("Generated", OUT / "icon.ico", "and", OUT / "icon.png")
