# GLL WordPress Plugin — Implementation Plan

A WordPress Gutenberg plugin that displays GLL (Generic Loudspeaker Library)
file data, built on the `gll-tools` Go/WASM parser with the web demo at
<https://meko-christian.github.io/gll-tools/> as the visual reference.

**Status: Phases 1–12 complete.** What is left is collected in
[Phase 13 — Remaining work](#phase-13--remaining-work) at the end of this
document: screen-reader testing, tagging the release, two remaining tracked
defects, and the features deliberately never built.

---

## Architecture

**Parsing is client-side WASM.** No Go on the server, no server-side attack
surface, works on any host — at the cost of a ~4 MB WASM download and a hard
dependency on a modern browser. The originally planned hybrid (cache parsed
metadata in post meta for the frontend) was not built; the frontend parses too.

**Files live in the media library** with `.gll` registered as
`application/x-gll` (`includes/class-gll-media.php`). A `gll_file` custom post
type is registered but the blocks reference attachments directly.

**Blocks share data through React Context** (`GLLProvider` / `useGLL` /
`useGLLLoader`). The WASM loader is a singleton; initialization is lazy and
every parse awaits it.

**`src/shared/gll-normalize.ts` is the single translation point** between raw
parser output (snake_case) and everything downstream (PascalCase). A block that
cannot find its data almost always needs a normalizer change first — that was
the shape of Phases 9 and 10 both. It also owns 1-based→0-based index
translation, rotation spelling, and the decision about what *not* to carry.

### Seven shipped blocks

| Block | Notes |
|---|---|
| `gll-info/gll-info` | File selector + overview + sources list |
| `gll-info/frequency-response` | Chart.js, dual axis, log X, phase modes |
| `gll-info/polar-plot` | Chart.js radar + custom compass plugin |
| `gll-info/balloon-3d` | Three.js, custom orbit, quality presets |
| `gll-info/geometry` | Three.js + OrbitControls, markers, source cones |
| `gll-info/resources` | Embedded PDFs, images, data files |
| `gll-info/config` | Box types, frames, filter groups, limits, warnings |

Plus 3 patterns (`includes/class-gll-patterns.php`) and 13 block variations
declared inline in `block.json` — core translates those out of the metadata
catalogue, keeping them off the editor bundle.

---

## Phases 1–7 (summary)

**1. Foundation.** Plugin scaffold, `gll_file` CPT, `.gll` MIME registration,
WASM loader singleton with no-WASM error path, `GLLContext` + `useGLLLoader`.

**2–3. Main block.** MediaUpload file selection, editor preview with parse
spinner and error handling, `save.js` data attributes + `view.js` hydration.
Overview (system info, metadata, header) is integrated into the main block
behind a `showOverview` toggle rather than being its own block. Not built: URL
input for external files; nested block structure.

**4. Frequency response.** `ChartWrapper` (ResizeObserver-based) and
`charting-utils` are shared from here. Dual Y-axis (level/phase), logarithmic X
with power-of-ten ticks, phase unwrapping and group-delay computation,
azimuth/elevation controls, metadata badges.

**5. Polar plot.** Chart.js `radar` at `startAngle: 90` (front on the right),
horizontal slice in blue / vertical in red, `computePolarSlices()` ported from
the demo, per-slice normalization, and a custom `polarCompassPlugin` that draws
Front/Back/Right/Left/Top/Bottom around the perimeter.

**6. 3D balloon.** Full-sphere mesh from `balloon_data` with symmetry mirroring,
HSL level→color mapping (hue 0=max red → 0.66=min blue, gray for missing),
per-vertex color buffer, custom pointer orbit/pan/zoom, auto-rotate, color-bar
legend. Radius mapping and the GLL Z-up → Three.js Y-up conversion:

```js
radius = 0.3 * scale + 0.9 * scale * (level - (displayMax - dbRange)) / dbRange
toViewPoint = { x: p.x, y: p.z, z: p.y }
```

Performance: IntersectionObserver lazy init, global max levels cached in a
WeakMap, geometry/material disposal before rebuild, animation paused off-screen,
three quality presets (stride-2 subsampling and pixelRatio cap at Low).

**7. Sources list.** Integrated into the main block. Collapsible cards with
label, bandwidth, data type, response count and angular resolution; per-source
response controls and embedded Chart.js charts; source placements resolved from
`box_types` (box/source keys, position in mm, HVR angles). Long lists reveal in
chunks via IntersectionObserver; collapsed cards unmount their controls; slider
input is rAF-batched.

---

## Phase 8 — Geometry viewer

Three.js scene with real OrbitControls (damping 0.08, distance 0.25–25) and a
manual pointer-orbit fallback. Faces as `BufferGeometry` with per-vertex colors
and flat shading, edges as `LineSegments`, sphere markers for reference point
(red), center of mass (green) and next pivot (amber), acoustic sources as
oriented cones with `CanvasTexture` labels.

**Cone apertures come from the file**, not a fixed silhouette: source
`RatedHorizontalAngle`/`RatedVerticalAngle` first, then box
`HorizontalOpeningAngle`/`VerticalOpeningAngle`, then the demo's ~46° fallback.
H and V apply as non-uniform scale, so an asymmetric source reads as an
elliptical cone. A deliberate divergence — the reference draws fixed cones
unrelated to real coverage, with no labels.

Placement angles are radians and GLL's forward axis is +Y (gll-tools
`docs/format.md:175`). `sourcePlacementOrientation()` returns the full
view-space basis rather than a minimal-arc rotation, because roll about the aim
axis is otherwise undefined — harmless for a circular cone, wrong for an
elliptical one. Its matrix and local-to-world column convention match
`buildRotationMatrix`/`rotateVector` in gll-tools `cmd/gllpy/main.go:556` entry
for entry, so cones aim where the acoustic engine radiates. Verified against all
54 case geometries in the corpus.

