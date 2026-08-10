# The blocks and their settings

Seven blocks, all in the **Media** category of the inserter. Every one of them
has a file panel at the top of the sidebar and an **Appearance** panel at the
bottom; the panels in between are what differ.

Settings below are named exactly as they appear in the block sidebar.

---

## Choosing a file

Every block asks for a GLL file the same way, in the **File** panel of its
sidebar:

- **Choose from media library** / **Replace** — pick a file you have uploaded.
- **Address of a GLL file** — paste the address of a file hosted somewhere else,
  then press *Update address* or Enter. The address is only used once you commit
  it, not while you type, because loading a GLL file can mean downloading tens of
  megabytes.
- **Remove** — clears the file. Emptying the address field does the same thing.

The address has to start with `https://` (or `http://` on a site that is itself
served over plain http — a browser blocks an http file on an https page). An
address that does not end in `.gll` is accepted with a warning, because download
links and signed CDN addresses often hide the file name.

### Files hosted somewhere else

**The website hosting the file has to allow your site to read it.** Browsers
refuse to let one website read a file from another unless the second one says it
is allowed, by sending the header

```
Access-Control-Allow-Origin: https://your-site.example
```

(or `*`, for "any site"). Most file hosts and CDNs have a setting for this;
ordinary web servers do not send it by default. If you host the file yourself
somewhere, ask whoever administers that server.

If the header is missing, what happens depends on the block:

- **GLL File Viewer** and **GLL Configuration** keep working. They are served
  from a small stored summary of the file rather than from the file itself, so
  visitors never need to download it.
- The other five blocks — Frequency Response, Polar Plot, 3D Balloon, Geometry
  Viewer and Resources — render measurement data that is not in the summary, so
  they need the file itself. Their visitors will see an error naming the site
  that refused.

While you are editing, your site can fetch the file for you even when the header
is missing, so you still get a preview and a stored summary. The editor tells you
when it has done that, because it means the published page and your preview may
not agree. An administrator switches that on under **Settings → GLL Info**; it is
off until they do.

**A file on another server is not watched.** Nothing on your site can tell when
such a file changes where it is hosted, so its stored summary is kept for twelve
hours and then rebuilt. To pick up a change sooner, open the post and press
*Refresh stored summary*, or clear all of them under Settings → GLL Info.

---

## GLL File Viewer

`gll-info/gll-info` — the overview block. Shows what the file *is* and which
acoustic sources it contains.

