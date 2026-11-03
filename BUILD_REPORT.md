# Build report — Dungeon Crawler Carl character sheet v2 (clean rebuild)

Date: 2026-11-02. Status: built and tested locally. **Not pushed to
GitHub and no GitHub repo created** — that step is blocked and will be
handled separately by the parent agent.

## What was built

A fresh, modular sheet in `~/workspace/new-crawler-sheet/`, written from
scratch in vanilla HTML/CSS/JS (no build step, no framework, no backend,
no paid services, GitHub Pages-ready). It is **not** a copy of the old
`~/workspace/crawler-rpg/index.html` (500 KB single file): that file was
read only to extract calculation formulas, which were re-implemented in
`js/rules.js` in a cleaner form (see "Rank model" below).

```
index.html            shell only: layout, tabs, modals, script tags
css/style.css         dark dungeon theme, centred modals, responsive
js/rules.js           pure calculations + rulebook-text parsers (no DOM)
js/app.js             state, rendering, save/load, tabs, cards, pickers
js/wizard.js          guided creation wizard
data/skills_spells.json   168 entries (33 attack, 81 utility, 54 spells)
data/items.json           81 entries (40 gear, 28 consumable, 6 mundane, 2 maps, 5 other)
data/races_classes.json   82 entries (30 races, 52 classes)
data/spell_keywords.json  keywords for all 54 spells
tests/test_rules.js   node unit tests for rules.js
README.md, .nojekyll
```

Data was copied, not invented, from `~/workspace/crawler-rpg/extracts/`.
`spell_keywords.json` was built from `keywords_extracted.json`'s spell
map (54/54 spells matched the skills_spells spell list exactly; the
older 6-spell-only `spell_keywords.json` was superseded, not used).

## Features implemented

- Tabs: Vitals, Attacks, Gear, Skills, Spells, Inventory, Choices
  (conditional), All. Sidebar profile with avatar upload, race/class
  pickers, and `?` popups for full rulebook text (never shown all at
  once). Header counters: Level, Floor, Stat Bank, Gold, Popularity,
  AI Favor, Move, Step, Boss Kills, Player Kills.
- Creation gateway (Guided wizard / Blank sheet / Import) and a
  6-step guided wizard: Name, Stats (standard array 2–6 with
  exactly-once validation, dice roll with 1s re-rolled, or manual),
  Race/Class, Starting skills, Starting gear, Review checklist. The
  wizard edits the live sheet, and Skip/Exit are always available — it
  never traps the user and never runs automatically.
- Stats, stat bank, health bar, mana, evade, DR, and all group/race/
  class effects listed in the README (fixed stats/penalties, splits,
  fixed named bonuses capped at Rank 10 at selection, choice grants,
  race/class DR, Tigran Move +10, Evade 1d4, Obsidian Butterfly CHA
  Health Bar, stat caps, damage-stat swaps, Mage −3 effective ranks,
  group bonuses as Rank adjustments including Lifebringer Heal via
  spell keywords).
- Inventory items with up to 5 structured bonuses (Stat, Skill grant,
  DR, Evade) applying only while equipped; gear slots; custom items,
  skills, spells, races/classes (as free text) fully supported.
- Attacks including auto-added UNARMED COMBAT (re-added on next load
  if deleted, by design).
- Vitals: buffs/debuffs, hotlist (max 10), trackers, Distribute dialog.
- Save: localStorage `dcc-sheet-v2`, debounced autosave, inputs commit
  on change (not per keystroke), only the active tab panel re-renders.
  Export/Import JSON, wrapped `{format:'dcc-sheet-v2', version:1,
  character}` (raw character objects also accepted). Clear Sheet
  confirms, then returns to the gateway.
- Performance: data JSON files lazy-load on first need; rendering is
  per active tab; no per-keystroke rebuilds.

## Rank model (cleaner than the old sheet, same specified behaviour)

Displayed Rank = trained rank + gear grants + race/class fixed +
group. Given amounts are **recomputed from live records on every
render** instead of being added/subtracted as deltas, so removing a
source cannot double-count or leave a stale bonus. The combined floor
is the sum of given amounts; manual lowering snaps to it; on removal,
rank = trained total minus given, and a card is removed only if that
hits 0. A card granted by a source cannot be manually deleted while
that source is present (the delete button explains this); removing the
source (or unequipping the item) removes the card.

