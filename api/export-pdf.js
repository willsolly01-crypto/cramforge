// api/export-pdf.js — Branded CramForge exam paper PDF export
// Uses pdfkit (server-side, no browser PDF quirks).
// Pro-only: free users get ONE lifetime demo export (tracked in profiles.pdf_demo_used).

import PDFDocument from "pdfkit";
import { requireUser, sendErr, httpErr } from "../lib/_auth.js";
import { readBody } from "../lib/_claude.js";

// ── A4 layout constants ────────────────────────────────────────────────────
const PW = 595.28;   // page width  (pts)
const PH = 841.89;   // page height (pts)
const ML = 68;       // margin left
const MR = 68;       // margin right
const CW = PW - ML - MR;  // content width ≈ 459 pts

// ── Brand colours ──────────────────────────────────────────────────────────
const INK    = "#1a2238";
const RED    = "#d7263d";
const PENCIL = "#8b90a0";
const LINE   = "#d6d9e2";
const LIGHT  = "#f5f6f9";
const WHITE  = "#ffffff";
const YELLOW = "#ffe45c";
const REDSFT = "#fbe9ec";

// ── Helpers ────────────────────────────────────────────────────────────────
function hasDiagramHint(text = "") {
  return /\b(sketch|draw|diagram|graph|plot|shade|label|illustrate|annotate)\b/i.test(text);
}

function linesForMarks(marks = 4) {
  // Proportional answer lines: minimum 5, maximum 22
  return Math.min(22, Math.max(5, Math.ceil(marks * 2.2)));
}

function subjectLabel(type) {
  return {
    stem:       "Mathematics / Science",
    essay:      "Humanities / Essay",
    law:        "Law",
    accounting: "Accounting / Finance",
    medicine:   "Medicine / Health Sciences",
  }[type] || "University";
}

