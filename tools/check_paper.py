#!/usr/bin/env python3
"""
check_paper.py — validate a CramForge exam content module before building.

    python3 tools/check_paper.py content_a content_b content_c

Catches, without a human reading the PDF:
  · mark totals that do not reach the advertised 130
  · a question whose parts do not sum to its stated mark value
  · missing or empty worked solutions
  · answer space wildly out of proportion to the marks
  · diagram geometry drawn outside the Drawing box (it will overlap
    the question text when placed in the PDF)
  · diagram functions that raise
  · ASCII pseudo-superscripts ("m s-1", "10^-19") that should be Unicode
  · solutions that never award a mark with the (1) token

Exit code 1 if any ERROR is found. WARNs do not fail the run.
"""
import sys
import re
import math
import importlib
import traceback

sys.path.insert(0, ".")

from reportlab.graphics.shapes import (Drawing, Group, Line, Rect, Circle,
                                       Ellipse, Polygon, PolyLine, String)

SECTION_A_COUNT = 20
SECTION_B_MARKS = 110
TOTAL_MARKS = 130

errors, warns = [], []


def err(m):
    errors.append(m)


def warn(m):
    warns.append(m)


# ── geometry: does everything sit inside the Drawing box? ────────────
def bbox(shape, dx=0.0, dy=0.0):
    """Yield (x0, y0, x1, y1) for a shape, applying a group offset."""
    if isinstance(shape, Group):
        # Only handle the translate/rotate transforms used in this codebase.
        t = getattr(shape, "transform", (1, 0, 0, 1, 0, 0))
        for c in shape.contents:
            for b in bbox(c, dx + t[4], dy + t[5]):
                yield b
        return
    if isinstance(shape, Line):
        yield (min(shape.x1, shape.x2) + dx, min(shape.y1, shape.y2) + dy,
               max(shape.x1, shape.x2) + dx, max(shape.y1, shape.y2) + dy)
    elif isinstance(shape, Rect):
        yield (shape.x + dx, shape.y + dy,
               shape.x + shape.width + dx, shape.y + shape.height + dy)
    elif isinstance(shape, Circle):
        yield (shape.cx - shape.r + dx, shape.cy - shape.r + dy,
               shape.cx + shape.r + dx, shape.cy + shape.r + dy)
    elif isinstance(shape, Ellipse):
        yield (shape.cx - shape.rx + dx, shape.cy - shape.ry + dy,
               shape.cx + shape.rx + dx, shape.cy + shape.ry + dy)
    elif isinstance(shape, (Polygon, PolyLine)):
        pts = shape.points
        xs = pts[0::2]
        ys = pts[1::2]
        if xs and ys:
            yield (min(xs) + dx, min(ys) + dy, max(xs) + dx, max(ys) + dy)
    elif isinstance(shape, String):
        # Rough: assume 0.62 em average glyph width.
        w = len(shape.text) * shape.fontSize * 0.62
        anchor = getattr(shape, "textAnchor", "start")
        x0 = shape.x - (w / 2 if anchor == "middle" else w if anchor == "end" else 0)
        yield (x0 + dx, shape.y - shape.fontSize * 0.25 + dy,
               x0 + w + dx, shape.y + shape.fontSize * 0.8 + dy)


def check_drawing(name, d, warn_at=4.0, err_at=24.0):
    """Flag geometry outside the Drawing box, which overlaps page text.

    String widths are estimated, so treat a small overhang as a warning
    and only fail the build on a spill big enough to reach the text."""
    if not isinstance(d, Drawing):
        err(f"{name}: did not return a Drawing")
        return
    W, H = d.width, d.height
    worst = None
    for shape in d.contents:
        for (x0, y0, x1, y1) in bbox(shape):
            over = max(-x0, -y0, x1 - W, y1 - H)
            if over > warn_at and (worst is None or over > worst):
                worst = over
    if worst is None:
        return
    msg = (f"{name}: geometry extends ~{worst:.0f}pt beyond the "
           f"{W:.0f}×{H:.0f} box")
    if worst > err_at:
        err(msg + " — it will overlap the question text. Grow the Drawing "
                  "or move the label inwards.")
    elif worst > warn_at:
        warn(msg + " — check the rendered page before shipping.")


# ── text conventions ─────────────────────────────────────────────────
ASCII_SUP = re.compile(r"(m\s*s-1|s-1|kg-1|10\^-?\d|\bx10\b|N/kg|m/s)")


