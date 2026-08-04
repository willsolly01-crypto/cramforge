"""CramForge VCE Physics practice exam engine.

Renders an exam PDF and a worked-solutions PDF from a single content module.
All diagrams are pure vector (reportlab.graphics) drawn to VCAA conventions:
0.9pt black lines, Helvetica-equivalent sans labels, solid arrowheads for
vectors, dashed lines for construction/reference geometry, no colour fills.
"""
import math
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, PageBreak, Flowable,
                                KeepTogether)
from reportlab.graphics.shapes import (Drawing, Line, Rect, Circle, String,
                                       Polygon, PolyLine, Ellipse, Group, Path)

# ── fonts ────────────────────────────────────────────────────────────
FD = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DJ", FD + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DJ-B", FD + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DJ-I", FD + "DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFont(TTFont("DJ-BI", FD + "DejaVuSans-BoldOblique.ttf"))
pdfmetrics.registerFontFamily("DJ", normal="DJ", bold="DJ-B",
                              italic="DJ-I", boldItalic="DJ-BI")

NAVY = colors.HexColor("#1B2A4A")
CORAL = colors.HexColor("#D9603B")
RULE = colors.HexColor("#9AA3B0")
LINE = colors.HexColor("#B8BFC9")

PW, PH = A4
LM = RM = 20 * mm
TM = 20 * mm
BM = 18 * mm
CW = PW - LM - RM          # content width ≈ 170mm

# ── paragraph styles ─────────────────────────────────────────────────
def _p(name, **kw):
    base = dict(fontName="DJ", fontSize=9.5, leading=13.5, textColor=colors.black)
    base.update(kw)
    return ParagraphStyle(name, **base)

S = {
    "body":    _p("body"),
    "bodyj":   _p("bodyj", alignment=TA_JUSTIFY),
    "small":   _p("small", fontSize=8, leading=11),
    "tiny":    _p("tiny", fontSize=7, leading=9.5, textColor=RULE),
    "qnum":    _p("qnum", fontName="DJ-B", fontSize=10.5, leading=14,
                  textColor=NAVY, spaceBefore=2),
    "marks":   _p("marks", fontSize=8.5, leading=12, alignment=2),
    "opt":     _p("opt", fontSize=9.5, leading=13, leftIndent=14, firstLineIndent=-14),
    "h1":      _p("h1", fontName="DJ-B", fontSize=15, leading=19, textColor=NAVY,
                  spaceBefore=6, spaceAfter=6),
    "h2":      _p("h2", fontName="DJ-B", fontSize=11, leading=15, textColor=NAVY,
                  spaceBefore=8, spaceAfter=3),
    "cover_t": _p("cover_t", fontName="DJ-B", fontSize=26, leading=30,
                  textColor=NAVY, alignment=TA_CENTER),
    "cover_s": _p("cover_s", fontSize=12, leading=17, alignment=TA_CENTER),
    "cover_x": _p("cover_x", fontSize=9, leading=13, alignment=TA_CENTER,
                  textColor=RULE),
    "sol":     _p("sol", fontSize=9, leading=13),
    "solb":    _p("solb", fontName="DJ-B", fontSize=9, leading=13, textColor=CORAL),
    "cap":     _p("cap", fontSize=8, leading=11, alignment=TA_CENTER, textColor=RULE),
}

# ── answer-space flowable ────────────────────────────────────────────
class Lines(Flowable):
    """Ruled writing space, VCAA-style."""
    def __init__(self, n=3, width=CW, gap=8.5 * mm):
        Flowable.__init__(self)
        self.n, self.width, self.gap = n, width, gap
        self.height = n * gap

    def wrap(self, aw, ah):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        for i in range(self.n):
            y = self.height - (i + 1) * self.gap + 2
            c.line(0, y, self.width, y)


class Box(Flowable):
    """Blank working box (for 'show your working' answers)."""
    def __init__(self, h=30 * mm, width=CW):
        Flowable.__init__(self)
        self.width, self.height = width, h

    def wrap(self, aw, ah):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.setDash(2, 2)
        c.rect(0, 0, self.width, self.height)


# ── diagram primitives ───────────────────────────────────────────────
BLK = colors.black
LW = 0.9


