"""Branded PDF export for a Concept Generation."""
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Image, Paragraph, SimpleDocTemplate, Spacer,
                                  Table, TableStyle)

from app.core.object_storage import get_object

SLATE_900 = colors.HexColor("#0F172A")
SLATE_500 = colors.HexColor("#64748B")
SLATE_100 = colors.HexColor("#F1F5F9")
AMBER = colors.HexColor("#F59E0B")


def _rupee(n) -> str:
    try:
        val = float(n or 0)
    except (TypeError, ValueError):
        return "Rs. 0.00"
    return "Rs. " + f"{val:,.2f}".replace(",", "_").replace("_", ",")  # ASCII-safe


def _rupee_indian(n) -> str:
    try:
        val = float(n or 0)
    except (TypeError, ValueError):
        val = 0.0
    # Indian grouping: last three digits, then two-digit groups
    neg = val < 0
    val = abs(val)
    int_part, dec_part = f"{val:.2f}".split(".")
    if len(int_part) > 3:
        last3 = int_part[-3:]
        rest = int_part[:-3]
        rest = ",".join([rest[max(i - 2, 0):i] for i in range(len(rest), 0, -2)][::-1])
        int_part = f"{rest},{last3}"
    body = f"Rs. {int_part}.{dec_part}"
    return f"(-{body})" if neg else body


def _image_from_storage(path: str, max_w: float, max_h: float):
    try:
        data, _ = get_object(path)
        img = Image(io.BytesIO(data))
        iw, ih = img.imageWidth, img.imageHeight
        scale = min(max_w / iw, max_h / ih)
        img.drawWidth = iw * scale
        img.drawHeight = ih * scale
        return img
    except Exception:
        return Paragraph("<i>Image unavailable</i>",
                          ParagraphStyle("na", fontSize=9, textColor=SLATE_500))


def render_concept_pdf(concept) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                              topMargin=18 * mm, bottomMargin=18 * mm,
                              title=f"Sitera Concept #{concept.id}")

    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold",
                          fontSize=22, textColor=SLATE_900, spaceAfter=4)
    eyebrow = ParagraphStyle("eyebrow", parent=ss["Normal"], fontName="Helvetica-Bold",
                                fontSize=8, textColor=AMBER, spaceAfter=2)
    meta = ParagraphStyle("meta", parent=ss["Normal"], fontName="Helvetica",
                            fontSize=9.5, textColor=SLATE_500, spaceAfter=2)
    body = ParagraphStyle("body", parent=ss["Normal"], fontName="Helvetica",
                            fontSize=10, textColor=SLATE_900)
    right = ParagraphStyle("right", parent=body, alignment=TA_RIGHT)

    story = []
    story.append(Paragraph("SITERA · AI DESIGN CONCEPT", eyebrow))
    story.append(Paragraph(f"{concept.style} — {concept.space_type}", h1))
    story.append(Paragraph(
        f"Approx. {float(concept.sqft):.0f} sq ft · {concept.region} · "
        f"Generated {concept.created_at.strftime('%d %b %Y')}", meta))
    story.append(Spacer(1, 10))

    # Before / After row
    half_w = (A4[0] - 36 * mm) / 2 - 4
    before = _image_from_storage(concept.uploaded_photo_path, half_w, 70 * mm)
    after = (_image_from_storage(concept.rendered_image_path, half_w, 70 * mm)
              if concept.rendered_image_path else Paragraph("<i>Render pending</i>", meta))
    grid = Table([
        [Paragraph("<b>BEFORE</b>", eyebrow), Paragraph("<b>AFTER — {} RESTYLE</b>".format(concept.style.upper()), eyebrow)],
        [before, after],
    ], colWidths=[half_w, half_w])
    grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(grid)
    story.append(Spacer(1, 6))

    # Cost table
    story.append(Paragraph("ITEMIZED COST ESTIMATE", eyebrow))
    header = ["#", "Category", "Description", "Qty", "Unit", "Rate", "Subtotal"]
    rows = [header]
    for i, li in enumerate(sorted(concept.lines or [], key=lambda l: (l.sort_order or 0, l.id)), 1):
        rows.append([
            str(i), li.category, li.description,
            f"{float(li.quantity):g}", li.unit,
            _rupee_indian(li.rate), _rupee_indian(li.subtotal),
        ])
    rows.append(["", "", "", "", "", "TOTAL", _rupee_indian(concept.total_estimate)])
    col_widths = [8 * mm, 25 * mm, 62 * mm, 12 * mm, 12 * mm, 22 * mm, 33 * mm]
    tbl = Table(rows, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), SLATE_500),
        ("BACKGROUND", (0, 0), (-1, 0), SLATE_100),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#CBD5E1")),
        ("FONT", (0, 1), (-1, -2), "Helvetica", 9),
        ("TEXTCOLOR", (0, 1), (-1, -2), SLATE_900),
        ("ALIGN", (3, 1), (3, -2), "RIGHT"),
        ("ALIGN", (5, 1), (6, -1), "RIGHT"),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, SLATE_100),
        ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 10),
        ("BACKGROUND", (0, -1), (-1, -1), SLATE_100),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "This is a preliminary AI-generated cost estimate for planning purposes. "
        "Final pricing will be captured in a formal Sitera Estimate.", meta))

    doc.build(story)
    return buf.getvalue()
