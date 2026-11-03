/* app.js — state, rendering, save/load, tabs, cards, pickers.
 * Depends on rules.js (window.DCCRules). Data JSON files are lazy-loaded:
 * each file is fetched only the first time something needs it (a picker,
 * a race/class application, a spell render). Rendering only rebuilds the
 * active tab panel, plus the sidebar and counters. Text inputs commit on
 * 'change' (Enter/Tab/blur), not on every keystroke, and saves are
 * debounced — the old sheet's per-keystroke full rebuild is deliberately
 * not repeated here.
 *
 * Rank model (see rules.js): displayed Rank = ownRank + gearGiven +
 * raceGiven + groupGiven. ownRank is what the player trained; given
 * amounts are recomputed from live records on every render, so removing
 * a source can never double-count or leave a stale bonus behind.
 */
(function () {
  'use strict';
  var R = window.DCCRules;
  var SAVE_KEY = 'dcc-sheet-v2';
  var uidCounter = 1;

  function uid() { return 'id' + (Date.now().toString(36)) + (uidCounter++); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(id) { return document.getElementById(id); }
  function setVal(id, val) {
    var el = $(id);
    if (el && document.activeElement !== el) el.value = val;
  }
  function num(v, fb) { var n = parseInt(v, 10); return isNaN(n) ? fb : n; }

  /* ---------------- state ---------------- */
  function blankState() {
    return {
      name: '', number: '', race: '', class: '', level: 1, floor: 1, avatarUrl: '',
      ownBase: { str: 1, con: 1, dex: 1, int: 1, cha: 1 },
      ownEnh: { str: 0, con: 0, dex: 0, int: 0, cha: 0 },
      ownArmor: 0, evadeBuffs: 0, drBuffs: 0,
      hpCurrent: 10, manaCurrent: 1, prevMaxMana: 1,
      statPointsSpent: 0, gold: 0, popularity: 0, aiFavor: 0,
      moveVal: 20, stepVal: 10, bossKills: 0, pkKills: 0,
      buffs: [], debuffs: [], hotlist: [],
      skills: [], spells: [], attacks: [], items: [],
      raceClassApplied: [], raceClassChoices: {}, raceClassMoveApplied: null, backgrounds: null,
      activeTab: 'vitals'
    };
  }
  var state = blankState();
  var hasSaved = false;

  function refreshWizard() {
    try {
      var w = document.getElementById('wizard');
      if (w && !w.hidden && window.Wizard && window.Wizard.render) window.Wizard.render();
    } catch (e) { /* wizard not open: nothing to refresh */ }
  }
  /* ---------------- lazy data ---------------- */
  var cache = { skills: null, items: null, races: null, keywords: null, _p: {} };
  function loadJSON(path) {
    return fetch(path + '?v=4').then(function (r) {
      if (!r.ok) throw new Error('Failed to load ' + path);
      return r.json();
    });
  }
  function ensureSkills() {
    if (!cache._p.skills) cache._p.skills = loadJSON('data/skills_spells.json').then(function (list) { cache.skills = list; buildLibIndex(list); return list; });
    return cache._p.skills;
  }
  function ensureItems() {
    if (!cache._p.items) cache._p.items = loadJSON('data/items.json').then(function (list) { cache.items = list; return list; });
    return cache._p.items;
  }
  function ensureRaces() {
    if (!cache._p.races) cache._p.races = loadJSON('data/races_classes.json').then(function (list) { cache.races = list; return list; });
    return cache._p.races;
  }
  function ensureKeywords() {
    if (!cache._p.keywords) cache._p.keywords = loadJSON('data/spell_keywords.json').then(function (d) { cache.keywords = d.keywords || {}; return cache.keywords; });
    return cache._p.keywords;
  }
  var libByName = null;
  function findLib(name) {
    if (!cache.skills || !libByName) return null;
    return libByName[R.normName(name)] || null;
  }
  function buildLibIndex(list) {
    libByName = {};
    list.forEach(function (e) { libByName[R.normName(e.name)] = e; });
  }
  function findRaceClass(name, kind) {
    if (!cache.races) return null;
    var n = R.normName(name);
    for (var i = 0; i < cache.races.length; i++) {
      if (cache.races[i].kind === kind && R.normName(cache.races[i].name) === n) return cache.races[i];
    }
    return null;
  }
  function raceEntry() { return findRaceClass(state.race, 'race'); }
  function classEntry() { return findRaceClass(state.class, 'class'); }

  /* ---------------- derived values ---------------- */
  function fixedStats() {
    var out = { str: 0, con: 0, dex: 0, int: 0, cha: 0 };
    [raceEntry(), classEntry()].forEach(function (e) {
      var s = R.parseRaceClassStats(e);
      R.STAT_KEYS.forEach(function (k) { out[k] += s[k]; });
    });
    return out;
  }
  function splitAssignments() {
    var out = { str: 0, con: 0, dex: 0, int: 0, cha: 0 };
    Object.keys(state.raceClassChoices).forEach(function (cid) {
      var parts = cid.split(':');
      if (parts.length < 3) return;
      var cur = parts[0] === 'race' ? state.race : state.class;
      if (parts[1] !== cur) return;
      var ch = state.raceClassChoices[cid];
      if (ch && ch.split) R.STAT_KEYS.forEach(function (k) { out[k] += num(ch.split[k], 0); });
    });
    return out;
  }
  function raceClassDR() {
    return R.parseRaceClassDR(raceEntry()) + R.parseRaceClassDR(classEntry());
  }
  function computeStats() {
    var fixed = fixedStats();
    var splits = splitAssignments();
    var gear = equippedBonuses().stat;
    var derived = R.derivedBase(state.ownBase, fixed, splits);
    var out = {};
    R.STAT_KEYS.forEach(function (k) {
      var penalty = Math.min(0, fixed[k]);
      var total = R.statTotal(derived[k], state.ownEnh[k] || 0, gear[k] || 0, penalty, R.statCapFor(state.race, state.class, k));
      out[k] = { derived: derived[k], fixed: fixed[k], split: splits[k], penalty: penalty, gear: gear[k] || 0, total: total, mod: R.getModifier(total) };
    });
    return out;
  }
  function equippedBonuses() {
    var stat = { str: 0, con: 0, dex: 0, int: 0, cha: 0 }, dr = 0, evade = 0;
    state.items.forEach(function (it) {
      if (!it.equipped) return;
      (it.bonuses || []).forEach(function (b) {
        if (b.type === 'stat' && stat[b.stat] !== undefined) stat[b.stat] += num(b.amount, 0);
        if (b.type === 'dr') dr += num(b.amount, 0);
        if (b.type === 'evade') evade += num(b.amount, 0);
      });
    });
    return { stat: stat, dr: dr, evade: evade };
  }
  function gearGivenFor(card) {
    var total = 0;
    Object.keys(card.gearGrants || {}).forEach(function (k) { total += num(card.gearGrants[k], 0); });
    return total;
  }
  function raceGivenFor(card) {
    var total = 0, key = R.normName(card.name);
    state.raceClassApplied.forEach(function (a) {
      if (a.kind === card.kind && R.normName(a.skillName) === key) total += num(a.amount, 0);
    });
    return total;
  }
  var keywordCache = {};
  function groupGivenFor(card) {
    var lib = findLib(card.name);
    var kw = keywordCache[R.normName(card.name)] || [];
    return R.groupBonusFor(card, state.race, state.class, lib, kw);
  }
  function cardRank(card) {
    return R.displayRank(card, gearGivenFor(card), raceGivenFor(card), groupGivenFor(card));
  }
  function cardFloor(card) {
    return R.combinedFloor(gearGivenFor(card), raceGivenFor(card), groupGivenFor(card));
  }
  function findCard(name, kind) {
    var list = kind === 'spell' ? state.spells : state.skills;
    var n = R.normName(name);
    for (var i = 0; i < list.length; i++) if (R.normName(list[i].name) === n) return list[i];
    return null;
  }

  /* ---------------- save / load ---------------- */
  var saveTimer = null;
  function saveSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  function saveNow() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); hasSaved = true; } catch (e) { /* storage full/blocked: sheet still works in memory */ }
  }
  function loadSaved() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return false;
      state = Object.assign(blankState(), data);
      // Ensure every field exists even for older v2 saves.
      var b = blankState();
      Object.keys(b).forEach(function (k) { if (state[k] === undefined) state[k] = b[k]; });
      hasSaved = true;
      return true;
    } catch (e) { return false; }
  }
  function exportJSON() {
    saveNow();
    var blob = new Blob([JSON.stringify({ format: 'dcc-sheet-v2', version: 1, character: state }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.name || 'crawler').replace(/[^a-z0-9-_]+/gi, '-') + '-sheet-v2.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    var t = document.createElement('div');
    t.textContent = 'Exported ' + a.download;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#2a2f3a;color:#e8e6df;padding:10px 16px;border:1px solid #6b5a2a;border-radius:8px;z-index:9999;';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
  }
  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(reader.result);
        var ch = obj.character || obj;
        if (!ch || (!ch.skills && !ch.spells && !ch.name && ch.level === undefined)) throw new Error('not a character');
        if (!confirm('Replace the current sheet with the imported character?')) return;
        state = Object.assign(blankState(), ch);
        ensureUnarmed();
        saveNow();
        renderAll();
      } catch (e) { alert('Import failed: that file is not a valid character sheet. Nothing was changed.'); }
    };
    reader.readAsText(file);
  }

  /* ---------------- attacks ---------------- */
  function ensureUnarmed() {
    var exists = state.attacks.some(function (a) { return R.normName(a.name) === 'unarmed combat'; });
    if (!exists) {
      state.attacks.unshift({ id: uid(), name: 'UNARMED COMBAT', toHitStat: 'str', damage: '1d4 + Str Bludgeoning', notes: 'Rank 5: +1d4. Rank 10: +1d4. Rank 15: +2d4. (Book p.179; damage follows the UNARMED COMBAT skill rank if you have that card, else Rank 1.)' });
    }
  }

  /* ---------------- gear grants ---------------- */
  function syncGearGrants() {
    // Create cards for equipped grants that have no card yet.
    state.items.forEach(function (it) {
      if (!it.equipped) return;
      (it.bonuses || []).forEach(function (b) {
        if (b.type !== 'grant' || !b.skillName) return;
        var kind = b.kind || 'skill';
        if (!findCard(b.skillName, kind)) {
          var lib = findLib(b.skillName);
          var card = { id: uid(), name: lib ? lib.name : b.skillName, kind: kind, ownRank: 0, stat: lib && lib.stat ? lib.stat.toLowerCase() : (kind === 'spell' ? 'int' : 'str'), checkType: 'Active Check', effect: '', used: false, gearGrants: {} };
          (kind === 'spell' ? state.spells : state.skills).push(card);
        }
      });
    });
    // Recompute each card's gearGrants from equipped items only.
    var all = state.skills.concat(state.spells);
    all.forEach(function (card) {
      var map = {};
      state.items.forEach(function (it) {
        if (!it.equipped) return;
        (it.bonuses || []).forEach(function (b) {
          if (b.type === 'grant' && b.skillName && R.normName(b.skillName) === R.normName(card.name) && (b.kind || 'skill') === card.kind) {
            map[it.id] = (map[it.id] || 0) + num(b.amount, 0);
          }
        });
      });
      card.gearGrants = map;
    });
    pruneBonusCards();
  }
  function pruneBonusCards() {
    function keep(list) {
      return list.filter(function (card) {
        return !R.shouldRemoveCard(card, gearGivenFor(card), raceGivenFor(card), groupGivenFor(card));
      });
    }
    state.skills = keep(state.skills);
    state.spells = keep(state.spells);
  }

  /* ---------------- race / class ---------------- */
  function choiceId(kind, sourceName, grantIdx, pickIdx) {
    return kind + ':' + sourceName + ':' + grantIdx + '-' + pickIdx;
  }
  function applyFixedBonus(source, sourceName, skillName, kind, amount) {
    var card = findCard(skillName, kind);
    var applied;
    if (!card) {
      var lib = findLib(skillName);
      applied = Math.min(amount, 10);
      card = { id: uid(), name: lib ? lib.name : skillName, kind: kind, ownRank: 0, stat: lib && lib.stat ? lib.stat.toLowerCase() : (kind === 'spell' ? 'int' : 'str'), checkType: 'Active Check', effect: '', used: false, gearGrants: {} };
      (kind === 'spell' ? state.spells : state.skills).push(card);
    } else {
      var before = cardRank(card);
      applied = Math.max(0, Math.min(amount, 10 - before)); // cap Rank 10 at selection
      if (applied <= 0) return;
    }
    state.raceClassApplied.push({ source: source, sourceName: sourceName, skillName: card.name, kind: kind, amount: applied, createdByBonus: card.ownRank === 0 });
  }
  function reverseSource(source, sourceName) {
    state.raceClassApplied = state.raceClassApplied.filter(function (a) {
      return !(a.source === source && (!sourceName || a.sourceName === sourceName));
    });
  }
  function syncMoveBonus() {
    if (state.raceClassMoveApplied) {
      var a = state.raceClassMoveApplied;
      state.moveVal = Math.max(a.ownBefore, state.moveVal - a.amount);
      state.raceClassMoveApplied = null;
    }
    var bonus = R.tigranMoveBonus(state.race, state.class);
    if (bonus > 0) {
      state.raceClassMoveApplied = { amount: bonus, ownBefore: state.moveVal };
      state.moveVal = state.moveVal + bonus;
    }
  }
  async function setRaceClass(kind, name) {
    var oldName = kind === 'race' ? state.race : state.class;
    if (oldName === name) return;
    await ensureSkills();
    await ensureRaces();
    // Reverse this source's fixed bonuses and its choices.
    reverseSource(kind, oldName);
    Object.keys(state.raceClassChoices).forEach(function (cid) {
      if (cid.indexOf(kind + ':' + oldName + ':') === 0) {
        reverseSource('choice', cid);
        delete state.raceClassChoices[cid];
      }
    });
    if (kind === 'race') state.race = name; else state.class = name;
    var entry = findRaceClass(name, kind);
    if (entry) {
      R.parseFixedSkillBonuses(entry, findLib).forEach(function (s) {
        applyFixedBonus(kind, name, s.name, s.kind === 'spell' ? 'spell' : 'skill', s.amount);
      });
    }
    syncMoveBonus();
    pruneBonusCards();
    saveSoon();
    renderAll();
    refreshWizard();
  }
  function setChoice(cid, kind, sourceName, grant, pickIdx, name) {
    reverseSource('choice', cid);
    if (!name) { delete state.raceClassChoices[cid]; }
    else {
      state.raceClassChoices[cid] = { name: name, kind: grant.category === 'spell' ? 'spell' : 'skill' };
      applyFixedBonus('choice', cid, name, grant.category === 'spell' ? 'spell' : 'skill', grant.amount);
    }
    pruneBonusCards();
    saveSoon();
    renderAll();
  }
  function setSplit(cid, statKey, delta, pool) {
    var ch = state.raceClassChoices[cid] || { split: {} };
    ch.split = ch.split || {};
    var total = 0;
    R.STAT_KEYS.forEach(function (k) { total += num(ch.split[k], 0); });
    var next = Math.max(0, num(ch.split[statKey], 0) + delta);
    if (delta > 0 && total >= pool) return;
    ch.split[statKey] = next;
    state.raceClassChoices[cid] = ch;
    saveSoon();
    renderAll();
  }
  function choiceSections() {
    var sections = [];
    [{ kind: 'race', entry: raceEntry() }, { kind: 'class', entry: classEntry() }].forEach(function (pair) {
      var entry = pair.entry;
      if (!entry) return;
      R.parseRaceClassSplit(entry).forEach(function (sp, si) {
        var cid = choiceId(pair.kind, entry.name, 'split' + si, 0);
        var cur = state.raceClassChoices[cid] || { split: {} };
        var total = 0;
        R.STAT_KEYS.forEach(function (k) { total += num((cur.split || {})[k], 0); });
        sections.push({ type: 'split', cid: cid, entry: entry, kind: pair.kind, pool: sp, total: total, cur: cur });
      });
      R.parseChoiceGrants(entry).forEach(function (g, gi) {
        for (var n = 0; n < g.count; n++) {
          var cid2 = choiceId(pair.kind, entry.name, 'choice' + gi, n);
          sections.push({ type: 'grant', cid: cid2, entry: entry, kind: pair.kind, grant: g, cur: state.raceClassChoices[cid2] });
        }
      });
    });
    return sections;
  }

  /* ---------------- rendering: sidebar / counters ---------------- */
  var activeTab = 'vitals';
  function renderSidebar() {
    setVal('f-name', state.name);
    setVal('f-number', state.number);
    setVal('f-level', state.level);
    setVal('f-floor', state.floor);
    $('race-name').textContent = state.race || '—';
    $('class-name').textContent = state.class || '—';
    var img = $('avatar-img'), ph = $('avatar-placeholder');
    if (state.avatarUrl) { img.src = state.avatarUrl; img.hidden = false; ph.hidden = true; }
    else { img.hidden = true; ph.hidden = false; }
  }
  function renderCounters(stats, hbMod) {
    var bank = R.statBank(state.level, state.statPointsSpent);
    $('ctr-level').textContent = state.level;
    $('ctr-floor').textContent = state.floor;
    $('ctr-bank').textContent = bank;
    $('ctr-gold').textContent = state.gold;
    $('ctr-pop').textContent = state.popularity;
    $('ctr-favor').textContent = state.aiFavor;
    $('ctr-move').textContent = state.moveVal;
    $('ctr-step').textContent = state.stepVal;
    $('ctr-boss').textContent = state.bossKills;
    $('ctr-pk').textContent = state.pkKills;
    $('bank-text').textContent = bank;
  }
  function hpStatus(pct) {
    if (pct >= 75) return 'Healthy';
    if (pct >= 50) return 'Damaged';
    if (pct >= 25) return 'Low';
    return 'Critical';
  }
  function renderVitals(stats) {
    var hbMod = R.healthBarUsesCha(raceEntry(), classEntry()) ? stats.cha.mod : stats.con.mod;
    var maxHp = R.totalHp(hbMod);
    var curHp = state.hpCurrent * hbMod;
    var pct = Math.round(state.hpCurrent / 10 * 100);
    $('hp-text').textContent = curHp + ' / ' + maxHp + ' HP (' + pct + '% · ' + hpStatus(pct) + ')';
    var bar = $('hp-bar');
    var cls = pct >= 75 ? 'filled' : pct >= 50 ? 'filled mid' : pct >= 25 ? 'filled low' : 'filled crit';
    var html = '';
    for (var i = 0; i < 10; i++) {
      html += '<div class="hp-seg ' + (i < state.hpCurrent ? cls : '') + '">' + (i < state.hpCurrent ? hbMod : '') + '</div>';
    }
    bar.innerHTML = html;
    var maxMana = R.maxMana(stats.int.total);
    if (state.prevMaxMana !== undefined && maxMana > state.prevMaxMana) {
      state.manaCurrent = Math.min(maxMana, state.manaCurrent + (maxMana - state.prevMaxMana));
    }
    state.prevMaxMana = maxMana;
    if (state.manaCurrent > maxMana) state.manaCurrent = maxMana;
    if (state.manaCurrent < 0) state.manaCurrent = 0;
    $('mana-text').textContent = state.manaCurrent + ' / ' + maxMana + ' Mana';
    var evadeDice = R.evadeDiceCount(raceEntry(), classEntry());
    var gearEvade = equippedBonuses().evade;
    $('evade-disp').textContent = R.evadeString(stats.dex.mod, evadeDice, state.evadeBuffs, gearEvade);
    $('evade-sub').textContent = 'd20' + (evadeDice ? ' + ' + evadeDice + 'd4 (Race/Class)' : '') + ' + DEX ' + stats.dex.mod + ' + Buffs ' + state.evadeBuffs + (gearEvade ? ' + Gear ' + gearEvade : '');
    var armor = state.ownArmor + equippedBonuses().dr;
    var dr = R.totalDR(armor, state.drBuffs, raceClassDR());
    $('dr-disp').textContent = dr;
    $('dr-sub').textContent = 'Armor ' + armor + ' + Buffs ' + state.drBuffs + (raceClassDR() ? ' + Race/Class ' + raceClassDR() : '');
    setVal('f-armor', state.ownArmor);
    setVal('f-evade-buffs', state.evadeBuffs);
    setVal('f-dr-buffs', state.drBuffs);
    // Stat cards
    var cards = '';
    R.STAT_KEYS.forEach(function (k) {
      var s = stats[k];
      cards += '<div class="stat-card"><h3>' + k.toUpperCase() + ' — ' + R.STAT_NAMES[k] + '</h3>'
        + '<label>Base (edit to set) <input type="number" min="1" value="' + s.derived + '" onchange="DCC.setOwnBase(\'' + k + '\', this.value)"></label>'
        + '<p>Derived Base: <strong>' + s.derived + '</strong> (own + positive race/class + split)</p>'
        + '<label>Enhance (own) <input type="number" min="0" value="' + (state.ownEnh[k] || 0) + '" onchange="DCC.setOwnEnh(\'' + k + '\', this.value)"></label>'
        + '<p>Gear: +' + s.gear + ' &nbsp; Race/Class: ' + (s.fixed + s.split >= 0 ? '+' : '') + (s.fixed + s.split) + '</p>'
        + (s.penalty < 0 ? '<p>Race/Class penalty: ' + s.penalty + ' (subtracted from Total)</p>' : '')
        + '<p>Total: <strong>' + s.total + '</strong> &nbsp; Modifier: <strong>+' + s.mod + '</strong></p></div>';
    });
    $('stat-cards').innerHTML = cards;
    // Note: the Base input above shows the derived base; changing it
    // sets ownBase (setOwnBase subtracts the positive race/class + split
    // part so the displayed base matches what was typed).
    function listHtml(list, kind) {
      return list.map(function (x, i) {
        return '<li>' + esc(x) + ' <button type="button" onclick="DCC.delNote(\'' + kind + '\',' + i + ')">Remove</button></li>';
      }).join('');
    }
    $('buff-list').innerHTML = listHtml(state.buffs, 'buff');
    $('debuff-list').innerHTML = listHtml(state.debuffs, 'debuff');
    setVal('t-gold', state.gold); setVal('t-pop', state.popularity); setVal('t-favor', state.aiFavor);
    setVal('t-move', state.moveVal); setVal('t-step', state.stepVal); setVal('t-boss', state.bossKills); setVal('t-pk', state.pkKills);
    $('hotlist').innerHTML = state.hotlist.map(function (x, i) {
      return '<div class="card"><span>' + esc(x) + '</span> <button type="button" onclick="DCC.delHotlist(' + i + ')">Remove</button></div>';
    }).join('') || '<p class="hint">Hotlist is empty.</p>';
  }
  function setOwnBase(key, value) {
    var fixed = fixedStats(), splits = splitAssignments();
    var positive = Math.max(0, fixed[key]) + (splits[key] || 0);
    state.ownBase[key] = Math.max(1, num(value, 1) - positive);
    saveSoon(); renderAll();
  }
  function setOwnEnh(key, value) {
    state.ownEnh[key] = Math.max(0, num(value, 0));
    saveSoon(); renderAll();
  }

  /* ---------------- rendering: cards ---------------- */
  function rulebookBox(card) {
    var lib = findLib(card.name);
    if (!lib) return '';
    var html = '<div class="rulebook"><strong>Rulebook:</strong> ' + esc(lib.base_effect || '');
    if (lib.base_damage) html += '<br>Damage: ' + esc(lib.base_damage);
    if (lib.mana_cost) html += '<br>Mana: ' + esc(lib.mana_cost);
    if (lib.range) html += '<br>Range: ' + esc(lib.range);
    if (lib.stat) html += '<br>Book stat: ' + esc(lib.stat);
    if (card.kind === 'spell') {
      var kw = keywordCache[R.normName(card.name)] || [];
      if (kw.length) html += '<br><span class="keywords">Keywords: ' + esc(kw.join(', ')) + '</span>';
      if (R.normName(card.name) === "nature's breath") {
        html += '<br>Heal at Rank ' + cardRank(card) + ': ' + esc(R.naturesBreathHealFormula(cardRank(card)));
      }
    }
    if (lib.upgrades) {
      var r = cardRank(card);
      ['5', '10', '15'].forEach(function (t) {
        if (lib.upgrades[t]) html += '<br>' + (r >= parseInt(t, 10) ? '✓ ' : '') + 'Rank ' + t + ': ' + esc(lib.upgrades[t]);
      });
    }
    html += '</div>';
    return html;
  }
  function cardHtml(card) {
    var rank = cardRank(card);
    var eff = R.effectiveRank(rank, card, state.race, state.class);
    var floor = cardFloor(card);
    var group = groupGivenFor(card);
    var lib = findLib(card.name);
    var statLocked = !!(lib && lib.stat);
    var statOptions = R.STAT_KEYS.map(function (k) {
      return '<option value="' + k + '"' + (card.stat === k ? ' selected' : '') + '>' + k.toUpperCase() + '</option>';
    }).join('');
    var rankOptions = '';
    for (var r = 1; r <= 20; r++) rankOptions += '<option value="' + r + '"' + (rank === r ? ' selected' : '') + '>' + r + '</option>';
    return '<div class="card"><h4>' + esc(card.name) + '</h4>'
      + '<div class="row"><label>Name <input type="text" value="' + esc(card.name) + '" onchange="DCC.renameCard(\'' + card.kind + '\',\'' + card.id + '\',this.value)"></label>'
      + '<label>Rank <select onchange="DCC.setRank(\'' + card.kind + '\',\'' + card.id + '\',this.value)">' + rankOptions + '</select></label>'
      + '<label>Stat <select ' + (statLocked ? 'disabled title="Book stat (see Rulebook box)"' : '') + ' onchange="DCC.setCardStat(\'' + card.kind + '\',\'' + card.id + '\',this.value)">' + statOptions + '</select></label>'
      + '<label>Check <select onchange="DCC.setCardCheck(\'' + card.kind + '\',\'' + card.id + '\',this.value)">'
      + ['Active Check', 'Contested Check', 'Evade Check', 'Passive Effect'].map(function (c) { return '<option' + (card.checkType === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></label>'
      + '<label>Used <input type="checkbox"' + (card.used ? ' checked' : '') + ' onchange="DCC.toggleUsed(\'' + card.kind + '\',\'' + card.id + '\',this.checked)"></label>'
      + '<button type="button" onclick="DCC.rollCard(\'' + card.kind + '\',\'' + card.id + '\')">Roll d20</button>'
      + '<button type="button" onclick="DCC.delCard(\'' + card.kind + '\',\'' + card.id + '\')">Delete</button></div>'
      + '<p>Rank ' + rank + (group ? ' (Group +' + group + ' in rank)' : '') + (eff !== rank ? ' — effective Rank ' + eff + ' (Mage −3)' : '') + (floor ? ' — floor ' + floor : '') + '</p>'
      + '<label>Notes <input type="text" value="' + esc(card.effect || '') + '" onchange="DCC.setCardEffect(\'' + card.kind + '\',\'' + card.id + '\',this.value)"></label>'
      + rulebookBox(card) + '</div>';
  }
  function renderSkills() { $('skill-list').innerHTML = state.skills.map(cardHtml).join('') || '<p class="hint">No skills yet. Pick from the rulebook or add a custom skill.</p>'; }
  function renderSpells() { $('spell-list').innerHTML = state.spells.map(cardHtml).join('') || '<p class="hint">No spells yet. Pick from the rulebook or add a custom spell.</p>'; }
  function renderAttacks() {
    $('attack-list').innerHTML = state.attacks.map(function (a) {
      var override = R.attackDamageStat(a.name, state.race, state.class);
      var stats = computeStats();
      var mod = stats[a.toHitStat] ? stats[a.toHitStat].mod : 0;
      return '<div class="card"><h4>' + esc(a.name) + '</h4>'
        + '<p>To hit: d20 + ' + a.toHitStat.toUpperCase() + ' Mod (+' + mod + ')</p>'
        + '<p>Damage: ' + esc(a.damage) + (override ? ' — damage uses ' + override.toUpperCase() + ' Mod instead (race/class override; to-hit unchanged)' : '') + '</p>'
        + '<p>' + esc(a.notes || '') + '</p>'
        + '<button type="button" onclick="DCC.rollAttack(\'' + a.id + '\')">Roll to hit</button>'
        + '<button type="button" onclick="DCC.delAttack(\'' + a.id + '\')">Delete</button></div>';
    }).join('') || '<p class="hint">No attacks.</p>';
  }
  function bonusRowHtml(item, bi) {
    var b = item.bonuses[bi];
    return '<div class="bonus-row"><select onchange="DCC.setBonusType(\'' + item.id + '\',' + bi + ',this.value)">'
      + ['stat', 'grant', 'dr', 'evade'].map(function (t) { return '<option value="' + t + '"' + (b.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>'
      + (b.type === 'stat' ? '<select onchange="DCC.setBonusStat(\'' + item.id + '\',' + bi + ',this.value)">' + R.STAT_KEYS.map(function (k) { return '<option value="' + k + '"' + (b.stat === k ? ' selected' : '') + '>' + k.toUpperCase() + '</option>'; }).join('') + '</select>' : '')
      + (b.type === 'grant' ? '<input type="text" placeholder="Skill/spell name" value="' + esc(b.skillName || '') + '" onchange="DCC.setBonusSkill(\'' + item.id + '\',' + bi + ',this.value)">'
        + '<select onchange="DCC.setBonusKind(\'' + item.id + '\',' + bi + ',this.value)"><option value="skill"' + ((b.kind || 'skill') === 'skill' ? ' selected' : '') + '>skill</option><option value="spell"' + (b.kind === 'spell' ? ' selected' : '') + '>spell</option></select>' : '')
      + '<label>Amount <input type="number" value="' + num(b.amount, 0) + '" onchange="DCC.setBonusAmount(\'' + item.id + '\',' + bi + ',this.value)"></label>'
      + '<button type="button" onclick="DCC.delBonus(\'' + item.id + '\',' + bi + ')">Remove bonus</button></div>';
  }
  function itemHtml(it) {
    var lib = null;
    if (cache.items) {
      var n = R.normName(it.name);
      lib = cache.items.find(function (e) { return R.normName(e.name) === n; }) || null;
    }
    var html = '<div class="card"><h4>' + esc(it.name) + (it.equipped ? ' — EQUIPPED' : '') + '</h4>'
      + '<p>' + esc(it.effect || '') + '</p>'
      + '<div class="row"><label>Name <input type="text" value="' + esc(it.name) + '" onchange="DCC.renameItem(\'' + it.id + '\',this.value)"></label>'
      + '<label>Slot <select onchange="DCC.setItemSlot(\'' + it.id + '\',this.value)">'
      + (function () { var slots = ['Head', 'Torso', 'Hands', 'Legs', 'Feet', 'Accessory', 'Weapon', 'Other']; if (slots.indexOf(it.slot) < 0) slots.unshift(it.slot); return slots.map(function (s) { return '<option' + (it.slot === s ? ' selected' : '') + '>' + s + '</option>'; }).join(''); })() + '</select></label>'
      + (it.equipped
        ? '<button type="button" onclick="DCC.setEquipped(\'' + it.id + '\',false)">Unequip</button>'
        : '<button type="button" onclick="DCC.setEquipped(\'' + it.id + '\',true)">Equip</button>')
      + '<button type="button" onclick="DCC.delItem(\'' + it.id + '\')">Delete</button></div>';
    if (lib) html += '<div class="rulebook"><strong>Rulebook:</strong> ' + esc(lib.effect || '') + (lib.source ? ' — ' + esc(lib.source) : '') + (lib.source_book_page ? ' (p.' + lib.source_book_page + ')' : '') + '</div>';
    html += '<p><strong>Bonuses (apply only while equipped, up to 5):</strong></p>'
      + (it.bonuses || []).map(function (b, bi) { return bonusRowHtml(it, bi); }).join('')
      + ((it.bonuses || []).length < 5 ? '<button type="button" onclick="DCC.addBonus(\'' + it.id + '\')">Add bonus</button>' : '')
      + '</div>';
    return html;
  }
  function renderItems() {
    $('item-list').innerHTML = state.items.map(itemHtml).join('') || '<p class="hint">Inventory is empty.</p>';
  }
  function renderGear() {
    var eq = state.items.filter(function (it) { return it.equipped; });
    $('equipped-list').innerHTML = eq.map(itemHtml).join('') || '<p class="hint">Nothing equipped. Equip items from Inventory; only equipped items apply their bonuses.</p>';
  }
  function renderChoices() {
    var sections = choiceSections();
    var btn = $('choices-tab-btn');
    btn.hidden = sections.length === 0;
    if (activeTab === 'choices' && sections.length === 0) showTab('vitals');
    $('choices-content').innerHTML = sections.map(function (s) {
      if (s.type === 'split') {
        var rows = s.pool.stats.map(function (k) {
          var v = num((s.cur.split || {})[k], 0);
          return '<p>' + k.toUpperCase() + ': <button type="button" onclick="DCC.setSplit(\'' + s.cid + '\',\'' + k + '\',-1,' + s.pool.pool + ')">−</button> ' + v + ' <button type="button" onclick="DCC.setSplit(\'' + s.cid + '\',\'' + k + '\',1,' + s.pool.pool + ')">+</button></p>';
        }).join('');
        return '<div class="card"><strong>Source: ' + esc(s.entry.name) + ' (' + s.kind + ') — +' + s.pool.pool + ' split between ' + s.pool.stats.map(function (k) { return k.toUpperCase(); }).join(', ') + '</strong><p>Assigned ' + s.total + ' / ' + s.pool.pool + '.</p>' + rows + '</div>';
      }
      var cur = s.cur;
      return '<div class="card"><strong>Source: ' + esc(s.entry.name) + ' (' + s.kind + ') — +' + s.grant.amount + ' ' + esc(s.grant.label) + '</strong><br>'
        + '<button type="button" onclick="DCC.openChoicePicker(\'' + s.cid + '\',\'' + s.kind + '\',\'' + esc(s.entry.name) + '\',' + s.grant.amount + ',\'' + s.grant.category + '\')">Pick from rulebook</button> '
        + '<input type="text" placeholder="or custom name" value="' + esc(cur && cur.name ? cur.name : '') + '" onchange="DCC.pickChoice(\'' + s.cid + '\',\'' + s.kind + '\',\'' + esc(s.entry.name) + '\',' + s.grant.amount + ',\'' + s.grant.category + '\',this.value)">'
        + (cur && cur.name ? ' <button type="button" onclick="DCC.pickChoice(\'' + s.cid + '\',\'' + s.kind + '\',\'' + esc(s.entry.name) + '\',' + s.grant.amount + ',\'' + s.grant.category + '\',\'\')">Clear pick</button>' : '')
        + '</div>';
    }).join('') || '<p class="hint">No choices right now.</p>';
  }
  function renderAllPanel(stats) {
    var html = '<p><strong>' + esc(state.name || 'Unnamed Crawler') + '</strong> — Level ' + state.level + ', Floor ' + state.floor + ', ' + esc(state.race || 'no race') + ' / ' + esc(state.class || 'no class') + '</p>';
    html += '<p>Stats: ' + R.STAT_KEYS.map(function (k) { return k.toUpperCase() + ' ' + stats[k].total + ' (+' + stats[k].mod + ')'; }).join(', ') + '</p>';
    html += '<p>Skills: ' + state.skills.map(function (c) { return esc(c.name) + ' ' + cardRank(c); }).join(', ') + '</p>';
    html += '<p>Spells: ' + state.spells.map(function (c) { return esc(c.name) + ' ' + cardRank(c); }).join(', ') + '</p>';
    html += '<p>Equipped: ' + state.items.filter(function (i) { return i.equipped; }).map(function (i) { return esc(i.name); }).join(', ') + '</p>';
    $('all-content').innerHTML = html;
  }

  /* ---------------- render orchestration ---------------- */
  function renderAll() {
    var stats = computeStats();
    renderSidebar();
    renderCounters(stats);
    // Keywords are needed for Lifebringer's Heal group bonus; load them
    // lazily on first render and re-render once they arrive.
    if (cache.keywords === null) {
      ensureKeywords().then(function (kw) { keywordCache = kw; renderAll(); }).catch(function () {});
    }
    if (activeTab === 'vitals') renderVitals(stats);
    else if (activeTab === 'attacks') renderAttacks();
    else if (activeTab === 'gear') renderGear();
    else if (activeTab === 'skills') renderSkills();
    else if (activeTab === 'spells') renderSpells();
    else if (activeTab === 'inventory') renderItems();
    else if (activeTab === 'choices') renderChoices();
    else if (activeTab === 'all') renderAllPanel(stats);
    renderChoices(); // keeps the Choices tab button visibility current
    // Keep Choices button in sync even when another tab is active.
    var btn = $('choices-tab-btn');
    if (choiceSections().length === 0 && activeTab === 'choices') { /* renderChoices already fell back */ }
  }
  function showTab(tab) {
    activeTab = tab;
    state.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + tab); });
    saveSoon();
    renderAll();
  }

  /* ---------------- pickers & info modal ---------------- */
  var pickerMode = null; // {type, onPick}
  function openPicker(title, candidates, onPick) {
    pickerMode = { onPick: onPick };
    $('picker-title').textContent = title;
    $('picker-search').value = '';
    renderPickerList(candidates);
    $('picker-modal').hidden = false;
    $('picker-search').focus();
  }
  function renderPickerList(candidates) {
    var q = R.normName($('picker-search').value);
    var list = candidates.filter(function (c) {
      return !q || R.normName(c.name).indexOf(q) >= 0 || (c.effect && R.normName(c.effect).indexOf(q) >= 0) || (c.benefits && R.normName(c.benefits).indexOf(q) >= 0);
    });
    $('picker-list').innerHTML = list.map(function (c, i) {
      var idx = candidates.indexOf(c);
      return '<button type="button" class="picker-item" onclick="DCC.pickerPick(' + idx + ')"><strong>' + esc(c.name) + '</strong><small>' + esc(c.kind || '') + (c.source ? ' · ' + c.source : '') + (c.source_book_page ? ' · p.' + c.source_book_page : '') + '</small><small>' + esc((c.base_effect || c.effect || c.benefits || '').slice(0, 160)) + '</small></button>';
    }).join('') || '<p class="hint">No matches.</p>';
    pickerMode.candidates = candidates;
  }
  function pickerPick(idx) {
    var c = pickerMode.candidates[idx];
    $('picker-modal').hidden = true;
    if (pickerMode.onPick) pickerMode.onPick(c);
  }
  function showInfo(title, bodyHtml) {
    $('info-title').textContent = title;
    $('info-body').innerHTML = bodyHtml;
    $('info-modal').hidden = false;
  }
  async function openSkillPicker(kind) {
    var list = await ensureSkills();
    var cands = list.filter(function (e) { return kind === 'spell' ? e.kind === 'spell' : e.kind !== 'spell'; });
    openPicker(kind === 'spell' ? 'Pick a spell' : 'Pick a skill', cands, function (c) {
      var card = { id: uid(), name: c.name, kind: kind === 'spell' ? 'spell' : 'skill', ownRank: 1, stat: c.stat ? c.stat.toLowerCase() : (kind === 'spell' ? 'int' : 'str'), checkType: 'Active Check', effect: '', used: false, gearGrants: {} };
      (kind === 'spell' ? state.spells : state.skills).push(card);
      saveSoon(); renderAll(); refreshWizard();
    });
  }
  async function openItemPicker() {
    var list = await ensureItems();
    var skills = [];
    try { skills = await ensureSkills(); } catch (e) { skills = []; }
    openPicker('Pick an item', list, function (c) {
      state.items.push({ id: uid(), name: c.name, kind: c.kind, source: c.source, slot: R.normalizeSlot(c.gear_slot), effect: c.effect || '', bonuses: R.parseItemBonuses(c.effect || '', skills), equipped: false });
      saveSoon(); renderAll(); refreshWizard();
    });
  }
  async function openRaceClassPicker(kind) {
    var list = await ensureRaces();
    openPicker(kind === 'race' ? 'Pick a race' : 'Pick a class', list.filter(function (e) { return e.kind === kind; }), function (c) {
      setRaceClass(kind, c.name);
    });
  }
  async function showRaceClassInfo(kind) {
    var name = kind === 'race' ? state.race : state.class;
    if (!name) { alert('No ' + kind + ' selected yet.'); return; }
    var list = await ensureRaces();
    var entry = list.find(function (e) { return e.kind === kind && R.normName(e.name) === R.normName(name); });
    if (!entry) { alert('No rulebook entry found for ' + name + '.'); return; }
    showInfo(entry.name + ' (' + kind + ')', '<p>' + esc(entry.benefits || '') + '</p>'
      + (entry.prerequisites ? '<p><strong>Prerequisites:</strong> ' + esc(entry.prerequisites) + '</p>' : '')
      + (entry.source_book_page ? '<p>Book p.' + entry.source_book_page + '</p>' : '')
      + '<p class="hint">Text shown here is book text for reference. Only the auto-applied effects listed in the README are applied automatically; everything else is shown, not auto-applied.</p>');
  }
  var choiceGrantByCid = {};
  function openChoicePicker(cid, kind, sourceName, amount, category) {
    var grant = choiceGrantByCid[cid];
    ensureSkills().then(function (list) {
      var cands;
      if (grant && grant.options) {
        cands = grant.options.map(function (n) {
          var lib = findLib(n);
          return lib || { name: n, kind: category === 'spell' ? 'spell' : 'utility', base_effect: 'Custom / choice option (not a Chapter 4 library entry, or matched by name).' };
        });
      } else if (category === 'spell') {
        cands = list.filter(function (e) { return e.kind === 'spell'; });
      } else if (category === 'weapon') {
        cands = list.filter(function (e) { return e.kind === 'attack'; });
      } else {
        cands = list.filter(function (e) { return e.kind !== 'spell'; });
      }
      openPicker('Pick a choice for ' + sourceName, cands, function (c) {
        setChoice(cid, kind, sourceName, grant || { amount: amount, category: category }, 0, c.name);
      });
    });
  }

  /* ---------------- distribute dialog ---------------- */
  var distAlloc = { str: 0, con: 0, dex: 0, int: 0, cha: 0 };
  function openDistribute() {
    distAlloc = { str: 0, con: 0, dex: 0, int: 0, cha: 0 };
    renderDistribute();
    $('distribute-modal').hidden = false;
  }
  function renderDistribute() {
    var bank = R.statBank(state.level, state.statPointsSpent);
    var used = 0;
    R.STAT_KEYS.forEach(function (k) { used += distAlloc[k]; });
    $('dist-remaining').textContent = bank - used;
    $('dist-rows').innerHTML = R.STAT_KEYS.map(function (k) {
      return '<p>' + k.toUpperCase() + ' (own base ' + state.ownBase[k] + '): <button type="button" onclick="DCC.distStep(\'' + k + '\',-1)">−</button> ' + distAlloc[k] + ' <button type="button" onclick="DCC.distStep(\'' + k + '\',1)">+</button></p>';
    }).join('');
  }
  function distStep(key, delta) {
    var bank = R.statBank(state.level, state.statPointsSpent);
    var used = 0;
    R.STAT_KEYS.forEach(function (k) { used += distAlloc[k]; });
    if (delta > 0 && used >= bank) return;
    distAlloc[key] = Math.max(0, distAlloc[key] + delta);
    renderDistribute();
  }

  /* ---------------- dice + rest ---------------- */
  var lastRollText = '';
  function showRoll(text) {
    lastRollText = text;
    var el = $('roll-result');
    if (el) el.textContent = text;
  }
  function rollD20Check(label, mod) {
    var die = R.rollDie(20);
    showRoll(label + ': d20 + ' + mod + ' = ' + die + ' + ' + mod + ' = ' + (die + mod));
  }
  function doRest(type, label) {
    var maxMana = R.maxMana(computeStats().int.total);
    var beforeHp = state.hpCurrent, beforeMana = state.manaCurrent, beforeDebuffs = state.debuffs.slice();
    var res = R.applyRest(type, state.hpCurrent, state.manaCurrent, maxMana, state.debuffs);
    state.hpCurrent = res.hp; state.manaCurrent = res.mana; state.debuffs = res.debuffs;
    var ended = beforeDebuffs.filter(function (d) { return res.debuffs.indexOf(d) < 0; });
    var msg = label + ': Health ' + beforeHp + ' → ' + res.hp + ' slots, Mana ' + beforeMana + ' → ' + res.mana
      + (ended.length ? ', ended: ' + ended.join(', ') : ', no injuries ended');
    var el = $('rest-result');
    if (el) el.textContent = msg;
    saveSoon(); renderAll();
    if (el) el.textContent = msg; // renderAll rebuilds Vitals text, not this line, but keep it safe
  }

  /* ---------------- public API (used by inline handlers & wizard) ---------------- */
  window.DCC = {
    getState: function () { return state; },
    setState: function (s) { state = s; },
    blankState: blankState,
    renderAll: renderAll, showTab: showTab, saveNow: saveNow, saveSoon: saveSoon,
    ensureSkills: ensureSkills, ensureItems: ensureItems, ensureRaces: ensureRaces, ensureKeywords: ensureKeywords,
    findLib: findLib, cardRank: cardRank, setRaceClass: setRaceClass, choiceSections: choiceSections,
    openSkillPicker: openSkillPicker, openItemPicker: openItemPicker, openRaceClassPicker: openRaceClassPicker,
    showRaceClassInfo: showRaceClassInfo, openChoicePicker: openChoicePicker, pickerPick: pickerPick,
    setOwnBase: setOwnBase, setOwnEnh: setOwnEnh,
    setRank: function (kind, id, value) {
      var list = kind === 'spell' ? state.spells : state.skills;
      var card = list.find(function (c) { return c.id === id; });
      if (!card) return;
      card.ownRank = R.ownRankForTotal(num(value, 1), gearGivenFor(card), raceGivenFor(card), groupGivenFor(card));
      saveSoon(); renderAll();
    },
    setCardStat: function (kind, id, value) {
      var list = kind === 'spell' ? state.spells : state.skills;
      var card = list.find(function (c) { return c.id === id; });
      if (card) { card.stat = value; saveSoon(); renderAll(); }
    },
    setCardCheck: function (kind, id, value) {
      var list = kind === 'spell' ? state.spells : state.skills;
      var card = list.find(function (c) { return c.id === id; });
      if (card) { card.checkType = value; saveSoon(); renderAll(); }
    },
    setCardEffect: function (kind, id, value) {
      var list = kind === 'spell' ? state.spells : state.skills;
      var card = list.find(function (c) { return c.id === id; });
      if (card) { card.effect = value; saveSoon(); }
    },
    renameCard: function (kind, id, value) {
      var list = kind === 'spell' ? state.spells : state.skills;
      var card = list.find(function (c) { return c.id === id; });
      if (card && value.trim()) { card.name = value.trim(); saveSoon(); renderAll(); }
    },
    toggleUsed: function (kind, id, checked) {
      var list = kind === 'spell' ? state.spells : state.skills;
      var card = list.find(function (c) { return c.id === id; });
      if (card) { card.used = checked; saveSoon(); }
    },
    delCard: function (kind, id) {
      // Manual delete is blocked while a source still gives the card:
      // a bonus-granted card is removed by removing its source, not here.
      var list = kind === 'spell' ? state.spells : state.skills;
      var card = list.find(function (c) { return c.id === id; });
      if (!card) return;
      if (cardFloor(card) > 0) { alert('This card is granted by a race, class, choice, or equipped item. Remove that source (or unequip the item) to remove the card; its rank cannot go below its given floor.'); return; }
      if (kind === 'spell') state.spells = state.spells.filter(function (c) { return c.id !== id; });
      else state.skills = state.skills.filter(function (c) { return c.id !== id; });
      saveSoon(); renderAll();
    },
    delAttack: function (id) { state.attacks = state.attacks.filter(function (a) { return a.id !== id; }); saveSoon(); renderAll(); },
    delItem: function (id) {
      state.items = state.items.filter(function (i) { return i.id !== id; });
      syncGearGrants(); saveSoon(); renderAll();
    },
    renameItem: function (id, value) {
      var it = state.items.find(function (i) { return i.id === id; });
      if (it && value.trim()) { it.name = value.trim(); syncGearGrants(); saveSoon(); renderAll(); }
    },
    setItemSlot: function (id, value) {
      var it = state.items.find(function (i) { return i.id === id; });
      if (it) { it.slot = value; saveSoon(); renderAll(); }
    },
    setEquipped: function (id, on) {
      var it = state.items.find(function (i) { return i.id === id; });
      if (!it) return;
      it.equipped = on;
      syncGearGrants(); saveSoon(); renderAll();
    },
    addBonus: function (id) {
      var it = state.items.find(function (i) { return i.id === id; });
      if (it && (it.bonuses || []).length < 5) { it.bonuses.push({ type: 'stat', stat: 'str', amount: 0 }); saveSoon(); renderAll(); }
    },
    delBonus: function (id, bi) {
      var it = state.items.find(function (i) { return i.id === id; });
      if (it) { it.bonuses.splice(bi, 1); syncGearGrants(); saveSoon(); renderAll(); }
    },
    setBonusType: function (id, bi, v) {
      var it = state.items.find(function (i) { return i.id === id; });
      if (it && it.bonuses[bi]) { it.bonuses[bi].type = v; syncGearGrants(); saveSoon(); renderAll(); }
    },
    setBonusStat: function (id, bi, v) {
      var it = state.items.find(function (i) { return i.id === id; });
      if (it && it.bonuses[bi]) { it.bonuses[bi].stat = v; saveSoon(); renderAll(); }
    },
    setBonusSkill: function (id, bi, v) {
      var it = state.items.find(function (i) { return i.id === id; });
      if (it && it.bonuses[bi]) { it.bonuses[bi].skillName = v; syncGearGrants(); saveSoon(); renderAll(); }
    },
    setBonusKind: function (id, bi, v) {
      var it = state.items.find(function (i) { return i.id === id; });
      if (it && it.bonuses[bi]) { it.bonuses[bi].kind = v; syncGearGrants(); saveSoon(); renderAll(); }
    },
    setBonusAmount: function (id, bi, v) {
      var it = state.items.find(function (i) { return i.id === id; });
      if (it && it.bonuses[bi]) { it.bonuses[bi].amount = num(v, 0); syncGearGrants(); saveSoon(); renderAll(); }
    },
    setSplit: setSplit,
    pickChoice: function (cid, kind, sourceName, amount, category, name) {
      var grant = choiceGrantByCid[cid] || { amount: amount, category: category };
      setChoice(cid, kind, sourceName, grant, 0, name);
    },
    delNote: function (kind, i) {
      if (kind === 'buff') state.buffs.splice(i, 1); else state.debuffs.splice(i, 1);
      saveSoon(); renderAll();
    },
    delHotlist: function (i) { state.hotlist.splice(i, 1); saveSoon(); renderAll(); },
    rollCard: function (kind, id) {
      var list = kind === 'spell' ? state.spells : state.skills;
      var card = list.find(function (c) { return c.id === id; });
      if (!card) return;
      var stats = computeStats();
      rollD20Check(card.name + ' — ' + card.checkType, stats[card.stat] ? stats[card.stat].mod : 0);
    },
    rollAttack: function (id) {
      var a = state.attacks.find(function (x) { return x.id === id; });
      if (!a) return;
      var stats = computeStats();
      rollD20Check(a.name + ' — to hit', stats[a.toHitStat] ? stats[a.toHitStat].mod : 0);
    },
    rollQuick: function (sides) {
      showRoll('d' + sides + ': rolled ' + R.rollDie(sides));
    },
    rollEvade: function () {
      var stats = computeStats();
      var dice = R.evadeDiceCount(raceEntry(), classEntry());
      var modTotal = stats.dex.mod + state.evadeBuffs + equippedBonuses().evade;
      var d20 = R.rollDie(20), d4s = [];
      for (var i = 0; i < dice; i++) d4s.push(R.rollDie(4));
      var parts = [d20].concat(d4s);
      var total = parts.reduce(function (a, b) { return a + b; }, 0) + modTotal;
      var formula = 'd20' + (dice ? ' + ' + dice + 'd4' : '') + ' + ' + modTotal;
      showRoll('Evade: ' + formula + ' = ' + parts.concat([modTotal]).join(' + ') + ' = ' + total);
    },
    distStep: distStep,
    renderPickerList: renderPickerList
  };
  // Keep the choice-grant map current for the picker.
  var origRenderChoices = renderChoices;
  renderChoices = function () {
    choiceGrantByCid = {};
    choiceSections().forEach(function (s) { if (s.type === 'grant') choiceGrantByCid[s.cid] = s.grant; });
    origRenderChoices();
  };

  /* ---------------- static wiring & init ---------------- */
  function bind() {
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.dataset.tab); });
    });
    function onChange(id, fn) { var el = $(id); if (el) el.addEventListener('change', function () { fn(el.value); saveSoon(); renderAll(); }); }
    onChange('f-name', function (v) { state.name = v; });
    onChange('f-number', function (v) { state.number = v; });
    onChange('f-level', function (v) { state.level = Math.max(1, Math.min(250, num(v, 1))); });
    onChange('f-floor', function (v) { state.floor = Math.max(1, num(v, 1)); });
    onChange('f-armor', function (v) { state.ownArmor = Math.max(0, num(v, 0)); });
    onChange('f-evade-buffs', function (v) { state.evadeBuffs = num(v, 0); });
    onChange('f-dr-buffs', function (v) { state.drBuffs = num(v, 0); });
    onChange('t-gold', function (v) { state.gold = num(v, 0); });
    onChange('t-pop', function (v) { state.popularity = num(v, 0); });
    onChange('t-favor', function (v) { state.aiFavor = num(v, 0); });
    onChange('t-move', function (v) { state.moveVal = Math.max(0, num(v, 20)); });
    onChange('t-step', function (v) { state.stepVal = Math.max(0, num(v, 10)); });
    onChange('t-boss', function (v) { state.bossKills = Math.max(0, num(v, 0)); });
    onChange('t-pk', function (v) { state.pkKills = Math.max(0, num(v, 0)); });
    function click(id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); }
    click('btn-export', exportJSON);
    click('btn-import', function () { $('import-file').click(); });
    click('btn-clear', function () {
      if (!confirm('Clear the current sheet? Export a backup first if you want to keep it.')) return;
      state = blankState();
      ensureUnarmed();
      saveNow();
      $('gateway').hidden = false;
      renderAll();
    });
    click('btn-new', function () { $('gateway').hidden = false; });
    click('btn-start-screen', function () { $('gateway').hidden = false; });
    click('gw-close', function () { $('gateway').hidden = true; });
    click('gw-blank', function () {
      if ((state.name || state.skills.length || state.spells.length) && !confirm('Start a blank sheet? This replaces the current sheet.')) return;
      state = blankState(); ensureUnarmed(); saveNow();
      $('gateway').hidden = true; renderAll();
    });
    click('gw-import', function () { $('import-file').click(); });
    click('gw-guided', function () {
      if ((state.name || state.skills.length || state.spells.length) && !confirm('Start guided creation? This replaces the current sheet with a blank one for the wizard.')) return;
      state = blankState(); ensureUnarmed(); saveNow();
      $('gateway').hidden = true;
      if (window.Wizard) window.Wizard.start();
      renderAll();
    });
    click('race-pick', function () { openRaceClassPicker('race'); });
    click('class-pick', function () { openRaceClassPicker('class'); });
    click('race-info', function () { showRaceClassInfo('race'); });
    click('class-info', function () { showRaceClassInfo('class'); });
    click('race-clear', function () { setRaceClass('race', ''); });
    click('class-clear', function () { setRaceClass('class', ''); });
    click('picker-close', function () { $('picker-modal').hidden = true; });
    click('info-close', function () { $('info-modal').hidden = true; });
    click('hp-minus', function () { state.hpCurrent = Math.max(0, state.hpCurrent - 1); saveSoon(); renderAll(); });
    click('hp-plus', function () { state.hpCurrent = Math.min(10, state.hpCurrent + 1); saveSoon(); renderAll(); });
    click('hp-full', function () { state.hpCurrent = 10; saveSoon(); renderAll(); });
    click('mana-minus', function () { state.manaCurrent = Math.max(0, state.manaCurrent - 1); saveSoon(); renderAll(); });
    click('mana-plus', function () { state.manaCurrent = state.manaCurrent + 1; saveSoon(); renderAll(); });
    click('mana-full', function () { state.manaCurrent = R.maxMana(computeStats().int.total); saveSoon(); renderAll(); });
    click('rest-short', function () { doRest('short', 'Short Rest'); });
    click('rest-long', function () { doRest('long', 'Long Rest'); });
    click('rest-fullday', function () { doRest('fullday', "Full Day's Rest"); });
    click('rest-mend', function () { doRest('mend', 'Mend'); });
    click('dice-evade', function () { window.DCC.rollEvade(); });
    click('dice-roll', function () {
      var v = $('dice-formula') ? $('dice-formula').value : '';
      var res = R.rollFormula(v);
      if (!res) { showRoll("That formula didn't parse — try e.g. 2d6+3 (up to 20 dice)."); return; }
      var f = res.count + 'd' + res.sides + (res.mod ? (res.mod > 0 ? '+' : '') + res.mod : '');
      showRoll(f + ': rolled [' + res.rolls.join(', ') + ']' + (res.mod ? ' + ' + res.mod : '') + ' = ' + res.total);
    });
    click('roll-copy', function () {
      var btn = $('roll-copy');
      if (!lastRollText || !navigator.clipboard) return;
      navigator.clipboard.writeText(lastRollText).then(function () {
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = 'Copy result'; }, 2000);
      }).catch(function () {});
    });
    click('buff-add', function () { var v = $('buff-name').value.trim(); if (v) { state.buffs.push(v); $('buff-name').value = ''; saveSoon(); renderAll(); } });
    click('debuff-add', function () { var v = $('debuff-name').value.trim(); if (v) { state.debuffs.push(v); $('debuff-name').value = ''; saveSoon(); renderAll(); } });
    click('hotlist-add', function () {
      var v = $('hotlist-name').value.trim();
      if (!v) return;
      if (state.hotlist.length >= 10) { alert('Hotlist holds up to 10 entries.'); return; }
      state.hotlist.push(v); $('hotlist-name').value = ''; saveSoon(); renderAll();
    });
    click('btn-distribute', openDistribute);
    click('dist-cancel', function () { $('distribute-modal').hidden = true; });
    click('dist-apply', function () {
      var total = 0;
      R.STAT_KEYS.forEach(function (k) { total += distAlloc[k]; state.ownBase[k] += distAlloc[k]; });
      state.statPointsSpent += total;
      $('distribute-modal').hidden = true;
      saveSoon(); renderAll();
    });
    click('skill-pick', function () { openSkillPicker('skill'); });
    click('spell-pick', function () { openSkillPicker('spell'); });
    click('item-pick', openItemPicker);
    click('skill-add', function () {
      state.skills.push({ id: uid(), name: 'New Skill', kind: 'skill', ownRank: 1, stat: 'str', checkType: 'Active Check', effect: '', used: false, gearGrants: {} });
      saveSoon(); renderAll(); showTab('skills');
    });
    click('spell-add', function () {
      state.spells.push({ id: uid(), name: 'New Spell', kind: 'spell', ownRank: 1, stat: 'int', checkType: 'Active Check', effect: '', used: false, gearGrants: {} });
      saveSoon(); renderAll(); showTab('spells');
    });
    click('item-add', function () {
      state.items.push({ id: uid(), name: 'New Item', kind: 'other', slot: 'Other', effect: '', bonuses: [], equipped: false });
      saveSoon(); renderAll(); showTab('inventory');
    });
    click('atk-add', function () {
      var name = $('atk-name').value.trim();
      if (!name) { alert('Give the attack a name first.'); return; }
      state.attacks.push({ id: uid(), name: name, toHitStat: $('atk-stat').value, damage: $('atk-damage').value, notes: $('atk-notes').value });
      $('atk-name').value = ''; $('atk-damage').value = ''; $('atk-notes').value = '';
      saveSoon(); renderAll();
    });
    var imp = $('import-file');
    if (imp) imp.addEventListener('change', function () { if (imp.files[0]) importFile(imp.files[0]); imp.value = ''; });
    var av = $('avatar-file');
    if (av) av.addEventListener('change', function () {
      var f = av.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { state.avatarUrl = rd.result; saveSoon(); renderAll(); };
      rd.readAsDataURL(f);
    });
    click('avatar-remove', function () { state.avatarUrl = ''; saveSoon(); renderAll(); });
    var ps = $('picker-search');
    if (ps) ps.addEventListener('input', function () { if (pickerMode) renderPickerList(pickerMode.candidates); });
    document.querySelectorAll('.overlay').forEach(function (ov) {
      ov.addEventListener('click', function (e) { if (e.target === ov) ov.hidden = true; });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var had = loadSaved();
    ensureUnarmed();
    bind();
    if (had) {
      if (state.activeTab) showTab(state.activeTab); else renderAll();
      // Keep any bonus-created cards consistent with current sources.
      syncGearGrants();
      renderAll();
    } else {
      state.manaCurrent = 1;
      renderAll();
      $('gateway').hidden = false;
    }
  });
})();