Traps found here:

- **Edge indices were 1-based.** `buildCaseGeometryData` indexes the vertex list
  directly, so every wireframe edge joined the wrong pair and mirrored
  (negative) references were dropped outright.
- **`disposeSceneObject` matched on `instanceof Mesh`/`LineSegments`**, silently
  skipping `Points` and `Line` and leaking a sprite material + canvas texture on
  every editor attribute change. It now drains an explicit owned-resource list,
  duck-types geometry and material, handles material arrays, and never disposes
  a sprite's geometry (three.js shares it process-wide).
- **Bounds are labelled W × H × D, not X × Y × Z** — `computeBounds` runs on
  view-space vertices, which have already swapped y and z.
- **`showFaces` has nothing to draw.** No geometry in the corpus carries a face
  list; the visible geometry is the edge wireframe. The face path exists because
  the format permits faces.

Theming: the `--geom-*` variables originally specified were superseded by the
plugin-wide `--gll-*` token layer (`c410415`, see
`docs/plans/2026-08-08-block-theming-design.md`). Colors resolve at runtime via
`resolveTheme()`, so there is no dark-mode branch. Marker colors and the axes
helper stay hardcoded — that doc classifies them as data, not chrome.

`src/geometry/scene-builder.ts` (object-graph construction and disposal) and
`src/geometry/helper-theme.ts` (theming Three.js chrome) are the shared patterns
the balloon block follows.

---

## Phase 9 — Resources

Embedded PDFs with download links, inline image previews, data files with
metadata, sizes, and `data:` URI downloads.

The plan's original reference pointer was wrong: `web/modules/exporters.js`
builds geometry export formats and is unrelated. The real reference is
`web/app.js:5390-5561` (`displayResources`), `formatBytes` at `app.js:7659`,
`cleanFilename` at `app.js:5557`.

**Most of the work was in the normalizer.** It dropped
`database.include_files` and `database.data_files` while passing through
`raw.resources` — the parser's heuristic byte scan — as the only
resource-shaped key, exactly inverted. Measured across the corpus that
heuristic contributes nothing: its PNG entries duplicate `data_files` byte for
byte including the base64 payload, and all 104 zlib entries lie inside embedded
PDFs, being those PDFs' own object and font streams. It is no longer carried, so
a parse no longer retains a second copy of every embedded image.
`database.author_files` never reaches the browser at all — WASM withholds it
deliberately, as those are encrypted licence blobs whose names leak the author's
absolute paths.

Two format concerns moved into the normalizer: file names carry Windows
authoring paths (`.\Drawings\...`, one two-level case in HOPS7-Pro), so each
record gains a folded `Name` beside the raw `Filename`; and tables are emitted at
on-disk length with unused slots blank (a third of the corpus; `3Way-LR.gll` for
both its slots) — padding, not data, filtered like unrenderable edges and faces.

Corpus shape drove the UX: 3 of 29 files carry documentation, 24 carry data
files, 5 carry neither. Since documentation is absent from 26 of 29, the
frontend drops an empty section entirely rather than rendering the demo's "No
documentation files found" — that placeholder would be the common case and would
teach readers to skip the block. The editor still renders it, because an author
toggling a control needs to see why the preview did not change.

**Data-file handling is generic, not XED-specific.** There is no XED file
anywhere in the corpus; every non-empty data file is a PNG logo between 337 B
and 14.7 KB. Classification is extension-driven, so an XED renders correctly as
a plain file if one ever appears.

**No download size cap.** Both entry points already fetch and parse the whole
GLL client-side, so the bytes are paid for either way and a `data:` URI costs
nothing extra — no REST endpoint, no Blob, no object URL to revoke. The one hard
rule: a data URI must never reach `save()` output. The largest embedded
datasheet is 2.17 MB (~2.9 MB base64) and does not belong in post content.

Rendering was split out of `view.ts` into `resource-render.ts` so it can run
under jsdom without the WASM loader — the first block whose frontend output is
tested at all.

