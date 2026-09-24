/*
 * Engine-agnostic test suite. Runs in Node (tools/test-optimizer.mjs) and in a
 * headless browser (tools/selftest.html) against exactly the same sources the
 * app ships, so the CI gate and a local spot check cannot drift apart.
 */
(function (root) {
  'use strict';
  var TS = (root.TS = root.TS || {});
  var U = TS.util;

  function Runner() {
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
    this.lines = [];
  }

  Runner.prototype.ok = function (condition, label, detail) {
    if (condition) {
      this.passed++;
    } else {
      this.failed++;
      this.failures.push(label + (detail ? ' — ' + detail : ''));
    }
  };

  Runner.prototype.eq = function (actual, expected, label) {
    this.ok(actual === expected, label, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  };

  Runner.prototype.note = function (text) { this.lines.push(text); };

  /* ---- fixtures ---------------------------------------------------------- */

  function fixtureState(options) {
    var opts = options || {};
    var state = TS.store.emptyState();
    state.tutors = TS.store.sampleTutors().map(function (t, i) {
      t.colorIndex = i;
      t.maxHoursPerWeek = state.settings.defaultMaxHours;
      return TS.store.normalizeTutor(t);
    });
    state.tutors.forEach(function (t, i) { t.id = 'tutor-' + i; });
    state.settings.weeklyBudgetEnabled = !!opts.budget;
    state.settings.weeklyBudgetHours = opts.budgetHours || 80;
    return state;
  }

  function tutorNamed(state, first, last) {
    for (var i = 0; i < state.tutors.length; i++) {
      if (state.tutors[i].firstName === first && (!last || state.tutors[i].lastName === last)) {
        return state.tutors[i];
      }
    }
    return null;
  }

  // What a tutor is willing to work: the hours they handed in, capped by what
  // they are approved for.
  function willingHours(t) {
    var n = 0;
    for (var i = 0; i < t.availability.length; i++) n += t.availability[i] ? 1 : 0;
    return Math.min(t.maxHoursPerWeek, n / 2);
  }

  function dayRuns(state, tutorId, day) {
    var row = [];
    for (var s = 0; s < U.SLOTS_PER_DAY; s++) row.push(0);
    state.assignments.forEach(function (a) {
      if (a.tutorId !== tutorId || a.day !== day) return;
      for (var s = a.startSlot; s < a.endSlot; s++) row[s] = 1;
    });
    var runs = [], run = 0;
    for (var i = 0; i <= U.SLOTS_PER_DAY; i++) {
      if (i < U.SLOTS_PER_DAY && row[i]) run++;
      else if (run) { runs.push(run); run = 0; }
    }
    return runs;
  }

  /* ---- 1. display names -------------------------------------------------- */

  function testDisplayNames(r) {
    function names(list) {
      var tutors = list.map(function (n, i) {
        return { id: 't' + i, firstName: n[0], lastName: n[1] };
      });
      var map = U.displayNames(tutors);
      return tutors.map(function (t) { return map[t.id]; });
    }

    var two = names([['Anna', 'Harden'], ['Anna', 'Henry']]);
    r.eq(two[0], 'Anna', 'Anna Harden keeps the bare first name');
    r.eq(two[1], 'Anna H', 'Anna Henry takes one initial');

    var reversed = names([['Anna', 'Henry'], ['Anna', 'Harden']]);
    r.eq(reversed[0], 'Anna H', 'labels do not depend on entry order (Henry)');
    r.eq(reversed[1], 'Anna', 'labels do not depend on entry order (Harden)');

    var three = names([['Anna', 'Hall'], ['Anna', 'Harden'], ['Anna', 'Henry']]);
    r.eq(three[0], 'Anna', 'three-way: Hall sorts first');
    r.eq(three[1], 'Anna H', 'three-way: Harden takes one letter');
    r.eq(three[2], 'Anna He', 'three-way: Henry grows to two letters');

    var mixed = names([['Anna', 'Harden'], ['Bea', 'Fox']]);
    r.eq(mixed[0], 'Anna', 'no collision leaves first names bare (Anna)');
    r.eq(mixed[1], 'Bea', 'no collision leaves first names bare (Bea)');

    var identical = names([['Anna', 'Henry'], ['Anna', 'Henry']]);
    r.ok(identical[0] !== identical[1], 'identical full names still get distinct labels',
      identical.join(' / '));

    var missing = names([['Anna', ''], ['Anna', '']]);
    r.ok(missing[0] !== missing[1], 'missing last names still get distinct labels',
      missing.join(' / '));

    var unique = {};
    var many = names([['Sam', 'Ash'], ['Sam', 'Ashe'], ['Sam', 'Ashby'], ['Sam', 'Barr']]);
    many.forEach(function (n) { unique[n] = true; });
    r.eq(Object.keys(unique).length, 4, 'four same-first-name tutors get four distinct labels');
  }

  /* ---- 2. contrast ------------------------------------------------------- */

  function testContrast(r) {
    // The identity bar is decorative; the text on the block is what has to
    // clear AA, in both themes and for every color in the palette including
    // the hatched repeats past the end of it.
    for (var i = 0; i < U.PALETTE.length + 2; i++) {
      var light = U.blockColors(i, false);
      var dark = U.blockColors(i, true);
      var lr = U.contrastRatio(light.ink, light.bg);
      var dr = U.contrastRatio(dark.ink, dark.bg);
      r.ok(lr >= 4.5, 'palette ' + i + ' light block text is AA', lr.toFixed(2) + ':1');
      r.ok(dr >= 4.5, 'palette ' + i + ' dark block text is AA', dr.toFixed(2) + ':1');
    }

    var brand = {
      navy: '#10305F', blue: '#0B57BE', blueDark: '#002855',
      orange: '#FE5000', orangeText: '#C63F00'
    };
    var white = '#FFFFFF';
    var darkSurface = '#18212F';
    var darkGround = '#0E1520';

    r.ok(U.contrastRatio(white, brand.navy) >= 4.5, 'header text on navy is AA',
      U.contrastRatio(white, brand.navy).toFixed(2) + ':1');
    r.ok(U.contrastRatio(brand.blue, white) >= 4.5, 'brand blue as text/button on white is AA',
      U.contrastRatio(brand.blue, white).toFixed(2) + ':1');
    r.ok(U.contrastRatio(white, brand.blue) >= 4.5, 'white on brand blue button is AA',
      U.contrastRatio(white, brand.blue).toFixed(2) + ':1');
    r.ok(U.contrastRatio(brand.blueDark, white) >= 4.5, 'PMS 295 text on white is AA');
    r.ok(U.contrastRatio(brand.orangeText, white) >= 4.5, 'darkened orange text on white is AA',
      U.contrastRatio(brand.orangeText, white).toFixed(2) + ':1');
    r.ok(U.contrastRatio(brand.orange, white) >= 3.0, 'brand orange clears 3:1 for focus rings',
      U.contrastRatio(brand.orange, white).toFixed(2) + ':1');

    r.ok(U.contrastRatio('#EEF3F9', darkSurface) >= 4.5, 'dark theme body text is AA');
    r.ok(U.contrastRatio('#AEBBCA', darkSurface) >= 4.5, 'dark theme muted text is AA',
      U.contrastRatio('#AEBBCA', darkSurface).toFixed(2) + ':1');
    r.ok(U.contrastRatio('#6FA8FF', darkGround) >= 4.5, 'dark theme accent is AA',
      U.contrastRatio('#6FA8FF', darkGround).toFixed(2) + ':1');
    r.ok(U.contrastRatio('#FF7A3D', darkGround) >= 3.0, 'dark theme orange clears 3:1');

    // No two tutors may resolve to fills that read alike, and the eight
    // Okabe-Ito hues set the bar the seven added to them have to clear.
    var worstTint = 999, tintPair = 'none';
    for (var a = 0; a < U.PALETTE.length; a++) {
      for (var b = a + 1; b < U.PALETTE.length; b++) {
        var ca = U.hexToRgb(U.blockColors(a, false).bg);
        var cb = U.hexToRgb(U.blockColors(b, false).bg);
        var spread = Math.max(
          Math.abs(ca[0] - cb[0]), Math.abs(ca[1] - cb[1]), Math.abs(ca[2] - cb[2])
        );
        if (spread < worstTint) { worstTint = spread; tintPair = a + '/' + b; }
      }
    }
    r.ok(U.PALETTE.length >= 15, 'the palette is wide enough for a normal roster',
      U.PALETTE.length + ' colors');
    r.ok(worstTint >= 8, 'every pair of palette tints is distinguishable',
      'slots ' + tintPair + ' at max channel delta ' + worstTint);

    /* The classes sit side by side in every column of the coverage page, so
     * they are the one set of colors with no solver to keep them apart -- they
     * have to be far enough apart as chosen, for every reader.
     */
    var laneHues = U.coverageLanes().map(function (lane) {
      return U.laneColors(lane, false).hue;
    });
    var worstLane = 999, lanePair = 'none';
    for (var la = 0; la < laneHues.length; la++) {
      for (var lb = la + 1; lb < laneHues.length; lb++) {
        var laneGap = U.blockGap(laneHues[la], laneHues[lb]);
        if (laneGap < worstLane) { worstLane = laneGap; lanePair = laneHues[la] + '/' + laneHues[lb]; }
      }
    }
    r.ok(worstLane >= 10, 'the class colors stay apart for every reader',
      lanePair + ' at ' + worstLane.toFixed(1));

    /* A red and a green are far apart to most readers and the same color to a
     * deuteranope. The gap the solver works from has to shrink for a pair like
     * that, or the colorblind case is invisible to it.
     */
    var normal = U.deltaE('#D53E00', '#009E6E');
    var worstCase = U.colorGap('#D53E00', '#009E6E');
    r.ok(worstCase < normal, 'a red/green pair reads closer once colorblindness is counted',
      worstCase.toFixed(1) + ' vs ' + normal.toFixed(1) + ' to normal vision');
  }

  /* ---- 2b. color assignment ---------------------------------------------- */

  function testColorAssignment(r) {
    var state = fixtureState();
    state.assignments = TS.optimizer.optimize(state, { iterations: 4000 });

    var map = U.assignColors(state.tutors, state.assignments);
    var picked = state.tutors.map(function (t) { return map[t.id]; });
    r.eq(Object.keys(map).length, state.tutors.length, 'every tutor is given a color');
    var distinct = {};
    picked.forEach(function (slot) { distinct[slot] = true; });
    r.eq(Object.keys(distinct).length, picked.length, 'no two tutors share a slot');

    var w = U.proximityMatrix(state.tutors, state.assignments);
    var n = state.tutors.length;

    // The closest any two colors the roster actually uses come. The solver
    // cannot beat it, only avoid spending it on a pair of tutors a reader
    // takes in together.
    var floor = Infinity;
    for (var a = 0; a < n; a++) {
      for (var b = a + 1; b < n; b++) {
        floor = Math.min(floor, U.blockGap(
          U.PALETTE[picked[a] % U.PALETTE.length], U.PALETTE[picked[b] % U.PALETTE.length]));
      }
    }

    // How near the closest pair of colors lands to a pair of tutors a reader
    // takes in together -- the case in the bug report, including the cross-day
    // one, a Monday block beside a Tuesday block at the same hour.
    function closestTouching(slots) {
      var gap = Infinity, pair = 'none';
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          if (w[i][j] < 0.8) continue;
          var seen = U.blockGap(U.PALETTE[slots[i] % U.PALETTE.length],
            U.PALETTE[slots[j] % U.PALETTE.length]);
          if (seen < gap) {
            gap = seen;
            pair = state.tutors[i].firstName + '/' + state.tutors[j].firstName;
          }
        }
      }
      return { gap: gap, pair: pair };
    }

    function totalClash(slots) {
      var total = 0;
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) total += w[i][j] * U.slotClash(slots[i], slots[j]);
      }
      return total;
    }

    var sequential = state.tutors.map(function (t, i) { return i; });
    var dynamic = closestTouching(picked), byOrder = closestTouching(sequential);

    r.ok(dynamic.gap < Infinity, 'the fixture schedule really does put tutors side by side');
    r.ok(dynamic.gap > floor + 0.01,
      'the ring’s closest pair is spent on two tutors nobody sees together',
      dynamic.pair + ' at ' + dynamic.gap.toFixed(1) + ' against a floor of ' + floor.toFixed(1));
    r.ok(dynamic.gap >= byOrder.gap, 'and never does worse than roster order did',
      dynamic.gap.toFixed(1) + ' vs ' + byOrder.gap.toFixed(1));
    r.ok(totalClash(picked) < totalClash(sequential),
      'schedule-aware colors beat roster-order colors overall',
      totalClash(picked).toFixed(3) + ' vs ' + totalClash(sequential).toFixed(3));

    // A block one day over at the same hour is as adjacent as one an hour later
    // in the same column, and the model has to say so.
    var monday = { day: 0, startSlot: 4, endSlot: 10 };
    var tuesday = { day: 1, startSlot: 4, endSlot: 10 };
    var thursday = { day: 3, startSlot: 4, endSlot: 10 };
    var evening = { day: 0, startSlot: 16, endSlot: 20 };
    r.ok(U.shiftProximity(monday, tuesday) >= 0.8,
      'the same hour a day apart counts as adjacent',
      U.shiftProximity(monday, tuesday).toFixed(2));
    r.ok(U.shiftProximity(monday, tuesday) > U.shiftProximity(monday, thursday),
      'a day apart is nearer than three days apart');
    r.eq(U.shiftProximity(monday, evening), 0,
      'morning and evening on the same day are not adjacent');

    var again = state.tutors.map(function (t) {
      return U.assignColors(state.tutors, state.assignments)[t.id];
    });
    r.eq(again.join(','), picked.join(','), 'the same schedule always produces the same colors');

    // Re-seating one tutor is what fitting a single tutor does, and it has to
    // leave everyone else wearing what they were already wearing.
    state.tutors.forEach(function (t, i) { t.colorIndex = picked[i]; });
    var one = U.assignColors(state.tutors, state.assignments, { only: [state.tutors[0].id] });
    var held = true;
    for (var k = 1; k < n; k++) {
      if (one[state.tutors[k].id] !== picked[k]) held = false;
    }
    r.ok(held, 'options.only leaves every other tutor at the color they had');

    // A roster past the end of the palette has to repeat a color, and every
    // repeat has to be hatched -- but the plain colors go first.
    var big = state.tutors.concat(state.tutors.map(function (t) {
      var copy = JSON.parse(JSON.stringify(t));
      copy.id = t.id + '-b';
      copy.colorIndex = 0;
      return copy;
    }));
    var bigShifts = state.assignments.concat(state.assignments.map(function (a) {
      var copy = JSON.parse(JSON.stringify(a));
      copy.id = a.id + '-b';
      copy.tutorId = a.tutorId + '-b';
      return copy;
    }));
    var bigMap = U.assignColors(big, bigShifts);
    var bigPicked = big.map(function (t) { return bigMap[t.id]; });
    var bigDistinct = {};
    bigPicked.forEach(function (slot) { bigDistinct[slot] = true; });
    r.eq(Object.keys(bigDistinct).length, big.length,
      'a roster of ' + big.length + ' still gets ' + big.length + ' distinct slots');
    var hatched = bigPicked.filter(function (slot) { return U.usesHatch(slot); }).length;
    r.eq(hatched, Math.max(0, big.length - U.PALETTE.length),
      'exactly the overflow is hatched, so plain colors are spent first');
  }

  /* ---- 2c. coverage by class --------------------------------------------- */

  function testCoverageRuns(r) {
    var tutors = [
      TS.store.normalizeTutor({ id: 'all', firstName: 'Ada',
        subjects: { chem1: true, chem2: true, orgo: true } }),
      TS.store.normalizeTutor({ id: 'gen', firstName: 'Ben', subjects: { chem1: true } }),
      TS.store.normalizeTutor({ id: 'lane', firstName: 'Dr. Lane', room: 'Office 210-B',
        subjects: { orgo: true } }),
      TS.store.normalizeTutor({ id: 'none', firstName: 'Dov', subjects: {} })
    ];
    var shift = function (id, day, a, b) {
      return TS.store.normalizeAssignment({ id: id + day + a, tutorId: id, day: day, startSlot: a, endSlot: b });
    };
    var laneOf = function (runs, label) {
      return runs.filter(function (run) { return run.label === label; });
    };

    // Each class is a column of its own on the class page.
    var lanes = U.coverageLanes();
    r.eq(lanes.length, U.SUBJECTS.length, 'every class has a lane of its own');
    r.eq(lanes.map(function (lane) { return U.coverageLabel(lane); }).join(','), '1110,1120,ORGO',
      'headed by its course number');
    r.eq(U.laneLabel(lanes[0]), 'General Chemistry I', 'and named in full in the legend');

    // A tutor signed up for three classes, working one shift, covers all three
    // at once.
    var runs = U.coverageRuns([shift('all', 0, 4, 10)], tutors);
    r.eq(runs.length, 3, 'one tutor teaching three classes covers three lanes at once');
    var labels = runs.map(function (run) { return run.label; }).sort().join(',');
    r.eq(labels, '1110,1120,ORGO', 'labelled for what they actually cover');
    var sameHours = runs.every(function (run) {
      return run.day === 0 && run.startSlot === 4 && run.endSlot === 10;
    });
    r.ok(sameHours, 'all three runs cover exactly the hours they worked');

    // Two tutors back to back on one class are a single stretch of cover, and
    // the run names both, because either may be the one sitting there.
    var joined = U.coverageRuns([shift('all', 2, 4, 8), shift('gen', 2, 8, 12)], tutors);
    var genRun = laneOf(joined, '1110');
    r.eq(genRun.length, 1, 'back-to-back shifts on one class are a single run');
    r.eq(genRun[0].startSlot + '-' + genRun[0].endSlot, '4-12', 'running the length of both');
    r.eq(genRun[0].tutorIds.slice().sort().join(','), 'all,gen', 'naming everyone in it');
    r.eq(genRun[0].segments.map(function (seg) {
      return seg.startSlot + '-' + seg.endSlot + ' ' + seg.tutorIds.join(',');
    }).join(' | '), '4-8 all | 8-12 gen', 'with a segment for each change of tutor inside it');
    r.eq(laneOf(joined, '1120')[0].endSlot, 8, 'a class only one of them teaches stops with them');

    // "Chance, Olivia 9-12, Olivia 12-2, Emma, Olivia 3-5": the class stays one
    // block while it is covered, who is in changes the segment, and a segment
    // with two names lists them alphabetically, whoever was entered first.
    var crew = [
      TS.store.normalizeTutor({ id: 'o', firstName: 'Olivia', subjects: { chem1: true } }),
      TS.store.normalizeTutor({ id: 'c', firstName: 'Chance', subjects: { chem1: true } }),
      TS.store.normalizeTutor({ id: 'e', firstName: 'Emma', subjects: { chem1: true } })
    ];
    var day = U.coverageRuns([
      shift('o', 0, 4, 14), shift('c', 0, 4, 10), shift('o', 0, 16, 20), shift('e', 0, 16, 20)
    ], crew);
    var names = function (seg) {
      return seg.tutorIds.map(function (id) {
        return crew.filter(function (t) { return t.id === id; })[0].firstName;
      }).join(', ');
    };
    r.eq(day.map(function (run) { return U.formatRange(run.startSlot, run.endSlot); }).join(' / '),
      '9:00 AM–2:00 PM / 3:00–5:00 PM', 'the class is one block for as long as it is covered');
    r.eq(day[0].segments.concat(day[1].segments).map(function (seg) {
      return names(seg) + ' ' + U.formatRange(seg.startSlot, seg.endSlot);
    }).join(' / '), 'Chance, Olivia 9:00 AM–12:00 PM / Olivia 12:00–2:00 PM / Emma, Olivia 3:00–5:00 PM',
    'and splits into segments wherever who is in changes, names in alphabetical order');
    // A stretch too short for its names folds into the one after it.
    var cramped = U.mergeCrampedSegments([
      { startSlot: 14, endSlot: 16, tutorIds: ['p'] },
      { startSlot: 16, endSlot: 24, tutorIds: ['p', 's'] },
      { startSlot: 24, endSlot: 25, tutorIds: ['s'] }
    ], function (seg) { return seg.endSlot - seg.startSlot >= 4; });
    r.eq(cramped.map(function (seg) {
      return seg.startSlot + '-' + seg.endSlot + ' ' + seg.tutorIds.join(',');
    }).join(' | '), '14-25 p,s', 'a cramped stretch merges into the next, names joined, and so on to the end');
    var tail = U.mergeCrampedSegments([
      { startSlot: 10, endSlot: 14, tutorIds: ['h'] },
      { startSlot: 14, endSlot: 16, tutorIds: ['d', 'h'] }
    ], function (seg) { return seg.endSlot - seg.startSlot >= 4; });
    r.eq(tail.map(function (seg) {
      return seg.startSlot + '-' + seg.endSlot + ' ' + seg.tutorIds.join(',');
    }).join(' | '), '10-16 h,d', 'a cramped last stretch folds back into the one before');
    r.eq(U.mergeCrampedSegments([{ startSlot: 1, endSlot: 2, tutorIds: ['x'] }],
      function () { return false; }).length, 1, 'a lone stretch stays as it is');

    r.eq(U.sortedNames(['Olivia', 'chance', 'Emma']).join(','), 'chance,Emma,Olivia',
      'and the order ignores capitalisation');

    // An hour with nobody in splits the cover rather than papering over it.
    var split = U.coverageRuns([shift('gen', 3, 4, 8), shift('gen', 3, 10, 14)], tutors);
    r.eq(split.length, 2, 'a gap in cover breaks the run in two');
    r.eq(split[0].endSlot + '/' + split[1].startSlot, '8/10', 'on either side of the gap');

    // Office hours in a room of their own are cover: a student can go there.
    r.eq(laneOf(U.coverageRuns([shift('lane', 1, 10, 12)], tutors), 'ORGO').length, 1,
      'office hours in another room still cover the class');
    r.eq(U.coverageRuns([shift('none', 1, 4, 10)], tutors).length, 0,
      'a tutor with no classes covers none');

    var hours = U.coverageLaneHours(U.coverageRuns([shift('all', 0, 4, 10)], tutors));
    r.eq(hours.length, lanes.length, 'the totals line up with the lanes');
    r.eq(hours[0], 6, 'and count half hours of cover');

    // The classes are named colors, three Okabe-Ito hues.
    r.eq(U.laneColors(lanes[0], false).hue, '#0072B2', 'General Chemistry I is blue');
    r.eq(U.laneColors(lanes[1], false).hue, '#009E73', 'II is green');
    r.eq(U.laneColors(lanes[2], false).hue, '#D55E00', 'and Organic is orange');
    r.eq(U.coverageColors(runs[0], false).hue, U.laneColors(lanes[runs[0].lane], false).hue,
      'a block wears its lane\'s color');

    // The real fixture, as a sanity check that it holds together at size.
    var state = fixtureState();
    state.assignments = TS.optimizer.optimize(state, { iterations: 4000 });
    var real = U.coverageRuns(state.assignments, state.tutors);
    r.ok(real.length > 0, 'the fixture schedule covers something', real.length + ' runs');
    var sane = real.every(function (run) {
      return run.endSlot > run.startSlot && run.tutorIds.length > 0 &&
        run.label && run.lane >= 0 && run.lane < lanes.length;
    });
    r.ok(sane, 'every run has an end after its start, a label and somebody in it');

    // Two runs in the same lane on the same day must never overlap, or the
    // grid would draw one block on top of another.
    var clash = false;
    real.forEach(function (a) {
      real.forEach(function (b) {
        if (a === b || a.lane !== b.lane || a.day !== b.day) return;
        if (a.startSlot < b.endSlot && b.startSlot < a.endSlot) clash = true;
      });
    });
    r.ok(!clash, 'no two runs in one lane ever overlap');
  }

  /* ---- 3. CSV ------------------------------------------------------------ */

  function testCsv(r) {
    var state = fixtureState();
    var text = TS.csv.exportTutors(state.tutors);
    var back = TS.csv.importTutors(text);

    r.eq(back.warnings.length, 0, 'a clean export re-imports without warnings',
      back.warnings.join(' | '));
    r.eq(back.tutors.length, state.tutors.length, 'round trip keeps every tutor');

    var identical = true;
    for (var i = 0; i < state.tutors.length; i++) {
      var a = state.tutors[i], b = back.tutors[i];
      if (a.firstName !== b.firstName || a.lastName !== b.lastName) identical = false;
      if (U.subjectMask(a.subjects) !== U.subjectMask(b.subjects)) identical = false;
      if (a.maxHoursPerWeek !== b.maxHoursPerWeek) identical = false;
      for (var s = 0; s < U.TOTAL_SLOTS; s++) {
        if ((a.availability[s] ? 1 : 0) !== (b.availability[s] ? 1 : 0)) identical = false;
      }
    }
    r.ok(identical, 'round trip preserves names, subjects, caps and availability');
    r.eq(text.split('\r\n')[0].indexOf('MaxHoursPerDay'), -1, 'the export has no daily cap column');

    // A file exported before the daily cap went away still imports, and a blank
    // weekly figure is left for the schedule's own default to fill.
    var old = TS.csv.importTutors(
      'First,Last,1110,MaxHoursPerWeek,MaxHoursPerDay,Availability\nJo,Lin,Yes,,6,"Mon 1-4pm"\n');
    r.eq(old.warnings.length, 0, 'an older file with a daily cap column imports cleanly',
      old.warnings.join(' | '));
    r.eq(old.tutors[0].maxHoursPerWeek, undefined, 'a blank weekly figure is left to the default');
    r.eq(TS.store.normalizeTutor(old.tutors[0]).maxHoursPerWeek, 20, 'which is 20 hours');

    var warnings = [];
    var avail = TS.csv.parseAvailability('Mon-Thu 3pm-8pm', function (m) { warnings.push(m); });
    r.eq(warnings.length, 0, '"Mon-Thu 3pm-8pm" parses cleanly', warnings.join(' | '));
    var count = 0;
    for (var k = 0; k < U.TOTAL_SLOTS; k++) count += avail[k] ? 1 : 0;
    r.eq(count, 4 * 10, '"Mon-Thu 3pm-8pm" is 20 hours');

    // There is no Friday tutoring: a roster that offers it says so, and keeps
    // the rest of the week.
    warnings = [];
    var withFriday = TS.csv.parseAvailability('Mon-Fri 3pm-5pm', function (m) { warnings.push(m); });
    r.ok(warnings.length === 1 && /Friday/.test(warnings[0]), 'Friday hours warn that they were skipped',
      warnings.join(' | '));
    r.eq(withFriday.filter(function (v) { return v; }).length, 4 * 4, 'and Monday to Thursday are kept');
    warnings = [];
    TS.csv.parseAvailability('Fri 9-12', function (m) { warnings.push(m); });
    r.eq(warnings.length, 1, 'a Friday-only clause warns once and adds nothing', warnings.join(' | '));

    warnings = [];
    TS.csv.parseAvailability('Mon 06:00-09:00', function (m) { warnings.push(m); });
    r.ok(warnings.length > 0, 'a range starting before 7:00 AM warns that it was trimmed');

    var quoted = TS.csv.parseRows('First,Notes\r\n"Ann","likes, commas\nand newlines"\r\n');
    r.eq(quoted.length, 2, 'quoted fields with commas and newlines stay one row');
    r.eq(quoted[1][1], 'likes, commas\nand newlines', 'quoted field content survives intact');

    var messy = TS.csv.importTutors('First,Last,1120,Availability\nJo,Lin,yes,"Tues/Thurs 1-4pm"\n');
    r.eq(messy.tutors.length, 1, 'a hand-typed row imports');
    r.ok(messy.tutors[0].subjects.chem2, '"yes" checks the subject box');
    var jo = 0;
    for (var m = 0; m < U.TOTAL_SLOTS; m++) jo += messy.tutors[0].availability[m] ? 1 : 0;
    r.eq(jo, 12, '"Tues/Thurs 1-4pm" is 6 hours across two days');

    // Emails ride along in the spreadsheet, and a file without the column
    // still imports with the addresses simply left blank.
    var mailed = TS.store.normalizeTutor({ firstName: 'Ada', lastName: 'Lo', email: ' ada@example.edu ',
      room: ' Office 210-B ', subjects: { chem1: true }, availability: [] });
    r.eq(mailed.email, 'ada@example.edu', 'a tutor keeps their email, trimmed');
    r.eq(mailed.room, 'Office 210-B', 'and their own room, trimmed');
    r.eq(TS.store.normalizeTutor({ firstName: 'Nobody' }).email, '', 'and has none by default');
    var mailBack = TS.csv.importTutors(TS.csv.exportTutors([mailed]));
    r.eq(mailBack.tutors[0].email, 'ada@example.edu', 'a CSV round trip keeps the email');
    r.eq(mailBack.tutors[0].room, 'Office 210-B', 'and the room');
    r.eq(messy.tutors[0].email, '', 'a file with no Email column imports with no email');
    r.eq(messy.tutors[0].room, '', 'or Room column with no room');

    // The template is what people copy, so its columns have to line up.
    var template = TS.csv.importTutors(TS.csv.templateCsv());
    r.eq(template.warnings.length, 0, 'the template imports without warnings',
      template.warnings.join(' | '));
    r.eq(template.tutors[0].availability.filter(function (v) { return v; }).length, 20,
      'the template\'s availability lands in the Availability column (10 hours)');
    r.eq(template.tutors[0].email, 'rquint@example.edu', 'and its email in the Email column');
    r.eq(template.tutors[2].room, 'Office 210-B', 'and a faculty member\'s office in the Room column');
  }

  /* ---- 4. the ten-tutor fixture ------------------------------------------ */

  function checkSchedule(r, state, label) {
    var problems = TS.optimizer.validate(state, state.assignments);
    r.eq(problems.length, 0, label + ': no hard constraint is violated', problems.slice(0, 6).join(' | '));

    state.tutors.forEach(function (t) {
      var hours = TS.optimizer.stats(state, state.assignments).perTutor.filter(function (p) {
        return p.id === t.id;
      })[0];
      r.ok(hours.hours <= t.maxHoursPerWeek + 1e-9,
        label + ': ' + t.firstName + ' ' + t.lastName + ' is within their cap',
        hours.hours + ' h of ' + t.maxHoursPerWeek);
    });
  }

  function testFixtureBudgetOff(r) {
    var state = fixtureState({ budget: false });
    state.assignments = TS.optimizer.optimize(state, { seed: 7, iterations: 90000 });
    var st = TS.optimizer.stats(state, state.assignments);

    r.note('Config B (budget off): ' + st.totalHours.toFixed(1) + ' h, coverage ' +
      st.coveredSlots + '/' + st.totalSlots + ', doubled ' + st.doubledHours.toFixed(1) +
      ' h, subjects/hour ' + st.avgSubjects.toFixed(2));

    checkSchedule(r, state, 'Config B');
    r.eq(st.coveredSlots, st.totalSlots, 'Config B: every open half hour is covered',
      'window ' + U.formatMinutes(U.slotStartMinutes(st.window.start)) + '-' +
      U.formatMinutes(U.slotStartMinutes(st.window.end)));
    r.ok(st.overCapacitySlots === 0, 'Config B: the center never holds more than its caps allow');
    r.eq(st.returnTrips, 0, 'Config B: nobody is sent away and asked back the same day');

    // Checked across the roster rather than for one tutor on one day. Nobody in
    // this fixture offers more than five unbroken hours, so the threshold is not
    // pressed hard here; the fuzz pass is what leans on it, with random rosters
    // and a break threshold that moves.
    var maxRun = Math.round(state.settings.breakAfterHours * 2) - 1;
    var overRun = [];
    state.tutors.forEach(function (t) {
      for (var d = 0; d < U.DAYS; d++) {
        dayRuns(state, t.id, d).forEach(function (n) {
          if (n > maxRun) overRun.push(t.firstName + ' ' + U.DAY_NAMES[d] + ' ' + (n / 2) + ' h');
        });
      }
    });
    r.eq(overRun.length, 0, 'Config B: nobody works past the break threshold on any day',
      overRun.join(', '));

    var labels = U.displayNames(state.tutors);
    var quint = tutorNamed(state, 'Rosa', 'Quint');
    var vance = tutorNamed(state, 'Rosa', 'Vance');
    r.eq(labels[quint.id], 'Rosa', 'fixture: Rosa Quint shows as "Rosa"');
    r.eq(labels[vance.id], 'Rosa V', 'fixture: Rosa Vance shows as "Rosa V"');

    return st;
  }

  function testFixtureBudgetOn(r) {
    // 50 h binds: the roster works 60 without one.
    var state = fixtureState({ budget: true, budgetHours: 50 });
    state.assignments = TS.optimizer.optimize(state, { seed: 7, iterations: 90000 });
    var st = TS.optimizer.stats(state, state.assignments);

    r.note('Config A (50 h budget): ' + st.totalHours.toFixed(1) + ' h, coverage ' +
      st.coveredSlots + '/' + st.totalSlots + ', doubled ' + st.doubledHours.toFixed(1) +
      ' h, subjects/hour ' + st.avgSubjects.toFixed(2));
    r.note('  per tutor: ' + st.perTutor.map(function (p) {
      var t = null;
      for (var i = 0; i < state.tutors.length; i++) if (state.tutors[i].id === p.id) t = state.tutors[i];
      return t.firstName.charAt(0) + t.lastName.charAt(0) + ' ' + p.hours;
    }).join(', '));

    checkSchedule(r, state, 'Config A');
    r.ok(st.totalHours <= 50 + 1e-9, 'Config A: total stays inside the 50 hour budget',
      st.totalHours + ' h');
    var gapsA = TS.optimizer.analyzeGaps(state, state.assignments);
    r.eq(st.coveredSlots, st.totalSlots, 'Config A: every open half hour is still covered',
      gapsA.map(function (g) {
        return U.DAY_NAMES[g.day] + ' ' + U.formatRange(g.start, g.end) + ' (' + g.reason + ')';
      }).join('; '));
    r.ok(st.totalHours >= 49, 'Config A: the budget is actually spent', st.totalHours + ' h');

    // Approved hours are the same for everyone; what each tutor is willing to
    // work is the availability they handed in. Neither may be exceeded.
    var beyond = st.perTutor.filter(function (p) {
      var t = null;
      for (var i = 0; i < state.tutors.length; i++) if (state.tutors[i].id === p.id) t = state.tutors[i];
      return p.hours > willingHours(t);
    });
    r.eq(beyond.length, 0, 'Config A: nobody works hours they did not offer',
      beyond.map(function (p) { return p.id + ' ' + p.hours + ' h'; }).join(', '));

    // Equity is soft, so this guards the shape of the result rather than an
    // exact split: nobody gets starved, and nobody hoovers up the budget. The
    // faculty member's single hour of office hours is not a share to divide.
    var students = st.perTutor.filter(function (p) {
      return !U.ownRoom(state.tutors.filter(function (t) { return t.id === p.id; })[0]);
    });
    var hours = students.map(function (p) { return p.hours; });
    var lowest = Math.min.apply(null, hours);
    var highest = Math.max.apply(null, hours);
    r.ok(lowest >= 3, 'Config A: no tutor is starved of hours', 'lowest is ' + lowest + ' h');
    r.ok(highest <= state.settings.defaultMaxHours, 'Config A: no tutor exceeds their cap',
      'highest is ' + highest + ' h');
    r.note('  spread ' + lowest + '-' + highest + ' h');

    return st;
  }

  function testCoverageBeatsDuplication(r) {
    // Monday 10:00 to noon is Rosa and Kenji, and Kenji only tutors General
    // Chemistry II, which Rosa already covers -- pairing them adds no class the
    // hour did not already have. A second tutor is still worth more than the
    // duplication costs, so both go on.
    var state = fixtureState({ budget: false });
    state.assignments = TS.optimizer.optimize(state, { seed: 3, iterations: 60000 });

    var occupancy = [];
    for (var s = U.hhmmToSlot('10:00'); s < U.hhmmToSlot('12:00'); s++) {
      var n = 0;
      for (var i = 0; i < state.assignments.length; i++) {
        var a = state.assignments[i];
        if (a.day === 0 && a.startSlot <= s && a.endSlot > s) n++;
      }
      occupancy.push(n);
    }
    r.ok(occupancy.every(function (n) { return n >= 1; }),
      'Monday 10 AM-noon is staffed', JSON.stringify(occupancy));
    r.ok(occupancy.every(function (n) { return n >= 2; }),
      'Monday 10 AM-noon is doubled up even though the second tutor adds no class',
      JSON.stringify(occupancy));
  }

  /* ---- 5. randomized fuzz ------------------------------------------------ */

  function testFuzz(r) {
    var rand = TS.optimizer.mulberry32(4242);
    var runs = 12;
    var allClean = true;
    var details = '';

    for (var n = 0; n < runs; n++) {
      var state = TS.store.emptyState();
      var count = 2 + Math.floor(rand() * 9);
      state.settings.weeklyBudgetEnabled = rand() < 0.5;
      state.settings.weeklyBudgetHours = 20 + Math.floor(rand() * 90);
      state.settings.maxConcurrent = 1 + Math.floor(rand() * 3);
      state.settings.eveningMaxConcurrent = 1 + Math.floor(rand() * 3);
      state.settings.eveningStartSlot = 12 + Math.floor(rand() * 16);
      state.settings.minShiftSlots = 1 + Math.floor(rand() * 4);
      state.settings.breakAfterHours = 3 + Math.floor(rand() * 6);

      for (var t = 0; t < count; t++) {
        var avail = [];
        var density = 0.15 + rand() * 0.7;
        for (var i = 0; i < U.TOTAL_SLOTS; i++) avail.push(rand() < density ? 1 : 0);
        state.tutors.push(TS.store.normalizeTutor({
          id: 'f' + n + '-' + t,
          firstName: 'T' + t,
          lastName: 'L' + t,
          colorIndex: t,
          subjects: { chem1: rand() < 0.6, chem2: rand() < 0.5, orgo: rand() < 0.4 },
          // Now and then a faculty member in an office of their own, so the
          // rules that leave them out of the room's limit are leaned on too.
          room: rand() < 0.15 ? 'Office ' + t : '',
          maxHoursPerWeek: 2 + Math.floor(rand() * 20),
          availability: avail
        }));
      }

      state.assignments = TS.optimizer.optimize(state, { seed: 100 + n, iterations: 12000 });
      var problems = TS.optimizer.validate(state, state.assignments);
      if (problems.length) {
        allClean = false;
        details += 'run ' + n + ': ' + problems.slice(0, 3).join(', ') + '; ';
      }
    }

    r.ok(allClean, 'fuzz: ' + runs + ' random rosters all produce legal schedules', details);
  }

  function testLockedBlocksSurvive(r) {
    var state = fixtureState({ budget: false });
    state.assignments = TS.optimizer.optimize(state, { seed: 11, iterations: 30000 });
    if (!state.assignments.length) { r.ok(false, 'locked test needs a schedule to lock'); return; }

    var target = state.assignments[0];
    target.locked = true;
    var signature = target.tutorId + ':' + target.day + ':' + target.startSlot + ':' + target.endSlot;

    state.assignments = TS.optimizer.optimize(state, { seed: 12, iterations: 30000 });
    var survived = state.assignments.some(function (a) {
      return a.locked && (a.tutorId + ':' + a.day + ':' + a.startSlot + ':' + a.endSlot) === signature;
    });
    r.ok(survived, 'a locked shift is preserved exactly across re-optimization', signature);
  }

  function testContiguousBlocks(r) {
    var state = fixtureState({ budget: false });
    state.assignments = TS.optimizer.optimize(state, { seed: 21, iterations: 30000 });

    var touching = state.assignments.filter(function (a) {
      return state.assignments.some(function (b) {
        return b !== a && b.tutorId === a.tutorId && b.day === a.day && b.startSlot === a.endSlot;
      });
    });
    r.eq(touching.length, 0, 'back-to-back shifts for one tutor come out as a single block',
      touching.slice(0, 3).map(function (a) {
        return a.tutorId + ' ' + U.DAY_NAMES[a.day] + ' ending ' + a.endSlot;
      }).join(' | '));
  }

  function testFitOneTutor(r) {
    var state = fixtureState({ budget: false });
    state.assignments = TS.optimizer.optimize(state, { seed: 31, iterations: 30000 });

    // Stand in for a mid-semester hire: one tutor with no shifts, everyone else
    // already told what they are working.
    var hire = state.tutors[3];
    state.assignments = state.assignments.filter(function (a) { return a.tutorId !== hire.id; });
    var before = state.assignments.map(function (a) {
      return a.id + ':' + a.tutorId + ':' + a.day + ':' + a.startSlot + ':' + a.endSlot;
    }).sort().join('|');

    var result = TS.optimizer.fitTutor(state, hire.id);
    var after = result.assignments
      .filter(function (a) { return a.tutorId !== hire.id; })
      .map(function (a) {
        return a.id + ':' + a.tutorId + ':' + a.day + ':' + a.startSlot + ':' + a.endSlot;
      }).sort().join('|');

    r.eq(after, before, 'fitting one tutor leaves every other shift exactly where it was');
    r.ok(result.added.length > 0, 'the fitted tutor gets shifts', hire.firstName);
    r.ok(result.addedSlots <= hire.maxHoursPerWeek * 2,
      'the fitted tutor stays inside their weekly cap', (result.addedSlots / 2) + ' h');

    state.assignments = result.assignments;
    r.eq(TS.optimizer.validate(state, state.assignments).length, 0,
      'a schedule with a fitted tutor breaks no rule',
      TS.optimizer.validate(state, state.assignments).slice(0, 4).join(' | '));

    // Pressing the button twice must not stack a second copy of their week.
    var twice = TS.optimizer.fitTutor(state, hire.id);
    var hours = twice.assignments.filter(function (a) { return a.tutorId === hire.id; })
      .reduce(function (n, a) { return n + (a.endSlot - a.startSlot); }, 0);
    r.ok(hours <= hire.maxHoursPerWeek * 2,
      'auto-fitting the same tutor twice does not double their hours', (hours / 2) + ' h');
  }

  function testScheduleWindow(r) {
    function label(w) {
      return U.formatMinutes(U.slotStartMinutes(w.start)) + '-' + U.formatMinutes(U.slotStartMinutes(w.end));
    }
    function tutorFree(day, from, to) {
      var a = new Array(U.TOTAL_SLOTS);
      for (var i = 0; i < U.TOTAL_SLOTS; i++) a[i] = 0;
      for (var s = from; s < to; s++) a[U.idx(day, s)] = 1;
      return { availability: a };
    }
    var CORE = '9:00 AM-5:00 PM';

    r.eq(label(U.scheduleWindow([])), CORE, 'an empty schedule still shows the 9-to-5 core');
    r.eq(label(U.scheduleWindow([{ day: 0, startSlot: 6, endSlot: 16 }])), CORE,
      'a schedule inside 9-to-5 does not shrink below it');
    r.eq(label(U.scheduleWindow([{ day: 0, startSlot: 1, endSlot: 6 }])), '7:30 AM-5:00 PM',
      'an early shift opens the top of the grid');
    r.eq(label(U.scheduleWindow([{ day: 3, startSlot: 20, endSlot: 27 }])), '9:00 AM-8:30 PM',
      'a late shift opens the bottom of the grid');

    // The editor has to offer the hours a tutor is free for, even before any
    // shift is placed there; the printed schedule does not.
    var early = [tutorFree(2, 0, 4)];
    r.eq(label(U.editorWindow(early, [])), '7:00 AM-5:00 PM',
      'the editor opens up for availability outside the core');
    r.eq(label(U.scheduleWindow([])), CORE,
      'the printed window ignores availability nobody is working');
    r.eq(label(U.editorWindow([tutorFree(1, 8, 14)], [])), CORE,
      'availability inside the core leaves the editor at 9-to-5');
  }

  function testUndoHistory(r) {
    TS.store.reset();
    TS.store.clearHistory();
    r.ok(!TS.store.canUndo(), 'a fresh state has nothing to undo');

    TS.store.loadSample();
    var count = TS.store.state.tutors.length;
    r.ok(count > 0, 'the sample roster loads');
    r.ok(TS.store.canUndo(), 'loading the sample is undoable');

    var target = TS.store.state.tutors[0];
    var name = target.firstName;
    TS.store.removeTutor(target.id);
    TS.store.commit('remove-tutor');
    r.eq(TS.store.state.tutors.length, count - 1, 'removing a tutor takes effect');

    r.eq(TS.store.undo(), 'remove-tutor', 'undo reports what it stepped over');
    r.eq(TS.store.state.tutors.length, count, 'undo brings the tutor back');
    r.eq(TS.store.state.tutors[0].firstName, name, 'undo restores them intact');

    r.eq(TS.store.redo(), 'remove-tutor', 'redo reports the same change');
    r.eq(TS.store.state.tutors.length, count - 1, 'redo removes them again');

    // Undoing to the start, then one step past it.
    var guard = 0;
    while (TS.store.canUndo() && guard++ < 100) TS.store.undo();
    r.eq(TS.store.state.tutors.length, 0, 'undoing everything reaches the empty state');
    r.eq(TS.store.undo(), null, 'undo past the beginning is a no-op');

    // A fresh change clears the redo branch, as undo stacks do.
    TS.store.loadSample();
    TS.store.undo();
    r.ok(TS.store.canRedo(), 'an undone change can be redone');
    TS.store.loadSample();
    r.ok(!TS.store.canRedo(), 'a new change drops the redo branch');

    TS.store.reset();
    TS.store.clearHistory();
  }

  /* ---- 6. a room of their own -------------------------------------------
   * A faculty member holding office hours in their own office is cover for
   * their classes but not a seat in the tutoring room. Both halves of that
   * are asserted, because either one wrong is invisible on screen until a
   * handout is already posted.
   */
  function testOwnRoom(r) {
    var free = function (t, day, from, to) {
      for (var s = from; s < to; s++) t.availability[U.idx(day, s)] = 1;
    };
    var room = fixtureState();
    room.settings.maxConcurrent = 2;
    var a = room.tutors[0], b = room.tutors[1], c = room.tutors[2];
    c.room = 'Office 135-A';
    free(a, 0, 8, 12); free(b, 0, 8, 12); free(c, 0, 8, 12);
    room.assignments = [
      { id: 'm1', tutorId: a.id, day: 0, startSlot: 8, endSlot: 12 },
      { id: 'm2', tutorId: b.id, day: 0, startSlot: 8, endSlot: 12 },
      { id: 'o1', tutorId: c.id, day: 0, startSlot: 8, endSlot: 12 }
    ].map(TS.store.normalizeAssignment);

    r.eq(TS.optimizer.validate(room, room.assignments).length, 0,
      'two tutors in the room plus office hours elsewhere breaks no rule',
      TS.optimizer.validate(room, room.assignments).join(' | '));
    r.eq(TS.optimizer.stats(room, room.assignments).overCapacitySlots, 0,
      'office hours do not put the room over its limit');
    c.room = '';
    r.ok(TS.optimizer.stats(room, room.assignments).overCapacitySlots > 0,
      'the same three all in the room would be over it');
    c.room = 'Office 135-A';

    // Placing office hours by hand is measured the same way.
    TS.store.replaceState(room);
    var placed = TS.calendar.checkPlacement(TS.store.state,
      { id: 'o1', tutorId: c.id }, 0, 8, 12);
    r.ok(placed.ok && !placed.overCapacity, 'office hours by hand are not flagged over the limit');
    // Half an hour of office hours is theirs to hold, below the shift minimum.
    var short = TS.calendar.checkPlacement(TS.store.state,
      { id: 'o1', tutorId: c.id }, 0, 8, 9);
    r.ok(short.ok, 'office hours may be shorter than the minimum shift', short.reason);
    var shortTutor = TS.calendar.checkPlacement(TS.store.state,
      { id: null, tutorId: a.id }, 0, 8, 9);
    r.ok(!shortTutor.ok, 'while a tutor\'s shift may not');
    TS.store.reset();
    TS.store.clearHistory();

    // Their hours count as coverage: the week reports them covered.
    var hole = TS.store.emptyState();
    hole.tutors = [TS.store.normalizeTutor({
      id: 'prof', firstName: 'Dr. Bragg', room: 'Office 135-A',
      subjects: { chem1: true, chem2: true, orgo: true }, maxHoursPerWeek: 1, availability: []
    })];
    free(hole.tutors[0], 2, 11, 12);
    hole.assignments = [TS.store.normalizeAssignment({ id: 'b1', tutorId: 'prof', day: 2, startSlot: 11, endSlot: 12 })];
    r.eq(TS.optimizer.validate(hole, hole.assignments).length, 0,
      'half an hour of office hours is a legal schedule',
      TS.optimizer.validate(hole, hole.assignments).join(' | '));
    r.eq(TS.optimizer.stats(hole, hole.assignments).coveredSlots, 1,
      'and counts as the half hour covered');
    var wednesday = TS.optimizer.analyzeGaps(hole, hole.assignments).filter(function (g) {
      return g.day === 2;
    });
    r.eq(wednesday.length, 2, 'the gaps on either side of it are reported, not the hour itself');

    // A shift from the Life Science scheduler held somewhere else, or on a
    // Friday, has no place on this calendar and is left behind on load.
    var imported = TS.store.migrate({
      tutors: [{ id: 't', firstName: 'T', availability: [] }],
      assignments: [
        { id: 'keep', tutorId: 't', day: 1, startSlot: 4, endSlot: 8, kind: 'main' },
        { id: 'lab', tutorId: 't', day: 1, startSlot: 8, endSlot: 12, kind: 'lab', room: 'OMN 286' },
        { id: 'fri', tutorId: 't', day: 4, startSlot: 4, endSlot: 8 }
      ]
    });
    r.eq(imported.assignments.map(function (x) { return x.id; }).join(','), 'keep',
      'an open lab and a Friday shift are dropped from an imported file');
    r.ok(!('kind' in imported.assignments[0]) && !('room' in imported.assignments[0]),
      'and a kept shift carries no kind or room of its own');
  }

  /* ---- 6b. the two 7-week halves ------------------------------------------ */

  function testPeriods(r) {
    TS.store.reset();
    TS.store.loadSample();
    TS.store.setPrintPeriods(null);
    var st = function () { return TS.store.state; };
    var who = st().tutors[0].id;
    TS.store.addAssignment({ tutorId: who, day: 0, startSlot: 12, endSlot: 16 });
    st().periods[0].start = '2026-08-24';
    st().periods[0].end = '2026-10-09';
    TS.store.commit('add-shift');

    r.eq(st().activePeriod, 0, 'the schedule opens on the 1st 7 weeks');
    r.eq(st().periods[1].assignments, null, 'with the 2nd not started yet');

    // Printing, while the 1st is under way, is both halves in one document.
    var sept = new Date(2026, 8, 24), nov = new Date(2026, 10, 2);
    r.eq(TS.store.printPeriods(sept), 'both', 'both 7 weeks print while the 1st is under way');
    var views = TS.store.printViews(sept);
    r.eq(views.map(function (v) { return v.periods[v.activePeriod].label; }).join(' / '),
      '1st 7 weeks / 2nd 7 weeks', 'the 1st, then the 2nd');
    r.eq(views[0].assignments.length, 1, 'the half on screen prints as it stands, unsaved shift and all');
    r.eq(views[1].assignments.length, 1, 'a 2nd never opened prints as the copy it would open as');
    r.eq(st().periods[1].assignments, null, 'without printing starting it');
    r.eq(views[0].settings.effective, 'Aug 24 – Oct 9, 2026', 'each half carries its own dates to the handout');
    r.eq(TS.store.printName(sept), 'Chemistry Tutoring Schedule 8-24-2026',
      'and the file is named for the 1st\'s start date');

    TS.store.switchPeriod(1);
    TS.store.commit('period');
    r.eq(st().activePeriod, 1, 'switching opens the 2nd 7 weeks');
    r.eq(st().assignments.length, 1, 'which starts as a copy of the 1st');
    r.ok(st().assignments[0].id !== st().periods[0].assignments[0].id,
      'with shifts of its own, not the 1st\'s');

    // Changing the 2nd leaves the 1st alone.
    TS.store.removeAssignment(st().assignments[0].id);
    st().periods[1].start = '2026-10-12';
    st().periods[1].end = '2026-12-10';
    TS.store.commit('remove');
    TS.store.switchPeriod(0);
    TS.store.commit('period');
    r.eq(st().assignments.length, 1, 'the 1st keeps its shift when the 2nd drops it');
    TS.store.switchPeriod(1);
    TS.store.commit('period');
    r.eq(st().assignments.length, 0, 'while the 2nd stays as it was left');

    // Once the 1st is over, only the 2nd prints -- unless someone picks otherwise.
    r.eq(TS.store.periodInEffect(sept) + '/' + TS.store.periodInEffect(nov), '0/1',
      'the half in effect follows the 1st\'s end date');
    r.eq(TS.store.printPeriods(nov), '1', 'after the 1st ends, only the 2nd prints');
    views = TS.store.printViews(nov);
    r.eq(views.length + ':' + views[0].activePeriod, '1:1', 'one half, the 2nd');
    r.eq(TS.store.printName(nov), 'Chemistry Tutoring Schedule 10-12-2026', 'named for its own start');
    TS.store.setPrintPeriods('0');
    views = TS.store.printViews(nov);
    r.eq(views.length + ':' + views[0].activePeriod + ':' + views[0].assignments.length, '1:0:1',
      '"1st 7 weeks only" prints the 1st alone, even from the 2nd');
    TS.store.setPrintPeriods('both');
    r.eq(TS.store.printViews(nov).length, 2, '"Both" prints both even after the 1st is over');
    TS.store.setPrintPeriods(null);

    // Opening the app: the half in effect, wherever it was left.
    TS.store.switchPeriod(0);
    TS.store.commit('period');
    r.ok(TS.store.openPeriodInEffect(nov), 'opened after the 1st has ended, it moves to the 2nd');
    r.eq(st().activePeriod, 1, 'and shows it');
    r.ok(!TS.store.canUndo(), 'which is where the session starts, not a change to undo');
    r.ok(TS.store.openPeriodInEffect(sept) && st().activePeriod === 0,
      'opened while the 1st is under way, it shows the 1st');
    st().periods[0].end = '';
    r.eq(TS.store.periodInEffect(nov), null, 'with no end date, there is nothing to go by');
    r.ok(!TS.store.openPeriodInEffect(nov), 'and it stays where it was left');
    st().periods[0].end = '2026-10-09';
    TS.store.commit('dates');

    // Copy the 1st again, and undo it.
    TS.store.switchPeriod(1);
    TS.store.commit('period');
    TS.store.copyOtherPeriod();
    TS.store.commit('copy-period');
    r.eq(st().assignments.length, 1, 'copying the 1st starts the 2nd over from it');
    r.eq(TS.store.undo(), 'copy-period', 'which is undoable');
    r.eq(st().assignments.length, 0, 'back to the 2nd as it was');
    r.eq(TS.store.undo(), 'period', 'and undo steps back over a switch too');
    r.eq(st().activePeriod, 0, 'landing on the 1st again');

    // Both halves survive a file round trip, and which one was open.
    TS.store.switchPeriod(1);
    TS.store.commit('period');
    var back = TS.store.migrate(JSON.parse(TS.store.toJson()));
    r.eq(back.activePeriod, 1, 'an export remembers which 7 weeks was open');
    r.eq(back.periods[0].assignments.length + '/' + back.assignments.length, '1/0',
      'and carries both halves\' shifts');
    r.eq(back.periods.map(function (p) { return p.start + '..' + p.end; }).join(' '),
      '2026-08-24..2026-10-09 2026-10-12..2026-12-10', 'and both halves\' dates');

    // Removing a tutor takes their shifts out of both halves.
    TS.store.copyOtherPeriod();
    TS.store.commit('copy-period');
    TS.store.removeTutor(who);
    TS.store.commit('remove-tutor');
    r.eq(st().assignments.length + st().periods[0].assignments.length, 0,
      'removing a tutor clears their shifts from both 7 weeks');

    // A one-week file -- older, or from the Life Science scheduler -- is the
    // 1st, and its free-text dates keep their start.
    var single = TS.store.migrate({
      settings: { effective: 'Aug 24 – Dec 10', term: 'Fall 2026' },
      tutors: [{ id: 't', firstName: 'T', availability: [] }],
      assignments: [{ id: 'a', tutorId: 't', day: 0, startSlot: 4, endSlot: 8 }]
    });
    r.eq(single.activePeriod + ':' + single.assignments.length + ':' +
      (single.periods[1].assignments === null), '0:1:true',
      'a file with one week loads as the 1st 7 weeks, with the 2nd not started');
    r.eq(single.periods[0].start, '2026-08-24', 'its free-text dates become a start date');
    r.ok(!('effective' in single.settings), 'and no free text is left behind');
    var bad = TS.store.migrate({ periods: [{ start: 'soon', end: '2026-13-01', assignments: [] }], tutors: [] });
    r.eq(bad.periods[0].start + '|' + bad.periods[0].end, '|', 'dates that are not dates are dropped');

    TS.store.reset();
    TS.store.clearHistory();
  }

  /* ---- 7. joining shifts that touch -------------------------------------- */

  function testMergeTouching(r) {
    TS.store.reset();
    TS.store.loadSample();
    var state = TS.store.state;
    var who = state.tutors[0].id;

    function add(start, end, extra) {
      var a = { tutorId: who, day: 0, startSlot: start, endSlot: end };
      Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; });
      return TS.store.addAssignment(a);
    }

    // 9:00-11:00 then 11:00-2:00 is one shift from 9:00 to 2:00.
    add(4, 8);
    add(8, 14);
    r.eq(TS.store.mergeTouching(who, 0), 1, 'two shifts that touch join into one');
    var mine = state.assignments.filter(function (a) { return a.tutorId === who; });
    r.eq(mine.length, 1, 'and leave a single block behind');
    r.eq(mine[0].startSlot + '-' + mine[0].endSlot, '4-14', 'spanning both');

    // A gap between them is a real gap.
    TS.store.state.assignments = [];
    add(4, 8);
    add(9, 14);
    r.eq(TS.store.mergeTouching(who, 0), 0, 'a shift with a gap before it stays separate');

    // Locking is what pins a shift down, so a locked neighbour is left alone.
    TS.store.state.assignments = [];
    add(4, 8, { locked: true });
    add(8, 14);
    r.eq(TS.store.mergeTouching(who, 0), 0, 'a locked shift is not absorbed');

    // Three in a row collapse in one pass.
    TS.store.state.assignments = [];
    add(4, 6);
    add(6, 8);
    add(8, 10);
    r.eq(TS.store.mergeTouching(who, 0), 2, 'a run of three joins in one pass');
    r.eq(state.assignments.length, 1, 'leaving one block');
    r.eq(state.assignments[0].startSlot + '-' + state.assignments[0].endSlot, '4-10',
      'spanning all three');

    TS.store.reset();
    TS.store.clearHistory();
  }

  /* ---- 8. the class list ------------------------------------------------- */

  function testSubjectClasses(r) {
    var defaults = U.defaultSubjects();
    r.eq(defaults.length, 3, 'the schedule ships with three Chemistry classes');
    r.eq(defaults.map(function (c) { return c.short; }).join(','), '1110,1120,ORGO',
      'headed by course number');
    r.eq(defaults.map(function (c) { return c.bit; }).join(','), '1,2,4',
      'bits are positional');

    var messy = U.normalizeSubjectList([
      { key: 'chem1', short: '1110', label: 'General Chemistry I' },
      { key: 'chem1', short: 'DUP', label: 'General Chemistry again' },
      { label: '  Biochemistry  ' },
      { label: '' },
      null
    ]);
    r.eq(messy.length, 2, 'a duplicate key and a nameless class are dropped');
    r.eq(messy[1].key, 'biochemistry', 'a key is derived from the name when none is given');
    r.eq(messy[1].short, 'BIOCHE', 'and a short code from the first letters');
    r.eq(messy[1].bit, 2, 'bits are reassigned by position');
    r.eq(U.normalizeSubjectList([]).length, 3, 'an empty list falls back to the defaults');

    var tooMany = [];
    for (var i = 0; i < U.MAX_SUBJECTS + 5; i++) tooMany.push({ label: 'Class ' + i });
    r.eq(U.normalizeSubjectList(tooMany).length, U.MAX_SUBJECTS,
      'the list is capped at what a bitmask can hold');

    // Adding a class: the mask helpers follow the live list.
    var state = TS.store.emptyState();
    state.settings.subjects = U.normalizeSubjectList(
      U.defaultSubjects().concat([{ key: 'chem', short: 'CHEM', label: 'Chemistry' }])
    );
    U.setSubjects(state.settings.subjects);
    r.eq(U.SUBJECTS.length, 4, 'the live list takes the new class');

    var chemist = TS.store.normalizeTutor({
      firstName: 'Rosalind', lastName: 'Fry',
      subjects: { chem: true }, availability: []
    });
    var mask = U.subjectMask(chemist.subjects);
    r.eq(mask, 8, 'the new class gets the next bit');
    r.eq(U.maskToShort(mask).join(','), 'CHEM', 'and its short code');
    r.eq(U.maskToLabels(mask).join(','), 'Chemistry', 'and its name');

    // A CSV round trip has to carry it too, or a roster loses a class on the
    // way to the spreadsheet and back.
    var text = TS.csv.exportTutors([chemist]);
    r.ok(text.split('\r\n')[0].indexOf('CHEM') !== -1, 'the export has a column for it',
      text.split('\r\n')[0]);
    var reimported = TS.csv.importTutors(text);
    r.eq(reimported.warnings.length, 0, 'and re-imports cleanly', reimported.warnings.join(' | '));
    r.ok(reimported.tutors.length === 1 && reimported.tutors[0].subjects.chem,
      'with the class still checked');

    // A file may name the class in full rather than by its number.
    var older = TS.csv.importTutors(
      'First,Last,General Chemistry I,1120,Availability\nJo,Lin,Yes,No,"Mon 1-4pm"\n');
    r.ok(older.tutors.length === 1 && older.tutors[0].subjects.chem1,
      'a header that spells out the class name still matches');

    // Removing a class is what the settings panel does to every tutor.
    state.settings.subjects = state.settings.subjects.filter(function (c) { return c.key !== 'chem'; });
    U.setSubjects(state.settings.subjects);
    delete chemist.subjects.chem;
    r.eq(U.subjectMask(chemist.subjects), 0, 'removing a class un-marks the tutors who taught it');
    r.eq(U.SUBJECTS.length, 3, 'and leaves the original three');

    U.setSubjects(U.defaultSubjects());
  }

  /* ---- 9. defaults ------------------------------------------------------- */

  /* ---- columns on the calendar ------------------------------------------ */

  function testDayColumns(r) {
    var n = 0;
    var at = function (tutorId, from, to) {
      return { id: 'b' + (n++), tutorId: tutorId, day: 3, startSlot: U.hhmmToSlot(from),
        endSlot: U.hhmmToSlot(to) };
    };

    // Chance is in before and after a break, and was once drawn on the right in
    // the morning and the left after lunch.
    var friday = [at('bailey', '09:00', '12:00'), at('chance', '09:00', '12:30'),
      at('chance', '13:00', '16:00')];
    var place = TS.calendar.layoutDay(friday);
    r.eq(place[friday[1].id].lane, place[friday[2].id].lane,
      'a tutor back from a break is in the column they left');
    r.eq(place[friday[1].id].lane, 0, 'the tutor with the most hours that day is on the left');
    r.eq(place[friday[0].id].lane, 1, 'and the one with fewer is on the right');
    r.eq(place[friday[2].id].lanes, 2, 'every block on the day shares the day\'s columns');

    // Listed in a different order, the same day comes out the same.
    var shuffled = TS.calendar.layoutDay(friday.slice().reverse());
    r.ok(friday.every(function (b) { return shuffled[b.id].lane === place[b.id].lane; }),
      'the columns do not depend on the order the shifts are stored in');

    // A day where each column is reused: nobody is squeezed into a third
    // column while one sits empty for all of their hours.
    var monday = [at('chloe', '09:00', '12:00'), at('chloe', '12:30', '16:00'),
      at('olivia', '09:00', '10:30'), at('ellie', '11:00', '14:00'),
      at('ashley', '13:00', '17:00'), at('chance', '14:00', '18:00'), at('kaitlyn', '17:00', '20:00')];
    var mon = TS.calendar.layoutDay(monday);
    r.eq(mon[monday[0].id].lane, 0, 'the longest day on the calendar takes the first column');
    r.eq(mon[monday[0].id].lane, mon[monday[1].id].lane, 'and keeps it after the break');
    r.eq(mon[monday[0].id].lanes, 3, 'three at once needs three columns, and no more');

    // Across real weeks: one column per tutor per day, and never two blocks at
    // the same time in one column.
    var clash = false, moved = false;
    [1, 2, 3].forEach(function (seed) {
      var state = fixtureState();
      state.assignments = TS.optimizer.optimize(state, { seed: seed, iterations: 4000 });
      for (var d = 0; d < U.DAYS; d++) {
        var day = state.assignments.filter(function (a) { return a.day === d; });
        var p = TS.calendar.layoutDay(day);
        var laneOf = {};
        day.forEach(function (a) {
          if (laneOf[a.tutorId] !== undefined && laneOf[a.tutorId] !== p[a.id].lane) moved = true;
          laneOf[a.tutorId] = p[a.id].lane;
          day.forEach(function (b) {
            if (a !== b && p[a.id].lane === p[b.id].lane &&
                a.startSlot < b.endSlot && b.startSlot < a.endSlot) clash = true;
          });
        });
      }
    });
    r.ok(!moved, 'across optimized weeks, no tutor changes column within a day');
    r.ok(!clash, 'and no two blocks share a column at the same time');
  }

  /* ---- the handout's file name ---------------------------------------- */

  function testHandoutName(r) {
    var today = new Date(2026, 8, 24);
    var name = function (start) {
      return U.handoutName({ title: 'Chemistry Tutoring Schedule', startDate: start }, today);
    };
    r.eq(name('2026-08-24'), 'Chemistry Tutoring Schedule 8-24-2026',
      'the file is named for the day the printed half starts');
    r.eq(name(''), 'Chemistry Tutoring Schedule 9-24-2026', 'with no start date, it is named for today');
    r.eq(name('2026-02-30'), 'Chemistry Tutoring Schedule 9-24-2026', 'and so it is when the start is no date');
    r.eq(U.handoutName({ title: 'Gen/Org Chem: Fall', startDate: '2026-08-24' }, today),
      'Gen Org Chem Fall 8-24-2026', 'characters a file name cannot hold are dropped from the title');

    // How the handout writes a half's dates.
    r.eq(U.dateRangeLabel('2026-08-24', '2026-10-09'), 'Aug 24 – Oct 9, 2026', 'the year once when both ends share it');
    r.eq(U.dateRangeLabel('2026-12-01', '2027-01-15'), 'Dec 1, 2026 – Jan 15, 2027', 'both years when not');
    r.eq(U.dateRangeLabel('2026-08-24', ''), 'From Aug 24, 2026', 'a start alone');
    r.eq(U.dateRangeLabel('', '2026-10-09'), 'Through Oct 9, 2026', 'an end alone');
    r.eq(U.dateRangeLabel('', ''), '', 'and nothing when neither is set');

    // "Over" is the day after the end date, not the end date itself.
    r.ok(!U.isPast('2026-10-09', new Date(2026, 9, 9, 17, 0)), 'the last day of a half is still in it');
    r.ok(U.isPast('2026-10-09', new Date(2026, 9, 10, 8, 0)), 'the day after, it is over');

    // Effective dates used to be free text; a file from then keeps its start.
    var read = function (text, term) { return U.isoDate(U.effectiveStart(text, term)); };
    r.eq(read('Aug 24 – Dec 11', 'Fall 2026'), '2026-08-24', 'free text: the first date, with the semester\'s year');
    r.eq(read('August 24, 2026 - December 11, 2026', ''), '2026-08-24', 'written out in full');
    r.eq(read('8/24 - 12/11', 'Spring 2027'), '2027-08-24', 'numbers');
    r.eq(read('Dec 1 – Jan 15, 2027', ''), '2026-12-01', 'running over New Year');
    r.eq(read('Starts 8/24/26', ''), '2026-08-24', 'a two-digit year');
    r.eq(read('Feb 30 – Mar 3', ''), '', 'and nothing from a date that is not one');
  }

  function testDefaults(r) {
    var s = TS.store.defaultSettings();
    r.eq(s.defaultMaxHours, 20, 'a tutor is approved for 20 hours a week by default');
    r.eq(s.maxConcurrent, 3, 'up to three tutors at once through the day');
    r.eq(s.eveningMaxConcurrent, 2, 'two in the evening');
    r.eq(U.formatMinutes(U.slotStartMinutes(s.eveningStartSlot)), '5:00 PM', 'which starts at 5:00 PM');
    r.ok(!('maxHoursPerDay' in s), 'there is no daily hour cap any more');
    r.eq(U.capSummary(s), '3 tutors at once before 5:00 PM, 2 after', 'and the rule reads as it should');

    // A schedule saved with the old daily cap loads without it.
    var old = TS.store.migrate({
      settings: { maxHoursPerDay: 8, maxConcurrent: 2 },
      tutors: [{ id: 't', firstName: 'Old', maxHoursPerDay: 4, availability: [] }],
      assignments: []
    });
    r.ok(!('maxHoursPerDay' in old.settings), 'an old daily cap setting is dropped on load');
    r.ok(!('maxHoursPerDay' in old.tutors[0]), 'and so is a tutor\'s own');
    r.eq(old.settings.maxConcurrent, 2, 'while a cap someone chose is kept');
    r.eq(TS.store.normalizeTutor({ firstName: 'New', availability: [] }).maxHoursPerWeek, 20,
      'a tutor with no figure of their own gets the 20-hour default');

    // The handout's QR books an appointment, and the text listing is optional.
    var slate = 'https://slate.chattanoogastate.edu/register/?id=a69c0cfb-95a8-48a2-860f-b38c6a4795aa';
    r.eq(s.qrUrl, slate, 'the QR code links to the appointment page, id and all');
    r.eq(s.includeListing, false, 'the text listing is off by default');
    r.eq(s.location, 'OMN 164', 'tutoring is in OMN 164');
    r.eq(s.title, 'Chemistry Tutoring Schedule', 'under the Chemistry title');
    r.eq(U.DAY_NAMES.join(','), 'Monday,Tuesday,Wednesday,Thursday', 'Monday to Thursday');
    r.eq(U.TOTAL_SLOTS, 4 * U.SLOTS_PER_DAY, 'and the week is four days long');

    var custom = TS.store.migrate({ settings: { qrUrl: 'https://example.edu/help', qrCaption: 'Mine',
      includeListing: true }, tutors: [], assignments: [] });
    r.eq(custom.settings.qrUrl, 'https://example.edu/help', 'a link someone chose is kept');
    r.eq(custom.settings.qrCaption, 'Mine', 'and so is their caption');
    r.eq(custom.settings.includeListing, true, 'and so is the listing turned on');
  }

  /* ---- 10. the evening cap ----------------------------------------------- */

  function testEveningCap(r) {
    var settings = TS.store.defaultSettings();   // 3 by day, 2 from 5:00 PM
    var five = settings.eveningStartSlot;
    var at = function (id, from, to) {
      return { id: id + from, tutorId: id, day: 0, startSlot: from, endSlot: to, kind: 'main' };
    };
    var overAt = function (list) {
      var cap = U.capacity(settings, list), out = [];
      for (var s = 0; s < U.SLOTS_PER_DAY; s++) {
        if (cap.counts[U.idx(0, s)] > cap.limits[U.idx(0, s)]) out.push(s);
      }
      return out;
    };

    r.eq(overAt([at('a', 10, 18), at('b', 10, 18), at('c', 10, 18)]).length, 0,
      'three at once before the evening is fine');
    r.eq(overAt([at('a', 10, 18), at('b', 10, 18), at('c', 10, 18), at('d', 12, 16)]).length, 4,
      'a fourth is over for every half hour they are in');

    // Three who were in before 5:00 bleed through it and finish their shifts.
    r.eq(overAt([at('a', 16, 22), at('b', 16, 24), at('c', 18, 21)]).length, 0,
      'three on shift before 5:00 PM may all carry on past it');
    // ...but nobody new arrives while that is more than the evening allows.
    r.eq(overAt([at('a', 16, 22), at('b', 16, 22), at('c', 18, 22), at('d', 20, 22)]).join(','),
      [five, five + 1].join(','), 'a fourth arriving at 5:00 PM is over');
    r.eq(overAt([at('a', 16, 24), at('b', 16, 21), at('c', 16, 21), at('d', 22, 24)]).length, 0,
      'once the carry-overs leave, someone new may come in up to the evening cap');
    r.eq(overAt([at('a', 16, 24), at('b', 18, 21), at('c', 21, 24)]).length, 0,
      'one who carries on and one who arrives is the evening cap exactly');
    r.eq(overAt([at('a', 16, 24), at('b', five, 24), at('c', five, 24)]).join(','),
      [five, five + 1, five + 2, five + 3].join(','),
      'but two arriving beside one who carries on is too many');
    r.eq(overAt([at('a', 16, 19), at('a', 20, 24), at('b', five, 24), at('c', five, 24)]).length, 4,
      'a tutor who took a break before 5:00 PM does not count as carrying on');

    // The optimizer keeps to it: a roster free all afternoon and evening puts
    // three on through the day and never more than the rule allows after.
    var state = TS.store.emptyState();
    for (var i = 0; i < 5; i++) {
      var t = TS.store.normalizeTutor({
        id: 'ev' + i, firstName: 'Eve' + i, subjects: { chem1: true, chem2: i % 2 === 0, orgo: i > 2 },
        maxHoursPerWeek: 20, availability: []
      });
      for (var d = 0; d < U.DAYS; d++) {
        for (var s = 12; s < U.SLOTS_PER_DAY; s++) t.availability[U.idx(d, s)] = 1;
      }
      state.tutors.push(t);
    }
    state.assignments = TS.optimizer.optimize(state, { seed: 9, iterations: 40000 });
    r.eq(TS.optimizer.validate(state, state.assignments).length, 0,
      'an optimized evening-heavy roster keeps to both caps',
      TS.optimizer.validate(state, state.assignments).slice(0, 4).join(' | '));
    var cap = U.capacity(state.settings, state.assignments);
    var peakDay = 0, peakEve = 0;
    for (var dd = 0; dd < U.DAYS; dd++) {
      for (var ss = 0; ss < U.SLOTS_PER_DAY; ss++) {
        var n = cap.counts[U.idx(dd, ss)];
        if (ss < five) peakDay = Math.max(peakDay, n);
      }
      // Past the point every carry-over has left, only the evening cap stands.
      var late = cap.counts[U.idx(dd, U.SLOTS_PER_DAY - 1)];
      peakEve = Math.max(peakEve, late);
    }
    r.eq(peakDay, 3, 'the daytime cap of three is used');
    r.ok(peakEve <= 2, 'the last half hour of the evening has no more than two', String(peakEve));

    // Placing a shift by hand is measured the same way.
    var hand = TS.store.emptyState();
    hand.tutors = ['a', 'b', 'c'].map(function (id) {
      var t = TS.store.normalizeTutor({ id: id, firstName: id, subjects: { chem1: true }, availability: [] });
      for (var s = 0; s < U.SLOTS_PER_DAY; s++) t.availability[U.idx(0, s)] = 1;
      return t;
    });
    hand.assignments = [at('a', 16, 22), at('b', 16, 22)].map(TS.store.normalizeAssignment);
    TS.store.replaceState(hand);
    var late3 = TS.calendar.checkPlacement(TS.store.state,
      { id: null, tutorId: 'c', kind: 'main' }, 0, five, 22);
    var early3 = TS.calendar.checkPlacement(TS.store.state,
      { id: null, tutorId: 'c', kind: 'main' }, 0, 16, 22);
    r.ok(late3.ok && late3.overCapacity, 'a third arriving at 5:00 PM is flagged over the cap');
    r.ok(early3.ok && !early3.overCapacity, 'a third who started at 3:00 PM may bleed through');
    TS.store.reset();
    TS.store.clearHistory();
  }

  /* ---- 11. continuous shifts --------------------------------------------- */

  function testContinuousShifts(r) {
    // Three tutors free all day, a budget that does not reach every hour twice:
    // the old scoring was content to send someone home at noon and ask them
    // back at three. Nobody should be.
    var state = TS.store.emptyState();
    for (var i = 0; i < 3; i++) {
      var t = TS.store.normalizeTutor({
        id: 'c' + i, firstName: 'C' + i, subjects: { chem1: true, chem2: i === 1, orgo: i === 2 },
        maxHoursPerWeek: 20, availability: []
      });
      for (var d = 0; d < U.DAYS; d++) {
        for (var s = U.CORE_START_SLOT; s < U.CORE_END_SLOT; s++) t.availability[U.idx(d, s)] = 1;
      }
      state.tutors.push(t);
    }
    state.assignments = TS.optimizer.optimize(state, { seed: 4, iterations: 60000 });
    var st = TS.optimizer.stats(state, state.assignments);
    r.eq(st.returnTrips, 0, 'nobody is sent away and asked back without a reason',
      JSON.stringify(TS.optimizer.returnTrips(state, state.assignments).slice(0, 3)));
    r.eq(st.coveredSlots, st.totalSlots, 'and the week is still fully covered');

    // A class in the middle of the day is a reason; so is the break the
    // six-hour rule demands. Neither is counted as a return trip.
    var solo = TS.store.emptyState();
    var who = TS.store.normalizeTutor({ id: 'solo', firstName: 'Solo', subjects: { chem1: true },
      maxHoursPerWeek: 20, availability: [] });
    for (var s2 = 4; s2 < 24; s2++) who.availability[U.idx(0, s2)] = 1;
    who.availability[U.idx(0, 10)] = 0;
    solo.tutors = [who];
    var trips = function (list) {
      return TS.optimizer.returnTrips(solo, list.map(TS.store.normalizeAssignment)).length;
    };
    var sh = function (a, b) { return { id: 'x' + a, tutorId: 'solo', day: 0, startSlot: a, endSlot: b }; };
    r.eq(trips([sh(4, 10), sh(11, 16)]), 0, 'leaving for a class is not a return trip');
    r.eq(trips([sh(4, 15), sh(16, 20)]), 0, 'nor is the break the six-hour rule asks for');
    r.eq(trips([sh(11, 14), sh(17, 20)]), 1, 'but being sent away for no reason is');
  }

  function testEmptyRoster(r) {
    var state = TS.store.emptyState();
    var result = TS.optimizer.optimize(state, { iterations: 500 });
    r.eq(result.length, 0, 'an empty roster optimizes to an empty schedule');
    r.eq(TS.optimizer.validate(state, result).length, 0, 'an empty schedule is valid');
    r.eq(TS.optimizer.analyzeGaps(state, result).length, U.DAYS, 'an empty schedule reports an all-day gap a day');
  }

  function run() {
    var r = new Runner();
    var started = Date.now();

    testDisplayNames(r);
    testScheduleWindow(r);
    testUndoHistory(r);
    testContrast(r);
    testColorAssignment(r);
    testCoverageRuns(r);
    testCsv(r);
    testSubjectClasses(r);
    testOwnRoom(r);
    testPeriods(r);
    testMergeTouching(r);
    testDefaults(r);
    testHandoutName(r);
    testDayColumns(r);
    testEveningCap(r);
    testContinuousShifts(r);
    testEmptyRoster(r);
    testFixtureBudgetOff(r);
    testFixtureBudgetOn(r);
    testCoverageBeatsDuplication(r);
    testContiguousBlocks(r);
    testFitOneTutor(r);
    testLockedBlocksSurvive(r);
    testFuzz(r);

    r.note('Completed in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
    return r;
  }

  TS.tests = { run: run, fixtureState: fixtureState };
})(typeof window !== 'undefined' ? window : globalThis);
