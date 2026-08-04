---
name: vce-exam-authoring
description: Write VCE practice examinations and worked solutions as PDFs for CramForge — question design, mark allocation, vector diagrams to VCAA conventions, solutions with per-mark breakdowns, and the Supabase upload path. Use whenever the task is to create, extend, or fix a practice exam, a solutions document, a formula sheet, or the diagrams inside them, for any VCE subject.
---

# Writing VCE practice exams

This skill exists because the first Physics set took far longer than it should
have. Almost every hour lost went to the same handful of mistakes, and every
one of them is preventable by following the order of work below. Read the
whole file before writing a single question.

## The one rule that matters most

**Author the content and the solution together, in one Python data structure,
and generate the exam PDF and the solutions PDF from it.** Never write a
question in one file and its answer in another. The moment those two drift,
the marking guide is wrong and the student trusts nothing else in the pack.

The proven shape is a module per paper exposing `PAPER`, `MC` and `SB`:

```python
PAPER = "A"

MC = [
 dict(t="question stem",
      o=["option A", "option B", "option C", "option D"],
      a=1,                     # index of the correct option
      s="why that answer is right, one or two sentences"),
]

SB = [
 dict(n=1, marks=8, diagram=D.a1_projectile,
   intro="the scenario, the numbers, and 'as shown below'",
   parts=[
    dict(l="a.", t="Calculate …", m=2, lines=4,
         s="working line 1  <b>(1)</b><br/>working line 2 = <b>answer</b>  <b>(1)</b>"),
   ]),
]
```

`lines` is the number of ruled answer lines. `s` is the worked solution, with
`<b>(1)</b>` marking the exact point at which each mark is earned.

## Order of work

Do not reorder these. Steps 2 and 3 are where the expensive mistakes happen.

1. **Structure.** Confirm the real exam's shape for the subject and the current
   study design. Physics is one paper: 20 multiple choice (20 marks) plus
   ~13 short-answer questions (110 marks), 130 total, 15 min reading and
   2 h 30 writing. Do not assume — Methods is two papers, Physics is one, and
   the structure changes between study designs.
2. **Blueprint the marks before writing anything.** List the questions with
   their mark values and check the arithmetic sums to the section total. Doing
   this after the fact means rewriting questions to fit.
3. **Work every calculation to a final number before writing the question.**
   Pick the given data so the answers come out clean, then write the stem
   around it. Writing the stem first and discovering the answer is 7.0632 m s⁻¹
   means starting again.
4. **Write the questions and their solutions in the same pass.**
5. **Write the diagram functions.**
6. **Run the validator** (`python3 tools/check_paper.py content_a`).
7. **Build the PDF, rasterise it, and look at every page with diagrams.**
   This is not optional — see below.
8. Build the solutions PDF and skim it for the same layout faults.

## Look at the rendered pages. Every time.

Rasterise and view. A diagram that is geometrically correct can still be
unreadable:

```python
import pypdfium2 as p
d = p.PdfDocument('out/Physics-A-Exam.pdf')
d[6].render(scale=1.3).to_pil().save('pg6.png')
```

Faults that only show up visually, all of which shipped at least once in the
first build:

- A label sitting on top of the arrow it labels.
- A trajectory that lands above the top of the wall the question says it hits.
- Wavefront arcs spilling out of the drawing and across the question text.
- A stray line from a `poly(...)` left in with a near-zero stroke width —
  `sw=0.0001` still renders.
- Two labels at the same coordinates because both were placed "to the right".
- An x-axis drawn at the bottom of a graph for a quantity that goes negative;
  flux and EMF oscillate about zero, so the axis belongs at the zero line with
  the curve above and below it.

## Diagram conventions

VCAA diagrams are plain line drawings. Match them:

- Black lines only, ~0.9 pt for objects, 0.6–0.7 pt for construction lines.
  No colour fills, no shading, no gradients.
- Vectors get **solid** arrowheads and an italic symbol label.
- Dashed for construction geometry, reference lines, trajectories and orbits.
- Hatching for ground and fixed supports.
- ⊗ for a field into the page, ⊙ for out of it, in a regular grid.
- Dimensions get a double-headed arrow and a value with units.
- "Not to scale." on anything astronomical.
- Label the sides of a coil (P, Q) so the question can refer to them.
- Graphs: arrowheads on both axes, italic axis labels with units in brackets,
  ticks with values, and data points as filled circles with uncertainty bars
  where the question is about measurement.

Build them as vector `reportlab.graphics.shapes` — never rasterise. A diagram
is a function returning a `Drawing`, named for the paper and question
(`a6_motor`, `d13_vt`).

**Keep every element inside the Drawing box.** Content drawn outside is not
clipped; it lands on top of the question text. The validator checks this.

## Numbers must agree everywhere

The single most embarrassing class of bug: the diagram says the town runs at
240 V, the question says 400 V, and the solution computes with a third figure.
Before building, re-read each question with only the diagram beside it and
confirm every labelled value appears identically in the stem.