---

## Phase 10 — Configuration

Box types, frames, filter groups, limits and warnings in collapsible cards.

Again mostly a normalizer job: it carried box types and case geometries but
dropped `database.frames`, `database.limits`, `database.warnings` and
`database.filter_groups` outright, even though all four already reach the
browser from WASM. Nothing consumed them, so nothing had noticed. Opening angles
were reachable only off `CaseGeometries`, never off the owning box type.

**Frame geometry drove the one real design decision.** Frame meshes are
*appended* to the flat `Database.CaseGeometries` list after the box meshes, each
frame keeping a `CaseGeometryIndex` back-pointer, rather than nesting a copy.
Appending is what makes it safe: `geometry/view.ts` and `geometry/edit.tsx`
index that list positionally against a saved `geometryIndex`, so box meshes
holding their positions is the difference between a no-op and every existing post
silently switching geometry. A corpus test pins the invariant. The payoff: the
geometry block can show a frame at all, for the price of one label fallback.

**"Show geometry if available" is a summary line, not a viewer.** The demo
embeds an inline WebGL canvas per box. Box lists reach 26 entries and browsers
cap live WebGL contexts near 8–16 — the demo only works because it opens one
viewer at a time behind a button. `src/geometry/` is the dedicated 3D block and
now reaches frames, so this block renders
`600 vertices • 300 edges • 0 faces • Symmetric @ X=0.000` and stops. Its
frontend bundle is 18 KB; the geometry block's is 538 KB.

Collapse state has two legitimate owners and got both: the author picks which
cards start open (block attribute in post content), a visitor's own toggling
overrides it from `localStorage` keyed by card name alone, so "I never care
about filter groups" follows the reader rather than the file. Native `<details>`
carries it instead of the demo's `div` + `onclick` + `▶` glyph — `<summary>` is
focusable, takes Enter *and* Space, exposes state to assistive tech, and lets
in-page find expand it. It also fails safe: if the view script dies after render
the cards still open.

Two demo bugs fixed rather than ported: limit and warning values print with no
unit though the type enum implies one (now kg for weight, degrees for tilt); and
the limit and warning type enums *number differently* — type 1 is Max Count Type
for a limit but Min Count for a warning — so they need two separate label
tables. Go's `String()` never crosses the JSON boundary, so only the bare integer
arrives. A test named after the divergence guards against a future reader
merging them.

**FIR coefficients are reduced to a count in the normalizer.** `data_irm` and
`data_dip` are 8193 float64 each per filter and the only thing any UI shows is
their length; carrying them would put ~131 KB per filter into a page-lifetime
structure. Log spectrum level and phase go the same way. Same reasoning as
`raw.resources`, and likewise enforced by a test rather than a comment. Box
`input_config` stays dropped — populated in none of the 29 corpus files.

Corpus coverage: box types in 26 of 29 files, filter groups in 10, frames in 5,
limits in 5, warnings in 2. Empty being the normal case, the frontend drops an
empty section outright while the editor keeps it and says why, so an author
flipping a toggle can tell "off" from "absent".

Worth recording: those figures were first *estimated* at 8 files with filter
groups; the E2E test measured 10; the `gllinfo` CLI reports 9, missing
`N-APS v1_0.gll`, which the WASM build parses as having 2 groups. The plugin uses
WASM, so 10 is the number that matters here — but the two parsers in `gll-tools`
genuinely disagree about that file and that is worth chasing there.

Deliberately out of scope: cluster setups, connectors and transformers (a
different demo function into a different tab, not listed in Phase 10's tasks,
still available in raw data), and the per-filter-group frequency response chart,
which would need FIR/IIR response computation ported and would force the huge
coefficient arrays back into the browser. That belongs in its own phase.

---

## Phase 11 — Integration & polish

**Patterns.** Six of the seven blocks serialize as self-closing comments with no
file attributes, so a pattern stays file-agnostic. Geometry is the exception —
its `save()` returns markup rather than null, and a bare comment would fail block
validation on insert. That markup lives verbatim in the PHP, a duplication
waiting to rot, so `src/geometry/pattern-content.test.tsx` re-serializes the real
block and asserts the PHP still contains exactly that string. (See Phase 12 for
where that guard was itself insufficient.)

**Internationalization was never a string problem.** Roughly 300 strings were
already wrapped and not one could be translated, because none of the loading
infrastructure existed: no `load_plugin_textdomain`, no
`wp_set_script_translations`, no `Domain Path`, no `languages/`. Two traps, both
producing code that lints clean, passes tests, and silently ships English:

1. **A translated string in a module-level constant** is evaluated at import
   time, before WordPress registers the catalogue. The normalizer's four enum
   label tables were exactly that shape and are now call-time lookups
   (`getLimitTypeLabel()` and siblings). `IIR_SHAPE_LABELS` and `SIZE_UNITS` stay
   constants *because* they are not translated, and now say so.
