import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "outputs" / "propuesta_funcional_patrocinadores_pawalert.md"
OUTPUT = ROOT / "output" / "pdf" / "propuesta_red_aliados_pawalert.pdf"

ORANGE = colors.HexColor("#EC802B")
ORANGE_DARK = colors.HexColor("#C95F14")
TEAL = colors.HexColor("#4FAEA6")
YELLOW = colors.HexColor("#EDC55B")
INK = colors.HexColor("#3D3027")
MUTED = colors.HexColor("#74665B")
CREAM = colors.HexColor("#FFF8F1")
BEIGE = colors.HexColor("#E8CCAD")
LIGHT_TEAL = colors.HexColor("#EAF7F5")
LIGHT_ORANGE = colors.HexColor("#FFF0E5")
LINE = colors.HexColor("#E8DDD2")


def register_fonts():
    regular = "/System/Library/Fonts/Supplemental/Arial.ttf"
    bold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    italic = "/System/Library/Fonts/Supplemental/Arial Italic.ttf"
    bold_italic = "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf"
    pdfmetrics.registerFont(TTFont("PawArial", regular))
    pdfmetrics.registerFont(TTFont("PawArial-Bold", bold))
    pdfmetrics.registerFont(TTFont("PawArial-Italic", italic))
    pdfmetrics.registerFont(TTFont("PawArial-BoldItalic", bold_italic))
    pdfmetrics.registerFontFamily(
        "PawArial",
        normal="PawArial",
        bold="PawArial-Bold",
        italic="PawArial-Italic",
        boldItalic="PawArial-BoldItalic",
    )


register_fonts()

styles = getSampleStyleSheet()
BODY = ParagraphStyle(
    "Body",
    parent=styles["BodyText"],
    fontName="PawArial",
    fontSize=9.2,
    leading=13.2,
    textColor=INK,
    spaceAfter=6,
    allowWidows=0,
    allowOrphans=0,
)
H1 = ParagraphStyle(
    "H1",
    parent=BODY,
    fontName="PawArial-Bold",
    fontSize=17,
    leading=21,
    textColor=ORANGE_DARK,
    spaceBefore=15,
    spaceAfter=7,
    keepWithNext=True,
)
H2 = ParagraphStyle(
    "H2",
    parent=BODY,
    fontName="PawArial-Bold",
    fontSize=12.2,
    leading=15.5,
    textColor=TEAL,
    spaceBefore=10,
    spaceAfter=5,
    keepWithNext=True,
)
H3 = ParagraphStyle(
    "H3",
    parent=BODY,
    fontName="PawArial-Bold",
    fontSize=10.3,
    leading=13.5,
    textColor=INK,
    spaceBefore=7,
    spaceAfter=3,
    keepWithNext=True,
)
SMALL = ParagraphStyle(
    "Small",
    parent=BODY,
    fontSize=7.6,
    leading=10.2,
)
TABLE_HEAD = ParagraphStyle(
    "TableHead",
    parent=SMALL,
    fontName="PawArial-Bold",
    textColor=colors.white,
    leading=9.5,
)
TABLE_BODY = ParagraphStyle(
    "TableBody",
    parent=SMALL,
    fontSize=7.4,
    leading=9.7,
)
QUOTE = ParagraphStyle(
    "Quote",
    parent=BODY,
    fontName="PawArial-BoldItalic",
    fontSize=10.4,
    leading=15,
    textColor=ORANGE_DARK,
    leftIndent=13,
    rightIndent=13,
    alignment=TA_LEFT,
)


def normalize(value: str) -> str:
    return (
        value.replace("\u2011", "-")
        .replace("\u2012", "-")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2212", "-")
    )


def inline_markup(value: str) -> str:
    value = normalize(value.strip())
    value = html.escape(value)
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"`(.+?)`", r'<font name="Courier" color="#3D3027">\1</font>', value)
    value = re.sub(r"(?<![\w\"=])(https?://[^\s<]+)", r'<link href="\1" color="#277E78">\1</link>', value)
    return value


def paragraph(text: str, style=BODY):
    return Paragraph(inline_markup(text), style)


def draw_paw(canvas, x, y, scale=1.0, color=ORANGE):
    canvas.saveState()
    canvas.setFillColor(color)
    canvas.circle(x, y, 5.2 * scale, fill=1, stroke=0)
    canvas.circle(x - 7.3 * scale, y + 8.5 * scale, 3.2 * scale, fill=1, stroke=0)
    canvas.circle(x - 2.3 * scale, y + 12.3 * scale, 3.1 * scale, fill=1, stroke=0)
    canvas.circle(x + 3.5 * scale, y + 12.2 * scale, 3.1 * scale, fill=1, stroke=0)
    canvas.circle(x + 8.1 * scale, y + 7.8 * scale, 3.0 * scale, fill=1, stroke=0)
    canvas.restoreState()