// ── Cover page ─────────────────────────────────────────────────────────────
function drawCover(doc, { questions, unitName, subjectType, demo }) {
  const total = questions.reduce((s, q) => s + (Number(q.marks) || 0), 0);
  const suggestedMins = Math.round(total * 1.2);

  // ① White background — gives the exam paper a clean, distinct feel
  doc.rect(0, 0, PW, PH).fill(WHITE);

  // ② Red accent bar (brand identifier visible to anyone nearby)
  doc.rect(0, 0, PW, 8).fill(RED);

  // ③ "CRAMFORGE" wordmark — large, centered
  //    We calculate exact widths so CRAM + FORGE are perfectly centred.
  doc.font("Times-Bold").fontSize(56);
  const cramW  = doc.widthOfString("CRAM");
  const forgeW = doc.widthOfString("FORGE");
  const wmX    = (PW - cramW - forgeW) / 2;
  doc.fillColor(INK).text("CRAM",  wmX,           32, { lineBreak: false });
  doc.fillColor(RED).text("FORGE", wmX + cramW,   32, { lineBreak: false });

  // ④ "PRACTICE EXAMINATION" tag
  doc.font("Courier").fontSize(11).fillColor(PENCIL)
     .text("PRACTICE EXAMINATION", 0, 98, { width: PW, align: "center", lineBreak: false });

  // ⑤ Thick rule
  doc.rect(ML, 120, CW, 2.5).fill(INK);

  // ⑥ Unit name — the headline visible to anyone who sees the paper
  let cy = 136;
  doc.font("Times-Bold").fontSize(32).fillColor(INK)
     .text(unitName || "Practice Examination", ML, cy, { width: CW, align: "center" });
  cy += doc.heightOfString(unitName || "Practice Examination",
        { width: CW, fontSize: 32 }) + 12;

  // ⑦ Subject + date
  doc.font("Courier").fontSize(10).fillColor(PENCIL)
     .text(subjectLabel(subjectType).toUpperCase(), 0, cy, { width: PW, align: "center", lineBreak: false });
  cy += 17;
  doc.font("Helvetica").fontSize(11).fillColor(PENCIL)
     .text(
       `Generated ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`,
       0, cy, { width: PW, align: "center", lineBreak: false }
     );
  cy += 32;

  // ⑧ Instructions box
  const instrLines = [
    `Total marks: ${total}  ·  Suggested time: ${suggestedMins} minutes`,
    "Write all answers clearly in the spaces provided below each question.",
    "Show all working — marks may be awarded for correct method even if the final answer is incorrect.",
    questions.some(q => hasDiagramHint(q.text))
      ? "Diagram boxes are provided where a sketch or graph is required."
      : null,
  ].filter(Boolean);

  const instrH = 24 + instrLines.length * 18 + 10;
  doc.rect(ML, cy, CW, instrH).fillAndStroke(LIGHT, INK);
  doc.rect(ML, cy, 4,   instrH).fill(RED);             // Red left accent

  let iy = cy + 10;
  doc.font("Courier-Bold").fontSize(9.5).fillColor(INK)
     .text("INSTRUCTIONS", ML + 14, iy, { lineBreak: false });
  iy += 17;
  doc.font("Helvetica").fontSize(10.5).fillColor(INK);
  for (const line of instrLines) {
    doc.text(`• ${line}`, ML + 14, iy, { width: CW - 20 });
    iy = doc.y + 1;
  }
  cy += instrH + 24;

  // ⑨ Student fields
  doc.font("Helvetica").fontSize(12).fillColor(INK);
  doc.text("Name:", ML, cy, { lineBreak: false });
  doc.moveTo(ML + 52, cy + 14).lineTo(ML + CW * 0.62, cy + 14)
     .strokeColor(INK).lineWidth(0.7).stroke();

  doc.text("Student ID:", ML + CW * 0.67, cy, { lineBreak: false });
  doc.moveTo(ML + CW * 0.67 + 73, cy + 14).lineTo(ML + CW, cy + 14)
     .strokeColor(INK).lineWidth(0.7).stroke();

  cy += 44;

  // ⑩ Question summary table
  doc.font("Courier").fontSize(9).fillColor(PENCIL)
     .text("QUESTION BREAKDOWN", ML, cy, { lineBreak: false });
  cy += 13;

  const c1 = ML, c2 = ML + 44, c3 = ML + 310, c4 = ML + 370, c5 = ML + 420;
  const rowH = 19;

  // Header row
  doc.rect(ML, cy, CW, rowH).fill(INK);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(WHITE);
  doc.text("Q",      c1 + 4,  cy + 5, { lineBreak: false });
  doc.text("Topic",  c2 + 4,  cy + 5, { lineBreak: false });
  doc.text("Marks",  c3 + 4,  cy + 5, { lineBreak: false });
  doc.text("Score",  c4 + 4,  cy + 5, { lineBreak: false });
  cy += rowH;

  questions.forEach((q, i) => {
    const bg = i % 2 === 0 ? WHITE : LIGHT;
    doc.rect(ML, cy, CW, rowH).fill(bg);
    // Thin grid lines
    doc.moveTo(ML, cy).lineTo(ML + CW, cy).strokeColor(LINE).lineWidth(0.4).stroke();

    doc.font("Helvetica").fontSize(10).fillColor(INK);
    doc.text(`${i + 1}`, c1 + 4, cy + 5, { lineBreak: false });

    // Truncate long topic names
    const topicStr = String(q.topic || "General");
    const topic = topicStr.length > 34 ? topicStr.slice(0, 32) + "…" : topicStr;
    doc.text(topic, c2 + 4, cy + 5, { width: c3 - c2 - 8, lineBreak: false });
    doc.text(`${q.marks || 0}`, c3 + 4, cy + 5, { lineBreak: false });
    doc.text("___",             c4 + 4, cy + 5, { lineBreak: false });
    cy += rowH;
  });

  // Total row
  doc.rect(ML, cy, CW, rowH).fill(INK);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(WHITE);
  doc.text("TOTAL", c1 + 4, cy + 5, { lineBreak: false });
  doc.text(`${total}`, c3 + 4, cy + 5, { lineBreak: false });
  doc.text("___",      c4 + 4, cy + 5, { lineBreak: false });

  // ⑪ Demo watermark (subtle, rotated)
  if (demo) {
    doc.save();
    doc.opacity(0.06);
    doc.font("Helvetica-Bold").fontSize(90).fillColor(RED)
       .text("DEMO", 80, PH / 2 - 60, { width: PW - 160, align: "center", lineBreak: false });
    doc.restore();
  }
}