2. **`load_plugin_textdomain` on `plugins_loaded`** is conventional and wrong on
   WP 6.7+, which fires `_doing_it_wrong` for any domain loaded before `init`.
   The declared minimum is 6.7, so it sits on `init` priority 0 — ahead of the
   post-type and pattern registrations, both of which translate at registration.

Translated text also has to survive the DOM: several badge rows were built by
string concatenation into `innerHTML`, defensible while every interpolated value
is a number, an injection the moment a translator supplies one containing `&` or
`<`. Those build nodes now, or route through `escapeHtml`. English output is
byte-identical.

**Accessibility is applied at runtime, never in `save()`.** `save()` output is
serialized into post content, so adding an attribute there invalidates every
existing post unless a matching `deprecated` entry is added for all seven — and a
demo page carrying the current markup is already published. It is also the more
honest design: the things needing announcement are runtime DOM mutations, and a
live region baked into `save()` would sit inert until `view.ts` touched it.

The single non-obvious a11y rule, which cost real time: **a live region must
exist in the document before its text changes**, or assistive tech treats the
text as initial content and stays silent. Creating and filling it in the same
tick is the classic way to ship a live region that never announces anything. In
`geometry/view.ts` that collides with
`@wordpress/no-unused-vars-before-return`, whose suggested fix — move the binding
down to first use — would quietly destroy the feature. It carries a targeted
suppression and an explanation instead.

**Contrast.** `--gll-accent` was `#667eea`: white-on-accent 3.66:1 against a
4.5:1 AA threshold, and 2.97:1 as text on the 12%-tinted badge fill. It is now
`#4c51bf` — 6.49:1 and 5.01:1. The badge fill, not the white button, was the
binding constraint: the obvious landmark `#5a67d8` clears white at 4.81:1 but
only reaches 3.80:1 there. The focus indicator deliberately does *not* use the
accent; it draws from the text and surface tokens, which any working theme has
already made legible against each other, so a badly overridden accent costs
contrast on a badge rather than the ability to see where the keyboard is.

Found while wiring stylesheets, all three invisible until someone looked:
`.gll-visually-hidden` was referenced by the shared live-region helper and
defined nowhere, so the geometry block's off-screen region and the
frequency-response value table rendered as visible page content; `.gll-error` was
missing from two blocks just moved onto the shared error panel; and balloon-3d's
error panel carried an inline `#fff8f8` background, white-on-white under a dark
theme.

---

## Phase 12 — Testing & release

