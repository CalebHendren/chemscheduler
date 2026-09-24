# Chemistry Tutoring Schedule — Chattanooga State

A weekly tutoring schedule builder for Chemistry tutoring in OMN 164 at Chattanooga State
Community College. It ships set up for the three Chemistry classes — General Chemistry I
(`1110`), General Chemistry II (`1120`) and Organic Chemistry (`ORGO`) — and you can
[add your own](#the-classes-you-tutor).

Enter your tutors, check the classes each one can tutor, paint their availability, and press
**Auto-optimize**, or place every shift by hand. You get a Monday–Thursday calendar in portrait
you can print, hand out and post — with a QR code students can scan to book a tutoring
appointment. The term runs as [two 7-week halves](#the-two-7-week-halves), each with a week of
its own, and a faculty member holding office hours in their own office is
[drawn on the calendar with their room on it](#office-hours-in-another-room).

The handout is a real table with row and column headers, every block names its tutor, hours and
classes in text, and the colors are chosen for colorblind readers — so the PDF is tagged,
navigable with a screen reader, and readable in grayscale.

**Live version:** https://calebhendren.github.io/chemscheduler/
**Offline version:** download `chemscheduler-local.html` from the
[latest release](https://github.com/CalebHendren/chemscheduler/releases) — one file, no install.

---

## Getting started

1. Open the site (or the single-file version) in any modern browser.
2. Click **Load sample roster**, at the bottom of **Schedule settings**, to see how it works —
   or **Add tutor** to start your own, or **Import JSON** for a schedule someone exported. The
   sample is made-up people: nine student tutors, each approved for 20 hours, and one faculty
   member with office hours in her own office.
3. For each tutor: first and last name, their email, the class checkboxes, their approved
   weekly hours (20 by default), and their availability. The email is never printed; **Email
   all** in the Tutors panel opens one message to every tutor, blind copied. In the availability grid each time sits on the line
   where it starts, so painting from the 9:00 line to the 1:00 line is 9:00 to 1:00; the line
   under the grid names the exact half hour under the pointer, and the whole stretch while you
   drag. A faculty member with office hours elsewhere also gets their room.
4. Fill the week in whichever way suits you — see [Three ways to place a
   shift](#three-ways-to-place-a-shift).
5. Adjust by hand — drag a block to move it, drag its edge to resize, lock the ones
   that are settled.
6. Switch to the **2nd 7 weeks** above the calendar and change whatever is different there.
7. **Print / Save as PDF** for the handout.

There is no account and no server. Everything stays in your browser.

## Three ways to place a shift

Auto-optimize is one option, not the only one. Nothing here needs it.

- **By hand.** Press **Add shifts** on a tutor in the roster. Their available hours are tinted
  across the week; drag down a tinted column to place a shift, and keep drawing until you are
  done. Esc stops. **Add shift** above the grid does the same thing from a dialog, which is
  also the way to do it without a mouse. Every rule below still applies: a placement that
  breaks one is refused and tells you why.
- **One tutor at a time.** **Auto-fit** on a roster row places that tutor's hours around the
  schedule as it already stands. Everyone else's shifts are left exactly where they are, which
  is what you want for a mid-semester hire, or for anyone whose availability just changed. It
  redraws that tutor's own unlocked shifts, so pressing it twice is safe; lock any of their
  shifts first to keep them.
- **The whole week at once.** **Auto-optimize** rebuilds the entire schedule from scratch.
  Locked shifts survive it; everything else is fair game, so it is the wrong button to press
  once people have been told what they are working.

Two shifts for the same tutor that touch are one shift. Give Anna 9:00–11:00 and then
11:00–2:00 and you get a single 9:00–2:00 block, whether you drew the second one, typed it, or
dragged it up against the first. A locked shift is never absorbed. What the merge cannot do is get around the break rule: a shift that would join
two others into six unbroken hours is refused before it is placed, and told to leave 30
minutes somewhere.

## Editing a shift

Drag a block to move it and drag its edge to resize it. To hand a shift to another tutor, which a
drag cannot express, hover the block and press **✎**.

## Removing a shift

Hover a shift and click the **×** in its corner, or focus it and press **Delete**. Either way it
comes back with **Ctrl+Z**. A locked shift has no **×** and refuses **Delete** — unlock it first.
**Clear schedule** removes every unlocked shift at once.

## Undoing

**Ctrl+Z** (**Cmd+Z** on a Mac) undoes the last change, and **Ctrl+Shift+Z** or **Ctrl+Y**
redoes it. The **Undo** button in the toolbar does the same thing and greys out when there is
nothing left to undo. Everything is undoable — a dragged shift, a deleted tutor, an
auto-optimize, a CSV import, even **Start over** — up to sixty steps back. Inside a text box the
shortcut is left alone, so it still undoes your typing.

History lives in the tab and is not saved, so it starts empty each visit.

## Locking

A locked shift is never moved, resized or removed by **Auto-optimize**, **Auto-fit** or
**Clear schedule**. Lock the parts of the week that are settled and the buttons stay safe to
press.

- **One shift** — hover it and click the padlock in its corner, double-click it, or press `L`
  while it is focused. Locked shifts wear a dashed border, keep their padlock showing, and lose
  their remove button.
- **One tutor** — **Lock all** on their roster row, for the person whose hours are agreed
  while the rest of the week is still moving.
- **Everything** — **Lock all shifts** in the toolbar, once the week is finished.

Each button turns into its own undo (**Unlock all**) when everything under it is locked.

## The two 7-week halves

The term runs as two 7-week halves, and a half can have a week of its own — a tutor whose
classes change at the midpoint, say. The switch above the calendar picks which one you are
working on: **1st 7 weeks** or **2nd 7 weeks**.

- **The 2nd starts as a copy of the 1st.** The first time you open it, it copies every shift
  from the 1st; change what is different and leave the rest. The two are independent from then
  on — editing one never touches the other.
- **Copy the 1st 7 weeks** (beside the switch, on the 2nd) starts the 2nd over from the 1st, if
  it has drifted. It asks first, and **Ctrl+Z** undoes it.
- **Each half has its own start and end dates**, both halves' under **Schedule settings →
  7-week dates**. The handout prints them — *Aug 24 – Oct 9, 2026* — and the start date names
  the saved PDF.
- **The schedule opens on the half in effect.** Once the day after the 1st's end date has come,
  opening the schedule shows the 2nd 7 weeks, and says so; before it, the 1st. With no end date
  set, it opens on whichever half was left on screen.
- **Everything else is shared** — the roster, the classes, the rules, the notes.
- **Everything you do is to the half on screen.** Auto-optimize, Clear schedule, Lock all, the
  stats and **Uncovered time** all work on it alone. Removing a tutor, or narrowing their
  availability, is true of the whole term, so it clears their shifts from both.
- **The handout carries both halves** until the 1st is over — see
  [Printing and PDFs](#printing-and-pdfs) — and each half's pages say which it is under the
  semester, *Fall 2026 · 2nd 7 weeks*, so the posted sheets cannot be mixed up.

One **Export JSON** file carries both halves, their dates, and which one was open. A file from
before the halves, or from the Life Science scheduler, loads as the 1st 7 weeks, and the first
date in its old free-text effective dates becomes the 1st's start.

## Office hours in another room

Tutoring is in OMN 164, or whatever **Tutoring room** says under **Schedule settings**. A faculty
member who holds office hours in their own office gets their room under **Edit** on their roster
row — *Room, if not OMN 164* — for example `Office 135-A`.

- **Their hours are drawn on the calendar** like anyone's, with the room written on the block,
  and the room follows their name in the legend, the listing and the by-class page.
- **They are coverage.** A student can go and get help there, so their hours count toward the
  classes they cover and fill **Uncovered time** like any tutor's.
- **They are not a seat in the tutoring room.** The limit on tutors at once is the room's, so
  office hours never count toward it, and never flag a room as over.
- **The minimum shift length does not apply.** Office hours are the faculty member's to set; a
  30-minute slot is fine.

Leave the room blank for everyone else.

## The classes you tutor

Under **Schedule settings → Classes**. Each class has a full name, which the handout spells
out, and a short code, which is what fits on a block — the course number, for the three it
ships with. Press **Add class** for another — Organic Chemistry II, say — then type over the
placeholder name and code.

Renaming a class keeps every tutor already marked for it. Removing one asks first, and says how
many tutors it un-marks; **Ctrl+Z** brings both the class and those marks back. A schedule keeps
at least one class, and holds at most sixteen.

The class columns in the CSV follow your list, so a roster exported after adding a class coded
`2020` has a `2020` column. Imports match a column by either its code or its full name, so a file exported
before a rename still lines up.

## How the schedule is built

The week is divided into 30-minute slots, Monday to Thursday, 7:00 AM to 8:30 PM — 108 slots.
The optimizer builds a first schedule greedily, then spends a couple of seconds improving it
with simulated annealing. It runs in slices so the page never freezes, and **Cancel** works.

### Rules it will never break

Approved hours and offered hours are different things. **Approved hours per week** is what the
department allows — 20 by default, and the same 20 for everyone in the sample. Availability is what that tutor
handed in: which of those hours they actually want to work. A tutor is never scheduled beyond
either one, and the hours they offered are hours the optimizer tries to use.

| Rule | Default | Where to change it |
|---|---|---|
| Inside the tutor's availability | always | — |
| Never in two places at once | always | — |
| At most N tutors in the tutoring room at once (office hours aside) | 3 | Schedule settings |
| At most N in the evening, for anyone arriving then | 2 from 5:00 PM | Schedule settings |
| Weekly hours per tutor | 20 | on each tutor |
| Minimum shift length (office hours aside) | 1 hour | Schedule settings |
| A 30-minute break before 6 hours straight | on | Schedule settings |
| Total scheduled hours, everyone combined | off | Schedule settings |

The break rule means a continuous run tops out at 5.5 hours, so a six-hour day comes out as
something like 4 hours, a 30-minute break, then 2 hours.

The evening cap is about who *arrives* in the evening, not who is still there. A tutor already
on shift when the evening starts may bleed through it and finish their shift, even if that
leaves three in the room at 5:30. Nobody new comes in until the room has drained below the
evening number, and it never refills past it. Both the number and the time it starts are under
**Schedule settings**; pick **No evening cap** to hold the day cap all day.

There is no daily hour limit. The break rule and the weekly cap already bound a day, and the
optimizer's preference for continuous shifts keeps a tutor's day in one piece.

### What it optimizes for

Coverage first, by a wide margin — an hour with somebody on duty always beats an hour with
nobody. After that it prefers pairing tutors who cover *different* classes, so a student
walking in has the best chance of finding their subject. Redundant pairs are mildly
discouraged but still chosen whenever the alternative is an empty hour: if the only two people
free on Monday afternoon both tutor 1110, both get scheduled.

It keeps each tutor's day in one piece. A tutor should only have to leave and come back
for a class of their own (a hole in the availability they handed in) or for the break the
six-hour rule asks for. Any other gap between two of their shifts costs the schedule heavily,
so a 10–12 and a 2–4 becomes one 10–2 or 12–4 wherever that still covers the week.

It also prefers fewer, longer blocks over scattered short ones, and spreads hours across the
roster rather than pooling them on whoever happens to fit best. That last one is the
**Distribute hours evenly** setting.

### The weekly hour budget

Off by default, so the only limits are each tutor's own cap and their availability. Turn on
**Limit total scheduled hours** when the department caps total paid hours regardless of what
each tutor is individually approved for. It changes the problem: covering 9:00 to 5:00 Monday
to Thursday once takes 32 hours, so a 40-hour budget leaves only 8 hours for second-tutor
coverage, and the optimizer has to spend them where they add the most class breadth.

### When a slot cannot be filled

The **Uncovered time** panel names the reason, because they call for different fixes:

- **No tutor is available** — you need availability you do not have.
- **Every available tutor is at their weekly cap** — someone's hours need raising.
- **The weekly hour budget is spent** — that is a money question.
- **Break and shift-length rules block a placement** — usually an awkward 30-minute hole.

## Names on the schedule

Blocks show first names only. When two tutors share one, the schedule adds just enough of the
last name to tell them apart:

| Roster | Shows as |
|---|---|
| Anna Harden, Anna Henry | **Anna** and **Anna H** |
| Anna Hall, Anna Harden, Anna Henry | **Anna**, **Anna H**, **Anna He** |

The roster and the edit form always show full names; only the printed schedule abbreviates.
Screen readers get the full name either way.

## Your data

On the website, your work saves automatically in whichever browser you use and is still there
next time you open the page. It never leaves your computer.

The offline single-file version saves the same way in Chrome, Edge and Firefox. A few
situations block saving entirely — private windows, Safari opening a local file, or site data
turned off — and in those the page says so at the top and asks you to export before closing.
Note that all local files share one storage area per browser, so two copies of
`chemscheduler-local.html` on the same computer share a schedule. The Chemistry and Life Science
schedulers keep separate stores, so the two never overwrite each other.

Because storage is per-browser, use **Export** to move between machines or keep a backup:

- **Export / Import JSON** — the whole thing: tutors, settings and both 7-week schedules.
- **Export / Import CSV** — just the tutor roster, for editing in Excel or Google Sheets.

### The CSV format

`First, Last, Email, Room, 1110, 1120, ORGO, MaxHoursPerWeek, MinHoursPerWeek, Availability, Notes`

`Email` and `Room` are optional, and a file without the columns still imports. `Room` is only
for a faculty member with office hours elsewhere. A blank `MaxHoursPerWeek` takes the schedule's
default. A `MaxHoursPerDay` column from an older
export is ignored.

One column per class, in the order they appear under **Schedule settings → Classes**, headed by
the short code — add a class coded `2020` and a `2020` column appears. An import accepts either the code or
the full class name as the header, so older files still read. Class columns take `Yes`/`No`.

Availability is written the way you would say it, with days sharing the same hours grouped
together:

```
Mon/Wed 12:00-17:00
Mon-Thu 08:00-13:00
Tue/Thu 13:00-17:30; Wed 09:00-12:00
```

Importing is forgiving — `Tues/Thurs 1-4pm` and `Monday 9:00 AM to 2:00 PM` both read
correctly, and a bare `1-4pm` is understood as the afternoon rather than 1:00 AM. There is no
Friday tutoring: `M-F 3pm-8pm` keeps Monday to Thursday and warns that Friday was skipped. Anything
it cannot read is reported per row instead of being silently dropped, and times outside
7:00 AM–8:30 PM are trimmed with a warning. Click **Template** for a starter file.

## Printing and PDFs

Two buttons, for two different needs:

- **Print / Save as PDF** — the one to use for anything you hand out or post. It prints from a
  real HTML table with proper row and column headers, so the PDF Chrome and Edge produce has
  selectable text, keeps its table structure, and carries a document language. Each 7 weeks is
  two pages: the calendar, the notes, the QR code and the legend, then **Coverage by class** —
  printed double sided, one sheet with a calendar on each face.
- **Download PDF** — one click, no print dialog, drawn directly with jsPDF. Same pages,
  same portrait layout and real text (nothing is a screenshot), but jsPDF does not emit a
  tagged structure tree, so it is the convenience option rather than the accessible one.

The **Print** choice beside the buttons says which 7 weeks go in the document:

- **Both 7 weeks** — the default while the 1st 7 weeks is under way: one document, the 1st's two
  pages then the 2nd's, four pages in all. A 2nd 7 weeks never opened prints as the copy of
  the 1st it would open as.
- **2nd 7 weeks only** — the default once the 1st has ended (the day after its end date under
  **7-week dates**), since a sheet for weeks already gone is not one to post.
- **1st 7 weeks only** — the 1st alone.

A choice lasts until the page is closed, so the next visit starts from the dates again. Either
way the file is named for the schedule and the day the first half in it starts — *Chemistry
Tutoring Schedule 8-24-2026* — or today, with no start date set. Print / Save as PDF gets the
name by putting it in the page title while printing, which is what Chrome and Edge offer as the
file name.

Tick **Include text listing** beside the two buttons to add a plain-text listing of every
shift, in two columns, after each calendar. That makes four pages a half — calendar, listing,
coverage by class, listing — so a double-sided print gives a sheet with a calendar on one face and
the listing on the other, whichever sheet someone picks up. It is off by default.

### Coverage by class

The by-class page is the same week read the other way round. The schedule is written tutor by
tutor, but the question a student turns up with is *when can I get help with 1120?* — so it gives
each class a lane of its own and shows the stretches it is covered for, with the tutors who are
in written inside.

A block runs for as long as its class is covered, with the class code in bold at the top. Where
the tutors change partway through, a faint line marks the change, and each stretch shows who is
in, names in alphabetical order, with its time underneath — *Chance, Olivia* over
*9:00 AM–12:00 PM*, then *Olivia* over *12:00–2:00 PM*. A stretch too short to name everyone
in it merges into the next one (the last one into the one before), listing everyone from both
across their joined hours — close enough, and never a name cut in half. Otherwise the time
always stays and the names give way. A gap with nobody in for the class ends the block; the next one starts
with the class code again.

It is otherwise page 1 exactly: the same header, the same notes, the same QR block. Only the grid changes, and the legend that decodes it.

A tutor signed up for three classes covers all three the moment they sit down, so one 9–12
shift by that tutor is three blocks at 9–12, one per lane. That is the point of the page, not
double counting: the legend's weekly hours are hours of cover per class, and they can add up to
more than tutoring is open.

General Chemistry I is blue, II green and Organic orange, each in a lane of its own. Office
hours count, since a student can get help there: the faculty member's name comes with their
room, *Dr. Lane (Office 210-B)*.

Both are portrait US Letter, with the grid's rows sized to fill the page. Printing always uses the light theme even if you are working in
dark mode. The print stylesheet sets a zero `@page` margin and insets the handout itself, which
is what keeps Chrome and Edge from stamping the document title across the top of the page and
the page URL across the bottom — there is no CSS switch for those, only the margin they are
drawn into. Both carry the semester, the location and contact, the QR code, a tutor legend and
the important notes, plus the plain-text listing when it is turned on.

### What goes on the handout

**Semester**, **Contact name**, **Contact email** and **Important notes** are all under
**Schedule settings**. The contact fields start empty — fill them in once and they print on
every handout, and appear in the app header.

The notes print in a box under the grid — closure dates, the last day of tutoring, anything
else people need to read off the wall. The default text is the fall 2026 closure schedule; edit
it for your term.

The **Appointment QR code** settings hold the link the code opens — the Slate appointment form
by default, used exactly as typed — and the heading and caption printed beside it. The link
itself is not printed: it is long and carries an id nobody would type, so the code is what gets
used. On screen the code and the **Open the booking page** button both open it.

**Tutoring room** names the room the calendar is about. A faculty member's office hours carry
their own room on every block, so the handout tells a student which door to knock on.

### The hours a schedule shows

A schedule is drawn over the hours that are actually in play, never narrower than 9:00 AM to
5:00 PM:

- **While editing**, the grid covers 9-to-5 plus every hour any tutor is available, so there is
  always somewhere to place a shift someone has offered to work.
- **On the handout**, it covers 9-to-5 plus every hour actually scheduled. Nobody working before
  9:00 means the PDF starts at 9:00, and the grid grows to fill the page rather than wasting a
  third of it on empty early mornings.

The underlying week still runs 7:00 AM to 8:30 PM — that is the range availability can be
painted over, and the range a tutor can be scheduled in. Only the drawing narrows. Coverage and
**Uncovered time** are reported over the same open hours, so an empty 7:00 AM nobody can work
is not counted against you.

### Accessibility notes

- Tutor colors are chosen with red-green colorblindness counted in, and every block prints the
  name, times and subjects as text — the schedule is fully readable in grayscale, and nothing
  depends on color alone.
- Fifteen colors, so a normal roster never repeats one. Past fifteen tutors a color has to come
  round again, and the repeat carries a diagonal hatch so the pair stays distinct.
- The whole app is keyboard operable. In the availability painter, move with the arrow keys and
  toggle with Space; the time of the focused half hour is read out as you move. On a scheduled block, arrow keys move it, Shift+arrows resize it, `L`
  locks it and Delete removes it; Tab from the block reaches its padlock. Placing a shift
  without a mouse is what **Add shift** above the grid is for.
- Text contrast is checked automatically in CI, in both light and dark themes, for every color
  in the palette and for the hatched repeats past the end of it.

## Colors

The interface uses Chattanooga State's palette: navy `#10305F`, royal blue `#0B57BE`, the
darker `#002855` (Pantone 295) where maximum legibility matters, and orange `#FE5000` as an
accent only — it is too light for body text on white, so text that needs to be orange uses
`#C63F00` instead.

All four are defined once at the top of `assets/css/app.css`. If Marketing supplies different
values, change them there and nothing else.

Tutor block colors are deliberately *not* brand colors. A set of hues that is both on-brand and
distinguishable to a red-green colorblind reader does not exist — a navy/royal/sky family
collapses into near-identical grays. The chrome is brand; the data is legible.

The palette is fifteen fixed colors. The first eight are Okabe-Ito's colorblind-safe set, which
is what the schedule always used. Seven more were added because eight was a ceiling: a ninth
tutor was handed the first color back, which is how two blues ended up side by side.

The seven were chosen against the same measure the assignment uses — CIE L\*a\*b\* distance
between the drawn blocks, taken as the worst of normal, protan and deutan vision, so a red and
a green count as close because to some readers they are the same color. The bar was the
original eight: the three closest pairs in the list are still Okabe-Ito's own, so nothing added
here made the palette harder to read.

### Which tutor gets which

Not roster order. Colors are assigned when the schedule is built, from where people actually
land in the week: two tutors whose blocks touch — including a Monday block beside a Tuesday one
at the same hour, which reads as adjacent on the printed page — are pushed to opposite ends of
the palette, and the closest pair of colors is spent on two tutors nobody sees together. The
cost is convex, so the solver will take several mildly similar pairs to avoid one pair that
reads alike.

Auto-optimize re-picks every color. Fitting a single tutor re-picks only theirs, so the rest of
the schedule stays where it was.

Classes are named colors rather than palette slots — General Chemistry I blue, II green,
Organic orange — so a class keeps its color whatever else is added. All three are Okabe-Ito
hues, chosen to stay apart for a colorblind reader too, and the suite checks that they do. A
class a coordinator adds falls back to the far end of the same fifteen.

## Development

No build step and no dependencies. Clone the repo and open `index.html` — that is the whole
setup. Files load as classic scripts specifically so the app works straight from `file://`.

```
index.html              app shell
assets/css/             app.css (screen, both themes) and print.css
assets/js/              util, store, csv, optimizer, theme, qr, tutors,
                        calendar, printview, pdf, app
assets/js/vendor/       qrcode-generator and jsPDF, both MIT
tools/tests.js          the test suite, engine-agnostic
tools/test-optimizer.mjs  CI entry point (Node)
tools/selftest.html     the same suite in a browser
tools/bundle.mjs        builds the single-file version
```

Run the tests:

```bash
node tools/test-optimizer.mjs     # needs Node 20+
```

Or open `tools/selftest.html` in a browser, which needs nothing installed. Both run the same
assertions against the same source files: the display-name rules, contrast in both themes for
every color of every palette size, that a generated palette keeps its closest pair apart for a
colorblind reader too and that the assignment does not waste that pair on two tutors sitting
side by side, CSV round-tripping and parsing (Friday hours skipped with a warning), the class
list and the bitmask it drives, office hours in another room counting as cover but not against
the room's limit or the minimum shift, the two 7-week halves (their dates, which half opens and prints after the 1st ends, copying, switching, undo across a
switch, both halves in a file, a tutor removed from both), touching shifts joining into one,
class coverage turning a tutor's shift into one run per class and a segment inside it wherever
the tutors change, one column per tutor per day, the day and evening caps (including tutors
bleeding through into the evening), nobody being sent away and asked back without a class or a
break in between, the sample roster with the budget both on and off, locked
shifts surviving re-optimization, back-to-back shifts coming out as one block, fitting a single
tutor without moving anyone else, and a randomized fuzz pass that asserts no generated schedule
ever breaks a hard rule.

Build the offline single file:

```bash
node tools/bundle.mjs             # writes dist/chemscheduler-local.html
```

### Versioning and releases

The version lives in one place — `VERSION` at the top of `assets/js/util.js` — and the app
shows it at the bottom of **Schedule settings**. Semantic versioning: a new feature is a minor
bump, a fix is a patch.

Bumping that line is what publishes a release. When the commit lands on `main`, CI reads it,
tags `v<version>`, and attaches the single-file build with generated release notes. A push that
does not bump it refreshes the build on the existing release instead, so nothing is duplicated
and nothing has to be remembered. Pushing a `v*` tag by hand still works and is checked against
that same line, so a tag can never disagree with the app inside it.

### Continuous integration

- `pages.yml` runs the suite, then deploys the site to GitHub Pages on every push to `main`
  (**Settings → Pages → Source → GitHub Actions**).
- `release.yml` runs the suite, builds the single-file version on every push and pull request,
  uploads it as a workflow artifact, and publishes the release described above.

## License

MIT. Bundled libraries — [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
and [jsPDF](https://github.com/parallax/jsPDF) — are MIT as well.
