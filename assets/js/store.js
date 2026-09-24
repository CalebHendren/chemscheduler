(function (root) {
  'use strict';
  var TS = (root.TS = root.TS || {});
  var U = TS.util;

  // Its own key: the Life Science scheduler is served from the same site, and
  // browser storage is shared per site, so the two would otherwise overwrite
  // each other's work.
  var STORAGE_KEY = 'cscc-chem-tutor-scheduler-v1';
  var VERSION = 1;
  var APPOINTMENT_URL =
    'https://slate.chattanoogastate.edu/register/?id=a69c0cfb-95a8-48a2-860f-b38c6a4795aa';

  function defaultSettings() {
    return {
      title: 'Chemistry Tutoring Schedule',
      term: 'Fall 2026',
      effective: '',
      notes: 'No tutoring will be available September 7, October 5–11, or November 23–29, ' +
        'or any time campus is closed. The last day of tutoring for the fall ' +
        'semester is December 10, 2026.',
      location: 'OMN 164',
      contactName: '',
      contactEmail: '',
      // The link is used exactly as given: Slate needs the id to find the form.
      qrUrl: APPOINTMENT_URL,
      qrHeading: 'Schedule a tutoring appointment',
      qrCaption: 'Scan the code to book a time with a tutor.',
      // The plain-text listing is optional, so the two calendars can be
      // printed on the two faces of one sheet.
      includeListing: false,
      minShiftSlots: 2,
      // Up to three at the center through the day, two once the evening starts
      // -- see U.capRules for how a shift already running carries past it.
      maxConcurrent: 3,
      eveningMaxConcurrent: 2,
      eveningStartSlot: 20,          // 5:00 PM
      breakAfterHours: 6,
      breakSlots: 1,
      defaultMaxHours: 20,
      weeklyBudgetEnabled: false,
      weeklyBudgetHours: 80,
      evenDistribution: true,
      subjects: U.defaultSubjects(),
      theme: 'system'
    };
  }

  /* ---- the two 7-week halves ----
   * The term runs as two 7-week halves, and a half can have a week of its own
   * -- a tutor whose classes change at the midpoint, say. Each half keeps its
   * own shifts and its own effective dates; the roster and every other setting
   * are shared.
   *
   * The half being worked on lives where a single week always has:
   * state.assignments and settings.effective. The rest of the app never needs
   * to know there is another one. The other half waits in state.periods, and
   * switching swaps the two over. A half whose assignments are null has not
   * been started, and opens as a copy of the other.
   */
  var PERIOD_LABELS = ['1st 7 weeks', '2nd 7 weeks'];

  function emptyPeriods() {
    return PERIOD_LABELS.map(function (label, i) {
      return { label: label, effective: '', assignments: i === 0 ? [] : null };
    });
  }

  function emptyState() {
    return {
      version: VERSION, settings: defaultSettings(), tutors: [], assignments: [],
      periods: emptyPeriods(), activePeriod: 0
    };
  }

  // Writes the half being worked on back into its place in state.periods, so
  // anything read from there -- a save, an export, undo -- is current.
  function syncPeriod() {
    var p = state.periods[state.activePeriod];
    p.assignments = state.assignments;
    p.effective = state.settings.effective;
  }

  function copyShifts(list) {
    return (list || []).map(function (a) {
      var copy = normalizeAssignment(a);
      copy.id = U.uid('shift');
      return copy;
    });
  }

  function activePeriodLabel() {
    return state.periods[state.activePeriod].label;
  }

  function switchPeriod(index) {
    if (index === state.activePeriod || !state.periods[index]) return false;
    syncPeriod();
    var next = state.periods[index];
    if (!next.assignments) next.assignments = copyShifts(state.assignments);
    // A tutor removed while the other half was on screen leaves nothing behind.
    next.assignments = next.assignments.filter(function (a) { return getTutor(a.tutorId); });
    state.assignments = next.assignments;
    state.settings.effective = next.effective;
    state.activePeriod = index;
    return true;
  }

  // Starts the half being worked on over as a copy of the other one.
  function copyOtherPeriod() {
    syncPeriod();
    var other = state.periods[1 - state.activePeriod];
    state.assignments = copyShifts(other.assignments || []);
    syncPeriod();
  }

  var state = emptyState();
  var listeners = [];

  function on(fn) { listeners.push(fn); return function () { listeners.splice(listeners.indexOf(fn), 1); }; }
  function emit(reason) {
    for (var i = 0; i < listeners.length; i++) listeners[i](state, reason);
  }

  /* ---- undo ----
   * Every change in the app already funnels through commit(), so history is
   * kept here rather than asking each caller to remember to record itself.
   * `mark` is the state as it stood after the last commit, which is exactly
   * the state to go back to when the next one lands.
   */
  var MAX_HISTORY = 60;
  var undoStack = [];
  var redoStack = [];
  var mark = null;   // set below, once serialize() is reachable

  function serialize() {
    syncPeriod();
    return JSON.stringify({
      settings: state.settings, tutors: state.tutors, assignments: state.assignments,
      periods: state.periods, activePeriod: state.activePeriod
    });
  }

  function restore(json) {
    state = migrate(JSON.parse(json));
    mark = serialize();
    save();
  }

  function commit(reason) {
    reason = reason || 'change';
    // One choke point for the class list: however it changed -- edited here,
    // imported, or stepped over by undo -- the masks follow the state.
    U.setSubjects(state.settings.subjects);
    if (mark !== null) {
      undoStack.push({ json: mark, reason: reason });
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
    }
    mark = serialize();
    save();
    emit(reason);
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  // Both return the reason of the change they stepped over, so the caller can
  // say what just happened, or null when there was nothing to step over.
  function undo() {
    if (!undoStack.length) return null;
    var entry = undoStack.pop();
    redoStack.push({ json: serialize(), reason: entry.reason });
    restore(entry.json);
    emit('undo');
    return entry.reason;
  }

  function redo() {
    if (!redoStack.length) return null;
    var entry = redoStack.pop();
    undoStack.push({ json: serialize(), reason: entry.reason });
    restore(entry.json);
    emit('redo');
    return entry.reason;
  }

  function clearHistory() {
    undoStack.length = 0;
    redoStack.length = 0;
    mark = serialize();
  }

  mark = serialize();

  var storageWorks = null;

  /*
   * Browsers block local storage in a few situations that matter here: a
   * private window, site data turned off, and -- the common one -- opening the
   * single-file build straight from disk, where Chrome treats file:// as an
   * opaque origin. The app still works; it just cannot remember anything, so
   * the UI says so rather than losing a schedule silently.
   */
  function storageAvailable() {
    if (storageWorks !== null) return storageWorks;
    try {
      var probe = STORAGE_KEY + ':probe';
      root.localStorage.setItem(probe, '1');
      root.localStorage.removeItem(probe);
      storageWorks = true;
    } catch (e) {
      storageWorks = false;
    }
    return storageWorks;
  }

  function save() {
    if (!storageAvailable()) return false;
    try {
      syncPeriod();
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      // Most likely the quota; treat it the same as unavailable from here on
      // so the warning shows and the app keeps running.
      storageWorks = false;
      if (root.console) root.console.warn('Schedule could not be saved locally:', e && e.message);
      return false;
    }
  }

  function load() {
    var raw = null;
    try { raw = root.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) return false;
    try {
      var parsed = JSON.parse(raw);
      state = migrate(parsed);
      clearHistory();   // the first change of the session undoes back to this
      return true;
    } catch (e) {
      if (root.console) root.console.warn('Saved schedule was unreadable; starting fresh.');
      return false;
    }
  }

  function migrate(obj) {
    var next = emptyState();
    if (!obj || typeof obj !== 'object') return next;
    // Unknown keys are dropped and missing ones defaulted, so an older or
    // hand-edited file still loads instead of half-populating the UI.
    if (obj.settings) {
      Object.keys(next.settings).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(obj.settings, k)) next.settings[k] = obj.settings[k];
      });
    }
    // The class list drives every subject mask in the app, so it is applied
    // before a single tutor is normalized against it.
    next.settings.subjects = U.normalizeSubjectList(next.settings.subjects);
    U.setSubjects(next.settings.subjects);
    next.tutors = (obj.tutors || []).map(normalizeTutor);
    var ids = {};
    next.tutors.forEach(function (t) { ids[t.id] = true; });

    /* A shift is kept if its tutor is still on the roster and it falls on a
     * tutoring day. A file from the Life Science scheduler can carry Friday
     * shifts, and embedded classes or open labs held somewhere else; neither
     * has a place on this calendar, so they are left behind rather than drawn
     * where they were never held.
     */
    var shifts = function (list) {
      return (list || []).filter(function (a) {
        return a && ids[a.tutorId] && (a.day | 0) < U.DAYS && (!a.kind || a.kind === 'main');
      }).map(normalizeAssignment);
    };

    // A file from before the halves -- or from the Life Science scheduler --
    // is one week, and it becomes the 1st 7 weeks.
    var saved = Array.isArray(obj.periods) ? obj.periods : null;
    next.periods.forEach(function (p, i) {
      var from = saved ? saved[i] || {} : (i === 0 ? { assignments: obj.assignments,
        effective: obj.settings && obj.settings.effective } : {});
      p.effective = String(from.effective || '');
      p.assignments = Array.isArray(from.assignments) ? shifts(from.assignments)
        : i === 0 ? [] : null;
    });
    next.activePeriod = saved && next.periods[obj.activePeriod] ? obj.activePeriod | 0 : 0;

    // The half that was open is live in obj.assignments and settings.effective,
    // which win over the copy filed under periods: that copy is only as fresh
    // as the last save.
    var active = next.periods[next.activePeriod];
    if (saved && Array.isArray(obj.assignments)) active.assignments = shifts(obj.assignments);
    if (saved && obj.settings && typeof obj.settings.effective === 'string') {
      active.effective = obj.settings.effective;
    }
    if (!active.assignments) active.assignments = [];
    next.assignments = active.assignments;
    next.settings.effective = active.effective;
    return next;
  }

  function normalizeTutor(t) {
    var avail = U.emptyAvailability();
    for (var i = 0; i < U.TOTAL_SLOTS; i++) {
      if (t.availability && t.availability[i]) avail[i] = 1;
    }
    /* Every class the schedule currently knows about, plus any flag left over
     * from one that was removed: keeping the stray keys is what lets an
     * accidental deletion be undone without losing who could teach what.
     */
    var subjects = {};
    Object.keys(t.subjects || {}).forEach(function (k) {
      if (t.subjects[k]) subjects[k] = true;
    });
    U.SUBJECTS.forEach(function (s) {
      subjects[s.key] = !!(t.subjects && t.subjects[s.key]);
    });

    return {
      id: t.id || U.uid('tutor'),
      firstName: String(t.firstName || '').trim(),
      lastName: String(t.lastName || '').trim(),
      email: String(t.email || '').trim(),
      room: String(t.room || '').trim(),
      colorIndex: typeof t.colorIndex === 'number' ? t.colorIndex : 0,
      subjects: subjects,
      maxHoursPerWeek: typeof t.maxHoursPerWeek === 'number'
        ? t.maxHoursPerWeek : defaultSettings().defaultMaxHours,
      minHoursPerWeek: typeof t.minHoursPerWeek === 'number' ? t.minHoursPerWeek : 0,
      availability: avail,
      notes: String(t.notes || '')
    };
  }

  function normalizeAssignment(a) {
    return {
      id: a.id || U.uid('shift'),
      tutorId: a.tutorId,
      day: a.day | 0,
      startSlot: a.startSlot | 0,
      endSlot: a.endSlot | 0,
      locked: !!a.locked,
      overCapacity: !!a.overCapacity
    };
  }

  /* ---- tutors ---- */

  function nextColorIndex() {
    var used = {};
    state.tutors.forEach(function (t) { used[t.colorIndex] = (used[t.colorIndex] || 0) + 1; });
    for (var i = 0; i < 64; i++) {
      if (!used[i]) return i;
    }
    return state.tutors.length;
  }

  /*
   * Re-picks tutor colors from the schedule as it now stands, so who sits next
   * to whom decides who gets which hue instead of the order the roster was
   * typed in. `onlyIds` limits it to those tutors and leaves the rest alone,
   * which is what a change to one person's shifts should do.
   *
   * Callers commit afterwards: colors ride along in the same undo step as the
   * schedule change that caused them.
   */
  function recolorTutors(onlyIds) {
    var map = U.assignColors(state.tutors, state.assignments,
      onlyIds ? { only: onlyIds } : null);
    state.tutors.forEach(function (t) {
      if (typeof map[t.id] === 'number') t.colorIndex = map[t.id];
    });
  }

  function addTutor(data) {
    var t = normalizeTutor(data || {});
    if (typeof (data && data.colorIndex) !== 'number') t.colorIndex = nextColorIndex();
    if (!(data && typeof data.maxHoursPerWeek === 'number')) t.maxHoursPerWeek = state.settings.defaultMaxHours;
    state.tutors.push(t);
    return t;
  }

  function getTutor(id) {
    for (var i = 0; i < state.tutors.length; i++) {
      if (state.tutors[i].id === id) return state.tutors[i];
    }
    return null;
  }

  function removeTutor(id) {
    state.tutors = state.tutors.filter(function (t) { return t.id !== id; });
    filterShifts(function (a) { return a.tutorId !== id; });
  }

  /* Keeps only the shifts `keep` accepts, in both halves: a change to the
   * roster is true of the whole term, not just the half on screen. Returns how
   * many were dropped from each, [1st, 2nd].
   */
  function filterShifts(keep) {
    syncPeriod();
    var dropped = state.periods.map(function (p) {
      if (!p.assignments) return 0;
      var before = p.assignments.length;
      p.assignments = p.assignments.filter(keep);
      return before - p.assignments.length;
    });
    state.assignments = state.periods[state.activePeriod].assignments;
    return dropped;
  }

  /* ---- assignments ---- */

  function addAssignment(a) {
    var next = normalizeAssignment(a);
    if (!next.id) next.id = U.uid('shift');
    state.assignments.push(next);
    return next;
  }

  function removeAssignment(id) {
    state.assignments = state.assignments.filter(function (a) { return a.id !== id; });
  }

  function getAssignment(id) {
    for (var i = 0; i < state.assignments.length; i++) {
      if (state.assignments[i].id === id) return state.assignments[i];
    }
    return null;
  }

  /* A tutor given 9:00-11:00 and then 11:00-2:00 is working one shift, not two,
   * so touching blocks are stitched together as they are placed -- the same
   * thing the optimizer does to its own fragments on the way out. A locked
   * block is left alone because locking is what pins a shift down.
   *
   * This can never create a stretch the rules would have refused: the break
   * rule measures the hours a tutor actually works in a row, not the block, so
   * a shift that would join two others into six unbroken hours is turned away
   * before it is ever placed.
   */
  function mergeTouching(tutorId, day) {
    var mine = state.assignments.filter(function (a) {
      return a.tutorId === tutorId && a.day === day && !a.locked;
    }).sort(function (a, b) { return a.startSlot - b.startSlot; });

    var merged = 0;
    for (var i = 0; i < mine.length - 1; i++) {
      var a = mine[i], b = mine[i + 1];
      if (a.endSlot !== b.startSlot) continue;
      a.endSlot = b.endSlot;
      a.overCapacity = a.overCapacity || b.overCapacity;
      removeAssignment(b.id);
      mine[i + 1] = a;      // carry the grown block into the next comparison
      merged++;
    }
    return merged;
  }

  function slotsFor(tutorId) {
    var n = 0;
    state.assignments.forEach(function (a) {
      if (a.tutorId === tutorId) n += a.endSlot - a.startSlot;
    });
    return n;
  }

  /* ---- import / export ---- */

  function toJson() {
    syncPeriod();
    return JSON.stringify(state, null, 2);
  }

  function fromJson(text) {
    var parsed = JSON.parse(text);
    state = migrate(parsed);
    commit('import');
  }

  function replaceState(next) {
    state = migrate(next);
    commit('replace');
  }

  function reset() {
    state = emptyState();
    commit('reset');
  }

  /* ---- sample roster ----
   * It doubles as the CI test case, so it deliberately contains two tutors
   * named Rosa, a faculty member in her own office, and enough availability
   * that every half hour from 9:00 to 5:00 is coverable by someone.
   */
  function availability(windows) {
    var a = U.emptyAvailability();
    windows.forEach(function (w) {
      var days = w[0], start = U.hhmmToSlot(w[1]), end = U.hhmmToSlot(w[2]);
      days.forEach(function (d) {
        for (var s = start; s < end; s++) a[U.idx(d, s)] = 1;
      });
    });
    return a;
  }

  var MON = 0, TUE = 1, WED = 2, THU = 3;

  /* Made-up people, to show how it all works without anyone's real week on
   * it. Everyone is approved for the same 20 hours -- a department decision,
   * not a personal one. What differs is availability, because these tutors
   * are students first: a couple can offer 10 or more, most a few afternoons
   * around their own classes, one or two a single shift. Between them they
   * cover 9:00 to 5:00 Monday to Thursday, two share a first name so the
   * handout has to tell them apart, and one is a faculty member holding
   * office hours in her own office.
   */
  function sampleTutors() {
    var all = { chem1: true, chem2: true, orgo: true };
    return [
      // 10 h and more -- the backbone of the week
      { firstName: 'Theo', lastName: 'Park', subjects: { chem1: true },
        availability: availability([[[TUE, THU], '09:00', '14:00'], [[MON], '13:00', '17:00']]) },
      { firstName: 'Rosa', lastName: 'Quint', subjects: { chem1: true, chem2: true },
        availability: availability([[[MON, WED], '09:00', '14:00']]) },
      // 6-8 h -- the usual case, two or three shifts around classes
      { firstName: 'Priya', lastName: 'Nand', subjects: { chem1: true, orgo: true },
        availability: availability([[[MON, WED], '13:00', '17:00']]) },
      { firstName: 'Marco', lastName: 'Diaz', subjects: { chem2: true, orgo: true },
        availability: availability([[[TUE, THU], '13:00', '17:00']]) },
      { firstName: 'Lena', lastName: 'Ortiz', subjects: { chem1: true, chem2: true },
        availability: availability([[[WED], '14:00', '17:00'], [[THU], '10:00', '13:00']]) },
      { firstName: 'Hana', lastName: 'Roth', subjects: all,
        availability: availability([[[TUE, THU], '11:00', '14:00']]) },
      // 3-4 h -- one shift is all their own timetable leaves
      { firstName: 'Kenji', lastName: 'Abe', subjects: { chem2: true },
        availability: availability([[[MON, WED], '10:00', '12:00']]) },
      { firstName: 'Rosa', lastName: 'Vance', subjects: { chem1: true, orgo: true },
        availability: availability([[[THU], '14:00', '17:00']]) },
      { firstName: 'Owen', lastName: 'Hale', subjects: { chem1: true },
        availability: availability([[[TUE], '14:00', '17:00']]) },
      // Office hours, in her own office rather than the tutoring room
      { firstName: 'Dr. Lane', lastName: '', subjects: all, room: 'Office 210-B',
        availability: availability([[[TUE], '12:00', '13:00']]) }
    ];
  }

  function loadSample() {
    state = emptyState();
    sampleTutors().forEach(function (t) { addTutor(t); });
    recolorTutors();
    commit('sample');
  }

  TS.store = {
    get state() { return state; },
    PERIOD_LABELS: PERIOD_LABELS,
    activePeriodLabel: activePeriodLabel,
    switchPeriod: switchPeriod,
    copyOtherPeriod: copyOtherPeriod,
    defaultSettings: defaultSettings,
    emptyState: emptyState,
    sampleTutors: sampleTutors,
    recolorTutors: recolorTutors,
    on: on,
    commit: commit,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    clearHistory: clearHistory,
    storageAvailable: storageAvailable,
    load: load,
    migrate: migrate,
    normalizeTutor: normalizeTutor,
    normalizeAssignment: normalizeAssignment,
    addTutor: addTutor,
    getTutor: getTutor,
    removeTutor: removeTutor,
    filterShifts: filterShifts,
    addAssignment: addAssignment,
    getAssignment: getAssignment,
    removeAssignment: removeAssignment,
    mergeTouching: mergeTouching,
    slotsFor: slotsFor,
    toJson: toJson,
    fromJson: fromJson,
    replaceState: replaceState,
    reset: reset,
    loadSample: loadSample
  };
})(typeof window !== 'undefined' ? window : globalThis);