The environment caveat recorded in Phases 8–11 ("no local WordPress environment
and staging is outward-facing") is **retired**. `wp-env` supplies one, configured
in `.wp-env.json` and made usable by `scripts/wp-env-after-start.sh`.

### Suites

| Command | What it runs |
|---|---|
| `npm test` | 655 Jest tests — jsdom `unit` + node `integration` (drives real `gll.wasm`) |
| `npm run test:php` | 31 PHPUnit tests against real WordPress in wp-env |
| `npm run test:e2e` | 23 Playwright specs against a real browser |
| `npm run typecheck` | tsc — `wp-scripts` compiles through babel, which strips types without checking |
| `npm run perf` | Sweeps the 29-file corpus, writes `docs/performance.md` |

wp-env is required for PHP and E2E: `npm run env:start`. The plugin mounts at the
`gll-info` slug rather than the repo directory name, because `wasm-loader` falls
back to `/wp-content/plugins/gll-info/...` and a differently named directory
would exercise a path no real install takes. Two environment traps, handled but
worth knowing: `scripts/wp-env-after-start.sh` activates a theme, without which
core resolves every block stylesheet to a 404 and no block renders at all; and
the PHP suite reinstalls the tests site, so E2E re-activates what it needs in its
own `globalSetup`.

Corpus-backed integration tests skip unless `GLL_CORPUS` points at a directory
of `.gll` files. The default sweep is size-bounded; run
`npm run test:integration:full` before a release.

Unit tests went from 316 to 655. Six previously untested pure modules are now
covered — `charting-utils`, `polar-utils`, `balloon-utils`, `a11y`,
`escape-html` and the polar compass plugin — roughly 2100 lines of maths and
runtime accessibility on every block's critical path. Type checking, on for the
first time, surfaced 96 errors, three of them real defects: `scene-builder`'s
`setIndex`, geometry's dead `enableKeys`, and two assertions comparing `NaN` to
`NaN`.

Block registration is covered by a CI matrix over WordPress 6.7.2 and current
core, because `function_exists` cannot be un-defined and the 6.7 fallback is
otherwise unreachable — which also makes "Requires at least: 6.7" a tested claim.
The `has_block()` defect carried a *passing* characterization test describing
what actually happened, on the reasoning that a red test in a release branch only
teaches people to ignore CI. That test did its job and has been replaced: the
gate is fixed in 13.3.1 and the tests now assert the intended behaviour.

### E2E found a shipped bug

The geometry markup duplicated into `class-gll-patterns.php` was missing the
`wp-block-gll-info-geometry` class that `supports.className` makes `save()` emit,
so that block loaded as **invalid** in every pattern containing it. WordPress
recovers an invalid block rather than refusing it, so nothing looked wrong.
`pattern-content.test.tsx` exists to prevent exactly this and passed throughout,
because `serialize()` under jsdom omits the same class — it was comparing the PHP
against equally incomplete output. The E2E spec is now the authority and asserts
`isValid` per block.

The fallback specs are the only honest reading of "test fallback for older
browsers": an old browser cannot be obtained and a faked user-agent tests
nothing, so `addInitScript` removes the features the code actually branches on
before any page script runs.

**Cross-browser honesty.** Chromium is a good proxy for Chrome and defensible for
Edge. Playwright's WebKit is **not Safari** — different graphics stack, and
Safari applies its own WebAssembly memory limits, precisely where this plugin is
most exposed given the performance findings. Safari on real hardware and any
mobile browser remain unverified, and `readme.txt` says so rather than listing
them.

### Performance: the limit is memory, not speed

The 100 MB criterion could not be met and was amended rather than faked. No such
file exists; the largest GLL in the corpus is 15.4 MB and that appears near the
format's real-world ceiling. Padding one to 100 MB would produce something the
parser rejects, so the measurement would describe the error path.

A 15.4 MB GLL expands to **228.7 MB of JSON** and leaves the Go WASM instance
holding **1.3 GB of linear memory, which Go never returns to the host**. Files of
10 MB and up need 800 MB–1.3 GB and 6–11 s to parse; unpleasant on desktop and
likely to fail on mobile, where per-tab WASM memory is capped well below a
gigabyte. Files up to ~2 MB — 21 of the 29 — parse in under a second and are
comfortable everywhere.

Everything downstream of the parser is free by comparison: normalization runs in
single-digit ms even for the largest file, balloon mesh construction under 15 ms,
case geometry ~1 ms. Optimizing any of those would be optimizing noise, which is
why "optimize if needed" is answered by not doing it.

Not gated in CI, deliberately: the corpus is machine-local third-party data, and
runner variance on CPU-bound WASM would swamp any threshold tight enough to
catch a regression.

### Release packaging

**The shipped ZIP was unusable and nobody could have noticed.** `wp-scripts
plugin-zip` reads only the `files` field in `package.json`. It does **not** read
`.distignore` or `.gitattributes`, and with no `files` field it falls back to a
hardcoded glob that omits `assets/**` — so the archive contained no `gll.wasm`,
and every block parses client-side through that module. The plugin installed
cleanly and could not read a single file. The obvious fix is the wrong one:
adding a `.distignore` would look right, pass review, and ship the same broken
ZIP. Only the `files` array changes the packer's behaviour.

`scripts/verify-plugin-zip.sh` asserts against the archive rather than the
packer's log — WASM module present *and over 4 MB*, since present-but-truncated
is a real failure mode a listing cannot see, plus the icon, the includes, all
seven block manifests, and the absence of `node_modules`, `src`, `tests` and the
lockfile. `scripts/check-version.mjs` guards the five hand-written version
locations and runs on every push.

`.github/workflows/release.yml` is written and verified but **not triggered** —
no tag is created, as agreed. It rebuilds and diffs `build/`, regenerates and
diffs the catalogue, packages, and runs ZIP verification before publishing. The
`build/` diff deliberately does *not* run on ordinary pushes: webpack output is
not reproducible across Node minor versions, and a check that reddens on version
skew teaches people to ignore a red X.

Also fixed: the create-block placeholder `description` and `author`, which
contradicted the PHP header, and the missing `LICENSE` file for a licence
declared in three places and present in none.

### The `.pot` catalogue

Generated: 476 strings, 1043 `build/` references. The trap: **`make-pot` must
scan `build/`, not just `src/`.** Core resolves a script translation by hashing
the script path relative to the plugin, and `make-json` derives that hash from
the POT's references. A POT referencing `src/` produces JSON named after paths
that do not exist in the shipped plugin, core never finds them, and every string
stays English with nothing failing. Verified end to end with a throwaway `de_DE`
catalogue rather than reasoned about.

---

## Reference

**Web demo:** <https://meko-christian.github.io/gll-tools/> — the reference
implementation for all visualizations.

| Area | Source in `gll-tools` |
|---|---|
| Polar plot | `web/modules/visualization.js:1-842`, `charting.js` |
| 3D balloon | `web/modules/visualization.js:843-1226` (`buildBalloonGeometry` 990-1153) |
| Geometry viewer | `web/modules/geometry.js` (all 953 lines) |
| Resources | `web/app.js:5390-5561` (`displayResources`), `formatBytes` `:7659`, `cleanFilename` `:5557` — *not* `exporters.js` |
| Configuration | `web/app.js` (configuration cards section) |
| Sources list | `web/app.js:580-792` (`displaySources`) |
| Rotation convention | `cmd/gllpy/main.go:556` (`buildRotationMatrix`, `rotateVector`); `docs/format.md:175` |

### Dependencies

`@wordpress/scripts`, `@wordpress/blocks`, `@wordpress/block-editor`,
`@wordpress/components`, `@wordpress/element`, `@wordpress/i18n`,
`chart.js` ^4.4.1, `three` ^0.159.0. Plus `assets/wasm/gll.wasm` (~4.2 MB) and
`wasm_exec.js` from gll-tools.

---

## Phase 13 — Remaining work

Everything still outstanding, in the order it blocks a release.

### 13.1 Screen-reader testing [BLOCKS RELEASE CLAIM]

- [ ] Narrate all seven blocks under NVDA (Windows/Firefox), JAWS (Windows) and
      VoiceOver (macOS/Safari)
- [ ] Verify live-region announcement *order and usefulness*, not just presence
- [ ] Verify the 3D blocks (`balloon-3d`, `geometry`) are navigable at all
- [ ] Verify the canvas text descriptions convey something a sighted user gets
      from the render

**Why this is not already closed.** axe-core runs against four blocks and reports
no serious or critical violations. That result is real, and it is strictly
smaller than what this task asks. axe cannot judge whether a canvas description
is *useful*, whether live-region announcements arrive in a sensible order, or
whether a WebGL block is navigable at all — those need a human and a real
screen reader. Closing this on an axe pass would be the one genuinely dishonest
move available here.

**What to check first, because it is the most fragile.** A live region must exist
in the document *before* its text changes, or assistive tech treats the text as
initial content and stays silent. `geometry/view.ts` creates its region early and
carries a targeted `@wordpress/no-unused-vars-before-return` suppression for
exactly this reason — the lint rule's suggested fix (move the binding down to
first use) would silently destroy the feature. If a screen reader announces
nothing there, that is the first thing to re-verify, not an ARIA attribute.

