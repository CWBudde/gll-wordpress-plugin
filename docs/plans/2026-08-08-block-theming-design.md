# Theme-adaptive block styling

Date: 2026-08-08

## Problem

Every block hardcodes `background: #fff` in its `style.scss`, plus
`--gll-three-bg: #f8fafc` for the WebGL canvas wrapper. Only `gll-info` and
`shared/three.scss` use CSS variables at all, and the only dark-mode support
keys on `.is-dark-theme` / `[data-wp-dark-mode="true"]`, which most themes never
set. Chart.js grid and tick colors are hardcoded in `shared/charting-utils.ts`.

On a dark theme the blocks render as white cards on a near-black page. The
reference case is `pcjv.de`, whose active theme `classy-black-2026` is a classic
(non-FSE, no `theme.json`) dark theme declaring on `:root`:

| Token                  | Value     |
| ---------------------- | --------- |
| `--color-bg`           | `#090909` |
| `--color-surface`      | `#111`    |
| `--color-surface-alt`  | `#202020` |
| `--color-text`         | `#ababab` |
| `--color-muted`        | `#757575` |
| `--color-heading`      | `#fefefe` |
| `--color-border`       | `#444`    |
| `--color-link`         | `#fefefe` |

## Decisions

1. **Colors come from a token layer that inherits from the theme.** Not from
   per-block color pickers. Blocks look right on any theme with zero
   configuration.
2. **`transparent` means fully chromeless.** No background, border, shadow,
   radius or padding.
3. **Scope is all five blocks plus the chart and 3D canvases.**
4. **The auto/plain/transparent choice is a per-block attribute**, serialized as
   a class on the wrapper.
5. **Canvas colors are resolved at runtime** via `getComputedStyle`, not by
   light/dark detection.

## 1. Token layer

New `src/shared/tokens.scss`, imported by every block's `style.scss` and
`editor.scss`. Defines the `--gll-*` set once on a shared `.gll-block` class,
each with a three-step fallback chain:

```scss
.gll-block {
  --gll-surface: var(--wp--preset--color--base, var(--color-surface, #fff));
  --gll-surface-muted: var(--color-surface-alt, #f5f5f5);
  --gll-text: var(--wp--preset--color--contrast, var(--color-text, #333));
  --gll-text-muted: var(--color-muted, #666);
  --gll-heading: var(--color-heading, var(--gll-text));
  --gll-border: var(--color-border, #e0e0e0);
  --gll-accent: var(--wp--preset--color--primary, var(--color-link, #667eea));
  --gll-shadow: 0 1px 3px rgb(0 0 0 / 5%);
}
```

- Step 1 is the WordPress `theme.json` preset — block themes get it free.
- Step 2 is the classic-theme convention. These are exactly the names
  `classy-black-2026` declares, so pcjv.de resolves correctly with no
  site-specific CSS.
- Step 3 is the current hardcoded value, so nothing regresses.

Every hardcoded `#fff` / `#f5f5f5` / `#333` / `#e0e0e0` across the five
`style.scss` files is replaced by the matching token. The per-block `--gll-*`
declarations in `gll-info/style.scss` are removed — they would shadow the shared
layer.

`gll-block` is added to each wrapper via `useBlockProps({ className })` in
`edit.tsx` and `save.tsx`. Existing `.wp-block-gll-info-*` selectors stay.

**Known limitation.** Step 2 bets on a naming convention that is not a standard.
It is correct for `classy-black-2026` and costs nothing when absent. The token
names are documented in `readme.txt` so other sites can map them.

## 2. `appearance` attribute

Added to all five blocks' `block.json`:

```json
"appearance": {
  "type": "string",
  "enum": [ "auto", "plain", "transparent" ],
  "default": "auto"
}
```

A shared `<AppearanceControl>` in `src/shared/` renders it as a
`ToggleGroupControl` in an **Appearance** panel in `InspectorControls`, so all
five blocks share one implementation.

