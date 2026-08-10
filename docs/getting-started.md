# Getting started

## 1. Upload a GLL file

WordPress does not accept `.gll` uploads on its own. Activating GLL Info
registers the extension as the MIME type `application/x-gll`, which is what
lets the upload through.

1. Go to **Media > Add New Media File**.
2. Drop the `.gll` file in, or use **Select Files**.
3. The file appears in the library with a purple "GLL" tile instead of a
   thumbnail.

In the media library's list view you can filter by **GLL Files** in the type
dropdown to see only the GLL uploads.

### Two things worth knowing before you upload

- **The file is public.** It is a normal media attachment, and every visitor who
  loads a page with a GLL block downloads the whole file so their browser can
  read it. Do not upload a file you would not hand out.
- **File size is the visitor's problem.** Version 0.1.0 does not cache anything
  on the server. Each page view downloads and re-parses the file. A large GLL
  file means a slow first paint for the visitor.

## 2. Insert a block

In the post or page editor, open the inserter and search for "GLL". All seven
blocks are in the **Media** category:

- GLL File Viewer
- GLL Frequency Response
- GLL Polar Plot
- GLL 3D Balloon
- GLL Geometry Viewer
- GLL Resources
- GLL Configuration

The variations (for example *GLL Magnitude Response*) appear in the same list —
see [patterns-and-variations.md](patterns-and-variations.md).

## 3. Choose the file

A freshly inserted block shows a placeholder with a media button and an
**Insert from URL** option. Pick your uploaded file and the block parses it and
renders a preview straight away — or paste the address of a GLL file hosted
somewhere else, which works if that website allows your site to read it. See
[Choosing a file](blocks.md#choosing-a-file) for what that means in practice.

Every block does this separately. There is no "site-wide GLL file" setting: if a
page has five GLL blocks on it, you select the file five times, and the visitor's
browser parses it once per block.

To swap or clear the file later, open the block sidebar. The first panel is
**File**, on every block, and holds the media button, the address field and
**Remove**.

## 4. Adjust the settings

Everything else lives in the block sidebar, under panels that differ per block.
[blocks.md](blocks.md) lists each one.

Two panels are shared by all seven blocks:

- The file panel described above.
- **Appearance**, with a single **Frame** setting: *Card*, *Plain* or *None*.
  Colors always follow your theme; this only controls the box drawn around the
  block. See `== Theming ==` in `readme.txt` if you want to override the colors.

## Requirements and limitations

- WordPress 6.7 or newer, PHP 7.4 or newer.
- The visitor's browser must support WebAssembly. There is no fallback for
  browsers that do not.
- **GLL 3D Balloon** and **GLL Geometry Viewer** also need WebGL. Without it the
  block reports that WebGL is unavailable instead of rendering.
- A file hosted on another website has to be readable by yours: that site must
  send an `Access-Control-Allow-Origin` header naming your site. Under
  **Settings > GLL Info** an administrator can also let this site fetch such
  files while you are editing; that is off by default.
- The plugin registers a **GLL Files** entry in the admin menu (a custom post
  type). No block reads from it — blocks always take their file from the media
  library — so you can ignore it.