ARIA structure is already verified in jsdom. What is unverified is narration.

### 13.2 Tag and publish the release

- [ ] Run `npm run test:integration:full` (the default corpus sweep is
      size-bounded; the full one is the pre-release gate)
- [ ] Confirm `scripts/check-version.mjs` passes — it guards the five places the
      version is written by hand
- [ ] Create the tag, which triggers `.github/workflows/release.yml`

The workflow is **written and verified but never triggered** — no tag was created
here, as agreed. It rebuilds and diffs `build/`, regenerates and diffs the
translation catalogue, packages the ZIP, and runs
`scripts/verify-plugin-zip.sh` before publishing.

Two things about it that look like bugs and are not:

- The `build/` diff deliberately does *not* run on ordinary pushes. Webpack
  output is not reproducible across Node minor versions, and a check that reddens
  on version skew teaches people to ignore a red X.
- ZIP verification asserts against the **archive**, not the packer's log, and
  requires `gll.wasm` to be present *and over 4 MB* — present-but-truncated is a
  real failure mode a file listing cannot see. This exists because the shipped
  ZIP was once unusable in a way nobody could notice: see the Phase 12 packaging
  note before touching `package.json`'s `files` array.

The release must not claim Safari or mobile support. Chromium is a good proxy for
Chrome and defensible for Edge; Playwright's WebKit is not Safari, and Safari
applies its own WebAssembly memory limits — precisely where this plugin is most
exposed. `readme.txt` already says so; keep it that way.

### 13.3 Defect backlog — work to do

Each defect below is characterized by a *passing* test describing today's
behaviour, so the first step of every fix is to flip that test to assert the
intended behaviour and watch it go red.

#### 13.3.1 Fix `has_block()` frontend asset gating [DONE]

`gll_info_enqueue_frontend_assets()` gated on `has_block()`, which inspects only
the main post content. A GLL block in a template part, widget, reusable block or
full-site-editing template therefore received neither `gllInfoSettings` nor its
script translations. It worked anyway on a stock install because `wasm-loader`
falls back to a hardcoded `/wp-content/plugins/gll-info/…` path — so the
breakage was invisible until someone renamed the plugin directory, installed in a
subdirectory, ran non-root multisite, or overrode `WP_PLUGIN_URL`. Translations
were broken in *all* of those cases regardless of path, having no fallback.

- [x] Register `gll-info-wasm-exec` on `init` (priority 5) rather than enqueueing
      it conditionally
- [x] Add `"gll-info-wasm-exec"` alongside `"file:./view.js"` in all seven
      `block.json` `viewScript` arrays — verified against core first
- [x] Attach `gllInfoSettings` and `gll_info_set_block_script_translations()`
      unconditionally
- [x] Delete the `has_block()` loop
- [x] Rebuild — `block.json` changes only take effect through `build/`
- [x] Replace the characterization test (PHPUnit, 31 → 33)
- [x] Add E2E specs for the reusable-block and template-part paths
- [x] Assert the regression the gate was bought to prevent: no GLL block on the
      page means nothing is enqueued