`edit.tsx` and `save.tsx` put the choice on the wrapper as
`gll-appearance--auto` / `--plain` / `--transparent`. The class is the only thing
crossing into the frontend; `view.ts` reads it back off the wrapper.

Meanings, defined in `tokens.scss`:

- **auto** — `--gll-surface` background, 1px `--gll-border`, 8px radius, 20px
  padding, `--gll-shadow`.
- **plain** — background and border kept; shadow and radius dropped.
- **transparent** — `--gll-surface: transparent`; border, shadow, radius and
  padding removed. Text tokens untouched so labels and axes stay legible.

Because `transparent` reassigns `--gll-surface` rather than overriding each rule,
it propagates automatically to the Three.js wrapper and Chart.js containers.

Adding an attribute changes serialized markup, so each block gets a `deprecated`
entry whose save output is the current class-free markup. Without it, saved posts
show "this block contains unexpected or invalid content".

## 3. Runtime color resolution

New `src/shared/resolve-theme.ts`:

```ts
export interface GllTheme {
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  surface: string;
  isDark: boolean;
}

export function resolveTheme( el: HTMLElement ): GllTheme;
```

Calls `getComputedStyle( el )` and reads `--gll-text`, `--gll-text-muted`,
`--gll-border`, `--gll-accent`, `--gll-surface`. The browser has already walked
the fallback chain, so the returned values are final — `#ababab` on pcjv.de,
`#333` on a default theme. No light/dark guessing.

`isDark` derives from the relative luminance of the resolved surface and is used
only where a boolean is genuinely required, such as picking a tone-mapped
material for the balloon.

Call sites:

- `shared/charting-utils.ts` — grid, tick, legend and tooltip colors become
  `theme.*`. **Dataset colors stay hardcoded**: they encode data series, not
  chrome, and recoloring them per theme would break the legend's meaning.
- `balloon-3d/view.ts` and `balloon-3d/edit.tsx` — axes helper, reference sphere
  and wireframe take `theme.border` / `theme.textMuted`. **Lights stay white**;
  tinting them would distort the dB colormap, which is the block's data channel.
  `setClearColor(0x000000, 0)` is already correct and stays.
- `geometry/view.ts` — same treatment for its helpers.

Resolution runs once at init and again on a `resize` / `ResizeObserver` tick. No
`MutationObserver` on the document — live theme-toggle support is not needed for
a site with one fixed theme.

## 4. Testing

Jest already has `unit` (jsdom) and `integration` (node/WASM) projects with
colocated `src/**/*.test.ts` suites. No config changes needed.

`src/shared/resolve-theme.test.ts`:

- theme tokens present → returned verbatim
- tokens absent → hardcoded fallback wins
- `isDark` true for a dark surface, false for a light one
- unparseable surface → falls back to `isDark: false` rather than throwing

`src/shared/appearance-control.test.tsx`: renders the three options and calls
`setAttributes` with the right value. The preset fails tests on unhandled
`console.error`, so this also catches React warnings.

**Not unit-tested:** the SCSS cascade. Asserting computed CSS in jsdom tests the
mock, not the browser. Verified visually instead.

## 5. Visual verification on staging

Deploy path, from the earlier session:

- `ssh pcjv.de` (host configured in `~/.ssh/config`)
- WP-CLI wrapper `wp-staging` =
  `sudo -u www-data wp --path=/var/www/staging.pcjv.de/christian/wordpress`
- Plugins dir:
  `/var/www/staging.pcjv.de/christian/wordpress/wp-content/plugins/`
- Target page `?page_id=2039` (`gll-tools`)
- Whole staging site behind HTTP Basic Auth (`preview` / `pcjv2026`)
- The GLL plugin was **not** installed on staging as of that session

Steps: `npm run build`, rsync the plugin, activate, place the blocks on the
gll-tools page, screenshot.

This deploys to a real host, so build and test locally first and confirm before
pushing anything to staging.
