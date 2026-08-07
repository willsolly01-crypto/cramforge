# Weak Topic Tracker — install

## How it works (30 seconds)
Students sit your PDF papers, self-mark with the solutions, then tick the question
numbers they got wrong. A static JSON map (`public/topic-maps/*.json`) translates
question numbers → topics, so the DB never stores question text — just one tiny
row per (user, subject, topic): ~60 bytes. Leitner spaced repetition drives it:
each topic sits in a box 0–4. Correct answer → box up, review pushed out
(1/1/3/7/14 days). Wrong → box down, back in today's queue. Box 4 = MASTERED
stamp. Progress bar = average box across the subject. XP and streaks are derived
from the counters — zero extra storage.

Storage cost: a student tracking 6 subjects ≈ under 3 KB. 10,000 users ≈ ~30 MB.

## Install

```bash
cd ~/Downloads/cramforge
# copy the files from this zip into the repo, keeping paths:
#   sql/weak_topics.sql          (reference only, runs in Supabase)
#   api/weak-topics.js
#   src/WeakTopics.jsx
#   public/topic-maps/methods.json
#   public/topic-maps/physics.json
```

1. **Supabase**: SQL Editor → new query → paste `sql/weak_topics.sql` → Run.

2. **Wire two lines** in `src/WeakTopics.jsx`:
   - the `supabase` import path (point at your existing client)
   - `generatePractice()` — match body/response to your `api/generate.js`.
     Paste me your generate.js request/response shape if unsure and I'll give
     you the exact adapter.

3. **Add the tab** in `src/App.jsx`:
   ```jsx
   import WeakTopics from "./WeakTopics";
   // add "Weak Topics" to your nav, render <WeakTopics /> for that route
   ```

4. **Fill the topic maps.** Open each PDF next to its JSON and set the topic per
   question number — ~10 min per paper. The Methods A entries are plausible
   defaults, NOT verified against your papers. Question keys must match your
   numbering ("7", "A7", "B2"). Papers with an empty `{}` map show as disabled
   in the picker, so ship incrementally.

5. Deploy:
   ```bash
   git add . && git commit -m "Weak topic tracker" && git push
   ```

## Free-tier note
Practice questions go through your existing `/api/generate`, so free-tier
limits already apply — no new cost surface. The tracker endpoints themselves
are just Supabase reads/writes (free tier fine).

## Marketing angle (worth using)
"Tells you exactly which VCE topics you're losing marks on — and drills them
until you're not" is a stronger hook than "past papers library". It's also the
feature School Box doesn't have.
