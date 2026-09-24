(function (root) {
  'use strict';
  var TS = (root.TS = root.TS || {});
  var U = TS.util;
  var doc = root.document;
  var esc = function (s) { return TS.tutors.esc(s); };

  /*
   * Lane grids per day. The screen view can position blocks freely, but a
   * table needs a fixed number of columns per day and a rowspan per block,
   * which is exactly what makes the exported PDF tagged and navigable.
   */
  function emptyGrid(lanes) {
    var grid = [];
    for (var l = 0; l < lanes; l++) {
      var row = new Array(U.SLOTS_PER_DAY);
      for (var s = 0; s < U.SLOTS_PER_DAY; s++) row[s] = null;
      grid.push(row);
    }
    return grid;
  }

  function laneGrid(assignments, day) {
    var dayBlocks = assignments.filter(function (a) { return a.day === day; });
    var placement = TS.calendar.layoutDay(dayBlocks);
    var lanes = 1;
    dayBlocks.forEach(function (b) {
      var p = placement[b.id];
      if (p) lanes = Math.max(lanes, p.lane + 1);
    });

    var grid = emptyGrid(lanes);
    dayBlocks.forEach(function (b) {
      var lane = placement[b.id] ? placement[b.id].lane : 0;
      for (var s = b.startSlot; s < b.endSlot; s++) grid[lane][s] = b;
    });

    return { lanes: lanes, grid: grid };
  }

  /* Days butt up against each other, so the last lane of each one carries the
   * divider and odd days carry a wash. Without both, a reader cannot tell
   * where Tuesday stops and Wednesday starts. */
  function cellClass(base, day, lane, lanes) {
    var cls = base;
    if (lane === lanes - 1) cls += ' pv-dayend';
    if (day % 2 === 1) cls += ' pv-day-alt';
    return cls;
  }

  function blockCell(a, labels, cls) {
    var tutor = TS.store.getTutor(a.tutorId);
    var colors = U.blockColors(tutor.colorIndex, false); // print is always light
    var mask = U.subjectMask(tutor.subjects);
    var shorts = U.maskToShort(mask);
    var full = (tutor.firstName + ' ' + tutor.lastName).trim();
    var room = U.ownRoom(tutor);
    return '<td class="' + cls + '" rowspan="' + (a.endSlot - a.startSlot) + '"' +
      ' style="background:' + colors.bg + ';border-left:4px solid ' + colors.bar + ';color:' + colors.ink + '"' +
      (U.usesHatch(tutor.colorIndex) ? ' data-hatch="1"' : '') + '>' +
      '<span class="pv-block__name">' + esc(labels[tutor.id]) + '</span>' +
      '<span class="pv-block__time">' + esc(U.formatRange(a.startSlot, a.endSlot)) + '</span>' +
      '<span class="pv-block__subjects">' + (shorts.join(' · ') || '—') + '</span>' +
      (room ? '<span class="pv-block__room">' + esc(room) + '</span>' : '') +
      '<span class="visually-hidden">' + esc(full) + '</span>' +
      '</td>';
  }

  /* Both calendars are the same table: a time column, then each printed day as
   * many lanes wide as it needs. Only what stands in a lane differs, so the
   * caller hands over the days -- { day, lanes, grid }, in order -- and says
   * how to draw the cell a block starts in; the rows it spans below are
   * absorbed by that cell's rowspan. The wash alternates by position on the
   * page, so it still alternates when a day is left out.
   */
  function gridTable(what, win, days, cellFor) {
    var rowPx = rowPxFor(win);
    var html = '<table class="pv-table" style="--pv-row:' + rowPx + 'px"><caption class="visually-hidden">' +
      what + ', ' + U.DAY_NAMES[days[0].day] + ' through ' + U.DAY_NAMES[days[days.length - 1].day] + ', ' +
      esc(U.formatMinutes(U.slotStartMinutes(win.start))) + ' to ' +
      esc(U.formatMinutes(U.slotStartMinutes(win.end))) + '</caption><thead><tr>' +
      '<th scope="col" class="pv-time-head pv-dayend">Time</th>';
    days.forEach(function (col) {
      html += '<th scope="' + (col.lanes > 1 ? 'colgroup' : 'col') + '"' +
        ' class="pv-dayend"' +
        (col.lanes > 1 ? ' colspan="' + col.lanes + '"' : '') + '>' +
        U.DAY_NAMES[col.day] + '</th>';
    });
    html += '</tr></thead><tbody>';

    for (var s = win.start; s < win.end; s++) {
      var onHour = U.slotStartMinutes(s) % 60 === 0;
      html += '<tr' + (onHour ? ' class="pv-hour"' : '') + '>' +
        '<th scope="row" class="pv-time">' +
        (onHour ? esc(U.formatMinutes(U.slotStartMinutes(s))) : '') + '</th>';

      for (var d = 0; d < days.length; d++) {
        var col = days[d];
        for (var l = 0; l < col.lanes; l++) {
          var item = col.grid[l] ? col.grid[l][s] : null;
          if (!item) {
            html += '<td class="' + cellClass('pv-empty', d, l, col.lanes) + '"></td>';
          } else if (item.startSlot === s) {
            html += cellFor(item, cellClass('pv-block', d, l, col.lanes), col.lanes, rowPx, days.length);
          }
        }
      }
      html += '</tr>';
    }

    return html + '</tbody></table>';
  }

  // Each printed day's lanes, labelled with the day they belong to.
  function dayColumns(assignments, laneFor) {
    return U.printedDays(assignments).map(function (d) {
      var col = laneFor(d);
      col.day = d;
      return col;
    });
  }

  function buildTable(state, labels) {
    var days = dayColumns(state.assignments, function (d) { return laneGrid(state.assignments, d); });
    return gridTable('Weekly tutoring schedule', U.scheduleWindow(state.assignments), days,
      function (a, cls) { return blockCell(a, labels, cls); });
  }

  /* The same grid read the other way round: one lane per class rather than per
   * tutor, so a student can find their class and see when it is covered. A day
   * only carries lanes for the classes actually on offer that day -- laying out
   * every class in every column would spend half the page on empty lanes.
   */
  function subjectLaneGrid(runs, day) {
    var today = runs.filter(function (run) { return run.day === day; });
    var lanes = [];
    today.forEach(function (run) {
      if (lanes.indexOf(run.lane) === -1) lanes.push(run.lane);
    });
    lanes.sort(function (a, b) { return a - b; });

    var grid = emptyGrid(lanes.length);
    today.forEach(function (run) {
      var lane = lanes.indexOf(run.lane);
      for (var s = run.startSlot; s < run.endSlot; s++) grid[lane][s] = run;
    });

    return { lanes: Math.max(1, lanes.length), subjects: lanes, grid: grid };
  }

  // Office hours say where they are held, since that is not the tutoring room.
  function namesOf(ids, labels) {
    return U.sortedNames(ids.map(function (id) {
      var tutor = TS.store.getTutor(id);
      if (!tutor) return '';
      return labels[tutor.id] + (U.ownRoom(tutor) ? ' (' + U.ownRoom(tutor) + ')' : '');
    }));
  }

  /* The printed page is a fixed size, so what fits in a stretch can be worked
   * out before it is drawn: a table cell cannot tell its contents to give way
   * line by line. These are the print.css figures the budget rests on.
   */
  /* Per orientation: the width inside the 0.4in inset each side, and the
   * height the grid's rows get once the header, the notes and the footer have
   * theirs. The rows are sized to fill it, shared out over the half hours on
   * the page; the budget leaves room for a few lines more of notes than the
   * default, and the cap keeps a short day from turning into a poster. */
  var PAGES = {
    portrait: { width: 739, grid: 640 },    // 8.5 x 11in
    landscape: { width: 979, grid: 420 }    // 11 x 8.5in
  };
  var page = PAGES.portrait;               // set from the schedule on each render
  var GUTTER_PX = 60;      // .pv-time
  var ROW_MIN_PX = 14, ROW_MAX_PX = 34;

  function pagePx() { return page.width; }

  function rowPxFor(win) {
    var rows = Math.max(1, win.end - win.start);
    return Math.max(ROW_MIN_PX, Math.min(ROW_MAX_PX, Math.floor(page.grid / rows)));
  }

  var LABEL_PX = 12;       // .pv-block__name, 8pt at line-height 1.1
  var LINE_PX = 10;        // .pv-block__who and __time, 6.5pt at about 1.15

  /* How wide a time reads at 6.5pt, measured in Chrome. A time only ever uses
   * these characters; anything else is priced as the widest. A pixel is kept
   * in hand, because a time that wraps when it was not expected to would push
   * itself out of the bottom of its stretch -- budgeting one line too many
   * only costs a line of names.
   */
  var TIME_CHAR_PX = { ':': 1.9, '–': 4.4, ' ': 2.3, A: 5.6, P: 4.9, M: 7.8 };
  var DIGIT_PX = 4.7;

  // Names are ordinary words, priced at a slightly generous average and wrapped
  // at spaces the way the browser will.
  var NAME_CHAR_PX = 4.6;

  function nameLinesNeeded(text, width) {
    var lines = 1, used = 0;
    text.split(' ').forEach(function (word) {
      var w = word.length * NAME_CHAR_PX;
      var add = used ? w + NAME_CHAR_PX : w;
      if (used && used + add > width) { lines++; used = w; } else used += add;
    });
    return lines;
  }

  function fitsOneLine(text, width) {
    var px = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      px += /[0-9]/.test(c) ? DIGIT_PX : (TIME_CHAR_PX[c] || 7.8);
    }
    return px <= width - 1;
  }

  /* The class code heads the block and the block runs as long as the class is
   * covered. Where the tutors change partway down, a faint rule marks the
   * change at the height it happens, and each stretch under it is boxed to
   * exactly its own hours, names over time. The page
   * is about the class, so the class code and the time are given their lines
   * first -- the range whole, broken after the dash, or shortened to one line
   * ("9-12") when that is all there is -- and the names get whole lines from
   * what is left, ending in an ellipsis rather than half a line when they run
   * out of room.
   */
  function subjectCell(run, labels, cls, lanes, rowPx, dayCount) {
    var colors = U.coverageColors(run, false);
    var spoken = run.subjects.map(function (i) { return U.SUBJECTS[i].label; });
    var who = namesOf(run.tutorIds, labels);
    var rows = run.endSlot - run.startSlot;
    // 4px bar, 3px padding each side and the borders, as measured.
    var width = (pagePx() - GUTTER_PX) / dayCount / Math.max(1, lanes) - 11.5;

    // Placed as a share of the block rather than in pixels, so each rule lands
    // on its hour however tall the rows come out.
    var pct = function (slots) { return (100 * slots / rows).toFixed(3) + '%'; };
    function layout(seg, i) {
      var lines = Math.floor(((seg.endSlot - seg.startSlot) * rowPx - 3 -
        (i === 0 ? LABEL_PX : 0)) / LINE_PX);

      var full = U.formatRange(seg.startSlot, seg.endSlot);
      var range = full.split('–');
      var out = { text: namesOf(seg.tutorIds, labels).join(', ') || 'unstaffed' };
      if (fitsOneLine(full, width)) {
        out.time = esc(full); out.timeLines = 1;
      } else if (lines >= 3) {
        // Either end stays whole: "9:00 AM-" over "4:00 PM". Only with a line
        // left for names; otherwise the short form keeps both on the page.
        out.time = '<span class="pv-nowrap">' + esc(range[0]) + '–</span>' +
          '<span class="pv-nowrap">' + esc(range[1]) + '</span>';
        out.timeLines = 2;
      } else {
        out.time = esc(U.formatRangeCompact(seg.startSlot, seg.endSlot)); out.timeLines = 1;
      }
      out.nameLines = Math.max(0, lines - out.timeLines);
      out.fits = nameLinesNeeded(out.text, width) <= out.nameLines;
      return out;
    }

    var merged = U.mergeCrampedSegments(run.segments, function (seg, i) {
      return layout(seg, i).fits;
    });
    var segments = merged.map(function (seg, i) {
      var fit = layout(seg, i);
      var time = fit.time;
      var names = fit.nameLines
        ? '<span class="pv-block__who" style="-webkit-line-clamp:' + fit.nameLines + '">' +
            esc(fit.text) + '</span>'
        : '';

      return '<div class="pv-seg' + (i ? ' pv-seg--after' : '') + '" style="top:' +
          pct(seg.startSlot - run.startSlot) + ';height:' + pct(seg.endSlot - seg.startSlot) + '">' +
        (i === 0 ? '<span class="pv-block__name">' + esc(run.label) + '</span>' : '') +
        names + '<span class="pv-block__time">' + time + '</span>' +
        '</div>';
    }).join('');

    return '<td class="' + cls + '" rowspan="' + rows + '"' +
      ' style="background:' + colors.bg + ';border-left:4px solid ' + colors.bar +
      ';color:' + colors.ink + '">' +
      // Sized from the fixed row height rather than stretched to the cell:
      // positioning the cell itself would paint its fill over the table's
      // borders.
      '<div class="pv-run" style="height:' + (rows * rowPx - 3) + 'px">' + segments + '</div>' +
      // "1120" is a label, not a sentence: a screen reader gets the class
      // spelled out instead.
      '<span class="visually-hidden">' + esc(U.listSentence(spoken)) +
      (who.length ? ', with ' + esc(U.listSentence(who)) : '') + '</span>' +
      '</td>';
  }

  function buildSubjectTable(state, labels, runs) {
    if (!runs.length) return '<p>No class is covered yet.</p>';
    var days = dayColumns(state.assignments, function (d) { return subjectLaneGrid(runs, d); });
    return gridTable('Weekly class coverage', U.scheduleWindow(state.assignments), days,
      function (run, cls, lanes, rowPx, dayCount) {
        return subjectCell(run, labels, cls, lanes, rowPx, dayCount);
      });
  }

  function buildSubjectLegend(runs) {
    if (!runs.length) return '';
    var totals = U.coverageLaneHours(runs);
    var items = U.coverageLanes().map(function (lane, i) {
      var colors = U.laneColors(lane, false);
      return '<li><span class="pv-swatch" style="background:' + colors.bg +
        ';border-left:5px solid ' + colors.bar + '"></span>' +
        esc(U.laneLabel(lane)) + ' <span class="pv-legend__subjects">' +
        esc(U.hoursLabel(totals[i])) + ' a week</span></li>';
    }).join('');
    return '<section class="pv-legend"><h2>Classes</h2><ul>' + items + '</ul></section>';
  }

  function buildListing(state, labels) {
    var html = '<section class="pv-listing"><h2>Schedule listing</h2>';
    var any = false;

    for (var d = 0; d < U.DAYS; d++) {
      var dayBlocks = state.assignments
        .filter(function (a) { return a.day === d; })
        .sort(function (a, b) { return a.startSlot - b.startSlot; });
      if (!dayBlocks.length) continue;
      any = true;

      // Each day is one unbreakable unit so a column never splits a heading
      // from the shifts under it.
      html += '<section class="pv-listing__day"><h3>' + U.DAY_NAMES[d] + '</h3><ul>';
      dayBlocks.forEach(function (a) {
        var tutor = TS.store.getTutor(a.tutorId);
        var mask = U.subjectMask(tutor.subjects);
        html += '<li>' + esc(labels[tutor.id]) + ', ' +
          esc(U.formatRange(a.startSlot, a.endSlot)) + ' — ' +
          esc(U.maskToLabels(mask).join(', ') || 'no classes assigned') +
          // The listing is the complete record, so it says where as well as when.
          (U.ownRoom(tutor) ? ' <em>(in ' + esc(U.ownRoom(tutor)) + ')</em>' : '') +
          '</li>';
      });
      html += '</ul></section>';
    }

    if (!any) html += '<p>No shifts are scheduled yet.</p>';
    return html + '</section>';
  }

  function buildLegend(state, labels) {
    if (!state.tutors.length) return '';
    var items = state.tutors.map(function (t) {
      var colors = U.blockColors(t.colorIndex, false);
      var shorts = U.maskToShort(U.subjectMask(t.subjects));
      return '<li><span class="pv-swatch" style="background:' + colors.bg +
        ';border-left:5px solid ' + colors.bar + '"></span>' +
        esc(labels[t.id]) + ' <span class="pv-legend__subjects">' +
        esc(shorts.join(' · ') || '—') + '</span>' +
        (U.ownRoom(t) ? ' <span class="pv-legend__room">' + esc(U.ownRoom(t)) + '</span>' : '') +
        '</li>';
    }).join('');
    return '<section class="pv-legend"><h2>Tutors</h2><ul>' + items + '</ul></section>';
  }

  /* ---- page furniture ----
   * The coverage page is page one over again, differing only in which grid it
   * carries and which legend decodes it, so everything either page would
   * otherwise repeat is built here and handed to both.
   */
  function buildHead(state) {
    var s = state.settings;
    // Which 7 weeks this is, beside the semester: the two halves' handouts
    // look alike, and one posted for the wrong half is easy to miss.
    var term = [s.term, state.periods[state.activePeriod].label].filter(Boolean).join(' · ');
    return '<header class="pv-head">' +
      '<div class="pv-head__main">' +
        '<p class="pv-college">Chattanooga State Community College</p>' +
        '<h1>' + esc(s.title) + '</h1>' +
        '<p class="pv-term">' + esc(term) + '</p>' +
        (s.effective ? '<p class="pv-subtitle">' + esc(s.effective) + '</p>' : '') +
        '<p class="pv-where">' + esc(s.location) + '</p>' +
      '</div>' +
      (s.contactName || s.contactEmail
        ? '<div class="pv-head__contact"><p>' +
            (s.contactName ? '<strong>' + esc(s.contactName) + '</strong>' : '') +
            (s.contactName && s.contactEmail ? '<br>' : '') +
            esc(s.contactEmail) + '</p></div>'
        : '') +
      '</header>';
  }

  function buildNotes(state) {
    var notes = state.settings.notes;
    if (!notes) return '';
    return '<section class="pv-notes"><h2>Important notes</h2><p>' +
      esc(notes) + '</p></section>';
  }

  function buildFoot(state, legendHtml) {
    var s = state.settings;
    // The link itself is left off the page: it is long and carries an id
    // nobody would type, so the code is what gets used.
    var qrSvg = TS.qr.toSvg(s.qrUrl, { label: 'QR code: ' + (s.qrHeading || s.qrUrl) });
    return '<div class="pv-foot">' +
      '<div class="pv-qr">' + qrSvg + '</div>' +
      '<div class="pv-qr__text">' +
        (s.qrHeading ? '<p><strong>' + esc(s.qrHeading) + '</strong></p>' : '') +
        (s.qrCaption ? '<p>' + esc(s.qrCaption) + '</p>' : '') +
      '</div>' +
      legendHtml +
      '</div>';
  }

  /* A whole handout page: the furniture wrapped round one grid and the legend
   * that decodes that grid's colours. */
  function buildHandout(state, labels, tableHtml, legendHtml) {
    return buildHead(state) +
      tableHtml +
      buildNotes(state) +
      buildFoot(state, legendHtml);
  }

  /* One half's pages. Printed double sided, the two calendars are the two
   * faces of one sheet. With the listing on, it follows each calendar instead,
   * so each sheet carries a calendar on one face and the listing on the other.
   */
  function renderPeriod(view) {
    var labels = U.displayNames(view.tutors);
    var runs = U.coverageRuns(view.assignments, view.tutors);
    var listing = view.settings.includeListing ? buildListing(view, labels) : '';
    return '<section class="pv-period">' +
      buildHandout(view, labels, buildTable(view, labels), buildLegend(view, labels)) +
      listing +
      '<section class="pv-coverage">' +
        buildHandout(view, labels, buildSubjectTable(view, labels, runs), buildSubjectLegend(runs)) +
      '</section>' +
      listing +
      '</section>';
  }

  // Both 7 weeks by default, one after the other, or whichever one the Print
  // choice asks for.
  /* The page's size and orientation. print.css cannot read a setting, so the
   * @page rule is written here, next to the pages it describes. */
  function setPage(orientation) {
    var landscape = orientation === 'landscape';
    page = landscape ? PAGES.landscape : PAGES.portrait;
    if (!doc) return;
    var style = doc.getElementById('pv-page');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'pv-page';
      style.media = 'print';
      doc.head.appendChild(style);
    }
    style.textContent = '@page { size: letter ' + (landscape ? 'landscape' : 'portrait') + '; margin: 0; }';
  }

  function render(container, state) {
    setPage(state.settings.orientation);
    container.innerHTML = TS.store.printViews().map(renderPeriod).join('');
  }

  TS.printview = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