def txt(d, x, y, s, size=8, anchor="start", font="DJ", col=BLK, angle=None):
    o = String(x, y, s, fontName=font, fontSize=size, fillColor=col,
               textAnchor=anchor)
    if angle:
        g = Group(o)
        g.transform = (math.cos(math.radians(angle)), math.sin(math.radians(angle)),
                       -math.sin(math.radians(angle)), math.cos(math.radians(angle)),
                       0, 0)
        d.add(g)
    else:
        d.add(o)
    return o


def ital(d, x, y, s, size=8, anchor="start", col=BLK):
    return txt(d, x, y, s, size, anchor, font="DJ-I", col=col)


def ln(d, x1, y1, x2, y2, w=LW, col=BLK, dash=None):
    l = Line(x1, y1, x2, y2, strokeColor=col, strokeWidth=w)
    if dash:
        l.strokeDashArray = dash
    d.add(l)
    return l


def arrow(d, x1, y1, x2, y2, w=LW, col=BLK, head=5.0, dash=None, open_head=False):
    """Vector arrow with solid head — VCAA vector convention."""
    ang = math.atan2(y2 - y1, x2 - x1)
    bx, by = x2 - head * math.cos(ang), y2 - head * math.sin(ang)
    ln(d, x1, y1, bx, by, w, col, dash)
    s = head * 0.42
    p = Polygon([x2, y2,
                 bx - s * math.sin(ang), by + s * math.cos(ang),
                 bx + s * math.sin(ang), by - s * math.cos(ang)],
                fillColor=(colors.white if open_head else col),
                strokeColor=col, strokeWidth=0.7)
    d.add(p)


def dblarrow(d, x1, y1, x2, y2, col=BLK, head=4.0):
    """Dimension line with heads both ends."""
    arrow(d, x1, y1, x2, y2, w=0.7, col=col, head=head)
    arrow(d, x2, y2, x1, y1, w=0.7, col=col, head=head)


def rect(d, x, y, w, h, fill=None, sw=LW, dash=None, col=BLK):
    r = Rect(x, y, w, h, strokeColor=col, strokeWidth=sw,
             fillColor=fill if fill else None)
    if dash:
        r.strokeDashArray = dash
    d.add(r)
    return r


def circ(d, x, y, r, fill=None, sw=LW, dash=None, col=BLK):
    c = Circle(x, y, r, strokeColor=col, strokeWidth=sw,
               fillColor=fill if fill else None)
    if dash:
        c.strokeDashArray = dash
    d.add(c)
    return c


def poly(d, pts, fill=None, sw=LW, dash=None, col=BLK, closed=True):
    if closed:
        o = Polygon(pts, strokeColor=col, strokeWidth=sw,
                    fillColor=fill if fill else None)
    else:
        o = PolyLine(pts, strokeColor=col, strokeWidth=sw)
    if dash:
        o.strokeDashArray = dash
    d.add(o)
    return o


def hatch(d, x, y, w, n=14, length=5, ang=45):
    """Ground / fixed-support hatching."""
    ln(d, x, y, x + w, y)
    step = w / n
    dx = length * math.cos(math.radians(ang))
    dy = length * math.sin(math.radians(ang))
    for i in range(n):
        px = x + i * step
        ln(d, px, y, px - dx, y - dy, w=0.6)


def field_into(d, x, y, r=2.6):
    """⊗ — field into page."""
    circ(d, x, y, r, sw=0.7)
    k = r * 0.7
    ln(d, x - k, y - k, x + k, y + k, w=0.7)
    ln(d, x - k, y + k, x + k, y - k, w=0.7)


def field_out(d, x, y, r=2.6):
    """⊙ — field out of page."""
    circ(d, x, y, r, sw=0.7)
    circ(d, x, y, 0.8, fill=BLK, sw=0)


def arc_angle(d, cx, cy, r, a1, a2, label=None, lsize=8, off=6):
    """Dashed-free angle arc between two rays, with optional label."""
    pts = []
    steps = 24
    for i in range(steps + 1):
        a = math.radians(a1 + (a2 - a1) * i / steps)
        pts += [cx + r * math.cos(a), cy + r * math.sin(a)]
    poly(d, pts, sw=0.7, closed=False)
    if label:
        am = math.radians((a1 + a2) / 2)
        txt(d, cx + (r + off) * math.cos(am), cy + (r + off) * math.sin(am) - 3,
            label, 8, "middle", font="DJ-I")


