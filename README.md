# Dungeon Crawler Carl — Character Sheet (v2, clean rebuild)

A fresh, modular, interactive character sheet for the Dungeon Crawler Carl
RPG. Vanilla HTML/CSS/JS only: no build step, no framework, no backend,
no paid services. Drop the folder on any static host (GitHub Pages works
as-is; `.nojekyll` is included) or serve it locally.

## Run locally

```sh
cd new-crawler-sheet
python3 -m http.server 8000
# open http://localhost:8000/
```

A plain `file://` open works for the shell, but the data JSON files are
fetched, so a static server (above) is required for pickers and race/class
benefits to load. No data leaves the browser: the sheet saves to
localStorage only.

## Layout

- **Sidebar:** avatar, name, number, level, floor, race/class pickers with
  a `?` popup for full rulebook text (full text is never shown all the
  time), and a Start screen button.
- **Header counters:** Level, Floor, Stat Bank, Gold, Popularity, AI
  Favor, Move, Step, Boss Kills, Player Kills.
- **Tabs:** Vitals (stats, health bar, mana, evade, DR, buffs/debuffs,
  trackers, stat-bank Distribute, hotlist), Attacks, Gear, Skills, Spells,
  Inventory, Choices (only while the current race/class offers a choice,
  each choice labelled with its source), All (summary).

## Features

- **Data, copied not invented:** 168 skills/spells, 81 items, 82
  races/classes (30 races, 52 classes), and keywords for all 54 spells,
  in `data/`. Pickers search by name, effect, or benefits text.
- **Creation gateway:** Guided wizard / Blank sheet / Import. The wizard
  steps are Name, Stats, Race/Class, Starting skills, Starting gear,
  Review. It edits the live sheet, is skippable at any point (Skip gives a
  blank sheet, Exit keeps what you have), and never runs automatically.
- **Stats:** STR/CON/DEX/INT/CHA. Derived Base = own base + positive
  race/class fixed bonuses + split assignments. Penalties subtract from
  Total, not Base. Total minimum 1. Caps on Total: Hobgoblin CHA 10,
  Pocket Kuma STR 10.
- **Stat bank:** (Level − 1) × 3 points minus points spent in the
  Distribute dialog. Level cap 250. Directly editing the Base field is a
  house-rule shortcut: it does not change the bank counter, which tracks
  Distribute-dialog spends only.
- **Health bar:** 10 slots, full HP and mana on a new crawler. Total HP =
  10 × Health Bar modifier (CON mod, or CHA mod for Obsidian Butterfly).
  Mana maximum = INT Total; when INT Total rises, current mana rises by
  the same amount (old-sheet behaviour). Segments are coloured by HP
  percentage (75–100% green, 50–74% yellow, 25–49% orange, 0–24% red).
- **Evade:** `d20 + [1d4 Race/Class] + DEX Mod + Buffs + Gear`. The 1d4
  applies for Elf, High and Obsidian Butterfly only.
- **Damage Resistance:** Armor (own + gear DR) + Buffs + Race/Class DR.
  Gear DR is already inside Armor and is not added twice.
- **Skills/spells:** Rank 1–20, upgrades shown at Ranks 5/10/15.
  Rank damage dice (book Table 37): 1 = +1, 2–3 = 1d2, 4–5 = 1d4,
  6–7 = 1d6, 8–9 = 1d8, 10–11 = 1d10, 12–13 = 1d12, 14–15 = 1d8+1d6,
  16–17 = 2d8, 18–19 = 1d10+1d8, 20 = 2d10.
  Nature's Breath heal = rank die + cumulative upgrade bonus (+1 at
  Rank 5, +2 at Rank 10, +3 at Rank 15 — flagged as correctable if the
  book means +1 total).