One deliberate parser improvement over the old sheet: the fixed-skill
parser now skips any "+N …" segment mentioning a choice, so choice
grants (e.g. "+2 in a Spell of your choice", "+2 to two chosen skills
from …") can never leak into fixed bonuses as library cards — they
live in the Choices tab instead.

## Formulas used

- Modifier: 1–2 → +1, 3–5 → +2, 6–9 → +3, 10–19 → +4, 20–49 → +5,
  50–99 → +6, 100–149 → +7, 150–199 → +8, 200–299 → +9, 300+ → +10
  (bands past 49 ported from the old sheet; the brief lists to 49).
- Derived Base = own base + positive fixed bonuses + split assignments;
  penalties subtract from Total; Total minimum 1; Hobgoblin CHA and
  Pocket Kuma STR capped at 10 on Total.
- Stat Bank = (Level − 1) × 3 − spent. Level cap 250.
- Total HP = 10 slots × Health Bar modifier (CON mod, CHA mod for
  Obsidian Butterfly). Mana max = INT Total; current mana rises by the
  INT Total delta when it increases (old-sheet behaviour — **not**
  CrawlerCo's HP 20 / Mana 5 formulas).
- Evade = d20 + (1d4 for Elf, High / Obsidian Butterfly) + DEX Mod +
  Buffs + Gear. DR = Armor (own + gear DR) + Buffs + Race/Class DR.
- Rank damage dice (Table 37): 1 = +1, 2–3 = 1d2, 4–5 = 1d4,
  6–7 = 1d6, 8–9 = 1d8, 10–11 = 1d10, 12–13 = 1d12,
  14–15 = 1d8+1d6, 16–17 = 2d8, 18–19 = 1d10+1d8, 20 = 2d10.
- Nature's Breath heal = rank die + cumulative upgrade bonus (+1 at
  Rank 5, +2 at 10, +3 at 15; flagged as correctable if the book means
  +1 total).

## Tests run (all passed)

- `node --check` on `js/rules.js`, `js/app.js`, `js/wizard.js` — all OK.
- `node tests/test_rules.js` — **58 passed, 0 failed**, covering
  modifier bands, rank damage dice, Nature's Breath heal, stat-bank
  math (including the book's Level 10 → 27 example), derived base /
  penalty / cap behaviour, the rank-floor and removal model, group
  bonuses (Lifebringer Heal via keywords, Shotgun Messenger), Mage
  penalty, Human/Elf City/Roadie parsers, the Lifebringer fixed parse
  (no bogus "Rank in all" / stat cards), choice-grant parsing, Tigran
  Move, damage-stat swaps, DR, evade, and HP.
- Data validation: skills_spells 168 (33/81/54), items 81
  (40/28/6/2/5), races_classes 82 (30 races/52 classes), spell
  keywords 54/54 spells, all JSON parse cleanly.
- Handler audit: every inline `DCC.*` handler referenced by rendered
  cards exists on `window.DCC`; every static HTML id is wired (directly
  or via the `click()`/`onChange()` helpers); tab panels are switched
  by class + `panel-<tab>` construction. No missing handlers found.
- Static-server smoke test: `python3 -m http.server` returned HTTP 200
  for index, all three JS files, CSS, and the skills data file.

## Deliberately not in v1 (see README for the full list)

- No Supabase/cloud sync, DM tools, campaigns, parties, loot boxes, or
  achievements. Single-player local sheet by design; those can be added
  later.
- No book lock on check type (stat is locked to the book stat where
  the book gives one; check type stays editable — the old sheet's
  check derivation covered only 114/168 entries).
- Text-only benefits (Advantage/Disadvantage, darkvision, clubs,
  triggers, Bune Level 50, Lajabless day/night, Rage, mana-regen
  multipliers, conditional damage) are shown as book text behind `?`,
  not auto-applied.
- Fixed skill bonuses cover Chapter 4 library entries only.
- No live-browser end-to-end test was run (subagents cannot operate
  the live browser): the sheet is syntax-checked, unit-tested, and
  server-smoke-tested, but a click-through in a real browser — wizard
  flow, picker, race/class application, equip/unequip — is still
  outstanding and should be done before calling v1 done.
- Directly editing the Base field is a house-rule shortcut: it does
  not change the stat-bank counter, which tracks Distribute-dialog
  spends only (documented in the README).

## Update — backgrounds wizard + live-test fixes (2026-11-02)
- Guided wizard now follows the book's Step 1/2: pick one background each for childhood, adolescence, career, and hobby (Tables 12–15, 48 backgrounds), two of its three skills each at Rank 1/1/3/2, no double-dipping, plus Unarmed Combat Rank 3 and a weapon skill or attack spell at Rank 3 (or unarmed only). Background skills are tracked separately so re-picking in the wizard does not stack ranks or delete a skill you trained past its background rank.
- Wizard now refreshes after race/class/skill/item picks, so Step 3 no longer shows stale Race/Class.
- Rulebook items now auto-create structured bonuses on pick from clear numeric text only (+N DR, +N Evade, +N stat, +N library skill/spell) — capped at 5, editable/deletable like manual bonuses. Text-only effects stay text.
- Item slots are normalised (Hand/Holding → Hands) and a slot outside the list is shown as-is instead of silently displaying as Head.
- Export now shows a confirmation toast with the filename.
- Two background-table parentheticals disagreed with the Chapter 4 entries (Gig Worker Escape Artist, Teacher Performance); the Chapter 4 stat was used, since a skill's associated stat is fixed per entry.

## Update — rest + dice roller (2026-11-02)
- Pure functions in js/rules.js: applyRest, rollDie, parseDiceFormula, rollFormula (unit-tested, 83 tests passing, was 70).
- UI in Vitals (Rest + Dice Tray) and Roll buttons on skill/spell/attack cards. Subresources bumped to ?v=4.

## Update — derived attacks (2026-11-02)
- renderAttacks derives attack skills/spells from cards (rules.js skillAttackType/isAttackSpell, unit-tested, 89 tests passing); the 7 hand-to-hand Damage Effects are Passive, not Melee/Ranged Attack, so they are excluded. The library is fetched on first visit to the Attacks tab so a reloaded sheet does not show an empty derived list. Subresources bumped to ?v=5.
