=== GLL Info ===
Contributors:
Tags:              loudspeaker, acoustics, gll, audio, blocks
Requires at least: 6.7
Tested up to:      7.0
Requires PHP:      7.4
Stable tag:        0.1.0
License:           GPL-2.0-or-later
License URI:       https://www.gnu.org/licenses/gpl-2.0.html

Display GLL loudspeaker data in Gutenberg blocks: overview, frequency response, polar plots, 3D balloon, geometry, resources and configuration.

== Description ==

GLL Info turns a GLL (Generic Loudspeaker Library) file into a set of Gutenberg
blocks. Upload the `.gll` file to the WordPress media library, pick it in a
block, and the block reads the file directly in the browser and renders it — no
export step, no conversion, and no copy of the data to keep in sync.

Parsing happens in WebAssembly. The plugin ships a Go-based GLL parser compiled
to `gll.wasm`; the browser downloads the `.gll` file and the parser, and
everything else — charts, meshes, tables — is built from the parsed result.

The file viewer and the configuration block do not make visitors do that work.
When a `.gll` file is uploaded, or first placed in a block, a small summary of it
is stored and served to visitors instead — a few kilobytes rather than a 4 MB
parser and a file that can run to 15 MB. The five blocks that draw measurement
data still parse in the browser, because that data is what they draw.

If your server can run Node, the summary is prepared at upload time and nobody
has to open the block editor for it. If it cannot, the block editor prepares it
when an author picks the file. If neither happens, visitors' browsers parse the
file as they always did. All three are supported; see Settings → GLL Info for
which one is in use on your site. No Go toolchain is required on the server in
any case.

= Blocks =

Seven blocks are registered, all in the **Media** category of the inserter:

* **GLL File Viewer** (`gll-info/gll-info`) — file selector plus the file
  overview (label, version, system type, manufacturer, description) and the
  list of acoustic sources, with optional per-source frequency response
  controls and charts.
* **GLL Frequency Response** (`gll-info/frequency-response`) — magnitude and
  phase chart for one response of one acoustic source, with unwrapped phase,
  wrapped phase or group delay.
* **GLL Polar Plot** (`gll-info/polar-plot`) — horizontal and vertical
  directivity slices at a single frequency.
* **GLL 3D Balloon** (`gll-info/balloon-3d`) — the full radiation balloon at
  one frequency, rendered with Three.js and orbitable with the mouse.
* **GLL Geometry Viewer** (`gll-info/geometry`) — the cabinet geometry modelled
  in the file, with faces, edges, source positions and reference markers.
* **GLL Resources** (`gll-info/resources`) — the documentation and data files
  embedded inside the GLL file, with image previews and download links.
* **GLL Configuration** (`gll-info/config`) — box types, frames, filter groups,
  rigging limits and rigging warnings.

= Block patterns =

Three ready-made layouts are registered under the **GLL Loudspeaker Data**
pattern category: *Full GLL Viewer*, *Quick GLL Overview* and *GLL Acoustic
Analysis*. A pattern cannot know which file you want, so every block it inserts
starts with no file selected — pick the file per block after inserting.

= Block variations =

Thirteen variations appear in the inserter alongside the plain blocks, each one
a block preset with different toggles: magnitude-only and normalized frequency
response, horizontal/vertical/normalized polar plots, wireframe and minimal
balloon, wireframe and rotating geometry, documentation-only resources, rigging
and filter configuration, and an overview-only file viewer.

= What this plugin does not do (yet) =

* Only the file viewer and the configuration block are served from the stored
  summary. The frequency response, polar plot, 3D balloon, geometry and
  resources blocks re-download the `.gll` file and re-parse it in the visitor's
  browser on every page view, because they render the measurement data the
  summary leaves out. Large files therefore still cost those visitors bandwidth
  and CPU, and very large files may fail on phones and tablets.
* The 3D blocks require WebGL. Every block except the file viewer and the
  configuration block requires a browser with WebAssembly support, and those two
  require it whenever their stored summary is unavailable. There is no
  non-WebAssembly fallback.
* A `gll_file` custom post type is registered, but the blocks do not read from
  it — they take their file from the media library.

= Documentation =

