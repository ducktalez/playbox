# Drachenlord Seed Candidates

This file converts safe-core research into draft quiz questions.

## Scope

- These entries are **draft candidates**, not runtime seed data.
- Each candidate should be re-checked against the dossier and stronger public sources before moving into `seed_questions.yaml`.
- The structure below is intentionally close to the quiz seed shape in `backend/app/games/quiz/seed.py`, but it stays human-readable for review.
- Authored runtime seeds should use YAML and the compact answer structure `answers: [correct_answer, [wrong_answer, ...]]`.

## Status vocabulary

- `DRAFT` — usable idea, not yet source-cleared
- `RECHECK` — promising, but needs better precision or distractor review
- `READY-FOR-SEED` — checked and ready to be transformed into the JSON seed format
- `PROMOTED` — already present in runtime `seed_questions.yaml`

## Starter batch

The first batch stays conservative and uses the safer, broadly understandable facts from `drachenlord-fact-pool.md`.

### DQS-001
- **Based on:** DQF-001
- **Draft question:** Under which online alias did Rainer Winkler become widely known?
- **Correct answer:** Drachenlord
- **Distractors:** Drachenmeister; Drachenkönig; Drachenritter
- **Category:** Identity & Basics
- **Tags:** identity, alias, basics, safe-core
- **Difficulty:** easy
- **Dossier anchors:** BG-001, PA-001, QZ-001
- **Seed status:** DRAFT

### DQS-002
- **Based on:** DQF-002
- **Draft question:** In which month and year does the dossier place the start of the Drachenlord YouTube channel?
- **Correct answer:** August 2011
- **Distractors:** August 2009; August 2014; November 2016
- **Category:** Timeline & Milestones
- **Tags:** timeline, youtube, origins, 2011, safe-core
- **Difficulty:** medium
- **Dossier anchors:** T-001, QZ-001
- **Seed status:** RECHECK

### DQS-003
- **Based on:** DQF-003
- **Draft question:** Which year does the dossier identify as the key turning point when the public address release escalated the conflict into the offline world?
- **Correct answer:** 2014
- **Distractors:** 2011; 2016; 2019
- **Category:** Timeline & Milestones
- **Tags:** timeline, escalation, address, offline-shift, safe-core
- **Difficulty:** medium
- **Dossier anchors:** T-002, PH-003
- **Seed status:** RECHECK

### DQS-004
- **Based on:** DQF-004
- **Draft question:** Which documentary format does the dossier describe as an important breakthrough in broader public awareness in 2016?
- **Correct answer:** Y-Kollektiv
- **Distractors:** Spiegel TV; STRG_F; ZDF Magazin Royale
- **Category:** Media & Documentation
- **Tags:** media, documentary, y-kollektiv, 2016, safe-core
- **Difficulty:** medium
- **Dossier anchors:** T-005, EK-002, SRC-P2-010
- **Seed status:** DRAFT

### DQS-005
- **Based on:** DQF-005
- **Draft question:** In which year did the event known as the "Schanzenfest" take place according to the dossier?
- **Correct answer:** 2018
- **Distractors:** 2016; 2019; 2022
- **Category:** Timeline & Milestones
- **Tags:** timeline, schanzenfest, offline, escalation, 2018, safe-core
- **Difficulty:** medium
- **Dossier anchors:** T-006, EK-003, BG-005
- **Seed status:** DRAFT

### DQS-006
- **Based on:** DQF-006
- **Draft question:** Which authority prohibited the livestream "Drache_Offiziell" in March 2019 because it lacked a broadcasting licence?
- **Correct answer:** Bayerische Landeszentrale für neue Medien (BLM)
- **Distractors:** Bayerischer Rundfunk; Bundesnetzagentur; Landesmedienanstalt NRW
- **Category:** Legal & Regulation
- **Tags:** legal, blm, regulation, livestream, 2019, safe-core
- **Difficulty:** medium
- **Dossier anchors:** T-008, EK-004, SRC-P1-001
- **Seed status:** DRAFT

### DQS-007
- **Based on:** DQF-009
- **Draft question:** In which year was the house known as the "Drachenschanze" demolished?
- **Correct answer:** 2022
- **Distractors:** 2018; 2021; 2024
- **Category:** Place & Infrastructure
- **Tags:** place, drachenschanze, demolition, altschauerberg, 2022, safe-core
- **Difficulty:** medium
- **Dossier anchors:** T-011, EK-008, CF-006
- **Seed status:** DRAFT

### DQS-008
- **Based on:** DQF-010
- **Draft question:** On which platform were the key Drachenlord channels removed on 11 August 2022?
- **Correct answer:** YouTube
- **Distractors:** Twitch; TikTok; Facebook
- **Category:** Place & Infrastructure
- **Tags:** platform, youtube, deletion, archives, 2022, safe-core
- **Difficulty:** medium
- **Dossier anchors:** T-012, EK-009, INF-003
- **Seed status:** DRAFT

### DQS-009
- **Based on:** DQF-011
- **Draft question:** What is the title of the major 2022 podcast reconstruction highlighted in the dossier?
- **Correct answer:** Cui Bono: Wer hat Angst vorm Drachenlord?
- **Distractors:** Baywatch Berlin; Fest & Flauschig; Lage der Nation
- **Category:** Media & Documentation
- **Tags:** media, podcast, cui-bono, reconstruction, 2022, safe-core
- **Difficulty:** medium
- **Dossier anchors:** T-014, EK-010, SRC-P2-012
- **Seed status:** DRAFT

### DQS-010
- **Based on:** DQF-012
- **Draft question:** What is the term for abusing emergency calls in order to trigger a real police or emergency response?
- **Correct answer:** Swatting
- **Distractors:** Doxing; Brigading; Shadow banning
- **Category:** Scene Terms & Dynamics
- **Tags:** terms, swatting, escalation, legal, safe-core
- **Difficulty:** medium
- **Dossier anchors:** T-004, EK-001, AK-001
- **Seed status:** DRAFT

### DQS-011
- **Based on:** DQF-013
- **Draft question:** Which place name is most strongly associated with the physical setting of the case in the dossier?
- **Correct answer:** Altschauerberg
- **Distractors:** Bayreuth; Passau; Emsdetten
- **Category:** Identity & Basics
- **Tags:** place, altschauerberg, basics, setting, safe-core
- **Difficulty:** easy
- **Dossier anchors:** BG-004, EK-003, EK-008
- **Seed status:** DRAFT

### DQS-012
- **Based on:** DQF-014
- **Draft question:** What does the term "Drachenschanze" refer to in the dossier?
- **Correct answer:** The house/location in Altschauerberg associated with Drachenlord
- **Distractors:** A documentary title; a forum archive; a police operation codename
- **Category:** Scene Terms & Dynamics
- **Tags:** terms, drachenschanze, place, scene-language, safe-core
- **Difficulty:** easy to medium
- **Dossier anchors:** BG-004, EK-008
- **Seed status:** DRAFT

## Held back for a later pass

These facts are useful, but are better suited to a second review wave before drafting routine seed entries:
- `DQF-007` — first-instance sentence details
- `DQF-008` — appeal/probation details
- `DQF-015` — Maskengame comparative context
- all `DQF-C*` entries — caution set only

## Minimum promotion checklist before runtime seeding

Before moving any entry from this file into the real runtime seed YAML, confirm:
1. the answer is unambiguous
2. the distractors do not accidentally become partly true
3. the fact is backed by at least one strong dossier anchor and preferably one stronger public source
4. the player-facing wording is clear outside scene jargon
5. the category and tags still fit the balancing rules in `drachenlord-topic-map.md`



