/*!
 * FPIC Calculator (NC Finance Connect, UNC School of Government)
 * Client-side only. No network calls, no storage, no analytics.
 *
 * Structure:
 *   1. Pure calculation functions (unit-tested in tests/calc.test.js).
 *   2. Formatting helpers.
 *   3. Copy helpers (text comes from data/fpic-data.json).
 *   4. The interface (builds the page inside every [data-fpic-calculator] element).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.FPICCalc = api;
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', api.initAll);
      } else {
        api.initAll();
      }
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 1. Pure calculation functions                                       */
  /* ------------------------------------------------------------------ */

  var MAX_ABS = 1e12; // far above any NC General Fund, keeps integer math exact

  /**
   * Parse a money string. Accepts "$", commas, spaces, a leading minus,
   * a Unicode minus, and (parentheses) for negatives.
   * Returns { status: 'blank' } | { status: 'error' } | { status: 'ok', value }.
   */
  function parseMoney(raw) {
    if (raw === null || raw === undefined) return { status: 'blank' };
    var s = String(raw).replace(/[−‒–—]/g, '-').replace(/\s+/g, '');
    if (s === '') return { status: 'blank' };
    var neg = false;
    if (/^\(.*\)$/.test(s)) {
      neg = true;
      s = s.slice(1, -1);
    }
    var m = /^(-)?\$?(-)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)$/.exec(s);
    if (!m || (m[1] && m[2])) return { status: 'error', reason: 'format' };
    if (m[1] || m[2]) neg = !neg;
    var v = Math.round(parseFloat(m[3].replace(/,/g, '')));
    if (!isFinite(v) || v > MAX_ABS) return { status: 'error', reason: 'range' };
    if (neg) v = -v;
    if (v === 0) v = 0; // normalize -0
    return { status: 'ok', value: v };
  }

  /** Find the band for a unit type and (whole-dollar) expenditures. */
  function bandFor(unitType, expenditures, data) {
    var unit = data.unitTypes[unitType];
    if (!unit) return null;
    var exp = Math.round(expenditures);
    for (var i = 0; i < unit.bands.length; i++) {
      var b = unit.bands[i];
      if (b.upTo === null || exp <= b.upTo) return b;
    }
    return unit.bands[unit.bands.length - 1];
  }

  function thresholdFor(unitType, expenditures, data) {
    var b = bandFor(unitType, expenditures, data);
    return b ? b.pct : null;
  }

  /**
   * Evaluate one year. Comparison uses integer arithmetic
   * (fba * 100 < pct * expenditures) so there is no floating-point drift.
   */
  function evaluate(input, data) {
    var exp = Math.round(input.expenditures);
    var fba = Math.round(input.fba);
    if (!(exp > 0)) return null;
    var band = bandFor(input.unitType, exp, data);
    if (!band) return null;
    var pct = band.pct;
    var lhs = fba * 100;
    var rhs = pct * exp;
    var thresholdDollars = rhs / 100;
    var headroom = fba - thresholdDollars;
    return {
      unitType: input.unitType,
      expenditures: exp,
      fba: fba,
      band: band,
      thresholdPct: pct,
      thresholdDollars: thresholdDollars,
      fbaPct: (fba / exp) * 100,
      isFpic: lhs < rhs,
      atThreshold: lhs === rhs,
      headroomDollars: headroom,
      headroomRounded: Math.round(headroom),
      headroomPoints: (fba / exp) * 100 - pct
    };
  }

  /** What-if: subtract a planned appropriation, expenditures unchanged. */
  function applyAppropriation(input, appropriation, data) {
    return evaluate(
      { unitType: input.unitType, expenditures: input.expenditures, fba: input.fba - appropriation },
      data
    );
  }

  /**
   * rows: chronological array of { label, expenditures, fba } (numbers or null).
   * Returns rows with .complete and .result (evaluation) added.
   */
  function buildTrend(rows, unitType, data) {
    return rows.map(function (r) {
      var complete =
        typeof r.expenditures === 'number' && r.expenditures > 0 && typeof r.fba === 'number';
      return {
        label: r.label,
        expenditures: r.expenditures,
        fba: r.fba,
        complete: complete,
        result: complete
          ? evaluate({ unitType: unitType, expenditures: r.expenditures, fba: r.fba }, data)
          : null
      };
    });
  }

  /**
   * Drift: FBA % fell in each of the last N consecutive years entered
   * (N = data.drift.declines, default 3), ending at the current (last) row.
   */
  /** Compare at the precision shown on screen (0.1 point) so a "decline" is one a reader can see. */
  function round1(x) {
    return Math.round(x * 10) / 10;
  }

  function detectDrift(trendRows, data) {
    var need = (data.drift && data.drift.declines) || 3;
    var streak = 0;
    for (var i = trendRows.length - 1; i > 0; i--) {
      var a = trendRows[i];
      var b = trendRows[i - 1];
      if (a.complete && b.complete && round1(a.result.fbaPct) < round1(b.result.fbaPct)) streak++;
      else break;
    }
    var last = trendRows[trendRows.length - 1];
    var first = trendRows[trendRows.length - 1 - streak];
    return {
      drifting: streak >= need,
      declines: streak,
      from: streak ? first : null,
      to: streak ? last : null
    };
  }

  /* ------------------------------------------------------------------ */
  /* 1b. All 17 indicators                                               */
  /* The registry in fpic-data.json lists every indicator, its type, its */
  /* comparator and its threshold. These functions read that registry.   */
  /* Each comparator states the comparison that CREATES an FPIC.         */
  /* ------------------------------------------------------------------ */

  function isBlank(v) {
    return v === null || v === undefined || v === '';
  }

  function inputNum(inputs, name) {
    var v = inputs[name];
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function cmp(op, a, b) {
    if (op === 'lt') return a < b;
    if (op === 'lte') return a <= b;
    if (op === 'gt') return a > b;
    if (op === 'gte') return a >= b;
    throw new Error('Unknown comparator: ' + op);
  }

  /** Parse a ratio such as 0.62. Blank, error (with a reason) or ok. */
  function parseRatio(raw) {
    if (raw === null || raw === undefined) return { status: 'blank' };
    var s = String(raw).replace(/\s+/g, '');
    if (s === '') return { status: 'blank' };
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return { status: 'error', reason: 'format' };
    var v = parseFloat(s);
    if (!isFinite(v) || v > 1e6) return { status: 'error', reason: 'range' };
    return { status: 'ok', value: v };
  }

  /**
   * Evaluate one indicator.
   * def: an entry from data.indicators (with its id).
   * inputs: a flat object. Numbers (or null) for amounts, 'yes' / 'no' / null for the
   *         yes-or-no rows (keyed by indicator id), and unitType for indicator 1.
   * Returns { status: 'fpic' | 'ok' | 'unchecked', value, valueText, display, message,
   *           prompt, atThreshold, thresholdText, ev }.
   * Percent and ratio comparisons multiply instead of divide, so exact-threshold
   * cases have no floating-point drift.
   */
  function evaluateIndicator(def, inputs, data) {
    inputs = inputs || {};
    var copy = (data && data.copy) || {};
    var res = {
      id: def.id,
      number: def.number,
      status: 'unchecked',
      value: null,
      valueText: null,
      display: null,
      message: null,
      prompt: null,
      atThreshold: false,
      thresholdText: def.thresholdText || '',
      ev: null
    };
    var own = def.type === 'yesNo' ? [def.id] : def.inputs || [];
    var entered = own.some(function (n) {
      return !isBlank(inputs[n]);
    });

    function need(name) {
      if (entered) {
        var reg = (data && data.inputs && data.inputs[name]) || null;
        res.prompt = fill(copy.promptEnter || 'Enter {name} to see a result.', { name: reg ? reg.label : name });
      }
      return res;
    }

    if (def.type === 'yesNo') {
      var a = inputs[def.id];
      if (a !== 'yes' && a !== 'no') return res;
      res.status = a === def.fpicAnswer ? 'fpic' : 'ok';
      res.valueText = a === 'yes' ? copy.yes || 'Yes' : copy.no || 'No';
      return res;
    }

    if (def.type === 'bandedPercent') {
      var exp = inputNum(inputs, 'exp');
      var fba = inputNum(inputs, 'fba');
      if (exp === null || !(exp > 0)) return need('exp');
      if (fba === null) return need('fba');
      if (!inputs.unitType || !data.unitTypes[inputs.unitType]) {
        if (entered) res.prompt = copy.promptUnit || 'Choose a unit type to see a result.';
        return res;
      }
      var ev = evaluate({ unitType: inputs.unitType, expenditures: exp, fba: fba }, data);
      res.ev = ev;
      res.status = ev.isFpic ? 'fpic' : 'ok';
      res.value = ev.fbaPct;
      res.valueText = formatPct(ev.fbaPct, ev.thresholdPct, ev.isFpic);
      res.display = def.display ? fill(def.display, { value: res.valueText }) : null;
      res.atThreshold = ev.atThreshold;
      res.thresholdText = def.thresholdTextChecked ? fill(def.thresholdTextChecked, { pct: ev.thresholdPct }) : res.thresholdText;
      return res;
    }

    // percentOfBase and value: one number compared with one threshold.
    var names = def.uses || def.inputs;
    var vals = names.map(function (n) {
      return inputNum(inputs, n);
    });
    var lhs, rhs, value;
    if (def.type === 'percentOfBase' || (def.type === 'value' && def.formula === 'ratio')) {
      var num = vals[0];
      var den = vals[1];
      if (num === null) return need(names[0]);
      if (den === null || !(den > 0)) return need(names[1]);
      var scale = def.type === 'percentOfBase' ? 100 : 1;
      lhs = num * scale;
      rhs = def.threshold * den;
      value = lhs / den;
    } else if (def.formula === 'difference') {
      if (vals[0] === null) return need(names[0]);
      if (vals[1] === null) return need(names[1]);
      value = vals[0] - vals[1];
      lhs = value;
      rhs = def.threshold;
    } else {
      if (vals[0] === null) return need(names[0]);
      value = vals[0];
      lhs = value;
      rhs = def.threshold;
    }
    res.value = value;
    res.atThreshold = lhs === rhs;
    res.status = cmp(def.comparator, lhs, rhs) ? 'fpic' : 'ok';
    if (def.valueFormat === 'percent') res.valueText = formatNear(value, def.threshold, 1, '%');
    else if (def.valueFormat === 'ratio') res.valueText = formatNear(value, def.threshold, def.valueDecimals || 1, '');
    else res.valueText = formatDollars(value);
    res.display = def.display ? fill(def.display, { value: res.valueText }) : null;
    res.message = res.atThreshold && def.exactlyMsg ? def.exactlyMsg : null;
    return res;
  }

  /** Indicator ids in the guide's table order (by number). */
  function indicatorOrder(data) {
    return Object.keys(data.indicators).sort(function (x, y) {
      return data.indicators[x].number - data.indicators[y].number;
    });
  }

  /**
   * Evaluate every indicator. opts.groups (optional) limits the group ids counted.
   * The total is the number of indicators in the groups shown: always 17 when all
   * three groups are shown, whether or not the water and sewer group is open.
   */
  function evaluateAll(inputs, data, opts) {
    var allowed = null;
    if (opts && opts.groups && opts.groups.length) {
      allowed = {};
      data.groups.forEach(function (g) {
        if (opts.groups.indexOf(g.id) > -1) g.indicators.forEach(function (id) { allowed[id] = true; });
      });
    }
    var results = [];
    indicatorOrder(data).forEach(function (id) {
      if (allowed && !allowed[id]) return;
      var def = data.indicators[id];
      var r = evaluateIndicator(def, inputs, data);
      r.label = def.label;
      results.push(r);
    });
    var counts = { total: results.length, checked: 0, fpic: 0, unchecked: 0 };
    results.forEach(function (r) {
      if (r.status === 'unchecked') counts.unchecked++;
      else counts.checked++;
      if (r.status === 'fpic') counts.fpic++;
    });
    return { results: results, counts: counts };
  }

  /**
   * What-if for indicators 1, 2 and 3. The same appropriation is subtracted from
   * fund balance available and from total fund balance; expenditures and the prior
   * year-end balance are unchanged, so the change in fund balance drops by the same amount.
   */
  function applyAppropriationAll(inputs, appropriation, data) {
    var sc = {};
    Object.keys(inputs).forEach(function (k) {
      sc[k] = inputs[k];
    });
    if (typeof inputs.fba === 'number') sc.fba = inputs.fba - appropriation;
    if (typeof inputs.totalFb === 'number') sc.totalFb = inputs.totalFb - appropriation;
    function three(inp) {
      return {
        inputs: inp,
        fba: evaluateIndicator(data.indicators.fba, inp, data),
        apprFb: evaluateIndicator(data.indicators.apprFb, inp, data),
        totalFb: evaluateIndicator(data.indicators.totalFb, inp, data)
      };
    }
    return { baseline: three(inputs), scenario: three(sc) };
  }


  /**
   * Mark every indicator in the given groups "not applicable" (for example water and sewer
   * when the unit has no such fund). Returns a new array; the input is not changed.
   * A not-applicable row keeps its place in the list and in the total of 17.
   */
  function markNotApplicable(results, groupIds, data) {
    var na = {};
    (groupIds || []).forEach(function (gid) {
      data.groups.forEach(function (g) {
        if (g.id === gid) g.indicators.forEach(function (id) { na[id] = true; });
      });
    });
    return results.map(function (r) {
      if (!na[r.id]) return r;
      var out = {};
      Object.keys(r).forEach(function (k) { out[k] = r[k]; });
      out.status = 'na';
      out.value = null;
      out.valueText = null;
      out.display = null;
      out.message = null;
      out.prompt = null;
      out.atThreshold = false;
      out.ev = null;
      return out;
    });
  }

  /**
   * Count results by status. fpic + ok + unchecked + na always equals total,
   * so the four tallies on screen always add up to the number of rows shown
   * (17 when all three groups are shown).
   */
  function tally(results) {
    var t = { total: results.length, fpic: 0, ok: 0, unchecked: 0, na: 0, checked: 0 };
    results.forEach(function (r) {
      if (r.status === 'fpic') t.fpic++;
      else if (r.status === 'ok') t.ok++;
      else if (r.status === 'na') t.na++;
      else t.unchecked++;
    });
    t.checked = t.fpic + t.ok;
    return t;
  }


  /* ------------------------------------------------------------------ */
  /* 2. Formatting helpers                                               */
  /* ------------------------------------------------------------------ */

  function withCommas(n) {
    return String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatDollars(n) {
    var r = Math.round(n);
    return (r < 0 ? '-$' : '$') + withCommas(r);
  }

  function trimZeros(s) {
    return s.indexOf('.') === -1 ? s : s.replace(/\.?0+$/, '');
  }

  /**
   * Format a percent so the rounded text never contradicts the result:
   * if a value just below the threshold would round up to the threshold,
   * add decimals until it shows as below.
   */
  function formatPct(value, thresholdPct, isFpic, trim) {
    var d = 1;
    var s = value.toFixed(d);
    if (typeof thresholdPct === 'number') {
      while (d < 3 && isFpic !== parseFloat(s) < thresholdPct) {
        d++;
        s = value.toFixed(d);
      }
    }
    if (typeof thresholdPct === 'number' && isFpic && !(parseFloat(s) < thresholdPct)) {
      // Too close to the line to show honestly as a rounded number.
      return 'Under ' + thresholdPct + '%';
    }
    return (trim ? trimZeros(s) : s) + '%';
  }

  /** "5 points", "1 point", "0.4 points", "less than 0.01 points". */
  function formatPoints(value) {
    var abs = Math.abs(value);
    var s = abs.toFixed(1);
    if (parseFloat(s) === 0 && abs > 0) s = abs.toFixed(2);
    if (parseFloat(s) === 0 && abs > 0) return 'less than 0.01 points';
    s = trimZeros(s);
    return s + (s === '1' ? ' point' : ' points');
  }

  /**
   * Dollars above or below the threshold, never showing "$0" for a result that is
   * on one side of the line. big = true gives the short tile form.
   */
  function formatGap(ev, big) {
    if (!ev.atThreshold && Math.abs(ev.headroomDollars) < 1 && Math.round(ev.headroomDollars) === 0) {
      return big ? 'Under $1' : 'less than $1';
    }
    return formatDollars(Math.abs(ev.headroomRounded));
  }

  function formatInputNumber(n) {
    return (n < 0 ? '-' : '') + withCommas(n);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ------------------------------------------------------------------ */
  /* 3. Copy helpers                                                     */
  /* ------------------------------------------------------------------ */

  /** Replace {name} placeholders. Values are inserted as-is (callers escape). */
  function fill(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
    });
  }

  function link(l, sr) {
    return (
      '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.text) +
      '<span class="fpic-sr"> (opens in a new tab)</span></a>'
    );
  }

  /**
   * Format a value so the rounded text never looks equal to the threshold when the
   * value is not. Starts at `decimals` places and adds places (up to 4) while the
   * rounded text equals the threshold. If it still does, say "Just under/over".
   * Example: 16.04 against a threshold of 16 shows "16.04%", not "16.0%".
   */
  function formatNear(value, threshold, decimals, suffix) {
    var d = decimals;
    var s = value.toFixed(d);
    while (parseFloat(s) === threshold && value !== threshold && d < 4) {
      d++;
      s = value.toFixed(d);
    }
    if (parseFloat(s) === threshold && value !== threshold) {
      return (value < threshold ? 'Just under ' : 'Just over ') + threshold + suffix;
    }
    return s + suffix;
  }


  /* ------------------------------------------------------------------ */
  /* 4. Interface                                                        */
  /* ------------------------------------------------------------------ */

  var instanceCount = 0;

  var ICON_UP =
    '<svg class="fpic-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M4 4h16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M12 20V9m0 0-5 5m5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_DOWN =
    '<svg class="fpic-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M4 20h16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M12 4v11m0 0-5-5m5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_LOCK =
    '<svg class="fpic-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  var ICON_ALERT =
    '<svg class="fpic-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v6m0 3.5v.01" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';


  var ICON_CHIP_FPIC =
    '<svg class="fpic-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3.5 22 20.5H2Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 10v5m0 2.6v.01" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  var ICON_CHIP_OK =
    '<svg class="fpic-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m7.8 12.4 3.1 3.1 5.4-6.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_CHIP_NONE =
    '<svg class="fpic-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="3 3"/><path d="M8 12h8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

  function chipKind(status) {
    return status === 'fpic' ? 'fpic' : status === 'ok' ? 'ok' : status === 'na' ? 'na' : 'none';
  }

  function chipIcon(status) {
    var k = chipKind(status);
    return k === 'fpic' ? ICON_CHIP_FPIC : k === 'ok' ? ICON_CHIP_OK : ICON_CHIP_NONE;
  }


  function mount(el, data) {
    var id = 'fpic' + ++instanceCount;
    var c = data.copy;
    var trendNames = c.trendRowNames;
    var wanted = (el.getAttribute('data-groups') || '')
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    var groups = data.groups.filter(function (g) { return !wanted.length || wanted.indexOf(g.id) > -1; });
    if (!groups.length) groups = data.groups;
    var shownIds = groups.map(function (g) { return g.id; });
    var hasGeneral = shownIds.indexOf('general') > -1;
    var hasWater = shownIds.indexOf('water') > -1;
    var shownTotal = groups.reduce(function (n, g) { return n + g.indicators.length; }, 0);
    var state = {
      exampleActive: false, chartRows: null, focusName: '', whatIfMsg: '',
      announceTimer: null, lastAnnounce: '', step: 0
    };
    var steps = [{ key: 'welcome' }, { key: 'unit' }]
      .concat(groups.map(function (g) { return { key: 'group', group: g }; }))
      .concat([{ key: 'results' }]);
    var totalSteps = steps.length - 1;
    var unitName = ids('unit');
    var waterName = ids('water');

    function $(sel) {
      return el.querySelector(sel);
    }
    function ids(name) {
      return id + '-' + name;
    }

    function $(sel) {
      return el.querySelector(sel);
    }
    function ids(name) {
      return id + '-' + name;
    }

    function errorP(name) {
      return (
        '<p class="fpic-error" id="' + ids(name) + '-err" hidden>' + ICON_ALERT +
        '<span class="fpic-error__text"></span></p>'
      );
    }

    function moneyField(name, label, help, extra) {
      extra = extra || {};
      return (
        '<div class="fpic-field">' +
        '<label class="fpic-label" for="' + ids(name) + '">' + esc(label) + '</label>' +
        (help ? '<p class="fpic-help" id="' + ids(name) + '-help">' + help + '</p>' : '') +
        '<div class="fpic-money' + (extra.ratio ? ' fpic-money--ratio' : '') + '">' +
        (extra.ratio ? '' : '<span class="fpic-money__sign" aria-hidden="true">$</span>') +
        '<input class="fpic-input" type="text" id="' + ids(name) + '" data-name="' + name + '"' +
        ' inputmode="' + (extra.signed ? 'text' : 'decimal') + '" autocomplete="off" spellcheck="false"' +
        ' aria-describedby="' + (help ? ids(name) + '-help ' : '') + ids(name) + '-err"></div>' +
        errorP(name) +
        '</div>'
      );
    }

    function fieldHtml(name) {
      var r = data.inputs[name];
      return moneyField(name, r.label, r.help ? esc(r.help) : '', { signed: r.signed, ratio: r.kind === 'ratio' });
    }

    function unitRadios() {
      var out = '';
      Object.keys(data.unitTypes).forEach(function (key) {
        out +=
          '<label class="fpic-radio fpic-radio--card"><input type="radio" name="' + unitName + '" value="' + key + '">' +
          '<span><span class="fpic-radio__t">' + esc(data.unitTypes[key].label) + '</span>' +
          '<span class="fpic-radio__d">' + esc((c.unitDesc && c.unitDesc[key]) || '') + '</span></span></label>';
      });
      return out;
    }

    /* ---------------- markup ---------------- */

    function yesNoRadios(name, labelledBy) {
      return (
        '<div class="fpic-yn" role="radiogroup" aria-labelledby="' + labelledBy + '">' +
        ['yes', 'no']
          .map(function (v) {
            return (
              '<label class="fpic-radio fpic-radio--yn"><input type="radio" name="' + name + '" value="' + v + '">' +
              '<span>' + esc(v === 'yes' ? c.yes : c.no) + '</span></label>'
            );
          })
          .join('') +
        '</div>'
      );
    }

    function moreHtml(def) {
      var panelId = ids('more-' + def.id);
      var inner = '<p><strong>' + esc(c.officialLabel) + '</strong> ' + esc(def.label) + '</p>';
      inner += '<p><strong>' + esc(c.ruleLabel) + '</strong> ' + esc(def.fpicWhen) + '.</p>';
      if (def.type === 'yesNo' && def.help) inner += '<p>' + esc(def.help) + '</p>';
      inner += '<p>' + esc(def.why) + '</p>';
      inner +=
        '<p class="fpic-help">' +
        fill(esc(c.whySource), { guideLink: link(data.links.lgcGuide), ref: esc(def.guideRef) }) +
        '</p>';
      return (
        '<div class="fpic-more">' +
        '<button type="button" class="fpic-more__btn" data-action="more" aria-expanded="false" aria-controls="' + panelId + '">' +
        '<span class="fpic-more__icon" aria-hidden="true">i</span><span>' + esc(c.why) +
        '<span class="fpic-sr"> ' + esc(def.plainLabel) + '</span></span></button>' +
        '<div class="fpic-more__panel" id="' + panelId + '" hidden>' + inner + '</div>' +
        '</div>'
      );
    }

    function rowHtml(def) {
      var yn = def.type === 'yesNo';
      var titleId = ids('title-' + def.id);
      var body;
      if (yn) {
        body = '<div class="fpic-row__body">' + yesNoRadios(ids(def.id), titleId) + '</div>';
      } else {
        body =
          '<div class="fpic-row__body"><div class="fpic-row__inputs">' + def.inputs.map(fieldHtml).join('') + '</div>' +
          (def.help ? '<p class="fpic-help">' + esc(def.help) + '</p>' : '') + '</div>';
      }
      return (
        '<li class="fpic-row' + (yn ? ' fpic-row--yn' : '') + '" id="' + ids('row-' + def.id) + '" tabindex="-1" data-indicator="' + def.id + '" data-status="unchecked">' +
        '<h4 class="fpic-row__name" id="' + titleId + '"><span class="fpic-row__num">' + def.number + '</span><span>' +
        esc(yn ? def.question : def.plainLabel) + '</span></h4>' +
        '<div class="fpic-row__chip" data-role="chip-' + def.id + '"></div>' +
        body +
        '<p class="fpic-row__value" data-role="value-' + def.id + '"></p>' +
        (def.type === 'bandedPercent' ? '<div class="fpic-row__detail" data-role="detail-' + def.id + '"></div>' : '') +
        moreHtml(def) +
        '</li>'
      );
    }

    function yearRows() {
      var out = '';
      for (var i = 0; i < 3; i++) {
        out +=
          '<fieldset class="fpic-yearrow">' +
          '<legend>' + esc(trendNames[i]) + '</legend>' +
          '<div class="fpic-yearrow__grid">' +
          '<div class="fpic-field"><label class="fpic-label" for="' + ids('y' + i + '-label') + '">' + esc(c.trendYear) + '</label>' +
          '<input class="fpic-input" type="text" id="' + ids('y' + i + '-label') + '" data-name="y' + i + '-label" autocomplete="off" placeholder="' + esc(c.trendYearPlaceholder) + '"></div>' +
          moneyField('y' + i + '-exp', c.trendExpenditures) +
          moneyField('y' + i + '-fba', c.trendFba, '', { signed: true }) +
          '</div>' +
          '<p class="fpic-error" id="' + ids('y' + i) + '-err" hidden>' + ICON_ALERT + '<span class="fpic-error__text"></span></p>' +
          '</fieldset>';
      }
      out +=
        '<fieldset class="fpic-yearrow fpic-yearrow--current">' +
        '<legend>' + esc(trendNames[3]) + '</legend>' +
        '<div class="fpic-yearrow__grid">' +
        '<div class="fpic-field"><label class="fpic-label" for="' + ids('y3-label') + '">' + esc(c.trendYear) + '</label>' +
        '<input class="fpic-input" type="text" id="' + ids('y3-label') + '" data-name="y3-label" autocomplete="off" placeholder="' + esc(c.trendCurrentPlaceholder) + '"></div>' +
        '<p class="fpic-help fpic-yearrow__note">' + esc(c.trendCurrentNote) + '</p>' +
        '</div></fieldset>';
      return out;
    }

    function goCard(key, title, text) {
      return (
        '<div class="fpic-gocard"><h4 class="fpic-gocard__t">' + esc(title) + '</h4><p>' + esc(text) + '</p>' +
        '<button type="button" class="fpic-btn fpic-btn--secondary fpic-gocard__btn" data-action="tool" data-tool="' + key + '"' +
        ' aria-expanded="false" aria-controls="' + ids('tool-' + key) + '"><span data-role="toollabel-' + key + '">' + esc(c.toolOpen) + '</span>' +
        '<span class="fpic-sr"> ' + esc(title) + '</span></button></div>'
      );
    }

    function goFurther() {
      return (
        '<section class="fpic-go" aria-labelledby="' + ids('h-go') + '">' +
        '<div class="fpic-noprint fpic-go__intro">' +
        '<h3 class="fpic-h" id="' + ids('h-go') + '">' + esc(c.goFurtherHeading) + '</h3>' +
        '<div class="fpic-go__cards">' +
        goCard('whatif', c.whatIfCardTitle, c.whatIfCardText) +
        goCard('trend', c.trendCardTitle, c.trendCardText) +
        '</div></div>' +
        '<div class="fpic-section fpic-toolsection" id="' + ids('tool-whatif') + '" data-role="tool-whatif" hidden>' +
        '<h4 class="fpic-h fpic-printonly">' + esc(c.whatIfHeading) + '</h4>' +
        '<div class="fpic-toolbody">' +
        '<h4 class="fpic-h fpic-noprint">' + esc(c.whatIfHeading) + '</h4>' +
        '<p class="fpic-lede fpic-noprint">' + esc(c.whatIfIntro) + '</p>' +
        '<div class="fpic-noprint">' + moneyField('appr', c.appropriationLabel, esc(c.appropriationHelp)) + '</div>' +
        '<div data-role="whatif"></div>' +
        '</div></div>' +
        '<div class="fpic-section fpic-toolsection" id="' + ids('tool-trend') + '" data-role="tool-trend" hidden>' +
        '<h4 class="fpic-h fpic-printonly">' + esc(c.trendHeading) + '</h4>' +
        '<div class="fpic-toolbody">' +
        '<h4 class="fpic-h fpic-noprint">' + esc(c.trendHeading) + '</h4>' +
        '<p class="fpic-lede fpic-noprint">' + esc(c.trendIntro) + '</p>' +
        '<div class="fpic-years fpic-noprint">' + yearRows() + '</div>' +
        '<div data-role="trend"></div>' +
        '</div></div>' +
        '</section>'
      );
    }

    function waterGate() {
      var q = ids('water-q');
      return (
        '<div class="fpic-gate">' +
        '<p class="fpic-gate__q" id="' + q + '">' + esc(c.waterQuestion) + '</p>' +
        yesNoRadios(waterName, q) +
        '<p class="fpic-help fpic-gate__note" data-role="water-hint">' + esc(c.waterHint) + '</p>' +
        '<p class="fpic-help fpic-gate__note" data-role="water-na" hidden>' + esc(c.waterNaNote) + '</p>' +
        '</div>'
      );
    }

    /** Wraps one screen of the guided flow. */
    function stepShell(i, title, intro, inner, meta, extraClass, attrs) {
      var hid = ids('step-h-' + i);
      return (
        '<section ' + (attrs || '') + ' class="fpic-step ' + (extraClass || 'fpic-noprint') + '" data-step="' + i + '" hidden aria-labelledby="' + hid + '">' +
        '<header class="fpic-step__head fpic-noprint"><div class="fpic-step__lead">' +
        '<p class="fpic-kicker">' + esc(fill(c.stepOf, { n: i, total: totalSteps })) + '</p>' +
        '<h2 class="fpic-step__title" id="' + hid + '" tabindex="-1">' + esc(title) + '</h2>' +
        (intro ? '<p class="fpic-step__intro">' + esc(intro) + '</p>' : '') +
        '</div>' + (meta || '') + '</header>' + inner + '</section>'
      );
    }

    function welcomeHtml() {
      return (
        '<section class="fpic-step fpic-noprint fpic-welcome" data-step="0" aria-labelledby="' + ids('step-h-0') + '">' +
        '<div class="fpic-card fpic-card--hero">' +
        '<h2 class="fpic-step__title fpic-step__title--xl" id="' + ids('step-h-0') + '" tabindex="-1">' + esc(c.welcomeHeading) + '</h2>' +
        '<p class="fpic-welcome__lede">' + esc(c.purpose) + '</p>' +
        '<ol class="fpic-how">' +
        c.welcomeSteps.map(function (s, i) {
          return '<li><span class="fpic-how__n" aria-hidden="true">' + (i + 1) + '</span><span class="fpic-how__t">' + esc(s.title) +
            '</span><span class="fpic-how__d">' + esc(s.text) + '</span></li>';
        }).join('') +
        '</ol>' +
        '<p class="fpic-need"><strong>' + esc(c.needTitle) + ':</strong> ' + esc(c.needText) + '</p>' +
        '<div class="fpic-actions fpic-actions--start">' +
        '<button type="button" class="fpic-btn fpic-btn--primary fpic-btn--lg" data-action="start">' + esc(c.startButton) + '</button>' +
        '<button type="button" class="fpic-btn fpic-btn--ghost" data-action="example">' + esc(c.exampleButton) + '</button>' +
        '</div>' +
        '<p class="fpic-privacy">' + ICON_LOCK + '<span>' + esc(c.privacy) + '</span>' +
        '<button type="button" class="fpic-linkbtn" data-action="terms">' + esc(c.termsLink) + '</button></p>' +
        '</div></section>'
      );
    }

    function unitHtml() {
      return stepShell(
        1, c.stepUnit, '',
        '<div class="fpic-card fpic-noprint">' +
        '<div class="fpic-controls">' +
        '<fieldset class="fpic-field fpic-field--unit"><legend class="fpic-label">' + esc(c.unitTypeLabel) + '</legend>' +
        '<p class="fpic-help" id="' + ids('unit-help') + '">' + esc(c.unitTypeHelp) + '</p>' +
        '<div class="fpic-choices">' + unitRadios() + '</div></fieldset>' +
        '<div class="fpic-field fpic-field--name"><label class="fpic-label" for="' + ids('name') + '">' + esc(c.unitNameLabel) + '</label>' +
        '<p class="fpic-help" id="' + ids('name-help') + '">' + esc(c.unitNameHelp) + '</p>' +
        '<input class="fpic-input" type="text" id="' + ids('name') + '" data-name="name" autocomplete="off" aria-describedby="' + ids('name-help') + '"></div>' +
        '</div></div>'
      );
    }

    function groupStepHtml(i, g) {
      var rows =
        '<ol class="fpic-rows" data-role="rows-' + g.id + '">' +
        g.indicators.map(function (k) { return rowHtml(data.indicators[k]); }).join('') +
        '</ol>';
      var meta =
        '<div class="fpic-step__meta"><span class="fpic-step__prog" data-role="prog-' + g.id + '"></span>' +
        '<span data-role="badge-' + g.id + '"></span></div>';
      return stepShell(
        i, g.label, g.intro || '',
        '<div class="fpic-card fpic-noprint">' + (g.id === 'water' ? waterGate() : '') + rows + '</div>',
        meta, 'fpic-noprint', 'data-group="' + g.id + '"'
      );
    }

    function resultsShell() {
      return stepShell(
        steps.length - 1, c.resultsHeading, '',
        '<div data-role="results" class="fpic-results fpic-noprint"></div>' +
        (hasGeneral ? goFurther() : '') +
        '<div class="fpic-actions fpic-noprint fpic-actions--end">' +
        '<button type="button" class="fpic-btn fpic-btn--primary" data-action="print">' + esc(c.printButton) + '</button>' +
        '<button type="button" class="fpic-btn fpic-btn--ghost" data-action="back">' + esc(c.backButton) + '</button>' +
        '<button type="button" class="fpic-btn fpic-btn--ghost" data-action="startover">' + esc(c.startOver) + '</button>' +
        '</div>',
        '', 'fpic-results-step'
      );
    }

    function stepperHtml() {
      return (
        '<div class="fpic-progress fpic-noprint" data-role="progress" hidden>' +
        '<nav aria-label="' + esc(c.progressLabel) + '"><ol class="fpic-stepper">' +
        steps.slice(1).map(function (s, k) {
          var idx = k + 1;
          var label = s.key === 'unit' ? c.stepUnit : s.key === 'results' ? c.stepResults : (s.group.short || s.group.label);
          return '<li data-stepper="' + idx + '"><button type="button" data-action="goto" data-step="' + idx + '">' +
            '<span class="fpic-stepper__bar" aria-hidden="true"></span><span class="fpic-stepper__lab"><span class="fpic-stepper__n">' + idx + '</span><span class="fpic-stepper__t">' + esc(label) + '</span></span></button></li>';
        }).join('') +
        '</ol></nav>' +
        '<p class="fpic-mini" data-role="mini"></p>' +
        '</div>'
      );
    }

    function navHtml() {
      return (
        '<div class="fpic-nav fpic-noprint" data-role="nav" hidden>' +
        '<button type="button" class="fpic-btn fpic-btn--ghost" data-action="back"><span aria-hidden="true">&larr;</span> ' + esc(c.backButton) + '</button>' +
        '<button type="button" class="fpic-btn fpic-btn--primary" data-action="next" data-role="next-btn">' + esc(c.nextButton) + '</button>' +
        '</div>'
      );
    }

    function termsHtml() {
      return (
        '<details class="fpic-terms fpic-noprint" data-role="terms"><summary>' + esc(c.termsHeading) + '</summary><dl>' +
        c.terms.map(function (t) { return '<div><dt>' + esc(t.term) + '</dt><dd>' + esc(t.def) + '</dd></div>'; }).join('') +
        '</dl></details>'
      );
    }

    var html =
      '<div class="fpic-tool">' +
      '<header class="fpic-head">' +
      '<p class="fpic-eyebrow">' + esc(c.eyebrow) + '</p>' +
      '<h1 class="fpic-title">' + esc(c.title) + '</h1>' +
      '<p class="fpic-tagline">' + esc(c.tagline) + '</p>' +
      '</header>' +
      (data.draftNotice ? '<p class="fpic-draft">' + esc(data.draftNotice) + '</p>' : '') +
      '<div class="fpic-sr" role="status" aria-live="polite" aria-atomic="true" data-role="announce"></div>' +
      stepperHtml() +
      '<p class="fpic-banner fpic-noprint" data-role="example-note" hidden><span>' + esc(c.exampleBanner) + '</span>' +
      '<button type="button" class="fpic-linkbtn" data-action="clearstart">' + esc(c.clearExample) + '</button></p>' +
      '<section class="fpic-section fpic-printonly" data-role="print-inputs"></section>' +
      '<div class="fpic-flow">' +
      welcomeHtml() +
      unitHtml() +
      groups.map(function (g, k) { return groupStepHtml(k + 2, g); }).join('') +
      resultsShell() +
      navHtml() +
      '</div>' +
      '<footer class="fpic-foot">' +
      termsHtml() +
      '<p>' +
      fill(esc(c.footerSource), {
        guideLink: link(data.links.lgcGuide),
        articleLink: link(data.links.article),
        lgcLink: link(data.links.lgcFpic),
        asOf: esc(data.thresholdsAsOf),
        checked: esc(data.thresholdsCheckedOn)
      }) +
      '</p>' +
      '<p>' + fill(esc(c.footerLinks), { myth8Link: link(data.links.myth8) }) + '</p>' +
      '<p class="fpic-foot__disclaimer">' + esc(c.footerDisclaimer) + '</p>' +
      '</footer>' +
      '</div>';

    // The template above escapes copy first and then inserts trusted link HTML.
    // fill() runs on the escaped string, so link markup is not escaped again.
    el.innerHTML = html;

    /* ---------------- reading inputs ---------------- */

    function val(name) {
      var n = $('[data-name="' + name + '"]');
      return n ? n.value : '';
    }

    function setVal(name, v) {
      var n = $('[data-name="' + name + '"]');
      if (n) n.value = v;
    }

    function unitType() {
      var r = $('input[name="' + unitName + '"]:checked');
      return r ? r.value : '';
    }

    function answer(indicatorId) {
      var r = $('input[name="' + ids(indicatorId) + '"]:checked');
      return r ? r.value : null;
    }

    function setError(name, msg) {
      var p = $('#' + ids(name) + '-err');
      var input = $('[data-name="' + name + '"]');
      if (!p) return;
      if (msg) {
        p.hidden = false;
        p.querySelector('.fpic-error__text').textContent = msg;
        if (input) input.setAttribute('aria-invalid', 'true');
      } else {
        p.hidden = true;
        p.querySelector('.fpic-error__text').textContent = '';
        if (input) input.removeAttribute('aria-invalid');
      }
    }

    /** Parse one money field and set its error message. Returns the parse result. */
    function readMoney(name, opts) {
      opts = opts || {};
      var p = parseMoney(val(name));
      var msg = '';
      var midTyping = false;
      if (p.status === 'error') {
        msg = p.reason === 'range' ? c.errTooLarge : c.errNotNumber;
        // Do not scold while the person is still typing (for example "20,0" on the way to "20,000").
        midTyping = p.reason === 'format' && state.focusName === name;
      }
      else if (p.status === 'ok' && opts.positive && p.value <= 0) msg = opts.positiveMsg || c.errExpendituresPositive;
      else if (p.status === 'ok' && opts.nonNegative && p.value < 0) msg = c.errNegative;
      if (!opts.silent) setError(name, midTyping ? '' : msg);
      if (msg) p = { status: 'error' };
      return p;
    }

    function readRatio(name) {
      var p = parseRatio(val(name));
      var msg = '';
      var midTyping = false;
      if (p.status === 'error') {
        msg = p.reason === 'range' ? c.errTooLarge : c.errRatio;
        midTyping = p.reason === 'format' && state.focusName === name;
      }
      setError(name, midTyping ? '' : msg);
      if (msg) p = { status: 'error' };
      return p;
    }

    /** Read every field. Returns the flat inputs object for evaluateAll and the parse results. */
    function readInputs() {
      var inputs = { unitType: unitType() };
      var parsed = {};
      Object.keys(data.inputs).forEach(function (name) {
        var r = data.inputs[name];
        var p;
        if (r.kind === 'ratio') p = readRatio(name);
        else if (r.base) p = readMoney(name, { positive: true, positiveMsg: name === 'exp' ? c.errExpendituresPositive : c.errBasePositive });
        else if (r.signed) p = readMoney(name);
        else p = readMoney(name, { nonNegative: true });
        parsed[name] = p;
        inputs[name] = p.status === 'ok' ? p.value : null;
      });
      Object.keys(data.indicators).forEach(function (k) {
        if (data.indicators[k].type === 'yesNo') inputs[k] = answer(k);
      });
      return { inputs: inputs, parsed: parsed };
    }

    /* ---------------- rendering ---------------- */

    function niceCeil(x) {
      if (x <= 10) return 10;
      if (x <= 50) return Math.ceil(x / 10) * 10;
      return Math.ceil(x / 20) * 20;
    }

    function barHtml(ev) {
      var scaleMax = niceCeil(Math.max(ev.fbaPct, ev.thresholdPct) * 1.2);
      var fillPct = Math.max(0, Math.min(1, ev.fbaPct / scaleMax)) * 100;
      var markPct = (ev.thresholdPct / scaleMax) * 100;
      function pos(p) {
        var edge = p > 82 ? 'right' : p < 14 ? 'left' : 'center';
        return 'style="left:' + p.toFixed(2) + '%" data-edge="' + edge + '"';
      }
      return (
        '<div class="fpic-bar" role="group" aria-label="' + esc(c.barLabel) + '">' +
        '<div class="fpic-bar__top"><span class="fpic-bar__label" ' + pos(markPct) + '>' +
        esc(fill(c.barThreshold, { pct: ev.thresholdPct })) + '</span></div>' +
        '<div class="fpic-bar__track" aria-hidden="true">' +
        '<div class="fpic-bar__fill" style="width:' + fillPct.toFixed(2) + '%"></div>' +
        '<div class="fpic-bar__mark" style="left:' + markPct.toFixed(2) + '%"></div>' +
        '</div>' +
        '<div class="fpic-bar__bottom"><span class="fpic-bar__label" ' + pos(fillPct) + '>' +
        esc(c.barYou) + ' ' + formatPct(ev.fbaPct, ev.thresholdPct, ev.isFpic) + '</span></div>' +
        '<div class="fpic-bar__scale" aria-hidden="true"><span>0%</span><span>' + scaleMax + '%</span></div>' +
        '</div>'
      );
    }

    function resultMessage(ev) {
      if (ev.isFpic) {
        return fill(c.messageBelow, {
          dollars: formatGap(ev),
          points: formatPoints(ev.headroomPoints)
        });
      }
      if (ev.atThreshold) return c.messageAt;
      return fill(c.messageAbove, {
        points: formatPoints(ev.headroomPoints),
        dollars: formatGap(ev)
      });
    }

    /** A small tag beside the question, shown only once the row has an answer. Text plus icon: color never carries the meaning alone. */
    function chipHtml(status) {
      if (status !== 'fpic' && status !== 'ok') return '';
      var k = chipKind(status);
      return '<span class="fpic-tag fpic-tag--' + k + '">' + chipIcon(status) + '<span>' + esc(statusWord(status)) + '</span></span>';
    }

    function renderRow(r) {
      var chip = $('[data-role="chip-' + r.id + '"]');
      if (chip) chip.innerHTML = chipHtml(r.status);
      var row = $('#' + ids('row-' + r.id));
      if (row) row.setAttribute('data-status', r.status);
      var v = $('[data-role="value-' + r.id + '"]');
      if (!v) return;
      var text = r.prompt || [r.display, r.message].filter(Boolean).join(' ');
      v.textContent = text;
      v.className = 'fpic-row__value' + (r.prompt ? ' fpic-row__value--prompt' : '');
    }

    function renderRow1Detail(r) {
      var box = $('[data-role="detail-fba"]');
      if (!box) return;
      if (!r || !r.ev) {
        box.innerHTML = '';
        return;
      }
      var ev = r.ev;
      var unit = data.unitTypes[ev.unitType];
      box.innerHTML =
        '<p class="fpic-message">' + esc(resultMessage(ev)) + '</p>' +
        barHtml(ev) +
        '<p class="fpic-help">' + esc(fill(c.aboutThreshold, { pct: ev.thresholdPct, noun: unit.noun, band: ev.band.label })) + '</p>';
    }

    /* ---------------- results screen ---------------- */

    function statusWord(status) {
      return status === 'fpic' ? c.chipFpicShort : status === 'ok' ? c.chipOkShort : status === 'na' ? c.chipNaShort : c.chipUncheckedShort;
    }

    function statusWordLong(status) {
      return status === 'fpic' ? c.chipFpic : status === 'ok' ? c.chipOk : status === 'na' ? c.chipNa : c.chipUnchecked;
    }

    function headlineText(t) {
      if (!t.checked) return c.panelEmptyHead;
      if (t.fpic) return fill(c.headlineFpic, { fpic: t.fpic, total: t.total });
      return fill(t.checked === 1 ? c.headlineNoneOne : c.headlineNone, { checked: t.checked });
    }

    function summaryText(t) {
      var parts = [headlineText(t)];
      if (t.checked) {
        parts.push(
          fill(c.tallyOk, { n: t.ok }) + ', ' + fill(c.tallyUnchecked, { n: t.unchecked }) +
          (t.na ? ', ' + fill(c.tallyNa, { n: t.na }) : '') + '.'
        );
      }
      return parts.join('. ').replace(/\.\./g, '.');
    }

    function numPill(def) {
      return '<span class="fpic-row__num" aria-hidden="true">' + def.number + '</span>';
    }

    function foldList(summary, items, cls) {
      return (
        '<details class="fpic-fold ' + (cls || '') + '"><summary>' + esc(summary) + '</summary><ul class="fpic-fold__list">' +
        items.join('') + '</ul></details>'
      );
    }

    function renderResults(all) {
      var box = $('[data-role="results"]');
      if (!box) return;
      var t = all.tally;
      if (!t.checked) {
        box.innerHTML =
          '<div class="fpic-card fpic-results__empty"><p>' + esc(c.resultsEmpty) + '</p>' +
          '<button type="button" class="fpic-btn fpic-btn--primary" data-action="goto" data-step="1">' + esc(c.resultsEmptyButton) + '</button></div>';
        return;
      }
      var byStatus = function (s) { return all.results.filter(function (r) { return r.status === s; }); };
      var fpics = byStatus('fpic');
      var oks = byStatus('ok');
      var unchecked = byStatus('unchecked');
      var nas = byStatus('na');

      var stats = [
        ['fpic', t.fpic, c.statFpic],
        ['ok', t.ok, c.statOk],
        ['none', t.unchecked, c.statUnchecked]
      ];
      if (t.na) stats.push(['na', t.na, c.statNa]);

      var html =
        '<div class="fpic-card fpic-hero" data-has-fpic="' + (t.fpic ? '1' : '0') + '">' +
        '<h3 class="fpic-hero__head">' + esc(headlineText(t)) + '</h3>' +
        '<ul class="fpic-stats">' +
        stats.map(function (s) {
          return '<li class="fpic-stat fpic-stat--' + s[0] + '"><span class="fpic-stat__n">' + s[1] + '</span><span class="fpic-stat__l">' + esc(s[2]) + '</span></li>';
        }).join('') +
        '</ul><p class="fpic-help">' + esc(c.panelNote) + '</p></div>';

      if (fpics.length) {
        html += '<section class="fpic-res" aria-labelledby="' + ids('h-fpic') + '"><h3 class="fpic-h" id="' + ids('h-fpic') + '">' + esc(c.resultsFpicHeading) + '</h3><ul class="fpic-cards">';
        fpics.forEach(function (r) {
          var def = data.indicators[r.id];
          var msg = r.ev && r.id === 'fba' ? resultMessage(r.ev) : [r.display, r.message].filter(Boolean).join(' ');
          html +=
            '<li class="fpic-fcard"><div class="fpic-fcard__top"><h4 class="fpic-fcard__t">' + numPill(def) + '<span>' + esc(def.plainLabel) + '</span></h4>' +
            '<span class="fpic-tag fpic-tag--fpic">' + ICON_CHIP_FPIC + '<span>' + esc(c.chipFpicShort) + '</span></span></div>' +
            (msg ? '<p class="fpic-fcard__msg">' + esc(msg) + '</p>' : '') +
            '<p class="fpic-fcard__rule"><strong>' + esc(c.ruleLabel) + '</strong> ' + esc(def.fpicWhen) + '.</p>' +
            '<button type="button" class="fpic-linkbtn" data-jump="' + r.id + '">' + esc(c.reviewButton) +
            '<span class="fpic-sr"> ' + esc(def.plainLabel) + '</span></button></li>';
        });
        html += '</ul></section>';
      }

      var next =
        '<p>' + esc(fill(c.responseNote, { days: data.responseDays })) + '</p><p>' + esc(c.askFpic) + '</p>' +
        '<p>' + link({ url: data.links.lgcFpic.url, text: c.nextLgcLink }) + '</p>';
      html += fpics.length
        ? '<section class="fpic-callout"><h3 class="fpic-callout__t">' + esc(c.nextHeading) + '</h3>' + next + '</section>'
        : '<details class="fpic-fold fpic-fold--quiet"><summary>' + esc(c.nextHeadingQuiet) + '</summary><div class="fpic-fold__body">' + next + '</div></details>';

      if (oks.length) {
        html += foldList(
          fill(oks.length === 1 ? c.resultsOkSummaryOne : c.resultsOkSummary, { n: oks.length }),
          oks.map(function (r) {
            var def = data.indicators[r.id];
            return '<li><span class="fpic-fold__name">' + numPill(def) + '<span>' + esc(def.plainLabel) + '</span></span>' +
              '<span class="fpic-fold__val">' + esc(r.display || '') + '</span></li>';
          })
        );
      }
      if (unchecked.length) {
        html += foldList(
          fill(c.resultsUncheckedSummary, { n: unchecked.length }),
          unchecked.map(function (r) {
            var def = data.indicators[r.id];
            return '<li><span class="fpic-fold__name">' + numPill(def) + '<span>' + esc(def.plainLabel) + '</span></span>' +
              '<button type="button" class="fpic-linkbtn" data-jump="' + r.id + '">' + esc(c.addButton) +
              '<span class="fpic-sr"> ' + esc(def.plainLabel) + '</span></button></li>';
          })
        );
      }
      if (nas.length) html += '<p class="fpic-help">' + esc(c.resultsNaNote) + '</p>';
      box.innerHTML = html;
    }

    function renderMini(t) {
      var m = $('[data-role="mini"]');
      if (!m) return;
      var txt = fill(c.miniChecked, { checked: t.checked, total: t.total });
      if (t.fpic) txt += ' · ' + fill(c.miniFpic, { fpic: t.fpic });
      m.textContent = txt;
      m.setAttribute('data-has-fpic', t.fpic ? '1' : '0');
    }

    function renderGroups(all) {
      groups.forEach(function (g) {
        var mine = all.results.filter(function (r) { return g.indicators.indexOf(r.id) > -1; });
        var entered = mine.filter(function (r) { return r.status === 'ok' || r.status === 'fpic'; }).length;
        var fp = mine.filter(function (r) { return r.status === 'fpic'; }).length;
        var allNa = mine.length && mine.every(function (r) { return r.status === 'na'; });
        $('[data-role="prog-' + g.id + '"]').textContent = allNa ? c.groupNa : fill(c.groupEntered, { entered: entered, total: mine.length });
        $('[data-role="badge-' + g.id + '"]').innerHTML = fp
          ? '<span class="fpic-tag fpic-tag--fpic">' + ICON_CHIP_FPIC + '<span>' + esc(fill(c.groupFpic, { n: fp })) + '</span></span>'
          : '';
      });
    }

    function resultCell(res) {
      return '<strong>' + esc(res.status === 'fpic' ? c.resultFpic : c.resultNoFpic) + '</strong>';
    }

    function headroomText(ev) {
      if (ev.atThreshold) return c.headroomNone;
      return fill(ev.isFpic ? c.headroomShortfall : c.headroomCushion, {
        dollars: formatGap(ev)
      });
    }

    function renderWhatIf(inputs, appr) {
      var box = $('[data-role="whatif"]');
      state.whatIfMsg = '';
      var base1 = evaluateIndicator(data.indicators.fba, inputs, data);
      if (!base1.ev) {
        box.innerHTML = '<p class="fpic-empty">' + esc(c.whatIfNeedResult) + '</p>';
        return null;
      }
      if (appr.status !== 'ok' || appr.value === 0) {
        box.innerHTML = '<p class="fpic-empty">' + esc(c.whatIfEmpty) + '</p>';
        return null;
      }
      var w = applyAppropriationAll(inputs, appr.value, data);
      var base = w.baseline.fba.ev;
      var sc = w.scenario.fba.ev;
      function res(ev) {
        return '<strong>' + esc(ev.isFpic ? c.resultFpic : c.resultNoFpic) + '</strong>';
      }
      var rows = [
        [c.rowFba, formatDollars(base.fba), formatDollars(sc.fba)],
        [c.rowFbaPct, formatPct(base.fbaPct, base.thresholdPct, base.isFpic), formatPct(sc.fbaPct, sc.thresholdPct, sc.isFpic)],
        [c.rowThreshold, base.thresholdPct + '%', sc.thresholdPct + '%'],
        [c.whatIfRowResult1, res(base), res(sc), true],
        [c.rowHeadroom, headroomText(base), headroomText(sc)]
      ];
      var b2 = w.baseline.apprFb;
      var s2 = w.scenario.apprFb;
      var b3 = w.baseline.totalFb;
      var s3 = w.scenario.totalFb;
      var withTotals = b2.status !== 'unchecked' && s2.status !== 'unchecked';
      if (withTotals) {
        rows.push([c.whatIfRowChange, formatDollars(b2.value), formatDollars(s2.value)]);
        rows.push([c.whatIfRowResult2, resultCell(b2), resultCell(s2), true]);
        rows.push([c.whatIfRowTotalFb, formatDollars(b3.value), formatDollars(s3.value)]);
        rows.push([c.whatIfRowResult3, resultCell(b3), resultCell(s3), true]);
      }
      var msg;
      var before = formatGap(base);
      var after = formatGap(sc);
      if (!base.isFpic && sc.isFpic) msg = fill(c.whatIfCross, { before: before, after: after });
      else if (!base.isFpic) msg = fill(c.whatIfShrink, { before: before, after: after });
      else msg = fill(c.whatIfGrow, { before: before, after: after });
      if (withTotals) {
        if (b2.status === 'ok' && s2.status === 'fpic') msg += ' ' + c.whatIfRow2Cross;
        if (b3.status === 'ok' && s3.status === 'fpic') msg += ' ' + c.whatIfRow3Cross;
      }
      state.whatIfMsg = msg;
      var note = sc.fba < 0 && appr.value > base.fba ? '<p class="fpic-note">' + esc(c.whatIfOverdraw) + '</p>' : '';
      var tbody = rows
        .map(function (r) {
          return (
            '<tr><th scope="row">' + esc(r[0]) + '</th><td data-label="' + esc(c.colBaseline) + '">' +
            (r[3] ? r[1] : esc(r[1])) + '</td><td data-label="' + esc(c.colScenario) + '">' +
            (r[3] ? r[2] : esc(r[2])) + '</td></tr>'
          );
        })
        .join('');
      box.innerHTML =
        '<div class="fpic-tablewrap" tabindex="0" role="region" aria-label="' + esc(c.whatIfHeading) + '"><table class="fpic-table fpic-table--stack fpic-table--whatif">' +
        '<caption class="fpic-sr">' + esc(c.whatIfHeading) + '</caption>' +
        '<thead><tr><th scope="col">' + esc(c.colMeasure) + '</th><th scope="col">' + esc(c.colBaseline) +
        '</th><th scope="col">' + esc(c.colScenario) + '</th></tr></thead><tbody>' + tbody + '</tbody></table></div>' +
        '<p class="fpic-message fpic-message--plain">' + esc(msg) + '</p>' + note +
        '<p class="fpic-help fpic-noprint">' + esc(c.whatIfCaveat) + '</p>';
      return sc;
    }

    function yearLabel(row, i) {
      return row.label && row.label.trim() ? row.label.trim() : c.trendShortNames[i];
    }

    function readTrend(t, mainExp, mainFba) {
      var rows = [];
      for (var i = 0; i < 3; i++) {
        var lbl = val('y' + i + '-label');
        var e = readMoney('y' + i + '-exp', { positive: true });
        var f = readMoney('y' + i + '-fba');
        // Blank expenditures is fine (row is skipped); "positive" only errors on 0/negative entries.
        var partial =
          (e.status === 'ok') !== (f.status === 'ok') &&
          (e.status !== 'blank' || f.status !== 'blank') &&
          e.status !== 'error' && f.status !== 'error';
        setError('y' + i, partial ? c.errYearIncomplete : '');
        rows.push({
          label: lbl,
          expenditures: e.status === 'ok' ? e.value : null,
          fba: f.status === 'ok' ? f.value : null
        });
      }
      rows.push({
        label: val('y3-label'),
        expenditures: mainExp.status === 'ok' ? mainExp.value : null,
        fba: mainFba.status === 'ok' ? mainFba.value : null
      });
      return rows;
    }

    /** A 1, 2 or 5 times a power of ten, giving about four ticks. Safe for any range. */
    function niceStep(range) {
      var raw = Math.max(range, 1) / 4;
      var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
      var n = raw / mag;
      return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
    }

    function tickLabel(v) {
      var a = Math.abs(v);
      if (a >= 1e6) return trimZeros((v / 1e6).toFixed(1)) + 'M%';
      if (a >= 1e4) return trimZeros((v / 1e3).toFixed(1)) + 'K%';
      return withCommas(v).replace(/^/, v < 0 ? '-' : '') + '%';
    }

    function chartSvg(rows, W, forPrint) {
      W = Math.max(300, Math.round(W));
      var H = forPrint ? 130 : W < 480 ? 260 : 300;
      var m = { l: 54, r: W < 480 ? 74 : 96, t: 28, b: 40 };
      var pw = W - m.l - m.r;
      var ph = H - m.t - m.b;
      var vals = [];
      rows.forEach(function (r) {
        vals.push(r.result.fbaPct, r.result.thresholdPct);
      });
      var lo = Math.min.apply(null, vals.concat([0]));
      var hi = Math.max.apply(null, vals.concat([10]));
      var step = niceStep(hi - lo);
      var yMin = lo < 0 ? Math.floor(lo / step) * step : 0;
      var yMax = Math.ceil((hi * 1.08) / step) * step;
      function X(i) {
        return rows.length === 1 ? m.l + pw / 2 : m.l + (pw * i) / (rows.length - 1);
      }
      function Y(v) {
        return m.t + ph - ((v - yMin) / (yMax - yMin)) * ph;
      }
      var g = '';
      for (var v = yMin, guard = 0; v <= yMax + 1e-9 && guard < 40; v += step, guard++) {
        g +=
          '<line x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) +
          '" class="fpic-chart__grid' + (v === 0 ? ' fpic-chart__grid--zero' : '') + '"/>' +
          '<text x="' + (m.l - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end" class="fpic-chart__tick">' + tickLabel(v) + '</text>';
      }
      // threshold as a step line (bands can change between years)
      var d = '';
      rows.forEach(function (r, i) {
        var y = Y(r.result.thresholdPct).toFixed(1);
        var x = X(i);
        if (i === 0) d += 'M' + (rows.length === 1 ? m.l : x).toFixed(1) + ' ' + y;
        else {
          var prev = rows[i - 1].result.thresholdPct;
          var mid = (X(i - 1) + x) / 2;
          if (prev !== r.result.thresholdPct) d += ' H' + mid.toFixed(1) + ' V' + y;
        }
      });
      d += ' H' + (m.l + pw).toFixed(1);
      var last = rows[rows.length - 1].result;
      var thrLabelY = Y(last.thresholdPct);
      var thr =
        '<path d="' + d + '" class="fpic-chart__thr"/>' +
        '<text class="fpic-chart__thrlabel" x="' + (m.l + pw + 14) + '" y="' + (thrLabelY - 2).toFixed(1) + '">' + esc(c.chartThreshold) + '</text>' +
        '<text class="fpic-chart__thrlabel" x="' + (m.l + pw + 14) + '" y="' + (thrLabelY + 14).toFixed(1) + '">' + last.thresholdPct + '%</text>';
      var pts = rows.map(function (r, i) {
        return X(i).toFixed(1) + ',' + Y(r.result.fbaPct).toFixed(1);
      });
      var line = '<polyline class="fpic-chart__line" points="' + pts.join(' ') + '"/>';
      var marks = '';
      var labels = '';
      var xl = '';
      var summary = [];
      rows.forEach(function (r, i) {
        var cx = X(i);
        var cy = Y(r.result.fbaPct);
        var name = r.label;
        var txt = formatPct(r.result.fbaPct, r.result.thresholdPct, r.result.isFpic);
        summary.push(name + ' ' + txt + (r.result.isFpic ? ' (FPIC)' : '') + ' against a threshold of ' + r.result.thresholdPct + '%');
        if (r.result.isFpic) {
          marks +=
            '<path class="fpic-chart__pt fpic-chart__pt--fpic" d="M' + cx.toFixed(1) + ' ' + (cy - 8).toFixed(1) +
            ' L' + (cx + 8).toFixed(1) + ' ' + cy.toFixed(1) + ' L' + cx.toFixed(1) + ' ' + (cy + 8).toFixed(1) +
            ' L' + (cx - 8).toFixed(1) + ' ' + cy.toFixed(1) + ' Z"><title>' + esc(name + ': ' + txt + ', FPIC') + '</title></path>';
        } else {
          marks +=
            '<circle class="fpic-chart__pt" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="6"><title>' +
            esc(name + ': ' + txt) + '</title></circle>';
        }
        var above = !r.result.isFpic;
        var ly = above ? cy - 14 : cy + 24;
        if (ly < 12) ly = cy + 24;
        var anchor = 'middle';
        labels +=
          '<text class="fpic-chart__val" x="' + cx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + anchor + '">' + esc(txt) + '</text>';
        var nm = name.length > 14 ? name.slice(0, 13) + '…' : name;
        xl += '<text class="fpic-chart__x" x="' + cx.toFixed(1) + '" y="' + (H - 14) + '" text-anchor="middle">' + esc(nm) + '</text>';
      });
      return {
        svg:
          '<svg class="fpic-chart" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
          '" role="img" aria-label="' + esc(fill(c.chartSummary, { points: summary.join('; ') })) + '">' +
          g + thr + line + marks + labels + xl + '</svg>'
      };
    }

    function renderChartOnly(forPrint) {
      var holder = $('[data-role="chart"]');
      if (!holder || !state.chartRows) return;
      holder.innerHTML = forPrint === true
        ? chartSvg(state.chartRows, 660, true).svg
        : chartSvg(state.chartRows, holder.clientWidth || 600).svg;
    }

    function renderTrend(t, base, mainExp, mainFba) {
      var box = $('[data-role="trend"]');
      state.chartRows = null;
      // Always parse year fields so their errors show even without a result.
      var rawRows = readTrend(t, mainExp, mainFba);
      if (!t || !base) {
        box.innerHTML = '<p class="fpic-empty">' + esc(c.trendNeedResult) + '</p>';
        return null;
      }
      var rows = buildTrend(rawRows, t, data);
      var complete = rows.filter(function (r) { return r.complete; });
      var body = rows
        .map(function (r, i) {
          if (!r.complete) return '';
          var ev = r.result;
          return (
            '<tr><th scope="row">' + esc(yearLabel(r, i)) + '</th>' +
            '<td data-label="' + esc(c.trendColExpenditures) + '">' + esc(formatDollars(ev.expenditures)) + '</td>' +
            '<td data-label="' + esc(c.trendColFba) + '">' + esc(formatDollars(ev.fba)) + '</td>' +
            '<td data-label="' + esc(c.trendColPct) + '">' + esc(formatPct(ev.fbaPct, ev.thresholdPct, ev.isFpic)) + '</td>' +
            '<td data-label="' + esc(c.trendColThreshold) + '">' + ev.thresholdPct + '%</td>' +
            '<td data-label="' + esc(c.trendColResult) + '"><strong>' + esc(ev.isFpic ? c.resultFpic : c.resultNoFpic) + '</strong>' +
            '<span class="fpic-cell__sub">' + esc(headroomText(ev)) + '</span></td></tr>'
          );
        })
        .join('');
      var out =
        '<div class="fpic-tablewrap" tabindex="0" role="region" aria-label="' + esc(c.trendTableCaption) + '"><table class="fpic-table fpic-table--stack fpic-table--trend">' +
        '<caption class="fpic-sr">' + esc(c.trendTableCaption) + '</caption>' +
        '<thead><tr><th scope="col">' + esc(c.trendColYear) + '</th><th scope="col">' + esc(c.trendColExpenditures) +
        '</th><th scope="col">' + esc(c.trendColFba) + '</th><th scope="col">' + esc(c.trendColPct) +
        '</th><th scope="col">' + esc(c.trendColThreshold) +
        '</th><th scope="col">' + esc(c.trendColResult) + '</th></tr></thead><tbody>' + body + '</tbody></table></div>';
      if (complete.length < 2) {
        out += '<p class="fpic-help fpic-noprint">' + esc(c.trendNeedMore) + '</p>';
        box.innerHTML = out;
        return null;
      }
      var anyFpic = complete.some(function (r) { return r.result.isFpic; });
      var legend =
        '<ul class="fpic-legend" aria-label="Chart key">' +
        '<li><svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><line x1="0" x2="34" y1="7" y2="7" class="fpic-chart__line"/><circle cx="17" cy="7" r="5" class="fpic-chart__pt"/></svg><span>' + esc(c.chartLegendFba) + '</span></li>' +
        '<li><svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><line x1="0" x2="34" y1="7" y2="7" class="fpic-chart__thr"/></svg><span>' + esc(c.chartLegendThreshold) + '</span></li>' +
        (anyFpic ? '<li><svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><path d="M17 0 L24 7 L17 14 L10 7 Z" class="fpic-chart__pt fpic-chart__pt--fpic"/></svg><span>' + esc(c.chartLegendFpic) + '</span></li>' : '') +
        '</ul>';
      out += legend + '<div class="fpic-chartwrap" data-role="chart"></div>';
      var drift = detectDrift(rows, data);
      if (drift.drifting) {
        var lastRow = rows[rows.length - 1];
        var idxFrom = rows.indexOf(drift.from);
        var idxTo = rows.length - 1;
        var tpl = lastRow.result.isFpic ? c.driftBelow : c.driftAbove;
        out +=
          '<p class="fpic-drift">' + ICON_DOWN.replace('width="24" height="24"', 'width="22" height="22"') + '<span>' +
          esc(fill(tpl, {
            n: drift.declines,
            from: formatPct(drift.from.result.fbaPct, null, null, true),
            to: formatPct(lastRow.result.fbaPct, lastRow.result.thresholdPct, lastRow.result.isFpic, true),
            fromYear: yearLabel(drift.from, idxFrom),
            toYear: yearLabel(lastRow, idxTo)
          })) + '</span></p>';
      }
      box.innerHTML = out;
      state.chartRows = [];
      rows.forEach(function (r, i) {
        if (r.complete) state.chartRows.push({ label: yearLabel(r, i), result: r.result });
      });
      renderChartOnly();
      return drift;
    }

    function renderPrint(inputs, all, appr) {
      var box = $('[data-role="print-inputs"]');
      var name = val('name').trim();
      var t = inputs.unitType;
      var dl = [
        [c.printUnit, name || '—'],
        [c.printUnitType, t ? data.unitTypes[t].label : '—'],
        [c.expendituresLabel, inputs.exp !== null ? formatDollars(inputs.exp) : '—'],
        [c.fbaLabel, inputs.fba !== null ? formatDollars(inputs.fba) : '—'],
        [c.printAppropriation, appr.status === 'ok' && appr.value > 0 ? formatDollars(appr.value) : c.printNone]
      ];
      var date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      var body = all.results
        .map(function (r) {
          var def = data.indicators[r.id];
          return (
            '<tr><td>' + def.number + '</td><th scope="row">' + esc(def.shortLabel) + '</th><td>' +
            esc(r.valueText || c.tableNoValue) + '</td><td>' + esc(r.thresholdText || c.tableNoValue) + '</td><td><strong>' +
            esc(statusWord(r.status)) + '</strong></td></tr>'
          );
        })
        .join('');
      box.innerHTML =
        '<h3 class="fpic-h">' + esc(c.printHeading) + '</h3>' +
        '<p class="fpic-help">' + esc(fill(c.printPrepared, { date: date })) + '. ' + esc(fill(c.printAsOf, { asOf: data.thresholdsAsOf })) + '</p>' +
        '<dl class="fpic-printdl">' +
        dl.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') +
        '</dl>' +
        '<table class="fpic-table fpic-table--print"><caption class="fpic-sr">' + esc(c.tableCaption) + '</caption>' +
        '<thead><tr><th scope="col">' + esc(c.tableNumber) + '</th><th scope="col">' + esc(c.tableIndicator) +
        '</th><th scope="col">' + esc(c.tableValue) + '</th><th scope="col">' + esc(c.tableThreshold) +
        '</th><th scope="col">' + esc(c.tableStatus) + '</th></tr></thead><tbody>' + body + '</tbody></table>';
    }


    /* ---------------- update ---------------- */

    function waterChoice() {
      var r = $('input[name="' + waterName + '"]:checked');
      return r ? r.value : '';
    }

    function update() {
      var read = readInputs();
      var inputs = read.inputs;
      var appr = readMoney('appr', { nonNegative: true });
      var all = evaluateAll(inputs, data, { groups: shownIds });
      var water = hasWater ? waterChoice() : '';
      // "No water or sewer fund" marks indicators 4 to 8 not applicable. They stay in the total of 17.
      all.results = markNotApplicable(all.results, water === 'no' ? ['water'] : [], data);
      all.tally = tally(all.results);
      if (hasWater) {
        $('[data-role="rows-water"]').hidden = water !== 'yes';
        $('[data-role="water-na"]').hidden = water !== 'no';
        $('[data-role="water-hint"]').hidden = water !== '';
      }
      all.results.forEach(renderRow);
      var row1 = all.results.filter(function (r) { return r.id === 'fba'; })[0] || null;
      renderRow1Detail(row1);
      renderResults(all);
      renderGroups(all);
      renderMini(all.tally);
      if (hasGeneral) {
        renderWhatIf(inputs, appr);
        renderTrend(inputs.unitType, row1 && row1.ev, read.parsed.exp, read.parsed.fba);
      }
      renderPrint(inputs, all, appr);
      $('[data-role="example-note"]').hidden = !state.exampleActive;
      announce([summaryText(all.tally), state.whatIfMsg].filter(Boolean).join(' '));
    }

    /** One persistent live region, updated after a pause, so screen readers hear the change once, not on every keystroke. */
    function announce(text) {
      clearTimeout(state.announceTimer);
      state.announceTimer = setTimeout(function () {
        if (text === state.lastAnnounce) return;
        state.lastAnnounce = text;
        var n = $('[data-role="announce"]');
        if (n) n.textContent = text;
      }, 800);
    }

    /* ---------------- events ---------------- */

    var moneyNames = ['appr', 'y0-exp', 'y0-fba', 'y1-exp', 'y1-fba', 'y2-exp', 'y2-fba'];
    Object.keys(data.inputs).forEach(function (k) {
      if (data.inputs[k].kind === 'money') moneyNames.push(k);
    });

    el.addEventListener('input', update);
    el.addEventListener('change', update);
    el.addEventListener('focusin', function (e) {
      state.focusName = (e.target && e.target.getAttribute && e.target.getAttribute('data-name')) || '';
    });
    // Tidy a valid amount on blur: 20000000 becomes 20,000,000.
    el.addEventListener('focusout', function (e) {
      var n = e.target && e.target.getAttribute && e.target.getAttribute('data-name');
      state.focusName = '';
      if (!n) return;
      if (moneyNames.indexOf(n) === -1) {
        if (data.inputs[n] && data.inputs[n].kind === 'ratio' && parseRatio(e.target.value).status === 'error') update();
        return;
      }
      var p = parseMoney(e.target.value);
      if (p.status === 'ok') e.target.value = formatInputNumber(p.value);
      else if (p.status === 'error') update(); // show the message now that typing has paused
    });

    /* ---------------- the guided flow ---------------- */

    var resultsIdx = steps.length - 1;
    var lastInputIdx = resultsIdx - 1;

    function goStep(n, focus) {
      n = Math.max(0, Math.min(resultsIdx, n));
      state.step = n;
      Array.prototype.forEach.call(el.querySelectorAll('.fpic-step'), function (s) {
        s.hidden = Number(s.getAttribute('data-step')) !== n;
      });
      $('[data-role="progress"]').hidden = n === 0;
      $('[data-role="nav"]').hidden = n === 0 || n === resultsIdx;
      $('[data-role="next-btn"]').textContent = n === lastInputIdx ? c.resultsButton : c.nextButton;
      Array.prototype.forEach.call(el.querySelectorAll('[data-stepper]'), function (li) {
        var i = Number(li.getAttribute('data-stepper'));
        li.classList.toggle('is-current', i === n);
        li.classList.toggle('is-done', i < n);
        var b = li.querySelector('button');
        if (i === n) b.setAttribute('aria-current', 'step');
        else b.removeAttribute('aria-current');
      });
      var top = el.getBoundingClientRect().top;
      if (top < 0) el.scrollIntoView({ block: 'start' });
      if (focus !== false) {
        var h = $('#' + ids('step-h-' + n));
        if (h) h.focus({ preventScroll: true });
      }
    }

    function setTool(key, open) {
      var section = $('[data-role="tool-' + key + '"]');
      var btn = $('[data-action="tool"][data-tool="' + key + '"]');
      if (!section || !btn) return;
      section.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      $('[data-role="toollabel-' + key + '"]').textContent = open ? c.toolClose : c.toolOpen;
      btn.closest('.fpic-gocard').classList.toggle('is-open', open);
    }

    function setMore(btn, open) {
      var p = el.querySelector('#' + btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (p) p.hidden = !open;
    }

    function fillExample() {
      var ex = data.example;
      Array.prototype.forEach.call(el.querySelectorAll('input[type="radio"]'), function (r) {
        if (r.name === unitName) r.checked = r.value === ex.unitType;
        else if (r.name === waterName) r.checked = r.value === 'yes';
        else {
          var key = r.name.slice(id.length + 1);
          r.checked = ex.answers[key] === r.value;
        }
      });
      setVal('name', ex.unitName);
      Object.keys(ex.values).forEach(function (k) {
        setVal(k, ex.values[k]);
      });
      setVal('appr', ex.appropriation);
      ex.years.forEach(function (y, i) {
        setVal('y' + i + '-label', y.label);
        setVal('y' + i + '-exp', y.expenditures);
        setVal('y' + i + '-fba', y.fba);
      });
      setVal('y3-label', ex.currentLabel);
      state.exampleActive = true;
      setTool('whatif', true);
      setTool('trend', true);
      update();
    }

    function clearAll() {
      Array.prototype.forEach.call(el.querySelectorAll('input'), function (i) {
        if (i.type === 'radio') i.checked = false;
        else i.value = '';
      });
      state.exampleActive = false;
      setTool('whatif', false);
      setTool('trend', false);
      Array.prototype.forEach.call(el.querySelectorAll('.fpic-more__btn'), function (b) { setMore(b, false); });
      update();
    }

    function jumpTo(indicatorId) {
      var row = $('#' + ids('row-' + indicatorId));
      if (!row) return;
      var step = row.closest('.fpic-step');
      goStep(step ? Number(step.getAttribute('data-step')) : 1, false);
      var target = row.querySelector('input');
      var rowsBox = row.closest('[data-role="rows-water"]');
      if (rowsBox && rowsBox.hidden) target = $('input[name="' + waterName + '"]');
      (target || row).focus({ preventScroll: true });
      ((rowsBox && rowsBox.hidden && target) || row).scrollIntoView({ block: 'center' });
    }

    function openTerms() {
      var t = $('[data-role="terms"]');
      if (!t) return;
      t.open = true;
      t.scrollIntoView({ block: 'center' });
      var s = t.querySelector('summary');
      if (s) s.focus({ preventScroll: true });
    }

    el.addEventListener('click', function (e) {
      var j = e.target.closest ? e.target.closest('[data-jump]') : null;
      if (j) {
        e.preventDefault();
        jumpTo(j.getAttribute('data-jump'));
        return;
      }
      var b = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!b) return;
      var a = b.getAttribute('data-action');
      if (a === 'start') goStep(1);
      else if (a === 'next') goStep(state.step + 1);
      else if (a === 'back') goStep(state.step - 1);
      else if (a === 'goto') goStep(Number(b.getAttribute('data-step')));
      else if (a === 'example') { fillExample(); goStep(resultsIdx); }
      else if (a === 'startover') { clearAll(); goStep(0); }
      else if (a === 'clearstart') { clearAll(); goStep(1); }
      else if (a === 'print') window.print();
      else if (a === 'terms') openTerms();
      else if (a === 'tool') setTool(b.getAttribute('data-tool'), b.getAttribute('aria-expanded') !== 'true');
      else if (a === 'more') setMore(b, b.getAttribute('aria-expanded') !== 'true');
    });

    var resizeTimer;
    var lastWidth = 0;
    function onResize() {
      var holder = $('[data-role="chart"]');
      if (!holder) return;
      var w = holder.clientWidth;
      if (w === lastWidth) return;
      lastWidth = w;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { renderChartOnly(false); }, 80);
    }
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(onResize).observe(el);
    } else {
      window.addEventListener('resize', onResize);
    }
    window.addEventListener('beforeprint', function () { renderChartOnly(true); });
    window.addEventListener('afterprint', function () { lastWidth = 0; renderChartOnly(false); });

    // Print shows the results screen with the what-if and trend, so reveal them for printing and put them back after.
    var hiddenBeforePrint = [];
    window.addEventListener('beforeprint', function () {
      hiddenBeforePrint = [];
      Array.prototype.forEach.call(el.querySelectorAll('.fpic-toolsection, .fpic-results-step'), function (s) {
        if (s.hidden) {
          hiddenBeforePrint.push(s);
          s.hidden = false;
        }
      });
    });
    window.addEventListener('afterprint', function () {
      hiddenBeforePrint.forEach(function (s) { s.hidden = true; });
      hiddenBeforePrint = [];
    });

    if (el.getAttribute('data-example') === '1') {
      fillExample();
      goStep(resultsIdx, false);
    } else {
      update();
      goStep(0, false);
    }
  }

  function initAll() {
    var data = typeof window !== 'undefined' ? window.FPIC_DATA : null;
    var nodes = document.querySelectorAll('[data-fpic-calculator]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-fpic-ready')) continue;
      if (!data) {
        nodes[i].textContent = 'The calculator data did not load. Please reload the page.';
        continue;
      }
      nodes[i].setAttribute('data-fpic-ready', '1');
      mount(nodes[i], data);
    }
  }

  return {
    parseMoney: parseMoney,
    parseRatio: parseRatio,
    formatNear: formatNear,
    evaluateIndicator: evaluateIndicator,
    evaluateAll: evaluateAll,
    markNotApplicable: markNotApplicable,
    tally: tally,
    applyAppropriationAll: applyAppropriationAll,
    indicatorOrder: indicatorOrder,
    bandFor: bandFor,
    thresholdFor: thresholdFor,
    evaluate: evaluate,
    applyAppropriation: applyAppropriation,
    buildTrend: buildTrend,
    detectDrift: detectDrift,
    formatDollars: formatDollars,
    formatPct: formatPct,
    formatPoints: formatPoints,
    formatGap: formatGap,
    initAll: initAll,
    mount: mount
  };
});