**The settings attach to the seven view-script handles, not to
`gll-info-wasm-exec`.** This is a deliberate departure from what this plan
originally specified. Attaching to the shared runtime handle would print one blob
instead of seven, but it would make correctness depend on all seven `block.json`
files carrying the handle — and a block added later, or one file missed in a
rename, would lose its settings silently. Deriving the handles from
`gll_info_get_block_names()` is what makes that impossible, and it is exactly
what the editor path already does. The runtime handle is now only an eager
preload: `wasm-loader` injects `wasm_exec.js` itself when `window.Go` is
undefined, so nothing depends on it arriving.

Registration sits at `init` priority 5, ahead of block registration at 10.
`register_block_script_handle()` resolves a non-`file:` entry to a bare handle
*without checking that it exists*, and enqueueing an unregistered handle is a
silent no-op, so registering late would fail invisibly.

Three things surfaced that are worth keeping:

**Core already sets the script text domain, but not the path.**
`register_block_script_handle()` calls `wp_set_script_translations( $handle,
$metadata['textdomain'] )` from `block.json` with no path, so it resolves against
`WP_LANG_DIR/plugins/` — the language-pack location, empty on an install that has
never fetched one. Pointing at the plugin's bundled `/languages` is the entire
contribution of `gll_info_set_block_script_translations()`. The first version of
the new test asserted the *domain* and passed before the fix was written: it was
testing core. It asserts the path now.

**Since WordPress 6.9, a block that renders empty has its enqueues undone.**
`WP_Block::render()` snapshots the asset queues, and if the rendered content is
blank it dequeues whatever the block just added. Every block's `save()` returns
null without a `fileUrl`, so the obvious test markup —
`<!-- wp:gll-info/gll-info /-->`, which is what the old tests and the patterns
use — loads no assets at all. That is correct behaviour, and it means any test
about asset loading has to use markup carrying a file and its saved `<div>`. Two
of the new tests initially failed against this and not against the production
code.

**The plugin is mounted at the `gll-info` slug in wp-env deliberately**, so the
hardcoded fallback keeps being exercised as it would be on a real install. The
failure this fixes is therefore not reproducible there by path; the tests assert
the presence of `gllInfoSettings` instead, which is the thing that was missing.

#### 13.3.2 Resolve `showResponses`

The main block's attribute serializes to `data-show-responses` and nothing reads
it. Decide, then do one of:

- [ ] **Wire it up** — have `gll-info/view.ts` and `edit.tsx` honour it the way
      `showOverview` and `showSources` are honoured, and add tests, or
- [ ] **Remove it** — and add a `deprecated` entry to the block, because dropping
      an attribute from `save()` output invalidates every published post that
      contains the block. A demo page carrying the current markup is already
      live, so this is not hypothetical
- [ ] Either way, update the InspectorControls label so the editor stops offering
      a toggle that does nothing

Recommendation: wire it up. The attribute exists because the feature was
intended, and the deprecation machinery is the more expensive path.

#### 13.3.3 Remove the redundant `polar-utils` guard

- [ ] Delete `onAxisLevel.length === onAxisLevel.length` from `canCombineOnAxis`
- [ ] Confirm the pinning test still passes unchanged — the preceding
      frequency-length comparison already enforces the intended rule, so removal
      must be a no-op. If the test moves, the analysis was wrong and the guard
      was load-bearing after all

Five minutes of work. Listed because the line reads like a typo for something
else and will keep drawing attention until it is gone.

### 13.4 Feature backlog — work that can and should be done

Ordered by value per unit of work. Each was deferred for a stated reason, and
each reason is now a design constraint rather than a blocker.

#### 13.4.1 Server-side parse cache [highest value — unblocks everything below]

The single most valuable piece of work left. Today every visitor to every page
downloads a 4.2 MB WASM binary and re-parses the whole GLL client-side; a 15.4 MB
file costs them 1.3 GB of memory and 6–11 s, and probably fails outright on
mobile. The original architecture called for caching and it was never built.

- [ ] Decide the storage tier — post meta (travels with the post, bloats
      `wp_postmeta`), transients (evictable, correct semantics), or filesystem
      under `wp-content/uploads/` (largest payloads, needs cleanup on attachment
      delete). **Recommendation: transients keyed by attachment ID + file hash,
      with a filesystem fallback for payloads over the object-cache limit**
- [ ] Define a *display subset* rather than caching the full parse. The
      normalizer already proves this works — dropping `raw.resources` and FIR
      coefficients was exactly this move. 228.7 MB of JSON is not what any block
      renders
- [ ] Add a REST endpoint per block-shaped view (`restUrl` is already plumbed
      through `gllInfoSettings` and unused)