def axes(d, x0, y0, w, h, xlabel, ylabel, xsize=8, ysize=8):
    arrow(d, x0, y0, x0 + w, y0, w=0.9, head=4.5)
    arrow(d, x0, y0, x0, y0 + h, w=0.9, head=4.5)
    txt(d, x0 + w / 2, y0 - 16, xlabel, xsize, "middle", font="DJ-I")
    g = Group(String(0, 0, ylabel, fontName="DJ-I", fontSize=ysize,
                     textAnchor="middle"))
    g.transform = (0, 1, -1, 0, x0 - 24, y0 + h / 2)
    d.add(g)


def tick(d, x, y, horiz=True, label=None, size=7.5, t=3):
    if horiz:
        ln(d, x, y - t, x, y + t, w=0.7)
        if label:
            txt(d, x, y - 12, label, size, "middle")
    else:
        ln(d, x - t, y, x + t, y, w=0.7)
        if label:
            txt(d, x - 6, y - 2.5, label, size, "end")


def spring(d, x1, y1, x2, y2, coils=8, amp=4):
    n = coils * 2
    dx = (x2 - x1) / n
    dy = (y2 - y1) / n
    L = math.hypot(x2 - x1, y2 - y1)
    nx, ny = -(y2 - y1) / L, (x2 - x1) / L
    pts = [x1, y1]
    for i in range(1, n):
        s = amp if i % 2 else -amp
        pts += [x1 + dx * i + nx * s, y1 + dy * i + ny * s]
    pts += [x2, y2]
    poly(d, pts, sw=0.8, closed=False)


def coil_side(d, x, y, n=6, w=26, h=3.6):
    """Solenoid drawn side-on as a row of loops."""
    step = w / n
    for i in range(n):
        d.add(Ellipse(x + step * (i + 0.5), y, step * 0.42, h,
                      strokeColor=BLK, strokeWidth=0.8, fillColor=None))


def caption(text):
    return Paragraph(text, S["cap"])


def dwrap(drawing):
    """Centre a Drawing in the text column."""
    t = Table([[drawing]], colWidths=[CW])
    t.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"),
                           ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                           ("TOPPADDING", (0, 0), (-1, -1), 4),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return t


# ── page furniture ───────────────────────────────────────────────────
def make_doc(path, title, running, solutions=False):
    doc = BaseDocTemplate(path, pagesize=A4,
                          leftMargin=LM, rightMargin=RM,
                          topMargin=TM, bottomMargin=BM,
                          title=title, author="CramForge",
                          subject="VCE Physics practice examination")
    frame = Frame(LM, BM, CW, PH - TM - BM, id="main",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

    def deco(canv, d):
        canv.saveState()
        canv.setFont("DJ", 7.5)
        canv.setFillColor(RULE)
        canv.drawString(LM, PH - TM + 8, running)
        canv.drawRightString(PW - RM, PH - TM + 8,
                             "page %d" % canv.getPageNumber())
        canv.setStrokeColor(LINE)
        canv.setLineWidth(0.5)
        canv.line(LM, PH - TM + 4, PW - RM, PH - TM + 4)
        canv.line(LM, BM - 8, PW - RM, BM - 8)
        canv.setFont("DJ", 7)
        canv.drawString(LM, BM - 17, "CramForge  ·  cramforge.vercel.app")
        canv.drawRightString(PW - RM, BM - 17,
                             "Practice material — not a VCAA examination")
        canv.restoreState()

    def plain(canv, d):
        canv.saveState()
        canv.setFont("DJ", 7)
        canv.setFillColor(RULE)
        canv.drawCentredString(PW / 2, BM - 17,
                               "CramForge  ·  cramforge.vercel.app  ·  "
                               "Practice material — not a VCAA examination")
        canv.restoreState()

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame], onPage=plain),
        PageTemplate(id="body", frames=[frame], onPage=deco),
    ])
    return doc


def marks_row(flow, marks):
    """Lay a flowable beside a right-aligned mark allocation."""
    mk = "%d mark%s" % (marks, "" if marks == 1 else "s")
    t = Table([[flow, Paragraph(mk, S["marks"])]],
              colWidths=[CW - 22 * mm, 22 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return t
