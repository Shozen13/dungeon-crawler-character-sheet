/* Node test for js/rules.js (pure functions only — no DOM, no app state).
 * Run: node tests/test_rules.js
 */
const R = require('../js/rules.js');
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log('PASS', label); }
  else { fail++; console.log('FAIL', label, '| got', JSON.stringify(actual), '| want', JSON.stringify(expected)); }
}

// Modifier bands
[[1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [9, 3], [10, 4], [19, 4], [20, 5], [49, 5]].forEach(([v, want]) => eq(R.getModifier(v), want, 'modifier ' + v));
// Rank damage dice, Table 37
[[1, '+1'], [2, '1d2'], [3, '1d2'], [4, '1d4'], [5, '1d4'], [6, '1d6'], [8, '1d8'], [10, '1d10'], [12, '1d12'], [14, '1d8 + 1d6'], [16, '2d8'], [18, '1d10 + 1d8'], [20, '2d10']].forEach(([v, want]) => eq(R.rankDamageDie(v), want, 'rank die ' + v));
// Nature's Breath heal (cumulative upgrade bonus)
eq(R.naturesBreathHealFormula(3), '1d2 slots', 'NB rank 3');
eq(R.naturesBreathHealFormula(5), '1d4 + 1 slots', 'NB rank 5');
eq(R.naturesBreathHealFormula(10), '1d10 + 2 slots', 'NB rank 10');
eq(R.naturesBreathHealFormula(15), '1d8 + 1d6 + 3 slots', 'NB rank 15');
// Stat bank
eq(R.statBank(1, 0), 0, 'bank level 1');
eq(R.statBank(10, 0), 27, 'bank level 10 (book example)');
eq(R.statBank(4, 5), 4, 'bank level 4 spent 5');
// Derived base / total: penalties from Total, not Base; minimum Total 1
eq(R.derivedBase({ str: 5, con: 5, dex: 5, int: 5, cha: 5 }, { str: 0, con: -4, dex: 3, int: 0, cha: 0 }, { str: 0, con: 0, dex: 0, int: 0, cha: 0 }),
  { str: 5, con: 5, dex: 8, int: 5, cha: 5 }, 'derived base ignores penalties');
eq(R.statTotal(5, 0, 0, -4, null), 1, 'total minimum 1 with -4 penalty on base 5? (5-4=1)');
eq(R.statTotal(10, 0, 0, 0, 10), 10, 'cap applied');
eq(R.statCapFor('Hobgoblin', '', 'cha'), 10, 'Hobgoblin CHA cap');
eq(R.statCapFor('Pocket Kuma', '', 'str'), 10, 'Pocket Kuma STR cap');
eq(R.statCapFor('Human', '', 'cha'), null, 'no cap for Human');
// Rank floor / removal model: rank = own + gear + race + group
const card = { ownRank: 1 };
eq(R.displayRank(card, 0, 2, 1), 4, 'display rank 1 trained + 2 fixed + 1 group = 4');
eq(R.combinedFloor(0, 2, 1), 3, 'combined floor = sum of given');
eq(R.ownRankForTotal(2, 0, 2, 1), 0, 'manual lowering below floor snaps to floor (own 0)');
eq(R.ownRankForTotal(5, 0, 2, 1), 2, 'manual rank 5 with given 3 -> own 2');
eq(R.shouldRemoveCard({ ownRank: 0 }, 0, 0, 0), true, 'bonus-only card removed when all given amounts go');
eq(R.shouldRemoveCard({ ownRank: 1 }, 0, 0, 0), false, 'trained card survives removal of all given amounts');
// Group bonuses
const healCard = { name: "NATURE'S BREATH", kind: 'spell', stat: '' };
eq(R.groupBonusFor(healCard, 'Lifebringer', '', null, ['Heal', 'Interrupt', 'Passive']), 1, 'Lifebringer Heal via keywords');
eq(R.groupBonusFor({ name: 'Running', kind: 'skill', stat: 'str' }, 'Shotgun Messenger', '', null, []), 1, 'Shotgun Messenger muscle movement');
eq(R.groupBonusFor({ name: 'Running', kind: 'skill', stat: 'str' }, 'Human', '', null, []), 0, 'no group bonus for Human');
eq(R.magePenalty({ name: 'Dagger', kind: 'skill', stat: 'dex' }, '', 'Boring Ol\u2019 Mage'), 3, 'Mage -3 DEX skill');
eq(R.effectiveRank(4, { name: 'Dagger', kind: 'skill', stat: 'dex' }, '', 'Boring Ol\u2019 Mage'), 1, 'Mage effective rank min 1');
// Parsers
eq(R.parseRaceClassStats({ name: 'Human', benefits: '' }), { str: 2, con: 2, dex: 2, int: 2, cha: 2 }, 'Human +2 all');
eq(R.parseRaceClassSplit({ name: 'Elf, City', benefits: '+6 split as you please between Intelligence, Dexterity, and Charisma' }),
  [{ pool: 6, stats: ['int', 'dex', 'cha'] }], 'Elf City split');
eq(R.parseRaceClassSplit({ name: 'Professional Roadie', benefits: 'Gains +8 split between Strength, Constitution, and Charisma' }),
  [{ pool: 8, stats: ['str', 'con', 'cha'] }], 'Roadie split');
const lib = (n) => {
  const map = { 'first aid': { name: 'First Aid', kind: 'utility' }, 'pathfinder': { name: 'Pathfinder', kind: 'utility' }, 'regeneration': { name: 'Regeneration', kind: 'utility' }, 'survival': { name: 'Survival', kind: 'utility' }, "nature's breath": { name: "NATURE'S BREATH", kind: 'spell' } };
  return map[n.toLowerCase()] || null;
};
eq(R.parseFixedSkillBonuses({ name: 'Lifebringer', benefits: 'Gains +2 Constitution and +1 Intelligence, +2 First Aid, Pathfinder, Regeneration, and Survival, +2 Nature\'s Breath Spell, and +1 Rank in all Spells with the Heal keyword.' }, lib),
  [{ name: 'First Aid', kind: 'utility', amount: 2 }, { name: 'Pathfinder', kind: 'utility', amount: 2 }, { name: 'Regeneration', kind: 'utility', amount: 2 }, { name: 'Survival', kind: 'utility', amount: 2 }, { name: "NATURE'S BREATH", kind: 'spell', amount: 2 }],
  'Lifebringer fixed parse (no bogus Rank-in-all / stat cards)');
eq(R.parseChoiceGrants({ name: 'Obsidian Butterfly', benefits: '+2 in a Spell of your choice.' }),
  [{ amount: 2, count: 1, category: 'spell', label: 'Spell', options: null }], 'choice grant: spell of choice');
eq(R.tigranMoveBonus('Tigran', ''), 10, 'Tigran Move +10');
eq(R.attackDamageStat('Slice Attack', 'Cat Girl/Cat Boy', ''), 'cha', 'Cat Girl Slice CHA damage');
eq(R.attackDamageStat('Bite', 'Rat Hooligan', ''), 'dex', 'Rat Hooligan Bite DEX damage');
eq(R.totalDR(5, 2, 1), 8, 'DR = Armor + Buffs + Race/Class');
eq(R.evadeString(3, 1, 0, 0), 'd20 + 1d4 + 3', 'evade string with 1d4');
eq(R.totalHp(4), 40, 'HP = 10 slots x mod 4');

// Item slot normalisation + rulebook bonus parsing (live-test fixes)
eq(R.normalizeSlot('Hand/Holding'), 'Hands', 'buckler slot Hand/Holding -> Hands');
eq(R.normalizeSlot('Hands/Holding'), 'Hands', 'slot Hands/Holding -> Hands');
eq(R.normalizeSlot('Head'), 'Head', 'slot Head unchanged');
eq(R.normalizeSlot('Mystery Slot'), 'Other', 'unknown slot -> Other');
eq(R.parseItemBonuses('Grants +1 Shield Block Skill and +3 Damage Resistance. Listed Gear Slot is Hands/Holding;', []),
  [{ type: 'dr', amount: 3 }], 'buckler: DR 3 only when the library is empty (grant needs a library entry)');
eq(R.parseItemBonuses('+2 Strength and +1 First Aid Skill', [{ name: 'FIRST AID', kind: 'skill' }]),
  [{ type: 'stat', stat: 'str', amount: 2 }, { type: 'grant', skillName: 'FIRST AID', kind: 'skill', amount: 1 }], 'item stat + grant parse');
eq(R.parseItemBonuses('A plain cloak with no numbers.', []), [], 'item with no bonuses parses to empty');
// Resting (book Ch.2 p.94, injuries p.96)
eq(R.applyRest('mend', 5, 3, 10, []), { hp: 6, mana: 8, debuffs: [] }, 'mend: +1 slot, +5 mana');
eq(R.applyRest('mend', 10, 10, 10, []), { hp: 10, mana: 10, debuffs: [] }, 'mend capped at full');
eq(R.applyRest('short', 2, 1, 10, ['Minor Injury', 'Long-term Minor Injury', 'Fatigued']),
  { hp: 7, mana: 6, debuffs: ['Long-term Minor Injury', 'Fatigued'] }, 'short rest: +5 slots, +half mana, plain Minor ends only');
eq(R.applyRest('long', 0, 0, 7, ['Fatigued', 'Minor Injury', 'Long-term Minor Injury', 'Major Injury', 'Long-term Major Injury', 'Blessed']),
  { hp: 10, mana: 7, debuffs: ['Long-term Major Injury', 'Blessed'] }, 'long rest: full, long-term Major survives');
eq(R.applyRest('fullday', 0, 0, 7, ['Fatigued', 'Long-term Major Injury']),
  { hp: 10, mana: 7, debuffs: [] }, 'full day rest: full, all injuries end');
// Dice (deterministic rng stubs)
eq(R.rollDie(20, () => 0), 1, 'die roll rng 0 -> 1');
eq(R.rollDie(20, () => 0.999), 20, 'die roll rng ~1 -> max');
eq(R.parseDiceFormula('1d20+5'), { count: 1, sides: 20, mod: 5 }, 'parse 1d20+5');
eq(R.parseDiceFormula('d6'), { count: 1, sides: 6, mod: 0 }, 'parse bare d6');
eq(R.parseDiceFormula('2d6 - 1'), { count: 2, sides: 6, mod: -1 }, 'parse 2d6-1 with spaces');
eq(R.parseDiceFormula('banana'), null, 'parse rejects non-dice text');
eq(R.parseDiceFormula('0d20'), null, 'parse rejects 0 dice');
eq(R.rollFormula('2d6+1', () => 0.5), { count: 2, sides: 6, mod: 1, rolls: [4, 4], total: 9 }, 'roll 2d6+1 with fixed rng');
// Attacks tab: only skills whose Type line says Melee/Ranged Attack count
eq(R.skillAttackType('Club'), 'Melee Attack', 'Club is Melee Attack');
eq(R.skillAttackType('Shuriken'), 'Ranged Attack', 'Shuriken is Ranged Attack');
eq(R.isAttackSkill('Club'), true, 'Melee Attack skill counts');
eq(R.isAttackSkill('Smush'), false, 'Smush is a Damage Effect, Passive — not an attack');
eq(R.isAttackSkill('Choke Out'), false, 'Choke Out is a Damage Effect, Passive — not an attack');
eq(R.isAttackSkill('Cooking'), false, 'utility skill does not count');
eq(R.isAttackSkill('Made Up Skill'), false, 'custom skill (no Type line) does not count');
eq(R.damageEffectParents('Foot Soldier Damage Effect, Passive. Only applies to targets with 20% Health Bar or less.'), ['Foot Soldier'], 'Smush parents: Foot Soldier');
eq(R.damageEffectParents('Foot Soldier, Noggin Nocker, or Pugilism Damage Effect, Passive. Cooldown: 30 hours.'), ['Foot Soldier', 'Noggin Nocker', 'Pugilism'], 'Powerful Strike parents: three attacks');
eq(R.damageEffectParents('Pugilism or Wrasslin’ Damage Effect, Passive.'), ['Pugilism', "Wrasslin'"], 'Dirty Fighting parents, curly apostrophe normalised');
eq(R.damageEffectParents('Melee bashing weapon attack with no additional base effect stated.'), [], 'Club is not a Damage Effect');
eq(R.normalizeKeywordMap({ 'FIREBALL': ['Attack', 'Fire'] }), { 'fireball': ['Attack', 'Fire'] }, 'keyword map keys normalised to lowercase');
eq(R.isAttackSpell(['Attack', 'Fire']), true, 'Attack-keyword spell counts');
eq(R.isAttackSpell(['Heal', 'Passive']), false, 'Heal spell does not count');
eq(R.isAttackSpell([]), false, 'spell with no keywords does not count');
// Backgrounds data (book Tables 12-15): shape + every skill in the library
const fs = require('fs');
const bg = JSON.parse(fs.readFileSync(__dirname + '/../data/backgrounds.json', 'utf8'));
const libAll = JSON.parse(fs.readFileSync(__dirname + '/../data/skills_spells.json', 'utf8'));
const libNames = new Set(libAll.map(e => e.name.toUpperCase()));
eq(bg.categories.length, 4, 'backgrounds: 4 categories');
eq(bg.categories.map(c => c.backgrounds.length), [12, 12, 12, 12], 'backgrounds: 12 per category');
eq(bg.categories.map(c => c.rank), [1, 1, 3, 2], 'background ranks 1/1/3/2');
let bgBad = [];
bg.categories.forEach(c => c.backgrounds.forEach(b => {
  if (b.skills.length !== 3) bgBad.push(b.name);
  b.skills.forEach(sk => { if (!libNames.has(sk.name.toUpperCase())) bgBad.push(sk.name); });
}));
eq(bgBad, [], 'backgrounds: every skill in Chapter 4 library');
eq(bg.combat_weapons.every(w => libNames.has(w.toUpperCase())), true, 'background combat weapons in library');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
