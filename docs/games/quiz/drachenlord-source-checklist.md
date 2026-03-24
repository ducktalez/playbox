# Drachenlord Source Checklist

This checklist is the bridge between research notes and real quiz seed imports.

## Purpose

Use this file before turning any draft from `drachenlord-seed-candidates.md` into runtime quiz data.
The goal is to prevent:
- ambiguous answers
- weakly sourced claims
- distractors that are accidentally true
- scene-only wording that is unclear to normal players

## Related files

- `research/drachenlord-dossier.de.md` — raw source dossier
- `drachenlord-fact-pool.md` — normalized fact candidates
- `drachenlord-topic-map.md` — category and balancing guide
- `drachenlord-seed-candidates.md` — draft question layer
- `backend/app/games/quiz/seed.py` — runtime seed structure (`SeedQuestionIn`, `QuizSeedFile`)

## Ready-state vocabulary

- `DRAFT` — not checked yet
- `RECHECK` — partially checked, still blocked
- `READY-FOR-SEED` — safe to convert into seed JSON
- `HOLD` — do not seed yet

## Per-question review checklist

For each candidate question, review the following fields.

### 1. Candidate link
- Candidate ID:
- Fact ID:
- Draft question text:
- Intended correct answer:

### 2. Source strength
- Highest available source class in dossier: `P1` / `P2` / `P3` / `P4`
- Strongest concrete source anchor:
- At least one corroborating source anchor:
- Is the claim still based only on scene reconstruction? yes / no
- Review result: pass / fail

### 3. Date precision
- Does the draft need an exact date, a month/year, or only a year?
- Is that level of precision actually supported by the dossier?
- If not, simplify the wording.
- Review result: pass / fail

### 4. Answer clarity
- Is there exactly one clear correct answer?
- Could a well-informed player reasonably interpret a second answer as correct?
- Does the question depend on scene-only interpretation?
- Review result: pass / fail

### 5. Distractor safety
- Are all distractors clearly false?
- Are any distractors too close to another real event in the same timeline?
- Are distractors fair for the intended difficulty?
- Review result: pass / fail

### 6. Player-facing wording
- Is the wording understandable outside the bubble?
- Is humiliating or mocking scene language avoided unless analytically necessary?
- Is the wording compact enough for normal quiz UI display?
- Review result: pass / fail

### 7. Category and tags
- Does the chosen category match `drachenlord-topic-map.md`?
- Do the tags help future balancing and search?
- Does this question overfill an already dominant category?
- Review result: pass / fail

### 8. Seed-shape compatibility

Check against the current quiz seed structure in `backend/app/games/quiz/seed.py`:
- question text should fit a normal seed question
- exactly one answer must be correct
- at least one wrong answer is required
- category should be stable and reusable
- tags should be simple and consistent
- no media fields should be required unless they are really needed
- Review result: pass / fail

### 9. Final state
- Final reviewer note:
- Final status: `DRAFT` / `RECHECK` / `READY-FOR-SEED` / `HOLD`

## Fast approval rules

A question can move to `READY-FOR-SEED` only if:
- source strength is at least one strong anchor (`P1` or `P2` preferred)
- answer clarity passes
- distractor safety passes
- wording is clear outside scene jargon
- the question fits the category balance strategy

## Immediate red flags

Do not seed a question yet if any of the following is true:
- it depends mainly on `P4` overview sources
- it includes private details
- it depends on archive material with unclear provenance
- it requires insider joke knowledge to understand the answer
- the supposed wrong answers are partly true in nearby contexts
- the wording implies a stronger factual claim than the dossier currently supports

## Suggested first review order

Review these first because they are relatively strong and broadly understandable:
1. `DQS-001`
2. `DQS-004`
3. `DQS-005`
4. `DQS-006`
5. `DQS-007`
6. `DQS-008`
7. `DQS-009`
8. `DQS-010`
9. `DQS-011`
10. `DQS-012`

Review these only after extra date/precision confirmation:
- `DQS-002`
- `DQS-003`

## Minimal template for future reviews

```text
Candidate ID:
Fact ID:
Question:
Correct answer:
Highest source class:
Strongest anchor:
Corroborating anchor:
Date precision ok: yes/no
Answer clarity ok: yes/no
Distractors ok: yes/no
Wording ok: yes/no
Category/tags ok: yes/no
Seed-shape ok: yes/no
Final status:
Notes:
```