// ── Question page ──────────────────────────────────────────────────────────
function drawQuestion(doc, q, index, totalQuestions, unitName) {
  const marks    = Number(q.marks) || 4;
  const isDiag   = hasDiagramHint(q.text);
  const numLines = linesForMarks(marks);

  // White background
  doc.rect(0, 0, PW, PH).fill(WHITE);

  // ── Header band ──
  doc.rect(0, 0, PW, 46).fill(INK);

  // CramForge in header — small but bold brand signal
  doc.font("Times-Bold").fontSize(15).fillColor(WHITE)
     .text("Cram", ML, 15, { lineBreak: false, continued: true });
  doc.fillColor("#ff7a8a").text("Forge", { lineBreak: false });

  // Unit name centred in header
  doc.font("Courier").fontSize(10).fillColor(WHITE)
     .text(unitName || "", 0, 17, { width: PW, align: "center", lineBreak: false });

  // Q.X / Y right-aligned
  doc.font("Courier-Bold").fontSize(10).fillColor(WHITE)
     .text(`Q.${index + 1} / ${totalQuestions}`, ML, 17,
           { width: CW, align: "right", lineBreak: false });

  // ── Topic tag ──
  let cy = 64;
  const topicText = String(q.topic || "Question").toUpperCase();
  doc.font("Courier-Bold").fontSize(9);
  const tagW = Math.min(doc.widthOfString(topicText) + 18, CW * 0.6);
  doc.rect(ML, cy, tagW, 18).fill(YELLOW);
  doc.fillColor(INK).text(topicText, ML + 9, cy + 5, { lineBreak: false });

  // ── Question number + marks circle ──
  cy += 28;
  doc.font("Times-Bold").fontSize(22).fillColor(INK)
     .text(`Question ${index + 1}`, ML, cy, { lineBreak: false });

  // Marks circle (right side)
  const cx = PW - MR - 24;
  const circR = 22;
  doc.circle(cx, cy + circR * 0.8, circR)
     .lineWidth(2).strokeColor(INK).stroke();
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK)
     .text(`${marks}`, cx - 20, cy + 5, { width: 40, align: "center", lineBreak: false });
  doc.font("Courier").fontSize(8).fillColor(PENCIL)
     .text("marks", cx - 20, cy + 19, { width: 40, align: "center", lineBreak: false });

  // ── Question text ──
  cy += 34;
  doc.font("Helvetica").fontSize(12.5).fillColor(INK).lineGap(4);
  const questionText = String(q.text || "");
  doc.text(questionText, ML, cy, { width: CW - 60, lineGap: 5 });
  cy = doc.y + 18;

  // ── Dashed separator ──
  doc.save();
  doc.dash(4, { space: 4 }).moveTo(ML, cy).lineTo(PW - MR, cy)
     .strokeColor(LINE).lineWidth(0.8).stroke();
  doc.undash();
  doc.restore();
  cy += 10;

  // ── "Answer space" label ──
  doc.font("Courier").fontSize(9).fillColor(PENCIL)
     .text("ANSWER SPACE  ·  SHOW ALL WORKING", ML, cy, { lineBreak: false });
  cy += 18;

  // ── Ruled answer lines ──
  const lineSpacing = 23;
  const footerReserve = 52;
  const scoreH = 32;
  const diagH  = isDiag ? 140 : 0;

  const available  = PH - cy - footerReserve - scoreH - diagH - 12;
  const maxLines   = Math.max(3, Math.floor(available / lineSpacing));
  const drawLines  = Math.min(numLines, maxLines);

  for (let i = 0; i < drawLines; i++) {
    const ly = cy + i * lineSpacing;
    doc.moveTo(ML, ly).lineTo(PW - MR, ly)
       .strokeColor(LINE).lineWidth(0.55).stroke();
  }
  cy += drawLines * lineSpacing + 8;

  // ── Diagram box (when question asks for a sketch/graph) ──
  if (isDiag && cy + diagH + footerReserve + scoreH < PH) {
    doc.rect(ML, cy, CW, diagH - 10)
       .lineWidth(0.8).strokeColor(LINE).stroke();
    doc.rect(ML, cy, CW, 16).fill(LIGHT);  // label bar
    doc.font("Courier").fontSize(8.5).fillColor(PENCIL)
       .text("DIAGRAM / GRAPH SPACE", ML + 8, cy + 4, { lineBreak: false });
    cy += diagH;
  }

  // ── Score box ──
  const sbW = 200;
  const sbY = PH - footerReserve - scoreH;
  doc.rect(PW - MR - sbW, sbY, sbW, scoreH)
     .lineWidth(1).strokeColor(INK).stroke();
  doc.font("Helvetica").fontSize(11).fillColor(INK)
     .text(`Marks awarded: ___ / ${marks}`,
           PW - MR - sbW + 9, sbY + 9, { lineBreak: false });
}

