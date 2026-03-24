---
applyTo: "**/games/quiz/Millionaire*"
---
# Wer wird Millionär — Show Reference & UI Rules

## Show Format Summary

"Wer wird Millionär?" (WWM) is the German adaptation of "Who Wants to Be a Millionaire?", hosted by Günther Jauch since 1999 on RTL.

### Core Gameplay
- **15 questions** with escalating difficulty and rising prize money.
- One player sits in the "hot seat" opposite the host.
- Each question shows **4 answer options** labeled **A, B, C, D**.
- The player **selects** ("locks in") an answer; there is a **dramatic pause** before the result is revealed.
- **Wrong answer** → game over, player falls back to the last safety net.
- **All 15 correct** → player wins the top prize (€1,000,000).

### Prize Ladder (German version)
| Level | Prize     | Note                     |
|-------|-----------|--------------------------|
| 1     | €50       |                          |
| 2     | €100      |                          |
| 3     | €200      |                          |
| 4     | €300      |                          |
| 5     | **€500**  | **Safety net 1**         |
| 6     | €1.000    |                          |
| 7     | €2.000    |                          |
| 8     | €4.000    |                          |
| 9     | €8.000    |                          |
| 10    | **€16.000** | **Safety net 2**       |
| 11    | €32.000   |                          |
| 12    | €64.000   |                          |
| 13    | €125.000  |                          |
| 14    | €500.000  |                          |
| 15    | €1.000.000|                          |

### Three Lifelines (Joker)
1. **50:50** — Two wrong answers are removed.
2. **Publikumsjoker (Audience Poll)** — Studio audience votes; results shown as bar chart.
3. **Telefonjoker (Phone a Friend)** — 30 seconds to ask one person.

### Visual Identity
- **Background:** deep navy/dark blue gradient, sometimes with subtle radial spotlight.
- **Answer buttons:** elongated **hexagonal / diamond shape** (pointed left and right ends), arranged in a 2×2 grid.
- **Answer label** (A/B/C/D) is on the left inside each diamond.
- **Color states:**
  - *Default:* dark blue fill with lighter blue border.
  - *Selected / locked in:* **orange-gold** (#F5A623 / #E8960C). This is the signature WWM "lock-in" color.
  - *Correct reveal:* **green** (#00C853 / #2E7D32).
  - *Wrong reveal:* **red** (#D50000 / #C62828), while the correct answer simultaneously flashes **green**.
- **Prize ladder:** vertical strip, current level highlighted in orange-gold; cleared levels dimmed; safety levels marked distinctly.
- **Question card:** centered dark blue panel with white text, diamond-shaped or rounded-rectangle outline.

### Sound Design (key moments)
| Moment                          | Sound cue                                  |
|---------------------------------|--------------------------------------------|
| Game start                      | "Let's Play" jingle                        |
| Question appears (levels 1-5)   | Light tension loop                         |
| Question appears (levels 6-10)  | Medium tension loop                        |
| Question appears (levels 11-14) | High tension loop                          |
| Million question                | Dramatic special music                     |
| Answer locked in                | Short lock-in sting                        |
| Correct answer revealed         | Triumphant correct sting + applause        |
| Wrong answer revealed           | Dramatic wrong-answer sting                |
| 50:50 activated                 | Short effect sound                         |

### Dramatic Pacing
- After lock-in there is a **1-3 second suspense pause** before the result is shown.
- On higher levels, the host often stretches the pause with commentary.
- Background music swells during the pause.

## UI Implementation Rules for PlayBox

- Use the **diamond/hexagonal button shape** via CSS `clip-path` for answer buttons.
- Default answer fill: dark blue gradient matching the background.
- **Selected state must be orange-gold**, not a generic highlight.
- After reveal: correct = green, wrong = red (correct also shown green simultaneously).
- Add a brief **reveal delay** (1.5-2s) after selecting an answer before showing the result, to mimic the show's suspense.
- Prize ladder should use orange-gold for the current level.
- Sound effects must be triggered at the correct moments; gracefully handle autoplay restrictions.
- Keep the layout mobile-first with touch-friendly tap targets (min 48px height).

