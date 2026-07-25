from pathlib import Path

from PIL import Image, ImageDraw


root = Path("tmp/pdfs/patrocinadores-final")
pages = sorted(root.glob("page-*.png"))

for start in range(0, len(pages), 6):
    batch = pages[start : start + 6]
    sheet = Image.new("RGB", (3 * 560, 2 * 750), "#DED8D1")
    draw = ImageDraw.Draw(sheet)

    for index, source in enumerate(batch):
        page = Image.open(source).convert("RGB")
        page.thumbnail((510, 660))
        x = (index % 3) * 560 + 25
        y = (index // 3) * 750 + 45
        sheet.paste(page, (x, y))
        draw.text((x, 18 + (index // 3) * 750), source.stem, fill="#3D3027")

    first = start + 1
    last = start + len(batch)
    sheet.save(root / f"contact-{first:02d}-{last:02d}.jpg", quality=92)