- **Race/class benefits (auto-applied):** fixed stat bonuses/penalties,
  split pools (Elf, City +6 INT/DEX/CHA, reassignable; Professional
  Roadie +8 STR/CON/CHA), fixed named skill/spell bonuses (cap Rank 10
  at selection, library entries only), choice grants via the Choices tab,
  race/class DR, Tigran Move +10, Evade 1d4 (above), Obsidian Butterfly
  CHA Health Bar, stat caps (above), Cat Girl Slice damage uses CHA,
  Rat Hooligan Bite damage uses DEX (to-hit unchanged), Boring Ol' Mage
  −3 effective ranks in DEX/STR skills (Rank field unchanged, minimum
  effective Rank 1), and group bonuses as Rank adjustments (Tetrakai +1
  Edged, Skyfowl +2 CHA-stat cards, Hobgoblin +3 Trap/Explosive,
  Bomb Squad Tech +2 Explosive, Shotgun Messenger +1 muscle-powered
  movement, Monk +1 DEX weapon, Elemental Monk +1 Electric/Fire/Ice
  damage/effect spells, Lifebringer +1 Heal-keyword spells).
- **Rank floor model:** displayed Rank = trained rank + gear grants +
  race/class fixed + group. The combined floor is the sum of given
  amounts; manual lowering cannot go below it. On removal of a source,
  rank = trained total minus given, and a card is removed only if that
  hits 0 or less. A card granted by a source cannot be manually deleted
  while that source is present — remove the source (or unequip the item)
  instead.
- **Inventory:** up to 5 structured bonuses per item (Stat, Skill grant,
  Damage Resistance, Evade), applying **only while equipped** in Gear.
  Custom items work fully alongside rulebook items. Gear slots are
  organisational; any equipped item applies.
- **Attacks:** including auto-added UNARMED COMBAT (STR, 1d4 + Str
  Bludgeoning, +1d4 at Rank 5, +1d4 at Rank 10, +2d4 at Rank 15). Deleting
  it re-adds it on the next load, by design.
- **Save:** localStorage key `dcc-sheet-v2`, debounced autosave (inputs
  commit on change, not on every keystroke; only the active tab panel is
  re-rendered). Export/Import JSON, wrapped format
  `{format:'dcc-sheet-v2', version:1, character}` (raw character objects
  are also accepted on import). Clear Sheet asks for confirmation first,
  then returns to the gateway.

## Formulas, in one place

| Quantity | Formula |
|---|---|
| Modifier | 1–2 → +1, 3–5 → +2, 6–9 → +3, 10–19 → +4, 20–49 → +5, 50–99 → +6, 100–149 → +7, 150–199 → +8, 200–299 → +9, 300+ → +10 |
| Derived Base | own base + positive fixed bonuses + split assignments |
| Stat Total | max(1, Derived Base + Enhance + Gear + penalty), then cap |
| Stat Bank | (Level − 1) × 3 − spent |
| Total HP | 10 slots × Health Bar modifier |
| Mana max | INT Total |
| Evade | d20 + (1d4 if Elf, High / Obsidian Butterfly) + DEX Mod + Buffs + Gear |
| DR | Armor (own + gear DR) + Buffs + Race/Class DR |

## Performance

Data JSON files load lazily (first picker / race-class application /
spell render that needs them), rendering rebuilds only the active tab
panel plus sidebar/counters, and event handling for dynamic cards uses
inline handlers on the card itself rather than global listeners that
rebuild on every keystroke.

## Deliberately not in v1

- **No cloud sync, DM tools, campaigns, parties, loot boxes, or
  achievements.** Those existed in the old sheet and can be added later;
  v1 is a single-player local sheet by design.
- **No book lock on check type.** A card whose name matches a Chapter 4
  entry shows its book stat, damage, and upgrades in its Rulebook box,
  and its stat select is locked to the book stat where the book gives
  one; its check type stays editable (the old sheet's check derivation
  covered only 114/168 entries and guessing the rest was rejected).
- **No auto-effects for text-only benefits.** Advantage/Disadvantage,
  darkvision, clubs, triggers (gold/popularity/AI Favor per kill or per
  level), Bune's Level 50 +2 Dexterity, Lajabless day/night effects,
  Rage damage per lost slot, mana-regen multipliers, and conditional
  damage are shown as book text behind `?`, not auto-applied — exactly
  as in the old sheet's design.
- **Fixed skill bonuses cover Chapter 4 library entries only.** A
  race/class grant naming a weapon skill that is not a Chapter 4 entry
  is shown as book text, not turned into a card.
