from pathlib import Path

from PIL import Image, ImageDraw


proposal_root = Path("tmp/pdfs/sponsor-analysis/proposal")
proposal_files = sorted(proposal_root.glob("page-*.png"))

for start in range(0, len(proposal_files), 12):
    batch = proposal_files[start : start + 12]
    thumbs = []
    for source in batch:
        image = Image.open(source).convert("RGB")
        image.thumbnail((420, 560))
        thumbs.append((source, image.copy()))

    sheet = Image.new("RGB", (4 * 440, 3 * 600), "white")
    draw = ImageDraw.Draw(sheet)
    for index, (source, image) in enumerate(thumbs):
        x = (index % 4) * 440 + 10
        y = (index // 4) * 600 + 30
        sheet.paste(image, (x, y))
        draw.text((x, y - 22), source.stem, fill="black")

    last = start + len(batch)
    sheet.save(proposal_root / f"contact-{start + 1:02d}-{last:02d}.jpg", quality=88)


challenge_root = Path("tmp/pdfs/sponsor-analysis/challenge")
challenge_files = sorted(challenge_root.glob("page-*.png"))
challenge_sheet = Image.new("RGB", (2 * 600, 2 * 850), "white")
challenge_draw = ImageDraw.Draw(challenge_sheet)

for index, source in enumerate(challenge_files):
    image = Image.open(source).convert("RGB")
    image.thumbnail((560, 790))
    x = (index % 2) * 600 + 20
    y = (index // 2) * 850 + 40
    challenge_sheet.paste(image, (x, y))
    challenge_draw.text((x, y - 25), source.stem, fill="black")

challenge_sheet.save(challenge_root / "contact-all.jpg", quality=90)
