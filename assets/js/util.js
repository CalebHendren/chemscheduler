(function (root) {
  'use strict';
  var TS = (root.TS = root.TS || {});

  /* The app's version, and the only place it is written down. A push to main
   * that changes it is what publishes a release: CI reads this line, tags the
   * commit and attaches the single-file build. Semantic versioning -- a new
   * feature is a minor bump, a fix is a patch.
   */
  var VERSION = '1.2.1';

  var DAY_START_MIN = 7 * 60;      // 7:00 AM
  var SLOT_MINUTES = 30;
  var SLOTS_PER_DAY = 27;          // 7:00 AM through 8:30 PM

  var DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  var DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  var DAYS = DAY_NAMES.length;
  var TOTAL_SLOTS = DAYS * SLOTS_PER_DAY;

  /* Chemistry tutoring runs Monday to Thursday, with Friday there for the
   * weeks someone works it. An optional day is on the scheduler like any
   * other, but it only counts -- toward coverage, the uncovered hours, the
   * printed handout -- once it is in use.
   */
  var OPTIONAL_DAYS = [4];

  // Whether a day counts on screen: always, unless it is optional and nobody
  // is available or scheduled on it.
  function dayInUse(day, tutors, assignments) {
    if (OPTIONAL_DAYS.indexOf(day) === -1) return true;
    if ((assignments || []).some(function (a) { return a.day === day; })) return true;
    return (tutors || []).some(function (t) {
      for (var s = 0; s < SLOTS_PER_DAY; s++) if (t.availability && t.availability[idx(day, s)]) return true;
      return false;
    });
  }

  // The days a printed half shows: every required day, and an optional one
  // only if a shift is on it -- a handout does not carry an empty Friday.
  function printedDays(assignments) {
    var days = [];
    for (var d = 0; d < DAYS; d++) {
      if (OPTIONAL_DAYS.indexOf(d) === -1 ||
          (assignments || []).some(function (a) { return a.day === d; })) days.push(d);
    }
    return days;
  }

  /* The three Chemistry classes the schedule ships with, headed by course
   * number because that is how students know them. A coordinator can add their
   * own -- Organic Chemistry II, say -- so the live list is kept in settings and
   * SUBJECTS is rewritten in place to match it, which leaves the array every
   * module captured at load time valid. Bits are positional and a mask is always
   * recomputed from tutor.subjects, so reordering the list cannot corrupt a saved
   * schedule.
   */
  var DEFAULT_SUBJECTS = [
    { key: 'chem1', short: '1110', label: 'General Chemistry I' },
    { key: 'chem2', short: '1120', label: 'General Chemistry II' },
    { key: 'orgo',  short: 'ORGO', label: 'Organic Chemistry' }
  ];

  var MAX_SUBJECTS = 16;           // a subject mask is a bitfield

  function defaultSubjects() {
    return DEFAULT_SUBJECTS.map(function (s, i) {
      return { key: s.key, bit: 1 << i, short: s.short, label: s.label };
    });
  }

  function subjectKey(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  }

  function normalizeSubjectList(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (s) {
      if (!s || out.length >= MAX_SUBJECTS) return;
      var label = String(s.label || s.short || s.key || '').trim();
      if (!label) return;
      var key = subjectKey(s.key) || subjectKey(label);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push({
        key: key,
        bit: 1 << out.length,
        short: String(s.short || '').trim() || label.slice(0, 6).toUpperCase(),
        label: label
      });
    });
    // An empty list would leave every tutor unschedulable, so the defaults stand.
    return out.length ? out : defaultSubjects();
  }

  var SUBJECTS = defaultSubjects();

  function setSubjects(list) {
    var next = normalizeSubjectList(list);
    SUBJECTS.length = 0;
    next.forEach(function (s) { SUBJECTS.push(s); });
    return SUBJECTS;
  }

  /* Where a tutor works. Most are in the tutoring room -- settings.location --
   * but a faculty member may hold their hours in their own office. Those hours
   * are drawn on the calendar like anyone's and count as cover for their
   * classes, since a student can go and get help there. They do not take a
   * seat in the tutoring room, though, so they never count toward its limit
   * on tutors at once, and office hours are the faculty member's to set, so
   * the minimum shift length does not apply to them either.
   */
  function ownRoom(tutor) { return String((tutor && tutor.room) || '').trim(); }

  // The shifts that take a seat in the tutoring room.
  function seatedShifts(assignments, tutors) {
    var elsewhere = {};
    (tutors || []).forEach(function (t) { if (ownRoom(t)) elsewhere[t.id] = true; });
    return (assignments || []).filter(function (a) { return !elsewhere[a.tutorId]; });
  }

  function compareNames(a, b) {
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  }

  // Names in alphabetical order, the way a block that lists several reads.
  function sortedNames(names) {
    return (names || []).filter(Boolean).slice().sort(compareNames);
  }

  /* ---- how many tutors the center holds ----
   * The day cap holds until the evening starts, and a smaller one after it. A
   * tutor already on shift when the evening starts is not sent home at that
   * moment, though: they may bleed through it and finish their shift, and so
   * may everyone else who was in. Only someone arriving in the evening is held
   * to the evening cap. So the limit at an evening half hour is the evening cap
   * or the number of tutors still carrying on from before it, whichever is
   * more -- which lets the room drain down to the evening cap as people leave,
   * but never lets it refill past it.
   */
  function capRules(settings) {
    var s = settings || {};
    var day = Math.max(1, s.maxConcurrent || 3);
    var evening = typeof s.eveningMaxConcurrent === 'number' ? s.eveningMaxConcurrent : day;
    var cutoff = typeof s.eveningStartSlot === 'number' ? s.eveningStartSlot : SLOTS_PER_DAY;
    return {
      day: day,
      evening: Math.max(1, evening),
      cutoff: Math.max(0, Math.min(SLOTS_PER_DAY, Math.round(cutoff)))
    };
  }

  function capLimit(rules, slot, carrying) {
    return slot < rules.cutoff ? rules.day : Math.max(rules.evening, carrying);
  }

  /* Tutors in the room, and how many it may hold, for every half hour of the
   * week. A tutor with a room of their own is left out: the caps are the
   * tutoring room's. Returns { counts, limits }, both indexed like idx().
   */
  function capacity(settings, assignments, tutors) {
    var rules = capRules(settings);
    var counts = [], limits = [], i;
    for (i = 0; i < TOTAL_SLOTS; i++) { counts.push(0); limits.push(rules.day); }

    var rows = {};
    seatedShifts(assignments, tutors).forEach(function (a) {
      var key = a.tutorId + '|' + a.day;
      if (!rows[key]) {
        rows[key] = { day: a.day, on: [] };
        for (var s = 0; s < SLOTS_PER_DAY; s++) rows[key].on.push(false);
      }
      for (var t = a.startSlot; t < a.endSlot; t++) {
        if (!rows[key].on[t]) counts[idx(a.day, t)]++;
        rows[key].on[t] = true;
      }
    });

    var carrying = [];
    for (i = 0; i < TOTAL_SLOTS; i++) carrying.push(0);
    if (rules.cutoff > 0) {
      Object.keys(rows).forEach(function (key) {
        var row = rows[key];
        for (var s = rules.cutoff - 1; s < SLOTS_PER_DAY && row.on[s]; s++) {
          if (s >= rules.cutoff) carrying[idx(row.day, s)]++;
        }
      });
    }
    for (var d = 0; d < DAYS; d++) {
      for (var s = 0; s < SLOTS_PER_DAY; s++) {
        limits[idx(d, s)] = capLimit(rules, s, carrying[idx(d, s)]);
      }
    }
    return { counts: counts, limits: limits };
  }

  // "3 tutors at once before 5:00 PM, 2 after", for the messages that quote it.
  function capSummary(settings) {
    var rules = capRules(settings);
    var tutors = function (n) { return n + ' tutor' + (n === 1 ? '' : 's'); };
    if (rules.cutoff >= SLOTS_PER_DAY || rules.evening === rules.day) {
      return tutors(rules.day) + ' at once';
    }
    return tutors(rules.day) + ' at once before ' +
      formatMinutes(slotStartMinutes(rules.cutoff)) + ', ' + rules.evening + ' after';
  }

  /* ---- the tutor palette ----
   * The eight Okabe-Ito colorblind-safe hues lead, because a roster that fits
   * inside them is readable to a red-green colorblind eye without anything
   * else having to work. The seven after them widen the list far enough that a
   * normal roster never has to repeat one -- the old eight meant a ninth tutor
   * was handed blue again, which is what put two blues side by side.
   *
   * The seven were picked against the same measure the solver below uses, with
   * the bar set at the original eight: the three closest pairs in the list are
   * still Okabe-Ito's own, so nothing added here made the palette harder to
   * read. Which tutor gets which is not this list's order, though --
   * assignColors picks from the finished schedule.
   */
  var PALETTE = [
    '#0072B2', '#D55E00', '#009E73', '#E69F00',
    '#56B4E9', '#CC79A7', '#999933', '#6E6E6E',
    '#2222B9', '#B92222', '#B9228C', '#27D37D',
    '#9C5821', '#8B5CF6', '#1DDDD4'
  ];

  /* Classes are named colours rather than palette slots, so a class keeps its
   * colour whatever else is added: General Chemistry I blue, II green, Organic
   * orange -- three Okabe-Ito hues, told apart by a red-green colourblind eye.
   * Anything a coordinator adds falls back to the far end of the tutor
   * palette, which is far enough from these three to stay distinct.
   */
  var SUBJECT_HUES = {
    chem1: '#0072B2',
    chem2: '#009E73',
    orgo: '#D55E00'
  };
  var SUBJECT_FALLBACK_OFFSET = 11;

  // The day is modelled 7:00 AM to 8:30 PM because someone may be available
  // then, but a schedule is drawn over the hours actually in play, never
  // narrower than the 9-to-5 core it is expected to look like.
  var CORE_START_SLOT = 4;         // 9:00 AM
  var CORE_END_SLOT = 20;          // 5:00 PM

  function clampWindow(start, end) {
    return {
      start: Math.max(0, Math.min(CORE_START_SLOT, start)),
      end: Math.min(SLOTS_PER_DAY, Math.max(CORE_END_SLOT, end))
    };
  }

  // What the finished schedule occupies: what the handout and the PDF draw.
  function scheduleWindow(assignments) {
    var start = CORE_START_SLOT, end = CORE_END_SLOT;
    (assignments || []).forEach(function (a) {
      if (a.startSlot < start) start = a.startSlot;
      if (a.endSlot > end) end = a.endSlot;
    });
    return clampWindow(start, end);
  }

  // The same, widened to every hour anyone is available, so the editing grid
  // always has somewhere to put a shift a tutor has offered to work.
  function editorWindow(tutors, assignments) {
    var w = scheduleWindow(assignments);
    var start = w.start, end = w.end;
    (tutors || []).forEach(function (t) {
      if (!t || !t.availability) return;
      for (var d = 0; d < DAYS; d++) {
        for (var s = 0; s < start; s++) {
          if (t.availability[idx(d, s)]) { start = s; break; }
        }
        for (var e = SLOTS_PER_DAY; e > end; e--) {
          if (t.availability[idx(d, e - 1)]) { end = e; break; }
        }
      }
    });
    return clampWindow(start, end);
  }

  function idx(day, slot) { return day * SLOTS_PER_DAY + slot; }
  function slotStartMinutes(slot) { return DAY_START_MIN + slot * SLOT_MINUTES; }

  /* ---- availability ----
   * One flag per half hour of the week. Every place that reads a tutor's
   * availability as stretches of time -- the painter's window rows, the CSV
   * column -- reads it through availabilityRuns, so the two cannot disagree.
   */
  function emptyAvailability() {
    var a = new Array(TOTAL_SLOTS);
    for (var i = 0; i < TOTAL_SLOTS; i++) a[i] = 0;
    return a;
  }

  // [[start, end], ...] for each unbroken stretch of one day, end exclusive.
  function availabilityRuns(avail, day) {
    var runs = [];
    var start = null;
    for (var s = 0; s <= SLOTS_PER_DAY; s++) {
      var on = s < SLOTS_PER_DAY && avail[idx(day, s)];
      if (on && start === null) start = s;
      else if (!on && start !== null) { runs.push([start, s]); start = null; }
    }
    return runs;
  }

  function formatMinutes(mins, opts) {
    opts = opts || {};
    var h24 = Math.floor(mins / 60);
    var m = mins % 60;
    var suffix = h24 >= 12 ? 'PM' : 'AM';
    var h = h24 % 12;
    if (h === 0) h = 12;
    var text = h + ':' + (m < 10 ? '0' : '') + m;
    if (opts.omitSuffix) return text;
    return text + ' ' + suffix;
  }

  // "2:00 - 5:00 PM", collapsing a shared AM/PM into the tail.
  function formatRange(startSlot, endSlot) {
    var a = slotStartMinutes(startSlot);
    var b = slotStartMinutes(endSlot);
    var sameHalf = (a >= 720) === (b >= 720);
    return formatMinutes(a, { omitSuffix: sameHalf }) + '–' + formatMinutes(b);
  }

  // "9–12", "12:30–2": the range as it is said aloud, for a block too narrow
  // to carry the clock readings in full. The day runs 7 AM to 8:30 PM, so a
  // bare hour is never ambiguous on the page.
  function formatRangeCompact(startSlot, endSlot) {
    var bare = function (mins) {
      return formatMinutes(mins, { omitSuffix: true }).replace(/:00$/, '');
    };
    return bare(slotStartMinutes(startSlot)) + '–' + bare(slotStartMinutes(endSlot));
  }

  function minutesToHhmm(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function hhmmToSlot(hhmm) {
    var parts = String(hhmm).split(':');
    var mins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    return Math.round((mins - DAY_START_MIN) / SLOT_MINUTES);
  }

  function hoursLabel(halfHours) {
    return (Math.round((halfHours / 2) * 10) / 10) + ' h';
  }

  /* ---- reading a date out of text ----
   * Effective dates used to be free text, typed however the term calendar
   * read, and a file from then -- or from the Life Science scheduler -- still
   * carries it. The first date in it becomes the start date on load, found
   * rather than required in one format:
   * "Aug 24 – Dec 11", "August 24, 2026 - December 11, 2026", "8/24 - 12/11",
   * "2026-08-24". A start with no year of its own takes the next year written
   * in the text -- stepping back one when the dates run over New Year -- then
   * the one in the semester name, then the current one.
   */
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var DATE_PATTERNS = [
    { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, y: 1, m: 2, d: 3 },
    { re: /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}|\d{2}))?\b/, m: 1, d: 2, y: 3 },
    { re: /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4})\b)?/i,
      name: 1, d: 2, y: 3 }
  ];

  // The earliest date written in `text`, as { month, day, year|null, end }.
  function firstDate(text) {
    var best = null;
    DATE_PATTERNS.forEach(function (p) {
      var m = p.re.exec(text);
      if (!m || (best && best.index <= m.index)) return;
      var month = p.name ? MONTHS.indexOf(m[p.name].slice(0, 3).toLowerCase()) + 1 : +m[p.m];
      var year = m[p.y] ? +m[p.y] : null;
      if (year !== null && year < 100) year += 2000;
      best = { index: m.index, end: m.index + m[0].length, month: month, day: +m[p.d], year: year };
    });
    if (!best || best.month < 1 || best.month > 12 || best.day < 1 || best.day > 31) return null;
    return best;
  }

  function effectiveStart(effective, term, today) {
    var text = String(effective || '');
    var start = firstDate(text);
    if (!start) return null;
    var year = start.year;
    if (year === null) {
      var rest = text.slice(start.end);
      var later = rest.match(/\b(\d{4})\b/);
      if (later) {
        year = +later[1];
        var next = firstDate(rest);
        if (next && next.month < start.month) year--;
      } else {
        var named = String(term || '').match(/\b(\d{4})\b/);
        year = named ? +named[1] : (today || new Date()).getFullYear();
      }
    }
    // Rolled over (Feb 30) means it was never a date.
    var check = new Date(year, start.month - 1, start.day);
    if (check.getMonth() !== start.month - 1) return null;
    return { year: year, month: start.month, day: start.day };
  }

  /* ---- a 7-week half's dates ----
   * Kept as ISO dates, "2026-08-24", which is what a date field reads and
   * writes. Anything else -- blank, or a date that is not one -- is no date.
   */
  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    var d = { year: +m[1], month: +m[2], day: +m[3] };
    var check = new Date(d.year, d.month - 1, d.day);
    return check.getMonth() === d.month - 1 && check.getDate() === d.day ? d : null;
  }

  function isoDate(d) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d ? d.year + '-' + pad(d.month) + '-' + pad(d.day) : '';
  }

  // Whether `today` falls after the day `iso` names -- the day after it ends.
  function isPast(iso, today) {
    var d = parseIso(iso);
    if (!d) return false;
    var now = today || new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()) >
      new Date(d.year, d.month - 1, d.day);
  }

  /* How the handout writes a half's dates: "Aug 24 – Oct 9, 2026", the year
   * once when both ends share it, "Dec 1, 2026 – Jan 15, 2027" when not, and
   * "From ..." or "Through ..." when only one end is known. */
  var MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dateRangeLabel(startIso, endIso) {
    var a = parseIso(startIso), b = parseIso(endIso);
    var day = function (d) { return MONTH_ABBR[d.month - 1] + ' ' + d.day; };
    var full = function (d) { return day(d) + ', ' + d.year; };
    if (a && b) return a.year === b.year ? day(a) + ' – ' + full(b) : full(a) + ' – ' + full(b);
    if (a) return 'From ' + full(a);
    if (b) return 'Through ' + full(b);
    return '';
  }

  /* "Chemistry Tutoring Schedule 8-24-2026": the title and the day the
   * schedule takes effect -- settings.startDate, the printed half's start --
   * or today when there is none. Used for the downloaded PDF and, as the page
   * title while printing, for the name the browser offers when saving as PDF. */
  function handoutName(settings, today) {
    var now = today || new Date();
    var d = parseIso(settings.startDate) ||
      { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
    var title = String(settings.title || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (title || 'Tutor Schedule') + ' ' + d.month + '-' + d.day + '-' + d.year;
  }

  function subjectMask(subjects) {
    var mask = 0;
    for (var i = 0; i < SUBJECTS.length; i++) {
      if (subjects && subjects[SUBJECTS[i].key]) mask |= SUBJECTS[i].bit;
    }
    return mask;
  }

  function maskToShort(mask) {
    var out = [];
    for (var i = 0; i < SUBJECTS.length; i++) {
      if (mask & SUBJECTS[i].bit) out.push(SUBJECTS[i].short);
    }
    return out;
  }

  function maskToLabels(mask) {
    var out = [];
    for (var i = 0; i < SUBJECTS.length; i++) {
      if (mask & SUBJECTS[i].bit) out.push(SUBJECTS[i].label);
    }
    return out;
  }

  function popcount(n) {
    var c = 0;
    while (n) { c += n & 1; n >>= 1; }
    return c;
  }

  function listSentence(items) {
    if (!items.length) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  /*
   * Schedule labels: first name alone, until two tutors share one. Within a
   * colliding group, sort by last name and let the first keep the bare first
   * name; everyone after takes the shortest last-name prefix not already in
   * use. "Anna Harden, Anna Henry" becomes "Anna", "Anna H".
   */
  function displayNames(tutors) {
    var out = {};
    var groups = [];
    var byKey = {};

    tutors.forEach(function (t, i) {
      var key = String(t.firstName || '').trim().toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(byKey, key)) {
        byKey[key] = [];
        groups.push(byKey[key]);
      }
      byKey[key].push({ t: t, order: i });
    });

    groups.forEach(function (members) {
      if (members.length === 1) {
        out[members[0].t.id] = String(members[0].t.firstName || '').trim() || '(unnamed)';
        return;
      }
      members.sort(function (a, b) {
        var la = String(a.t.lastName || '').trim().toLowerCase();
        var lb = String(b.t.lastName || '').trim().toLowerCase();
        if (la !== lb) return la < lb ? -1 : 1;
        return a.order - b.order;
      });

      var used = [];
      members.forEach(function (m, i) {
        var fn = String(m.t.firstName || '').trim() || '(unnamed)';
        var last = String(m.t.lastName || '').trim();
        var label = null;

        if (i === 0) {
          label = fn;
        } else {
          for (var len = 1; len <= last.length; len++) {
            var cand = fn + ' ' + last.slice(0, len);
            if (used.indexOf(cand) === -1) { label = cand; break; }
          }
          if (label === null) {
            var n = 2;
            while (used.indexOf(fn + ' (' + n + ')') !== -1) n++;
            label = fn + ' (' + n + ')';
          }
        }
        used.push(label);
        out[m.t.id] = label;
      });
    });

    return out;
  }

  /* ---- coverage by class ----
   * The schedule is written tutor by tutor, but the question a student arrives
   * with is the other way round: when can I get help with 1120? These turn one
   * into the other.
   *
   * A class is covered for as long as someone who teaches it is on shift, so
   * one tutor signed up for three classes covers all three at once, and comes
   * out under each of them -- which is the point. Office hours count: a student
   * can get help there too.
   */

  // One lane per class, in the order the class list gives.
  function coverageLanes() {
    return SUBJECTS.map(function (subject, i) { return [i]; });
  }

  // What a block calls itself: the class's short code.
  function coverageLabel(indices) {
    return indices.map(function (i) { return SUBJECTS[i].short; }).join(' & ');
  }

  // What the legend calls a lane: the class's name.
  function laneLabel(lane) {
    return lane.map(function (i) { return SUBJECTS[i].label; }).join(' / ');
  }

  /*
   * Every stretch of the week each lane is covered for, split wherever cover
   * starts or stops.
   *
   * Who is in can change inside a run without breaking it: the class is still
   * covered, so the block stays one piece. Each stretch with the same tutors is
   * a segment of the run instead -- "Chance, Olivia" 9-12, then "Olivia" 12-2 --
   * which is how a student tells who they will find there, and when.
   *
   * Returns { lane, subjects, label, day, startSlot, endSlot, tutorIds,
   * segments: [{ startSlot, endSlot, tutorIds }] }, every list of tutorIds in
   * alphabetical order of name.
   */
  function coverageRuns(assignments, tutors) {
    var masks = {}, names = {}, runs = [];
    (tutors || []).forEach(function (t) {
      masks[t.id] = subjectMask(t.subjects);
      names[t.id] = (String(t.firstName || '').trim() + ' ' + String(t.lastName || '').trim()).trim();
    });
    var byName = function (a, b) { return compareNames(names[a], names[b]) || (a < b ? -1 : a > b ? 1 : 0); };

    var shifts = (assignments || []).filter(function (a) { return masks[a.tutorId]; });
    var lanes = coverageLanes();

    lanes.forEach(function (lane, laneIndex) {
      var laneMask = 0;
      lane.forEach(function (i) { laneMask |= SUBJECTS[i].bit; });

      for (var day = 0; day < DAYS; day++) {
        var today = shifts.filter(function (a) {
          return a.day === day && (masks[a.tutorId] & laneMask);
        });
        if (!today.length) continue;

        // Which of the lane's classes are covered in each half hour, and who is
        // in for them.
        var cover = [];
        for (var slot = 0; slot < SLOTS_PER_DAY; slot++) cover.push(null);
        today.forEach(function (a) {
          for (var slot = a.startSlot; slot < a.endSlot; slot++) {
            if (!cover[slot]) cover[slot] = { mask: 0, ids: [] };
            cover[slot].mask |= masks[a.tutorId] & laneMask;
            if (cover[slot].ids.indexOf(a.tutorId) === -1) cover[slot].ids.push(a.tutorId);
          }
        });

        var open = null;
        for (var s = 0; s <= SLOTS_PER_DAY; s++) {
          var here = s < SLOTS_PER_DAY ? cover[s] : null;
          if (open && (!here || here.mask !== open.mask)) {
            runs.push(closeRun(open, laneIndex, lane, day, s, byName));
            open = null;
          }
          if (!here) continue;
          var who = here.ids.slice().sort(byName);
          if (!open) open = { start: s, mask: here.mask, ids: [], segments: [] };
          who.forEach(function (id) {
            if (open.ids.indexOf(id) === -1) open.ids.push(id);
          });
          var seg = open.segments[open.segments.length - 1];
          if (seg && seg.tutorIds.join('|') === who.join('|')) seg.endSlot = s + 1;
          else open.segments.push({ startSlot: s, endSlot: s + 1, tutorIds: who });
        }
      }
    });
    return runs;
  }

  function closeRun(open, laneIndex, lane, day, endSlot, byName) {
    var subjects = lane.filter(function (i) { return open.mask & SUBJECTS[i].bit; });
    return {
      lane: laneIndex,
      subjects: subjects,
      label: coverageLabel(subjects),
      day: day,
      startSlot: open.start,
      endSlot: endSlot,
      tutorIds: open.ids.sort(byName),
      segments: open.segments
    };
  }

  /* A stretch too short to name everyone in it is folded into the stretch after
   * it, and the two are read as one: their hours joined, everyone from both
   * named. Not exact -- the second tutor may only arrive partway through -- but
   * closer than a name cut in half. The last stretch has nothing after it, so
   * it folds back into the one before instead. `fits(segment, index)` is the
   * renderer's answer to whether a stretch shows all its names where it now
   * stands.
   */
  function mergeCrampedSegments(segments, fits) {
    var out = (segments || []).map(function (seg) {
      return { startSlot: seg.startSlot, endSlot: seg.endSlot, tutorIds: seg.tutorIds.slice() };
    });
    var i = 0;
    while (i < out.length - 1) {
      if (fits(out[i], i)) { i++; continue; }
      var next = out[i + 1];
      next.tutorIds.forEach(function (id) {
        if (out[i].tutorIds.indexOf(id) === -1) out[i].tutorIds.push(id);
      });
      out[i].endSlot = next.endSlot;
      out.splice(i + 1, 1);
    }
    while (out.length > 1 && !fits(out[out.length - 1], out.length - 1)) {
      var last = out.pop(), prev = out[out.length - 1];
      last.tutorIds.forEach(function (id) {
        if (prev.tutorIds.indexOf(id) === -1) prev.tutorIds.push(id);
      });
      prev.endSlot = last.endSlot;
    }
    return out;
  }

  // Half hours a week each lane is covered for, indexed like coverageLanes().
  function coverageLaneHours(runs) {
    var totals = [];
    for (var i = 0; i < coverageLanes().length; i++) totals.push(0);
    (runs || []).forEach(function (run) {
      totals[run.lane] += run.endSlot - run.startSlot;
    });
    return totals;
  }

  /* ---- color math, shared by the app and the CI contrast test ---- */

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  function mix(a, b, amount) {
    var ra = hexToRgb(a), rb = hexToRgb(b);
    return rgbToHex([
      ra[0] + (rb[0] - ra[0]) * amount,
      ra[1] + (rb[1] - ra[1]) * amount,
      ra[2] + (rb[2] - ra[2]) * amount
    ]);
  }

  function relativeLuminance(hex) {
    var rgb = hexToRgb(hex).map(function (v) {
      var c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function contrastRatio(a, b) {
    var la = relativeLuminance(a), lb = relativeLuminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  var SURFACE_LIGHT = '#FFFFFF';
  var SURFACE_DARK = '#18212F';
  var INK_LIGHT = '#14181F';
  var INK_DARK = '#EEF3F9';

  // How much white a block fill is cut with: enough hue to tell two blocks
  // apart, pale enough to read black text over.
  var BLOCK_TINT = 0.86;

  // Block colors are derived rather than hand-picked, so the contrast test
  // covers every color of every ring instead of a curated subset.
  function shadeBlock(hue, dark) {
    if (dark) {
      return {
        hue: hue,
        bar: mix(hue, '#FFFFFF', 0.18),
        bg: mix(hue, SURFACE_DARK, 0.80),
        ink: INK_DARK
      };
    }
    return {
      hue: hue,
      bar: hue,
      bg: mix(hue, SURFACE_LIGHT, BLOCK_TINT),
      ink: INK_LIGHT
    };
  }

  function blockColors(colorIndex, dark) {
    return shadeBlock(PALETTE[colorIndex % PALETTE.length], dark);
  }

  function subjectHue(subjectIndex) {
    var subject = SUBJECTS[subjectIndex];
    var named = subject && SUBJECT_HUES[subject.key];
    return named || PALETTE[(SUBJECT_FALLBACK_OFFSET + subjectIndex) % PALETTE.length];
  }

  // A lane wears the colour of its class.
  function laneColors(lane, dark) {
    return shadeBlock(subjectHue(lane && lane.length ? lane[0] : 0), dark);
  }

  function coverageColors(run, dark) {
    return laneColors(coverageLanes()[run.lane], dark);
  }

  // Past the end of the list a color has to come round again, and the repeat is
  // drawn with a diagonal hatch so the pair stays distinct anyway.
  function usesHatch(colorIndex) { return colorIndex >= PALETTE.length; }

  /* ---- how different two colors look ---- */

  // CIE L*a*b* under D65. Hex arithmetic answers "are these the same bytes";
  // Lab answers the question the schedule actually asks, which is whether two
  // blocks look alike to someone glancing at the page.
  function hexToLab(hex) {
    var lin = hexToRgb(hex).map(function (v) {
      var c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    var f = [
      (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047,
      (0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]),
      (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883
    ].map(function (t) {
      return t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t) + 16 / 116;
    });
    return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
  }

  function deltaE(a, b) {
    var la = hexToLab(a), lb = hexToLab(b);
    var dl = la[0] - lb[0], da = la[1] - lb[1], db = la[2] - lb[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  /* Building a ring asks the same handful of questions about the same few
   * hundred colors over and over, so the conversions are kept rather than
   * redone. Pure functions of the hex, so the cache never goes stale.
   */
  var labCache = {};
  function labOf(hex, vision) {
    var key = vision + hex;
    if (labCache[key] === undefined) {
      labCache[key] = hexToLab(vision === 'normal' ? hex : simulateCvd(hex, vision));
    }
    return labCache[key];
  }

  function labGap(a, b) {
    var dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  // Two palette slots compared the way they are drawn: the tint is most of the
  // block, the identity bar the rest, so the tint counts double. Slots past the
  // palette wrap onto the same hues, which is exactly what the caller needs to
  // know -- slot 0 and slot 11 are the same blue.
  /* Vienot, Brettel & Mollon (1999): drop the color onto the plane a dichromat
   * still has, and what comes back is what that reader sees. Red-green is the
   * common case and the one that matters here -- an evenly spaced ring of hues
   * always contains a red and a green that a deuteranope reads as one color.
   */
  function simulateCvd(hex, kind) {
    var rgb = hexToRgb(hex);
    var l = 17.8824 * rgb[0] + 43.5161 * rgb[1] + 4.11935 * rgb[2];
    var m = 3.45565 * rgb[0] + 27.1554 * rgb[1] + 3.86714 * rgb[2];
    var s = 0.0299566 * rgb[0] + 0.184309 * rgb[1] + 1.46709 * rgb[2];
    if (kind === 'protan') l = 2.02344 * m - 2.52581 * s;
    else m = 0.494207 * l + 1.24827 * s;
    return rgbToHex([
      0.080944479 * l - 0.130504409 * m + 0.116772127 * s,
      -0.0102485335 * l + 0.0540193266 * m - 0.113614708 * s,
      -0.0003652968 * l - 0.0041216156 * m + 0.693512259 * s
    ]);
  }

  // The worst case across readers, which is the smallest of the three gaps: two
  // colors are only as distinct as the eye that can least tell them apart.
  function colorGap(a, b) {
    return Math.min(
      labGap(labOf(a, 'normal'), labOf(b, 'normal')),
      labGap(labOf(a, 'protan'), labOf(b, 'protan')),
      labGap(labOf(a, 'deutan'), labOf(b, 'deutan'))
    );
  }

  /* How far apart two colors land once they are drawn as blocks: the fill is
   * most of what the eye gets and counts double, the identity bar is the rest.
   * The light theme is the one that prints, so it is the one measured.
   */
  function blockGap(hueA, hueB) {
    return (2 * colorGap(mix(hueA, SURFACE_LIGHT, BLOCK_TINT), mix(hueB, SURFACE_LIGHT, BLOCK_TINT)) +
      colorGap(hueA, hueB)) / 3;
  }

  // The palette is fixed, so every number below it is too: worked out once.
  var slotGapCache = {};
  var widestSlotGap = 0;

  function slotDistance(a, b) {
    var ia = a % PALETTE.length, ib = b % PALETTE.length;
    if (ia === ib) return 0;
    var key = Math.min(ia, ib) + ':' + Math.max(ia, ib);
    if (slotGapCache[key] === undefined) {
      slotGapCache[key] = blockGap(PALETTE[ia], PALETTE[ib]);
    }
    return slotGapCache[key];
  }

  function slotSpread() {
    if (!widestSlotGap) {
      for (var a = 0; a < PALETTE.length; a++) {
        for (var b = a + 1; b < PALETTE.length; b++) {
          widestSlotGap = Math.max(widestSlotGap, slotDistance(a, b));
        }
      }
    }
    return widestSlotGap;
  }

  // 1 when two slots are indistinguishable, near 0 when nothing about them is
  // shared. Cubed so a merely different-ish pair costs almost nothing and only
  // the genuinely confusable pairs -- the two blues, the two purples -- push
  // the solver around.
  function slotClash(a, b) {
    var clash = Math.pow(Math.max(0, 1 - slotDistance(a, b) / slotSpread()), 3);
    // A repeated color is drawn with a diagonal hatch, which carries most of the
    // distinction by itself.
    if (usesHatch(a) !== usesHatch(b)) clash *= 0.45;
    return clash;
  }

  /* ---- dynamic color assignment ---- */

  // Shifts on the same day share a column; a day apart puts them side by side.
  // Both read as "next to each other" on the printed page, so both constrain
  // what colors the two tutors can wear.
  var DAY_FALLOFF = [1, 0.8, 0.35, 0.15, 0.1];
  var NEAR_SLOTS = 6;       // three hours: still one glance
  var LEGEND_WEIGHT = 0.06; // in the legend every tutor is beside every other
  var TAKEN_COST = 1e6;     // a slot already spoken for is never the answer
  var CLASH_POWER = 3;      // see seatCost: one bad pair costs more than many mild ones

  function shiftProximity(a, b) {
    var dayWeight = DAY_FALLOFF[Math.min(Math.abs(a.day - b.day), DAY_FALLOFF.length - 1)];
    var gap = Math.max(a.startSlot, b.startSlot) - Math.min(a.endSlot, b.endSlot);
    if (gap >= NEAR_SLOTS) return 0;
    return dayWeight * (gap <= 0 ? 1 : 1 - gap / NEAR_SLOTS);
  }

  // How close a pair of tutors ever comes to each other, as a weight from the
  // legend floor up to 1. Repeated near misses accumulate, without any one pair
  // ever outweighing the rest of the week.
  function proximityMatrix(tutors, assignments) {
    var seat = {}, n = tutors.length, w = [], i, j;
    for (i = 0; i < n; i++) {
      seat[tutors[i].id] = i;
      w.push([]);
      for (j = 0; j < n; j++) w[i].push(i === j ? 0 : LEGEND_WEIGHT);
    }
    var shifts = (assignments || []).filter(function (a) {
      return seat[a.tutorId] !== undefined;
    });
    for (i = 0; i < shifts.length; i++) {
      for (j = i + 1; j < shifts.length; j++) {
        var ia = seat[shifts[i].tutorId], ib = seat[shifts[j].tutorId];
        if (ia === ib) continue;
        var near = shiftProximity(shifts[i], shifts[j]);
        if (near <= 0) continue;
        w[ia][ib] = w[ib][ia] = 1 - (1 - w[ia][ib]) * (1 - near);
      }
    }
    return w;
  }

  /*
   * What it costs tutor `i` to wear `slot`, given who already holds what.
   * `skip` leaves one tutor out, which is what makes pricing a swap cheap.
   *
   * Raised to a power rather than summed flat: a handful of mildly similar
   * pairs is a schedule nobody complains about, and one pair of blocks that
   * read as the same color is the whole complaint. Convex cost means the
   * solver will happily take the first to avoid the second.
   *
   * `tier` prices the wrap. Every clash term is under 1 and there are fewer
   * than `tier` of them, so charging a whole tier for each round past the
   * first means no repeated color is taken while an unused one is free. Two
   * tutors trading slots keep the rounds between them, so the tier cancels out
   * of a swap and never blocks one.
   */
  function seatCost(i, slot, chosen, w, skip, tier) {
    var sum = tier * Math.floor(slot / PALETTE.length);
    for (var k = 0; k < chosen.length; k++) {
      if (k === i || k === skip || chosen[k] < 0) continue;
      sum += chosen[k] === slot ? TAKEN_COST
        : Math.pow(w[i][k] * slotClash(slot, chosen[k]), CLASH_POWER);
    }
    return sum;
  }

  function cheapestSeat(i, chosen, slots, w, tier) {
    var best = slots[0], bestCost = Infinity;
    for (var s = 0; s < slots.length; s++) {
      var cost = seatCost(i, slots[s], chosen, w, -1, tier);
      if (cost < bestCost) { bestCost = cost; best = slots[s]; }
    }
    return best;
  }

  /*
   * Picks a color for every tutor from where they land in the week rather than
   * from the order they were typed in, so two tutors whose blocks sit next to
   * each other never come out the same blue. `options.only` re-seats just those
   * tutors and leaves everyone else's color where it is.
   *
   * Returns a map of tutor id to color index. Deterministic: the same roster
   * and the same schedule always produce the same colors.
   */
  function assignColors(tutors, assignments, options) {
    var opts = options || {};
    var list = (tutors || []).filter(Boolean);
    var n = list.length, out = {}, i;
    if (!n) return out;

    var w = proximityMatrix(list, assignments);
    var load = w.map(function (row) {
      return row.reduce(function (sum, v) { return sum + v; }, 0);
    });

    var chosen = [], loose = [], span = n;
    for (i = 0; i < n; i++) {
      var held = opts.only && opts.only.indexOf(list[i].id) === -1;
      var keeping = held && typeof list[i].colorIndex === 'number';
      chosen.push(keeping ? list[i].colorIndex : -1);
      if (keeping) span = Math.max(span, list[i].colorIndex + 1);
      if (!held) loose.push(i);
    }

    // The whole palette, plus a hatched round for every wrap this roster
    // forces, so there is always a free slot and no two tutors ever share one.
    // `span` also covers a color a held tutor is already wearing.
    var rounds = Math.max(1, Math.ceil(span / PALETTE.length));
    var slots = [];
    for (i = 0; i < rounds * PALETTE.length; i++) slots.push(i);

    // Hardest first: a tutor who is next to everyone has the fewest good
    // options left if they are colored last.
    loose.sort(function (a, b) {
      return load[b] - load[a] || (list[a].id < list[b].id ? -1 : 1);
    });
    loose.forEach(function (t) { chosen[t] = cheapestSeat(t, chosen, slots, w, n); });

    // Greedy settles the hard cases but can strand an easy one, and once every
    // slot is spoken for the only move left is trading two of them.
    for (var pass = 0; pass < 12; pass++) {
      var improved = false;
      for (var a = 0; a < loose.length; a++) {
        var x = loose[a];
        for (var b = a + 1; b < loose.length; b++) {
          var y = loose[b];
          var before = seatCost(x, chosen[x], chosen, w, y, n) + seatCost(y, chosen[y], chosen, w, x, n);
          var after = seatCost(x, chosen[y], chosen, w, y, n) + seatCost(y, chosen[x], chosen, w, x, n);
          if (after < before - 1e-9) {
            var swap = chosen[x]; chosen[x] = chosen[y]; chosen[y] = swap;
            improved = true;
          }
        }
        var moved = cheapestSeat(x, chosen, slots, w, n);
        if (moved !== chosen[x] &&
            seatCost(x, moved, chosen, w, -1, n) < seatCost(x, chosen[x], chosen, w, -1, n) - 1e-9) {
          chosen[x] = moved;
          improved = true;
        }
      }
      if (!improved) break;
    }

    for (i = 0; i < n; i++) out[list[i].id] = chosen[i];
    return out;
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' +
      Math.random().toString(36).slice(2, 9) +
      Date.now().toString(36).slice(-4);
  }

  TS.util = {
    VERSION: VERSION,
    DAY_START_MIN: DAY_START_MIN,
    SLOT_MINUTES: SLOT_MINUTES,
    SLOTS_PER_DAY: SLOTS_PER_DAY,
    DAYS: DAYS,
    TOTAL_SLOTS: TOTAL_SLOTS,
    CORE_START_SLOT: CORE_START_SLOT,
    CORE_END_SLOT: CORE_END_SLOT,
    scheduleWindow: scheduleWindow,
    editorWindow: editorWindow,
    DAY_NAMES: DAY_NAMES,
    DAY_ABBR: DAY_ABBR,
    OPTIONAL_DAYS: OPTIONAL_DAYS,
    dayInUse: dayInUse,
    printedDays: printedDays,
    SUBJECTS: SUBJECTS,
    MAX_SUBJECTS: MAX_SUBJECTS,
    defaultSubjects: defaultSubjects,
    subjectKey: subjectKey,
    normalizeSubjectList: normalizeSubjectList,
    setSubjects: setSubjects,
    ownRoom: ownRoom,
    seatedShifts: seatedShifts,
    compareNames: compareNames,
    sortedNames: sortedNames,
    capRules: capRules,
    capLimit: capLimit,
    capacity: capacity,
    capSummary: capSummary,
    coverageLanes: coverageLanes,
    coverageLabel: coverageLabel,
    coverageRuns: coverageRuns,
    coverageLaneHours: coverageLaneHours,
    mergeCrampedSegments: mergeCrampedSegments,
    laneLabel: laneLabel,
    PALETTE: PALETTE,
    idx: idx,
    slotStartMinutes: slotStartMinutes,
    emptyAvailability: emptyAvailability,
    availabilityRuns: availabilityRuns,
    formatMinutes: formatMinutes,
    formatRange: formatRange,
    formatRangeCompact: formatRangeCompact,
    minutesToHhmm: minutesToHhmm,
    hhmmToSlot: hhmmToSlot,
    hoursLabel: hoursLabel,
    effectiveStart: effectiveStart,
    parseIso: parseIso,
    isoDate: isoDate,
    isPast: isPast,
    dateRangeLabel: dateRangeLabel,
    handoutName: handoutName,
    subjectMask: subjectMask,
    maskToShort: maskToShort,
    maskToLabels: maskToLabels,
    popcount: popcount,
    listSentence: listSentence,
    displayNames: displayNames,
    hexToRgb: hexToRgb,
    contrastRatio: contrastRatio,
    blockColors: blockColors,
    laneColors: laneColors,
    coverageColors: coverageColors,
    usesHatch: usesHatch,
    deltaE: deltaE,
    colorGap: colorGap,
    blockGap: blockGap,
    slotClash: slotClash,
    shiftProximity: shiftProximity,
    proximityMatrix: proximityMatrix,
    assignColors: assignColors,
    uid: uid
  };
})(typeof window !== 'undefined' ? window : globalThis);