// ── Per-page footer (added after all pages generated, using bufferPages) ───
function drawFooter(doc, pageIndex, totalPages, demo) {
  const fy = PH - 36;

  // Rule above footer
  doc.moveTo(ML, fy).lineTo(PW - MR, fy)
     .strokeColor(LINE).lineWidth(0.5).stroke();

  // CramForge brand (left)
  doc.font("Times-Bold").fontSize(9.5).fillColor(PENCIL)
     .text("Cram", ML, fy + 8, { lineBreak: false, continued: true });
  doc.fillColor(RED).text("Forge", { lineBreak: false });

  // URL (centre)
  doc.font("Courier").fontSize(8.5).fillColor(PENCIL)
     .text("cramforge.app", 0, fy + 9, { width: PW, align: "center", lineBreak: false });

  // Page number (right) — skip "Page 0" for cover
  if (pageIndex > 0) {
    doc.font("Helvetica").fontSize(9).fillColor(PENCIL)
       .text(`Page ${pageIndex} of ${totalPages - 1}`, ML, fy + 9,
             { width: CW, align: "right", lineBreak: false });
  }

  // Subtle "DEMO" watermark on every question page (not the cover)
  if (demo && pageIndex > 0) {
    doc.save();
    doc.opacity(0.04);
    doc.font("Helvetica-Bold").fontSize(80).fillColor(RED)
       .text("DEMO", 80, PH * 0.4, { width: PW - 160, align: "center", lineBreak: false });
    doc.restore();
  }
}

// ── Main handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { questions, unitName, subjectType } = await readBody(req);
    if (!Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ error: "No questions provided." });
    }

    // ── Auth + Pro / demo gating ──────────────────────────────────────────
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Sign in required to export a PDF." });

    const { sb, user, profile } = await requireUser(req);

    let isDemo = false;
    if (profile.plan !== "pro") {
      if (profile.pdf_demo_used) {
        throw httpErr(
          402,
          "PDF export is a Pro feature. You've used your one free demo — upgrade to Pro for unlimited exports."
        );
      }
      // Mark demo used before generating (idempotent)
      await sb.from("profiles").update({ pdf_demo_used: true }).eq("id", user.id);
      isDemo = true;
    }

    // ── Build PDF ─────────────────────────────────────────────────────────
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, left: ML, right: MR, bottom: 56 },
      bufferPages: true,   // lets us post-process page numbers
      autoFirstPage: true, // cover is page 0
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));

    // Cover page (page 0)
    drawCover(doc, { questions, unitName, subjectType, demo: isDemo });

    // One page per question
    for (let i = 0; i < questions.length; i++) {
      doc.addPage();
      drawQuestion(doc, questions[i], i, questions.length, unitName);
    }

    // Add footers to every page via bufferPages
    const { start, count } = doc.bufferedPageRange();
    for (let i = 0; i < count; i++) {
      doc.switchToPage(start + i);
      drawFooter(doc, i, count, isDemo);
    }

    // Flush buffered pages then close
    doc.flushPages();
    doc.end();

    await new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
    });

    const pdf = Buffer.concat(chunks);
    const safeName = String(unitName || "exam")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 40);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdf.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cramforge-${safeName || "exam"}.pdf"`
    );
    return res.status(200).send(pdf);
  } catch (e) {
    return sendErr(res, e);
  }
}