Sidebar panel **File**: see [Choosing a file](#choosing-a-file), plus
*Refresh stored summary*.

This block is served from a stored summary of the file rather than parsing it in
every visitor's browser, so a published page carrying only this block never
downloads the parser. *Refresh stored summary* rebuilds that summary from the
file currently loaded; you should not normally need it, because replacing the
file invalidates the summary on its own.

Sidebar panel **Display Options**:

| Setting | Default | Effect |
| --- | --- | --- |
| **Show Overview** | on | The System Information table (Label, Version, Type, Manufacturer) and the Description. |
| **Show Sources** | on | The "Acoustic Sources" list. |
| **Sources Display Mode** | Expandable | *Compact*, *Detailed* or *Expandable*. Expandable draws each source as a collapsible card; only the open card renders its details, which keeps files with many sources fast. |
| **Show Response Charts** | off | Adds per-source frequency response controls and a chart inside each source card. Only offered while *Show Sources* is on. |
| **Show Responses** | on | The per-source text summary — how many measured responses the source carries and at what angular resolution — in the editor and on the published page. It does not draw charts; that is *Show Response Charts* in the editor, or the separate GLL Frequency Response block. |

Long source lists are revealed in chunks as you scroll rather than all at once,
so a file with dozens of sources does not stall the editor.

---

## GLL Frequency Response

`gll-info/frequency-response` — magnitude and phase against frequency, for one
response of one acoustic source.

Sidebar panel **File**: see [Choosing a file](#choosing-a-file).

Sidebar panel **Source Settings**:

| Setting | Default | Effect |
| --- | --- | --- |
| **Acoustic Source** | first source | Which source definition in the file to chart. |
| **Response Index** | 0 | Which stored response of that source. Slider, 0–10. Responses correspond to measurement directions; the block reports the source and range it ended up with underneath the chart. |

Sidebar panel **Chart Settings**:

| Setting | Default | Effect |
| --- | --- | --- |
| **Show Magnitude** | on | The level (dB) trace. |
| **Show Phase** | on | The phase trace on the second axis. |
| **Phase Mode** | Unwrapped | *Unwrapped*, *Wrapped* or *Group Delay*. Only offered while *Show Phase* is on. |
| **Normalize (On-Axis)** | off | Referenced to the on-axis level, so the chart shows shape rather than absolute level. |
| **Chart Height (px)** | 400 | 200–800, in steps of 50. |

---

## GLL Polar Plot

`gll-info/polar-plot` — directivity at a single frequency, drawn as polar
slices.

Sidebar panel **File**: see [Choosing a file](#choosing-a-file).

Sidebar panel **Source & Frequency**:

| Setting | Default | Effect |
| --- | --- | --- |
| **Acoustic Source** | first source | Which source definition to plot. |
| **Frequency** | first frequency | Dropdown of the frequencies stored in the file. |
| **Frequency Slider** | — | The same choice as a slider, for sweeping through frequencies quickly. The help text under it shows the frequency you are on. |

Sidebar panel **Display Options**:

| Setting | Default | Effect |
| --- | --- | --- |
| **Show Horizontal Slice** | on | The Front-Right-Back-Left plane (blue). |
| **Show Vertical Slice** | on | The Front-Top-Back-Bottom plane (red). |
| **Normalize** | off | Normalizes each slice to its own maximum level. |
| **Chart Height (px)** | 400 | 200–800, in steps of 50. |

Under the plot the block reports the frequency, the data's symmetry, its angular
resolution and the source, plus badges when the data is normalized, uses the
on-axis reference, or only covers the front half.

---

## GLL 3D Balloon

`gll-info/balloon-3d` — the full three-dimensional radiation balloon at one
frequency, rendered with Three.js. Drag to orbit, right-drag to pan, scroll to
zoom. Requires WebGL; without it the block says so instead of rendering.

Sidebar panel **File**: see [Choosing a file](#choosing-a-file).

Sidebar panel **Source & Frequency**:

| Setting | Default | Effect |
| --- | --- | --- |
| **Acoustic Source** | first source | Which source definition to render. |
| **Frequency** | first frequency | Dropdown of the frequencies in the file. |
| **Frequency Index** | 0 | The same choice as a slider. |

Sidebar panel **Display Options**:

| Setting | Default | Effect |
| --- | --- | --- |
| **dB Range** | 40 | Dynamic range for level display, 20–80 dB in steps of 5. A narrower range exaggerates the shape of the pattern. |
| **Scale** | 1.0 | Size multiplier for the balloon, 0.6–1.6 in steps of 0.1. |
| **Wireframe** | off | Draws the mesh as a wireframe instead of a solid surface. |
| **Auto-Rotate** | off | Rotates the balloon continuously. |
| **Show Reference Sphere** | on | The wireframe unit sphere the balloon is measured against. |
| **Show Axes** | on | The colour-coded X/Y/Z axes helper. |
| **Canvas Height (px)** | 500 | 200–800, in steps of 50. |
| **Quality Preset** | Medium (default) | *Low (faster)*, *Medium (default)* or *High (best lighting)*. Low subsamples the mesh and drops antialiasing — use it if the page has several 3D blocks or you are targeting weak hardware. |

The balloon only starts rendering once it scrolls into view, and its animation
pauses again when it leaves.

---

## GLL Geometry Viewer

`gll-info/geometry` — the loudspeaker enclosure as modelled in the file. Same
mouse controls as the balloon, and it likewise requires WebGL.

Sidebar panel **File**: see [Choosing a file](#choosing-a-file).

Sidebar panel **Geometry Options**:

| Setting | Default | Effect |
| --- | --- | --- |
| **Geometry** | first geometry | Which case geometry to display. Only shown when the file contains more than one. |
| **Show Faces** | on | Shaded surfaces. Turn off for a wireframe look. |
| **Show Edges** | on | Edge lines. |
| **Show Sources** | off | Marks where the acoustic sources sit on the cabinet. |
| **Center on Reference** | off | Centres the view on the file's reference point instead of the geometry's own centre. |
| **Auto-Rotate** | off | Rotates the model continuously. |
| **Canvas Height (px)** | 500 | 200–800, in steps of 50. |

Sidebar panel **Markers**:

| Setting | Default | Effect |
| --- | --- | --- |
| **Reference Point** | on | The acoustic reference point marker. |
| **Center of Mass** | on | The centre-of-mass marker. |
| **Next Pivot** | off | The next rigging pivot marker. |

Below the viewer the block reports vertex, edge and face counts, whether the
geometry is symmetric, and the number of sources.

---

## GLL Resources

`gll-info/resources` — the documents and data files packed inside the GLL file
itself: data sheets, images, and whatever else the manufacturer embedded.

Sidebar panel **File**: see [Choosing a file](#choosing-a-file).

Sidebar panel **Display Settings**:

| Setting | Default | Effect |
| --- | --- | --- |
| **Show Documentation** | on | The Documentation section. If the file has none, the sidebar says so under the toggle. |
| **Show Data Files** | on | The Data Files section, with the same note when the file has none. |
| **Show Image Previews** | on | Renders embedded images inline instead of listing them as downloads only. |
| **Preview Height (px)** | 240 | Maximum preview height, 80–600 in steps of 20. Only offered while previews are on. |
| **Hide When Empty** | off | Hides the whole block on the front end when the file has no resources. The editor still shows it, so you can find and change it. |

Every listed resource gets a **Download** link.

---

## GLL Configuration

`gll-info/config` — how the loudspeaker is configured and rigged: box types,
frames, DSP filter groups, and the manufacturer's limits and warnings. Each
section is a collapsible card whose summary carries the number of entries in it.

Sidebar panel **File**: see [Choosing a file](#choosing-a-file), plus *Refresh
stored summary*. Like the file viewer, this block is served from a stored summary
of the file rather than parsing it in every visitor's browser.

Sidebar panel **Display Settings**:

| Setting | Default | Effect |
| --- | --- | --- |
| **Show Box Types** | on | The Box Types card. |
| **Show Frames** | on | The Frames card. |
| **Show Filter Groups** | on | The Filter Groups card. |
| **Show Rigging Limits** | on | The rigging limits card. |
| **Show Rigging Warnings** | on | The rigging warnings card. |
| **Show Geometry Summary** | on | Adds vertex and face counts to box types and frames. |
| **Show Filter Details** | on | Lists the individual filters inside each filter group, not just the group. |
| **Show Pin Points** | off | Lists each frame's rigging pin points. Off by default — a frame can carry dozens. |
| **Start Collapsed** | off | Cards start closed. The count in each summary still tells the reader what is inside. |
| **Remember Open Cards** | on | Stores which cards a visitor opened and restores them next visit. Front end only; the editor preview always follows *Start Collapsed*. |
| **Hide When Empty** | off | Hides the block on the front end when the file has no configuration to show. |

The five toggles for the sections show a note in the sidebar when the file
contains nothing for that section, so you can tell "switched off" from "not in
the file". A section that is switched on but empty prints a short placeholder
such as "No box types defined."

---

## Appearance (all blocks)

The **Appearance** panel has one setting, **Frame**:

- **Card** — background, border, rounded corners and a subtle shadow. The default.
- **Plain** — background and border, no shadow or rounded corners.
- **None** — no frame at all; the visualization sits directly on the page.

Colors always follow the site theme regardless of this setting. To change the
colors themselves, see `== Theming ==` in the plugin's `readme.txt`.