def cover_page(canvas, doc):
    width, height = letter
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(ORANGE)
    canvas.rect(0, height - 1.45 * inch, width, 1.45 * inch, fill=1, stroke=0)
    canvas.setFillColor(TEAL)
    canvas.rect(0, 0, width, 0.28 * inch, fill=1, stroke=0)
    for x, y, size, alpha in [
        (0.7 * inch, 0.85 * inch, 1.1, 0.13),
        (6.8 * inch, 2.0 * inch, 1.6, 0.11),
        (6.3 * inch, 8.5 * inch, 1.2, 0.17),
        (1.2 * inch, 9.4 * inch, 0.9, 0.20),
    ]:
        canvas.setFillAlpha(alpha)
        draw_paw(canvas, x, y, size, ORANGE_DARK)
    canvas.setFillAlpha(1)
    canvas.restoreState()


def later_page(canvas, doc):
    width, height = letter
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(0.68 * inch, height - 0.52 * inch, width - 0.68 * inch, height - 0.52 * inch)
    draw_paw(canvas, 0.83 * inch, height - 0.34 * inch, 0.45, ORANGE)
    canvas.setFont("PawArial-Bold", 7.5)
    canvas.setFillColor(INK)
    canvas.drawString(1.04 * inch, height - 0.37 * inch, "PawAlert")
    canvas.setFont("PawArial", 7.1)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 0.68 * inch, height - 0.37 * inch, "Red de Aliados - Propuesta funcional")
    canvas.line(0.68 * inch, 0.48 * inch, width - 0.68 * inch, 0.48 * inch)
    canvas.setFont("PawArial", 7.2)
    canvas.drawString(0.68 * inch, 0.29 * inch, "Versión 1.1 - 21 de julio de 2026")
    canvas.drawRightString(width - 0.68 * inch, 0.29 * inch, f"Página {doc.page}")
    canvas.restoreState()


def make_cover():
    title = ParagraphStyle(
        "CoverTitle",
        parent=BODY,
        fontName="PawArial-Bold",
        fontSize=29,
        leading=33,
        textColor=INK,
        alignment=TA_LEFT,
    )
    subtitle = ParagraphStyle(
        "CoverSubtitle",
        parent=BODY,
        fontName="PawArial",
        fontSize=14,
        leading=20,
        textColor=TEAL,
    )
    kicker = ParagraphStyle(
        "CoverKicker",
        parent=BODY,
        fontName="PawArial-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.white,
        alignment=TA_CENTER,
        tracking=1.5,
    )
    note = ParagraphStyle(
        "CoverNote",
        parent=BODY,
        fontSize=9.5,
        leading=14,
        textColor=MUTED,
    )
    return [
        Spacer(1, 0.35 * inch),
        Paragraph("PAWALERT", kicker),
        Spacer(1, 1.25 * inch),
        Paragraph("Red de Aliados PawAlert", title),
        Spacer(1, 0.15 * inch),
        Paragraph("Propuesta funcional para patrocinadores, donantes y aliados locales", subtitle),
        Spacer(1, 0.36 * inch),
        HRFlowable(width="25%", thickness=4, color=ORANGE, hAlign="LEFT"),
        Spacer(1, 0.35 * inch),
        Paragraph(
            "Modelo centrado en asociaciones, sin pasarela de pago en el MVP y con flujos trazables para recursos, apoyo económico y transporte.",
            note,
        ),
        Spacer(1, 1.05 * inch),
        Table(
            [[paragraph("Documento", TABLE_HEAD), paragraph("Propuesta funcional", TABLE_BODY)],
             [paragraph("Versión", TABLE_HEAD), paragraph("1.1", TABLE_BODY)],
             [paragraph("Fecha", TABLE_HEAD), paragraph("21 de julio de 2026", TABLE_BODY)]],
            colWidths=[1.25 * inch, 2.7 * inch],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), ORANGE),
                ("BACKGROUND", (1, 0), (1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]),
        ),
        PageBreak(),
    ]


def parse_table(lines, start, available_width):
    raw = []
    i = start
    while i < len(lines) and lines[i].strip().startswith("|"):
        cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
        raw.append(cells)
        i += 1
    if len(raw) > 1 and all(re.fullmatch(r":?-{3,}:?", c) for c in raw[1]):
        raw.pop(1)
    cols = max(len(row) for row in raw)
    raw = [row + [""] * (cols - len(row)) for row in raw]
    data = []
    for row_index, row in enumerate(raw):
        style = TABLE_HEAD if row_index == 0 else TABLE_BODY
        data.append([paragraph(cell, style) for cell in row])
    if cols == 2:
        widths = [available_width * 0.35, available_width * 0.65]
    elif cols == 3:
        widths = [available_width * 0.23, available_width * 0.48, available_width * 0.29]
    elif cols == 4:
        widths = [available_width * 0.27, available_width * 0.18, available_width * 0.18, available_width * 0.37]
    else:
        widths = [available_width / cols] * cols
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table, i


