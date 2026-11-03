/* wizard.js — guided creation. Edits the live sheet state (via window.DCC)
 * so the Review step is always the real sheet, never a separate draft.
 * The wizard is always skippable: Skip gives a blank sheet, Exit keeps
 * whatever is on the sheet so far. It never traps the user, and it never
 * runs automatically — it only starts from the gateway's Guided button.
 *
 * Steps: 0 Name, 1 Stats, 2 Race/Class, 3 Starting skills, 4 Starting
 * gear, 5 Review. Race/class choice grants (splits and picks) are handled
 * on the sheet's Choices tab, which the Race/Class step links to.
 */
(function () {
  'use strict';
  var R = window.DCCRules;
  var step = 0;
  var statMethod = 'array';
  var rolled = null; // {str,con,dex,int,cha} from the dice step, if any
  var wizStats = null; // manual/array values being edited in this step

  function S() { return window.DCC.getState(); }
  function refresh() { window.DCC.renderAll(); }
  function el(id) { return document.getElementById(id); }

  function start() {
    step = 0; statMethod = 'array'; rolled = null; wizStats = null;
    el('wizard').hidden = false;
    render();
  }
  function close() { el('wizard').hidden = true; }
  function titles() {
    return ['Name', 'Stats', 'Race & Class', 'Starting skills', 'Starting gear', 'Review'];
  }
  function render() {
    el('wiz-title').textContent = 'Guided creation — Step ' + (step + 1) + ' of 6: ' + titles()[step];
    var body = el('wiz-body');
    if (step === 0) renderName(body);
    else if (step === 1) renderStats(body);
    else if (step === 2) renderRaceClass(body);
    else if (step === 3) renderSkills(body);
    else if (step === 4) renderGear(body);
    else renderReview(body);
    el('wiz-back').style.visibility = step === 0 ? 'hidden' : 'visible';
    el('wiz-next').textContent = step === 5 ? 'Finish — go to sheet' : 'Continue';
  }
  function err(msg) {
    var e = el('wiz-error');
    if (e) e.textContent = msg;
    else {
      var d = document.createElement('p');
      d.id = 'wiz-error'; d.style.color = '#d97a6a'; d.textContent = msg;
      el('wiz-body').appendChild(d);
    }
  }
  function renderName(body) {
    var s = S();
    body.innerHTML = '<div class="wiz-field"><label>What do they call you?</label>'
      + '<input type="text" id="wiz-name" value="' + String(s.name).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" placeholder="e.g. Pip, Marrow, Sable…"></div>'
      + '<p class="hint">Every crawler starts as a fledgling nobody. Race and class come next — in the book, race and class are chosen on the Third Floor, but this sheet lets you pick them now if your campaign starts there.</p>';
    el('wiz-name').addEventListener('change', function () { s.name = el('wiz-name').value.trim(); window.DCC.saveSoon(); });
  }
  function currentStats() {
    if (!wizStats) wizStats = { str: 1, con: 1, dex: 1, int: 1, cha: 1 };
    return wizStats;
  }
  function renderStats(body) {
    if (statMethod === 'array' && !wizStats) wizStats = { str: 6, int: 5, con: 4, dex: 3, cha: 2 };
    var st = currentStats();
    var rows = R.STAT_KEYS.map(function (k) {
      if (statMethod === 'array') {
        var opts = [2, 3, 4, 5, 6].map(function (v) { return '<option value="' + v + '"' + (st[k] === v ? ' selected' : '') + '>' + v + '</option>'; }).join('');
        return '<p>' + k.toUpperCase() + ': <select data-wiz-stat="' + k + '">' + opts + '</select> (mod +' + R.getModifier(st[k]) + ')</p>';
      }
      return '<p>' + k.toUpperCase() + ': <input type="number" min="1" data-wiz-stat="' + k + '" value="' + st[k] + '"> (mod +' + R.getModifier(st[k]) + ')</p>';
    }).join('');
    body.innerHTML = '<p>Five numbers define your crawler.</p>'
      + '<div class="btn-row">'
      + '<button type="button" id="wiz-m-array">Standard array (2 · 3 · 4 · 5 · 6)</button>'
      + '<button type="button" id="wiz-m-roll">Roll dice</button>'
      + '<button type="button" id="wiz-m-manual">Enter your own</button></div>'
      + (statMethod === 'roll' ? '<button type="button" id="wiz-roll">Roll five dice (1s are re-rolled)</button><p class="hint">Each die is a d6; a 1 is re-rolled, so results are 2–6.</p>' : '')
      + (statMethod === 'array' ? '<p class="hint">Standard array: use each of 2, 3, 4, 5, 6 exactly once.</p>' : '')
      + rows;
    el('wiz-m-array').addEventListener('click', function () { statMethod = 'array'; wizStats = { str: 6, int: 5, con: 4, dex: 3, cha: 2 }; render(); });
    el('wiz-m-roll').addEventListener('click', function () { statMethod = 'roll'; render(); });
    el('wiz-m-manual').addEventListener('click', function () { statMethod = 'manual'; render(); });
    var rb = el('wiz-roll');
    if (rb) rb.addEventListener('click', function () {
      rolled = {};
      R.STAT_KEYS.forEach(function (k) {
        var v = 1;
        while (v === 1) v = 1 + Math.floor(Math.random() * 6);
        rolled[k] = v;
      });
      wizStats = Object.assign({}, rolled);
      render();
    });
    body.querySelectorAll('[data-wiz-stat]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        wizStats[inp.dataset.wizStat] = Math.max(1, parseInt(inp.value, 10) || 1);
        render();
      });
    });
  }
  function renderRaceClass(body) {
    var s = S();
    body.innerHTML = '<p>Race: <strong>' + (s.race || '—') + '</strong> <button type="button" id="wiz-race">Pick race</button> '
      + '<button type="button" id="wiz-race-info">?</button> <button type="button" id="wiz-race-clear">Clear</button></p>'
      + '<p>Class: <strong>' + (s.class || '—') + '</strong> <button type="button" id="wiz-class">Pick class</button> '
      + '<button type="button" id="wiz-class-info">?</button> <button type="button" id="wiz-class-clear">Clear</button></p>'
      + '<p class="hint">Picking a race or class applies its fixed bonuses, split pools, and fixed skill/spell bonuses automatically. Split pools and choice picks live on the Choices tab after you finish — or open it from the sheet at any time. Full rulebook text is behind the ? button, never shown all at once.</p>'
      + '<p class="hint">You may leave race and class blank and pick them later on the sheet.</p>';
    el('wiz-race').addEventListener('click', function () { window.DCC.openRaceClassPicker('race'); });
    el('wiz-class').addEventListener('click', function () { window.DCC.openRaceClassPicker('class'); });
    el('wiz-race-info').addEventListener('click', function () { window.DCC.showRaceClassInfo('race'); });
    el('wiz-class-info').addEventListener('click', function () { window.DCC.showRaceClassInfo('class'); });
    el('wiz-race-clear').addEventListener('click', function () { window.DCC.setRaceClass('race', ''); render(); });
    el('wiz-class-clear').addEventListener('click', function () { window.DCC.setRaceClass('class', ''); render(); });
  }
  function renderSkills(body) {
    var s = S();
    body.innerHTML = '<p>Starting skills (including any granted by race/class). Add more from the rulebook or as custom skills.</p>'
      + '<div class="btn-row"><button type="button" id="wiz-skill-pick">Pick from rulebook</button>'
      + '<button type="button" id="wiz-skill-add">Add custom skill</button>'
      + '<button type="button" id="wiz-spell-pick">Pick a spell</button></div>'
      + '<ul>' + s.skills.map(function (c) { return '<li>' + c.name + ' (Rank ' + c.ownRank + ' trained)</li>'; }).join('') + '</ul>'
      + '<ul>' + s.spells.map(function (c) { return '<li>' + c.name + ' (spell, Rank ' + c.ownRank + ' trained)</li>'; }).join('') + '</ul>';
    el('wiz-skill-pick').addEventListener('click', function () { window.DCC.openSkillPicker('skill'); });
    el('wiz-spell-pick').addEventListener('click', function () { window.DCC.openSkillPicker('spell'); });
    el('wiz-skill-add').addEventListener('click', function () {
      var name = prompt('Custom skill name:');
      if (name && name.trim()) { s.skills.push({ id: 'id' + Date.now(), name: name.trim(), kind: 'skill', ownRank: 1, stat: 'str', checkType: 'Active Check', effect: '', used: false, gearGrants: {} }); window.DCC.saveSoon(); render(); }
    });
  }
  function renderGear(body) {
    var s = S();
    body.innerHTML = '<p>Starting gear. Pick from the rulebook or add a custom item; equip it on the Gear tab after finishing.</p>'
      + '<div class="btn-row"><button type="button" id="wiz-item-pick">Pick from rulebook</button>'
      + '<button type="button" id="wiz-item-add">Add custom item</button></div>'
      + '<ul>' + s.items.map(function (i) { return '<li>' + i.name + '</li>'; }).join('') + '</ul>';
    el('wiz-item-pick').addEventListener('click', function () { window.DCC.openItemPicker(); });
    el('wiz-item-add').addEventListener('click', function () {
      var name = prompt('Custom item name:');
      if (name && name.trim()) { s.items.push({ id: 'id' + Date.now(), name: name.trim(), kind: 'other', slot: 'Other', effect: '', bonuses: [], equipped: false }); window.DCC.saveSoon(); render(); }
    });
  }
  function renderReview(body) {
    var s = S();
    refresh();
    // Derived numbers are read from the live sheet after refresh.
    var hpText = el('hp-text') ? el('hp-text').textContent : '';
    var manaText = el('mana-text') ? el('mana-text').textContent : '';
    var evadeText = el('evade-disp') ? el('evade-disp').textContent : '';
    body.innerHTML = '<ul>'
      + '<li>Name set: ' + (s.name || '— (empty)') + '</li>'
      + '<li>Stats: ' + R.STAT_KEYS.map(function (k) { return k.toUpperCase() + ' ' + s.ownBase[k]; }).join(', ') + ' (own base, before race/class bonuses)</li>'
      + '<li>Race: ' + (s.race || '—') + ' · Class: ' + (s.class || '—') + '</li>'
      + '<li>Skills: ' + s.skills.length + ' · Spells: ' + s.spells.length + ' · Items: ' + s.items.length + '</li>'
      + '<li>Health: ' + hpText + ' · Mana: ' + manaText + ' · Evade: ' + evadeText + '</li>'
      + '<li>Level ' + s.level + ', Floor ' + s.floor + ', Stat Bank ' + R.statBank(s.level, s.statPointsSpent) + '</li>'
      + '</ul><p class="hint">Check everything, go Back to change anything, or Finish to go to the sheet. Nothing here is final — the sheet stays fully editable.</p>';
  }
  function applyStatsStep() {
    if (statMethod === 'array') {
      var st = currentStats();
      var vals = R.STAT_KEYS.map(function (k) { return st[k]; }).sort(function (a, b) { return a - b; });
      if (vals.join(',') !== '2,3,4,5,6') { err('Standard array: use each of 2, 3, 4, 5, 6 exactly once.'); return false; }
    }
    var s = S();
    var st2 = currentStats();
    R.STAT_KEYS.forEach(function (k) { s.ownBase[k] = Math.max(1, st2[k]); });
    // A new crawler starts full: 10 HP slots, mana = INT total.
    s.hpCurrent = 10;
    window.DCC.saveSoon();
    refresh();
    return true;
  }
  function next() {
    if (step === 0) {
      var s = S();
      var v = el('wiz-name') ? el('wiz-name').value.trim() : s.name;
      if (!v) { err('Give your crawler a name first — or use Skip wizard to leave the sheet blank.'); return; }
      s.name = v;
    }
    if (step === 1 && !applyStatsStep()) return;
    if (step === 5) { close(); window.DCC.showTab('vitals'); return; }
    step++;
    render();
  }
  function back() { if (step > 0) { step--; render(); } }

  document.addEventListener('DOMContentLoaded', function () {
    var nb = el('wiz-next'), bb = el('wiz-back'), sb = el('wiz-skip'), xb = el('wiz-exit');
    if (nb) nb.addEventListener('click', next);
    if (bb) bb.addEventListener('click', back);
    if (sb) sb.addEventListener('click', function () { close(); window.DCC.showTab('vitals'); });
    if (xb) xb.addEventListener('click', close);
  });

  window.Wizard = { start: start, close: close };
})();
