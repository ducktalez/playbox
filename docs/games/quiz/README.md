# Quiz Research

This directory stores non-runtime research material for the Quiz game.

## Purpose

Use these files as working material for:
- future question writing
- fact verification
- topic clustering
- source tracking
- difficulty balancing across quiz categories

## Structure

- `research/` — source dossiers, notes, and topic-specific research collections
- `draft-seeds/` — machine-readable YAML draft seed files kept outside the default runtime seed path
- `drachenlord-fact-pool.md` — normalized fact candidates derived from the raw dossier
- `drachenlord-topic-map.md` — category, tag, and balancing guidance for future question writing
- `drachenlord-seed-candidates.md` — draft quiz questions derived from the safe-core fact pool
- `drachenlord-source-checklist.md` — re-verification checklist before moving draft questions into seed data

## Language policy

The repository documentation convention is English, but source material may be preserved in its original language when that is important for accuracy or archival value.

When that happens:
- keep the navigation/index files in English
- encode the source language in the filename, for example `.de.md`
- treat the original-language file as raw research material, not as a final gameplay text

## Current research files

- `research/drachenlord-dossier.de.md` — user-provided German source dossier for Drachenlord-related quiz research
- `draft-seeds/drachenlord-seed-draft.yaml` — loader-compatible draft seed batch for review and later optional import
- `drachenlord-fact-pool.md` — English working sheet for safe-core and cautionary fact candidates
- `drachenlord-topic-map.md` — English topic/category map for future seed planning
- `drachenlord-seed-candidates.md` — first conservative batch of draft seed questions
- `drachenlord-source-checklist.md` — approval checklist for question promotion into runtime seed format

## Recommended workflow

1. Start with the raw dossier in `research/`.
2. Move reusable facts into `drachenlord-fact-pool.md`.
3. Use `drachenlord-topic-map.md` to choose categories and tags.
4. Draft human-reviewed question candidates in `drachenlord-seed-candidates.md`.
5. Clear them through `drachenlord-source-checklist.md`.
6. Stage loader-compatible YAML drafts in `draft-seeds/`.
7. Only then turn selected facts into actual runtime seed data.