def parse_list(lines, start, numbered=False):
    pattern = re.compile(r"^(\d+)\.\s+(.*)$") if numbered else re.compile(r"^-\s+(.*)$")
    items = []
    current = None
    i = start
    while i < len(lines):
        stripped = lines[i].strip()
        match = pattern.match(stripped)
        if match:
            if current is not None:
                items.append(current)
            current = match.group(2 if numbered else 1)
            i += 1
            continue
        if not stripped or stripped.startswith("#") or stripped.startswith("|") or stripped.startswith(">"):
            break
        if (numbered and re.match(r"^\d+\.\s+", stripped)) or (not numbered and stripped.startswith("- ")):
            break
        if current is None:
            break
        current += " " + stripped
        i += 1
    if current is not None:
        items.append(current)
    flow_items = [ListItem(paragraph(item), leftIndent=12) for item in items]
    list_args = {
        "bulletType": "1" if numbered else "bullet",
        "leftIndent": 20,
        "bulletFontName": "PawArial-Bold",
        "bulletFontSize": 8.5,
        "bulletColor": TEAL if numbered else ORANGE,
        "spaceAfter": 7,
    }
    if numbered:
        list_args["start"] = "1"
    else:
        list_args["bulletChar"] = "•"
    return ListFlowable(flow_items, **list_args), i


def make_contents(section_titles):
    data = []
    for title in section_titles:
        match = re.match(r"(\d+)\.\s*(.*)", title)
        if match:
            data.append([
                Paragraph(match.group(1), ParagraphStyle("TocNum", parent=BODY, fontName="PawArial-Bold", fontSize=10, textColor=ORANGE, alignment=TA_CENTER)),
                paragraph(match.group(2), ParagraphStyle("TocItem", parent=BODY, fontSize=9, leading=12, spaceAfter=0)),
            ])
    table = Table(data, colWidths=[0.4 * inch, 6.15 * inch], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.35, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [Paragraph("Contenido", H1), table, PageBreak()]


def build_story(source_text, available_width):
    lines = normalize(source_text).splitlines()
    section_titles = [line[3:].strip() for line in lines if line.startswith("## ")]
    story = make_cover() + make_contents(section_titles)
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped:
            i += 1
            continue
        if stripped.startswith("# "):
            i += 1
            continue
        if stripped.startswith("## "):
            title = stripped[3:].strip()
            story.extend([Paragraph(inline_markup(title), H1), HRFlowable(width="100%", thickness=1.2, color=BEIGE, spaceAfter=5)])
            i += 1
            continue
        if stripped.startswith("### "):
            story.append(Paragraph(inline_markup(stripped[4:]), H2))
            i += 1
            continue
        if stripped.startswith("#### "):
            story.append(Paragraph(inline_markup(stripped[5:]), H3))
            i += 1
            continue
        if stripped.startswith("|"):
            table, i = parse_table(lines, i, available_width)
            story.extend([table, Spacer(1, 7)])
            continue
        if stripped.startswith(">"):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i].strip()[1:].strip())
                i += 1
            quote = Paragraph(inline_markup(" ".join(quote_lines)), QUOTE)
            box = Table([[quote]], colWidths=[available_width], style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT_ORANGE),
                ("BOX", (0, 0), (-1, -1), 0.8, ORANGE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]))
            story.extend([box, Spacer(1, 8)])
            continue
        if stripped.startswith("- "):
            flow, i = parse_list(lines, i, numbered=False)
            story.append(flow)
            continue
        if re.match(r"^\d+\.\s+", stripped):
            flow, i = parse_list(lines, i, numbered=True)
            story.append(flow)
            continue
        paragraph_lines = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt or nxt.startswith(("#", "|", ">", "- ")) or re.match(r"^\d+\.\s+", nxt):
                break
            paragraph_lines.append(nxt)
            i += 1
        text = " ".join(paragraph_lines)
        if text.startswith("`") and text.endswith("`") and " -> " in text:
            callout = Table([[paragraph(text, ParagraphStyle("State", parent=BODY, fontName="Courier", fontSize=8.5, leading=12, textColor=INK, alignment=TA_CENTER))]], colWidths=[available_width], style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT_TEAL),
                ("BOX", (0, 0), (-1, -1), 0.7, TEAL),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]))
            story.extend([callout, Spacer(1, 6)])
        else:
            story.append(paragraph(text))
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        rightMargin=0.68 * inch,
        leftMargin=0.68 * inch,
        topMargin=0.67 * inch,
        bottomMargin=0.62 * inch,
        title="Red de Aliados PawAlert - Propuesta funcional",
        author="PawAlert",
        subject="Integración de patrocinadores, donantes y aliados",
    )
    story = build_story(SOURCE.read_text(encoding="utf-8"), doc.width)
    doc.build(story, onFirstPage=cover_page, onLaterPages=later_page)
    print(OUTPUT)


if __name__ == "__main__":
    main()