The same applies to graphs. If a question asks the student to read the
gradient, derive the graph's geometry *from* the intended answer — set the
scale so the plotted line genuinely passes through the points the solution
quotes. Do not draw a plausible-looking line and then invent a gradient.

## Typography

Use real Unicode: `m s⁻¹`, `10⁻¹⁹`, `N kg⁻¹`, `μC`, `Ω`, `λ`, `Δ`, `θ`, `Φ`.
Never fake a superscript by drawing a smaller string at an offset — it looks
wrong at every zoom level and breaks copy-paste. Register a font with full
Unicode coverage (DejaVu Sans); the reportlab built-ins do not have Greek.

## Question design

- **Coverage.** Spread questions across the whole study design, weighted the
  way the real exam is. For Physics: motion and momentum, gravitational,
  electric and magnetic fields, induction and transmission, special
  relativity, light and matter, and one question on measurement and
  uncertainty. Never let a paper drift towards the topics that are easiest to
  write.
- **Mark values.** 1–2 marks for a recall or single-step calculation, 3–4 for
  multi-step working, 3–4 for an explanation. A 4-mark explanation needs four
  genuinely distinct things to say — if you cannot list them in the solution,
  it is not worth 4 marks.
- **Command words** must match what is being asked: *state* (no working),
  *calculate* (working required), *show that* (the answer is given, so the
  working is the whole mark), *explain* (physics reasoning in sentences),
  *describe* (what is observed), *justify*.
- **"Show that" questions are a gift** — they let a later part continue even
  if the student fails the earlier one. Use one or two per paper.
- **Multiple choice**: four options, exactly one defensible. Distractors must
  encode real errors — the sign slip, the forgotten `N` turns, the radius
  measured from the surface instead of the centre. Never make the correct
  option conspicuously the longest.
- **Across a set of papers, do not repeat a context.** If Paper A has a ball
  off a cliff, Paper B gets a kicked football and Paper C a package dropped
  from an aircraft. Students sit all three; recognising the scenario turns a
  physics test into a memory test. Keep a running list of contexts used.

## Writing the solutions

- One `<b>(1)</b>` per mark, positioned at the exact step that earns it. A
  student marking themselves must be able to point at their own line and match
  it.
- Show the formula, then the substitution, then the answer with units. Those
  are usually the three marks.
- State the alternative method in italics where one exists (energy vs
  kinematics, path difference vs fringe spacing).
- For explanation marks, write the marks as separate assertions, not a
  paragraph the student has to score holistically.
- Give a tolerance where the answer is read off a graph: *accept 8.5 × 10⁹ –
  1.1 × 10¹⁰ J for a reasonable square count*.
- Add a marking-protocol note on the solutions cover: consequential marks
  apply, and mark strictly.
- End the solutions with an **error log** table — question, marks lost, topic,
  error type (concept / algebra / units and significant figures / incomplete
  explanation / misread). The category that repeats is what the student should
  revise, and it is the most useful page in the whole pack.

## Legal and framing

Every page footer and the cover must say the material is CramForge practice,
**not** a VCAA examination, and not endorsed by or affiliated with the VCAA.
Write to the structure and style of the real exam; never reproduce VCAA
questions, and never imply endorsement.

## Shipping to the app

Naming is load-bearing — the paywall matches on file path:

```
Physics-A-Exam.pdf        Physics-A-Solutions.pdf
Physics-B-Exam.pdf        Physics-B-Solutions.pdf
Physics-Formula-Sheet.pdf Physics-Practice-Guide.pdf
```

Paper A of each subject is the free tier, matched by a regex on `file_path`
(never on `title`, which can be edited in the database and would silently
unlock the Pro papers).

Uploads go to the `past-papers` bucket. Two things that will bite:

- Chrome appends `_3` to a re-downloaded file, so the object name may not
  match the row. Repair by matching on filename alone rather than full path:
  ```sql
  update public.past_papers p set file_path = o.name
  from storage.objects o
  where o.bucket_id = 'past-papers'
    and o.name like '%' || substring(p.file_path from '[^/]+$')
    and o.name <> p.file_path;
  ```
- Always finish with the verification query, and expect zero rows:
  ```sql
  select p.title, p.file_path
  from public.past_papers p
  left join storage.objects o
    on o.bucket_id = 'past-papers' and o.name = p.file_path
  where o.id is null;
  ```

Insert a row for **every** file. The Paper A solutions were missing from the
database for a week because only the exam row was written — the paper looked
fine and the answers simply did not exist on the site.

## Before you call it done

- [ ] Validator passes with no errors
- [ ] Marks sum to the section and paper totals
- [ ] Every diagram page rasterised and inspected
- [ ] Every value in a diagram matches the stem and the solution
- [ ] Every graph's geometry derived from the intended answer
- [ ] No context repeated from another paper in the set
- [ ] Solutions award every mark with a `(1)` at the right step
- [ ] Error log page present
- [ ] Disclaimer on the cover and in the footer
- [ ] A row in `past_papers` for every uploaded file, verification query clean