End-user documentation lives in the `docs/` directory of the plugin:
`docs/getting-started.md`, `docs/blocks.md` and
`docs/patterns-and-variations.md`.

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/gll-info`, or install the
   plugin through the WordPress plugins screen.
1. Activate the plugin through the *Plugins* screen in WordPress.
1. Go to *Media > Add New* and upload a `.gll` file. The plugin registers the
   `.gll` extension as `application/x-gll`, which is what makes the upload
   pass WordPress's file type check.
1. Edit a post or page, insert one of the GLL blocks, and choose the uploaded
   file with *Select GLL File*.

WordPress 6.7 or newer and PHP 7.4 or newer are required. Visitors need a
browser with WebAssembly support, and WebGL for the 3D Balloon and Geometry
Viewer blocks.

== Theming ==

The blocks take their colors from the active theme. Nothing needs configuring
for this to work, and it applies to the charts and 3D views as well as the
surrounding markup.

Each block instance also has an **Appearance** panel in the block sidebar with a
single **Frame** setting:

* **Card** — background, border, rounded corners and a subtle shadow.
* **Plain** — background and border, no shadow or rounded corners.
* **None** — no frame at all. The visualization sits directly on the page.

= How colors are resolved =

Every color resolves through a chain, first match wins:

1. The theme's `theme.json` presets (`--wp--preset--color--base`,
   `--wp--preset--color--contrast`, `--wp--preset--color--primary`,
   `--wp--preset--color--tertiary`). Block themes provide these automatically.
2. A set of conventional custom properties on `:root`, for classic themes:
   `--color-surface`, `--color-surface-alt`, `--color-text`, `--color-muted`,
   `--color-heading`, `--color-border`, `--color-link`.
3. The plugin's own defaults, a light palette.

A classic theme that already declares the step 2 names is picked up with no
extra work. A theme that declares neither can opt in by setting them, or by
overriding the plugin's own variables directly:

`--gll-surface`, `--gll-surface-muted`, `--gll-text`, `--gll-text-muted`,
`--gll-heading`, `--gll-border`, `--gll-accent`, `--gll-shadow`,
`--gll-radius`, `--gll-padding`.

For example, to force a dark panel regardless of the theme:

`.gll-block { --gll-surface: #111; --gll-text: #ababab; --gll-border: #444; }`

Data colors are deliberately **not** themed: chart series colors and the dB
colormap on the 3D balloon encode meaning, so they stay stable across themes.

== Tested Environments ==

Stated as what was actually run, rather than as a list of everything the plugin
is hoped to work on.

**WordPress:** the integration suite runs against WordPress 6.7.2, which is the
declared minimum, and against current WordPress. Both block registration paths
are exercised: 6.7 takes the per-block fallback and 6.8+ takes the metadata
collection.

**Browsers:** the end-to-end suite runs on Chromium, which is a good proxy for
Chrome and a defensible one for Edge, since they share an engine. It is also
configured for Firefox and WebKit locally.

Safari has **not** been verified on real hardware. Playwright's WebKit is not
Safari — it uses a different graphics stack, and Safari has historically applied
its own limits to WebAssembly memory, which is exactly where this plugin is most
exposed. Mobile browsers have not been verified at all.

**Large files are a real limit, not a theoretical one.** Parsing happens in the
browser, and a large GLL needs a great deal of memory: a 15 MB file expands to
over 200 MB of intermediate data and leaves the parser holding more than a
gigabyte. Files up to roughly 2 MB are comfortable everywhere. Files of 10 MB
and up take several seconds even on a current laptop and may fail outright on
phones and tablets. See `docs/performance.md` for measurements.

**Screen readers** have not been tested. Automated accessibility checks
(axe-core) run against the rendered blocks and report no serious or critical
violations, but that is a strictly smaller claim: it cannot tell whether the
chart descriptions are actually useful to someone listening to them.

== Frequently Asked Questions ==

= WordPress refuses to upload my .gll file. =

The plugin adds `application/x-gll` to the allowed upload types, so this only
happens when the plugin is inactive, or when the host or a security plugin
restricts uploads further. Check that GLL Info is activated, then check any
upload-restriction plugin or the `upload_mimes` filter in your theme.

= Do I have to pick the file in every block? =

Yes. Each block stores its own `fileId`, `fileUrl` and `fileName`, and each one
parses the file independently. The bundled patterns insert several blocks at
once, but you still choose the file in each of them.

= Can I use a GLL file that is not in my media library? =

Yes. Every block's File panel has an address field: paste the address of a GLL
file hosted elsewhere and press Enter.

One condition, and it is not up to you: the website hosting the file has to tell
browsers that your site may read it, by sending the header
`Access-Control-Allow-Origin` naming your site (or `*`). File hosts and CDNs
usually have a setting for this; ordinary web servers do not send it by default.

If it is missing, the GLL File Viewer and GLL Configuration blocks still work —
they are served from a small stored summary rather than from the file — and the
five blocks that draw measurement data will show an error on the published page.
Under Settings > GLL Info an administrator can let the site fetch such files
while you are editing, so you at least get a preview and a stored summary. That
is off by default.

Bear in mind that nothing on your site can notice when a file changes where it is
hosted. Its stored summary is refreshed twelve hours after it was made, or when
you press "Refresh stored summary".

= The block shows nothing on the front end. =

Three common causes: the block has no file selected; the browser has no
WebAssembly or (for the 3D blocks) no WebGL support; or the block's *Hide When
Empty* option is on and the file genuinely contains nothing for that block —
that option exists on the Resources and Configuration blocks.

= The blocks look wrong on my theme. How do I fix the colors? =

See the Theming section. In most cases nothing is needed. If your theme uses
its own naming for its palette, map it onto the `--gll-*` variables listed
there in your stylesheet.

= Can I remove the box around a block? =

Yes. Set *Appearance > Frame* to "None" in the block sidebar.

= Is the GLL file public once I upload it? =

Yes. It is a media library attachment like any other, and the visitor's browser
downloads it in full in order to render the block. Do not upload a GLL file you
are not willing to distribute.

= Settings > GLL Info says no server-side parser is available. Is that a problem? =

No. It is a supported configuration and nothing is broken. Your site will
prepare each file's summary in the block editor instead, when an author picks
the file, and visitors' browsers will parse any file that has no summary yet.

Server-side parsing needs PHP to be allowed to start a subprocess, which many
shared hosts forbid, and it needs `node` on the server's PATH. If you have Node
installed somewhere unusual, point the plugin at it with the
`GLL_INFO_NODE_BIN` constant or the `gll_info_node_bin` filter, then press
"Check again".

= I replaced a GLL file with a new version. Do I have to clear anything? =

No. The stored summary records a fingerprint of the file it was built from and
is discarded automatically as soon as the file's contents differ. Deleting the
attachment removes it too. If you want to force the work to happen again, use
*Refresh stored summary* in the file viewer's or configuration block's sidebar.

= Is there a custom post type for GLL files? =

A `gll_file` post type is registered and appears in the admin menu, but no
block reads from it. Blocks select their file from the media library.

== Screenshots ==

No screenshots ship with this release. The `assets/` directory contains only the
media library icon and the WebAssembly parser; screenshot files will be added
before the plugin is submitted anywhere that displays them.

== Changelog ==

= 0.1.0 =
* Initial development version. Not yet released.
* Seven blocks: GLL File Viewer, Frequency Response, Polar Plot, 3D Balloon,
  Geometry Viewer, Resources and Configuration.
* Client-side GLL parsing via a Go parser compiled to WebAssembly.
* A stored per-file summary, served over the REST API, so the file viewer and
  configuration blocks render without downloading the parser. Prepared on upload
  where the server can run it, in the block editor otherwise, and rebuilt on
  demand from the block sidebar.
* Optional server-side parsing with no Go toolchain required: the bundled
  WebAssembly parser is run under Node. An external `gllinfo` binary can be
  configured instead. Settings > GLL Info reports which is in use.
* `.gll` upload support and a media library filter for GLL files.
* Three block patterns and thirteen block variations.
* Theme-aware styling with a per-block Appearance frame setting.

== Upgrade Notice ==

= 0.1.0 =
First development version. There is no earlier release to upgrade from.
