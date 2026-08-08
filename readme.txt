=== GLL Info ===
Contributors:
Tags:              loudspeaker, acoustics, gll, audio, blocks
Requires at least: 6.7
Tested up to:      6.7
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

Parsing happens client-side in WebAssembly. The plugin ships a Go-based GLL
parser compiled to `gll.wasm`; the browser downloads the `.gll` file and the
parser, and everything else — charts, meshes, tables — is built from the parsed
result. Nothing about the file is processed on the server.

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

* Parsed data is **not** cached in post meta. Every page view re-downloads the
  `.gll` file and re-parses it in the visitor's browser. Large files therefore
  cost the visitor bandwidth and CPU on every visit.
* The 3D blocks require WebGL, and all blocks require a browser with
  WebAssembly support. There is no non-WebAssembly fallback.
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
* `.gll` upload support and a media library filter for GLL files.
* Three block patterns and thirteen block variations.
* Theme-aware styling with a per-block Appearance frame setting.

== Upgrade Notice ==

= 0.1.0 =
First development version. There is no earlier release to upgrade from.