- [ ] Populate the cache on attachment upload, and on demand for existing files
- [ ] Invalidate on re-upload and on attachment delete
- [ ] Make the frontend prefer the cache and fall back to WASM, so the plugin
      still works if the cache is cold or the endpoint is unavailable
- [ ] Only then consider making WASM frontend-optional — that is the payoff:
      pages that stop shipping 4.2 MB entirely

This requires either a Go parser on the server (a hosting requirement the project
explicitly rejected) or running the WASM parse once at upload time in an admin
context. The latter keeps the no-Go-on-server property and is the reason this is
worth doing rather than reopening the architecture decision.

#### 13.4.2 URL input for external GLL files

- [ ] Add a URL text control beside the MediaUpload in every block that selects a
      file
- [ ] Resolve the CORS question that shelved this: an arbitrary origin will not
      send `Access-Control-Allow-Origin`, so either document the requirement
      plainly or proxy the fetch through a REST endpoint
- [ ] If proxying, treat it as SSRF-sensitive — validate the scheme, block
      private address ranges, cap the response size against the memory ceiling
      in 13.5.1, and require an authenticated capability to configure the URL
- [ ] Add the attribute to all seven blocks consistently, or to none

#### 13.4.3 Per-filter-group frequency response chart

The largest genuinely new feature, and its own phase.

- [ ] Port the FIR/IIR response computation from the demo
- [ ] Compute on demand from coefficients rather than carrying them — the
      normalizer reduces `data_irm`/`data_dip` (8193 float64 each, ~131 KB per
      filter) to a count precisely so they never live for the page's lifetime.
      Do not undo that; fetch or recompute per chart and release
- [ ] Reuse `charting-utils` and `ChartWrapper` from Phase 4
- [ ] Corpus reality check: filter groups appear in 10 of 29 files, so the empty
      state is the common case — follow the Phase 9/10 rule (frontend drops the
      section, editor explains why)

#### 13.4.4 Cluster setups, connectors and transformers

- [ ] Extend the normalizer — the data reaches the browser and is dropped, which
      is exactly the shape of the Phases 9 and 10 work
- [ ] Decide placement: a new block, or new sections in `gll-info/config`
- [ ] Measure corpus coverage before designing the UX, as in 9 and 10 — how many
      of the 29 files carry each

#### 13.4.5 `showFaces` — obtain geometry that actually has faces

Implemented, shipped, and unexercised: no case geometry in the 29-file corpus
carries a face list, so the toggle has nothing to draw and the face path has
never rendered a single triangle in anger.

- [ ] Source a GLL with face-carrying case geometry, or synthesize one with the
      `gll-tools` writer if it has one **(beyond this repo)**
- [ ] Add it to the corpus and assert faces render
- [ ] If no such file can be obtained, say so in `readme.txt` and consider hiding
      the toggle when the selected geometry has no faces — an inert control is
      worse than an absent one

#### 13.4.6 Nested block structure for the overview

- [ ] Lowest value here. The toggle-based design works and nesting buys
      composability nobody has asked for. Revisit only if users ask to reorder or
      interleave overview sections

### 13.5 Open questions

1. **Max upload size for `.gll` in the media library?** Informed rather than
   speculative now: a 15.4 MB GLL expands to 228.7 MB of JSON and leaves the Go
   WASM instance holding 1.3 GB of linear memory Go never returns. Files ≥10 MB
   need 800 MB–1.3 GB and 6–11 s and will likely fail on mobile. Files up to
   ~2 MB (21 of 29) are comfortable everywhere. Three real options: a hard cap, a
   warning at upload time, or 13.4.1's server-side pre-parse. They are not
   exclusive — the warning is cheap and worth doing regardless.
2. **Caching tier for parsed JSON** — see 13.4.1, which is where this gets
   answered.
3. **Multi-file support:** compare several GLL files in one view? Wants 13.4.1
   first; two full parses in one page is not viable client-side today.

### 13.6 Upstream work in `gll-tools` (beyond this repo)

- [ ] **Reconcile the two parsers on `N-APS v1_0.gll`.** The `gllinfo` CLI
      reports 9 corpus files with filter groups; the WASM build reports 10. The
      CLI misses that file, which WASM parses as having 2 groups. One of them is
      wrong about a real file, and the plugin's number is only trustworthy
      because it happens to use WASM.
- [ ] **Address the WASM memory ceiling at the source.** Go never returns linear
      memory to the host, so a large parse permanently costs the tab ~1.3 GB.
      Options, roughly in order of payoff: a streaming or subset parse API so
      callers can request only what they render; tearing down and recreating the
      instance after a large parse; or trimming the JSON the WASM boundary
      emits — 228.7 MB for a 15.4 MB input suggests the serialization, not the
      data, is the cost. This caps what any browser-based consumer can do and is
      not fixable from the plugin side.
- [ ] **Confirm 15.4 MB is really near the format ceiling.** The performance
      work assumed it because nothing larger exists in the corpus. If
      manufacturers ship larger files, the memory findings understate the
      problem.