- **Book text is reference, not a reproduction claim.** The extracts in
  `data/` are the project's own condensed rulebook data; where a rule
  is uncertain it is shown as text, not as an auto-effect.

## Update — backgrounds wizard + live-test fixes (2026-11-02)
- Guided wizard now follows the book's Step 1/2: pick one background each for childhood, adolescence, career, and hobby (Tables 12–15, 48 backgrounds), two of its three skills each at Rank 1/1/3/2, no double-dipping, plus Unarmed Combat Rank 3 and a weapon skill or attack spell at Rank 3 (or unarmed only). Background skills are tracked separately so re-picking in the wizard does not stack ranks or delete a skill you trained past its background rank.
- Wizard now refreshes after race/class/skill/item picks, so Step 3 no longer shows stale Race/Class.
- Rulebook items now auto-create structured bonuses on pick from clear numeric text only (+N DR, +N Evade, +N stat, +N library skill/spell) — capped at 5, editable/deletable like manual bonuses. Text-only effects stay text.
- Item slots are normalised (Hand/Holding → Hands) and a slot outside the list is shown as-is instead of silently displaying as Head.
- Export now shows a confirmation toast with the filename.
- Two background-table parentheticals disagreed with the Chapter 4 entries (Gig Worker Escape Artist, Teacher Performance); the Chapter 4 stat was used, since a skill's associated stat is fixed per entry.

## Update — rest + dice roller (2026-11-02)
- Vitals now has Rest buttons: Short Rest (2h: +5 health slots, +half max mana rounded down, plain Minor Injuries end), Long Rest (8h: full health/mana, Fatigued and Minor Injuries end, long-term Major Injuries stay), Full Day's Rest (30h: full health/mana, all injuries end), Mend (1h: +1 slot, +5 mana). A rest never changes Buffs or Used flags. Injuries are recognised by debuff wording ("Fatigued", "Minor Injury", "Major Injury", "long-term").
- Vitals now has a Dice Tray: quick d4/d6/d8/d10/d12/d20/d100 buttons, a formula roller (e.g. 2d6+3, up to 20 dice), a Roll Evade button (d20 + race/class 1d4s + DEX + buffs + gear), and Copy result. Skill/spell cards have a Roll d20 button (d20 + stat mod) and attacks have Roll to hit. Results show in the Dice Tray, including when rolled from another tab.

## Update — derived attacks (2026-11-02)
- Attacks tab now lists, below your own attacks, every ranked skill whose Chapter 4 Type line says Melee Attack or Ranged Attack (26 skills) and every ranked spell whose keywords include "Attack" (26 spells), with rank, to-hit stat/mod, damage, mana cost where present, and a Roll to hit button. They are derived, not editable here — change rank/stat on the Skills/Spells tab. A name already present as one of your own attacks (including UNARMED COMBAT) is shown once, as your own attack. Custom skills/spells never appear on their own; add them as your own attacks.

## Update — Fireball keyword fix + Damage Effects under their attack (2026-11-02)
- Fixed a case bug: spell keyword keys are stored UPPERCASE but were looked up lowercased, so no spell keyword ever matched — Fireball did not appear as a derived attack, spell Keyword lines were empty, and the Lifebringer Heal bonus could not fire. Keywords are now normalised on load.
- Damage Effects are now shown under the attack they modify in the Attacks tab (e.g. Smush under Foot Soldier, with its full book condition: only targets at 20% Health Bar or less, once per round, x2 total damage, with rank upgrades shown on its Skills card). They are still never listed as attacks themselves.

## Update — roll toast + Damage Effects linked both ways (2026-11-02)
- Roll buttons no longer look dead: every roll now also pops a dismissible toast on whatever tab you are on (the Dice Tray on Vitals still keeps the same result). Previously the result only went to the Vitals tray, which is hidden on the Skills/Spells/Attacks tabs.
- All 7 Damage Effects are linked both ways: an attack skill's card lists the Damage Effects ranked for it, a Damage Effect's card names the attacks it applies to, and the Attacks tab lists ranked Damage Effects under their parent attack. Parsed from the book's "X Damage Effect, Passive" text for all 7, unit-tested.