def check_text(where, s):
    if not s or not str(s).strip():
        err(f"{where}: empty text")
        return
    m = ASCII_SUP.search(str(s))
    if m:
        warn(f"{where}: ASCII notation {m.group(0)!r} — use Unicode "
             "(m s⁻¹, 10⁻¹⁹, N kg⁻¹)")


def check_module(modname):
    print(f"\n=== {modname} ===")
    try:
        m = importlib.import_module(modname)
    except Exception:
        err(f"{modname}: import failed\n{traceback.format_exc()}")
        return

    paper = getattr(m, "PAPER", "?")

    # ── Section A ────────────────────────────────────────────────
    mc = getattr(m, "MC", [])
    if len(mc) != SECTION_A_COUNT:
        err(f"Paper {paper}: Section A has {len(mc)} questions, "
            f"expected {SECTION_A_COUNT}")
    for i, q in enumerate(mc, 1):
        w = f"Paper {paper} MC{i}"
        check_text(w, q.get("t"))
        if len(q.get("o", [])) != 4:
            err(f"{w}: {len(q.get('o', []))} options, expected 4")
        if not isinstance(q.get("a"), int) or not 0 <= q["a"] <= 3:
            err(f"{w}: answer index must be 0–3")
        check_text(w + " solution", q.get("s"))
        # An answer that is always the longest option is a giveaway.
        opts = q.get("o", [])
        if opts and q.get("a") is not None:
            lens = [len(o) for o in opts]
            if lens[q["a"]] == max(lens) and max(lens) > 1.6 * (
                    sorted(lens)[-2] or 1):
                warn(f"{w}: correct option is much longer than the "
                     "distractors — a test-taker can spot it without physics")

    # ── Section B ────────────────────────────────────────────────
    sb = getattr(m, "SB", [])
    total = 0
    for q in sb:
        w = f"Paper {paper} Q{q.get('n')}"
        check_text(w, q.get("intro"))
        part_sum = sum(p.get("m", 0) for p in q.get("parts", []))
        if part_sum != q.get("marks"):
            err(f"{w}: parts sum to {part_sum} but the question is "
                f"labelled {q.get('marks')} marks")
        total += q.get("marks", 0)

        for p in q.get("parts", []):
            pw = f"{w}{p.get('l', '?')}"
            check_text(pw, p.get("t"))
            sol = p.get("s", "")
            check_text(pw + " solution", sol)
            marks = p.get("m", 0)
            # Every mark should be visibly awarded in the solution.
            awarded = len(re.findall(r"<b>\((\d)\)</b>", sol))
            got = sum(int(x) for x in re.findall(r"<b>\((\d)\)</b>", sol))
            if awarded == 0:
                err(f"{pw}: solution never awards a mark with the (1) token")
            elif got != marks:
                warn(f"{pw}: solution awards {got} marks, part is worth {marks}")
            # Writing space should scale with marks.
            lines = p.get("lines", 0)
            if lines and marks and lines < marks:
                warn(f"{pw}: {lines} ruled lines for {marks} marks — "
                     "students will run out of room")

    if total != SECTION_B_MARKS:
        err(f"Paper {paper}: Section B totals {total} marks, "
            f"expected {SECTION_B_MARKS} "
            f"(paper total would be {total + len(mc)}, not {TOTAL_MARKS})")

    # ── Diagrams ─────────────────────────────────────────────────
    seen = set()
    for q in sb:
        fn = q.get("diagram")
        if fn is None or fn in seen:
            continue
        seen.add(fn)
        name = f"Paper {paper} {getattr(fn, '__name__', 'diagram')}"
        try:
            check_drawing(name, fn())
        except Exception:
            err(f"{name}: raised\n{traceback.format_exc()}")

    n_dia = len(seen)
    if n_dia < 8:
        warn(f"Paper {paper}: only {n_dia} diagrams — VCAA papers are "
             "heavily illustrated, aim for 10+")
    print(f"Section A {len(mc)} · Section B {total} marks · {n_dia} diagrams")


if __name__ == "__main__":
    mods = sys.argv[1:]
    if not mods:
        print(__doc__)
        sys.exit(2)
    for mod in mods:
        check_module(mod)

    print("\n" + "─" * 60)
    for w in warns:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(f"\n{len(errors)} error(s), {len(warns)} warning(s)")
    sys.exit(1 if errors else 0)
