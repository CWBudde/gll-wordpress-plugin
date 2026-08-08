=== Gll Info ===
Contributors:      The WordPress Contributors
Tags:              block
Tested up to:      6.7
Stable tag:        0.1.0
License:           GPL-2.0-or-later
License URI:       https://www.gnu.org/licenses/gpl-2.0.html

Example block scaffolded with Create Block tool.

== Description ==

This is the long description. No limit, and you can use Markdown (as well as in the following sections).

For backwards compatibility, if this section is missing, the full length of the short description will be used, and
Markdown parsed.

== Installation ==

This section describes how to install the plugin and get it working.

e.g.

1. Upload the plugin files to the `/wp-content/plugins/gll-info` directory, or install the plugin through the WordPress plugins screen directly.
1. Activate the plugin through the 'Plugins' screen in WordPress


== Theming ==

The blocks take their colors from the active theme. Nothing needs configuring
for this to work, and it applies to the charts and 3D views as well as the
surrounding markup.

Each block instance also has an **Appearance** setting in the block sidebar:

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

= The blocks look wrong on my theme. How do I fix the colors? =

See the Theming section. In most cases nothing is needed. If your theme uses
its own naming for its palette, map it onto the `--gll-*` variables listed
there in your stylesheet.

= Can I remove the box around a block? =

Yes. Set Appearance to "None" in the block sidebar.

== Screenshots ==

1. This screen shot description corresponds to screenshot-1.(png|jpg|jpeg|gif). Note that the screenshot is taken from
the /assets directory or the directory that contains the stable readme.txt (tags or trunk). Screenshots in the /assets
directory take precedence. For example, `/assets/screenshot-1.png` would win over `/tags/4.3/screenshot-1.png`
(or jpg, jpeg, gif).
2. This is the second screen shot

== Changelog ==

= 0.1.0 =
* Release

== Arbitrary section ==

You may provide arbitrary sections, in the same format as the ones above. This may be of use for extremely complicated
plugins where more information needs to be conveyed that doesn't fit into the categories of "description" or
"installation." Arbitrary sections will be shown below the built-in sections outlined above.
