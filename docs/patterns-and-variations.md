# Patterns and variations

Two shortcuts save you from assembling pages block by block. **Patterns** insert
a whole layout at once. **Variations** insert a single block already configured
a particular way.

## Block patterns

Open the inserter, switch to the **Patterns** tab, and look for the **GLL
Loudspeaker Data** category.

### Full GLL Viewer

A complete loudspeaker page in reading order, with headings and short
introductions between the blocks:

1. "Loudspeaker Data" — the **GLL File Viewer**.
2. "Frequency Response" — the **GLL Frequency Response** block.
3. "Directivity" — the **GLL Polar Plot** and the **GLL 3D Balloon**.
4. "Cabinet Geometry" — the **GLL Geometry Viewer**.
5. "Configuration" — the **GLL Configuration** block, inserted with *Start
   Collapsed* already on.
6. "Documents and Downloads" — the **GLL Resources** block, inserted with *Hide
   When Empty* already on.

### Quick GLL Overview

A compact summary: the **GLL File Viewer** with the source listing switched off
(overview only), followed by the **GLL Resources** block with *Hide When Empty*
on, under the heading "Loudspeaker at a Glance".

### GLL Acoustic Analysis

The three acoustic visualizations for one source, each under its own subheading:
**GLL Frequency Response**, **GLL Polar Plot**, **GLL 3D Balloon**.

### After inserting a pattern

A pattern is fixed content, so it cannot know which GLL file you mean. Every
block it inserts starts with no file selected and shows its *Select GLL File*
placeholder. Work down the page and pick the same file in each one.

The headings and paragraphs a pattern inserts are ordinary core blocks — edit or
delete them freely.

## Block variations

Variations appear in the normal **Blocks** tab of the inserter, next to the
plain blocks. Each one is just the block with some toggles pre-set, so anything
a variation does you can also do afterwards in the sidebar.

| Variation | Block | Pre-set as |
| --- | --- | --- |
| **GLL Overview** | GLL File Viewer | *Show Sources* and *Show Responses* off — metadata only |
| **GLL Magnitude Response** | GLL Frequency Response | *Show Phase* off |
| **GLL Normalized Response** | GLL Frequency Response | *Normalize (On-Axis)* on |
| **GLL Horizontal Polar Plot** | GLL Polar Plot | *Show Vertical Slice* off |
| **GLL Vertical Polar Plot** | GLL Polar Plot | *Show Horizontal Slice* off |
| **GLL Normalized Polar Plot** | GLL Polar Plot | *Normalize* on |
| **GLL Wireframe Balloon** | GLL 3D Balloon | *Wireframe* on |
| **GLL Balloon (Minimal)** | GLL 3D Balloon | *Show Reference Sphere* and *Show Axes* off |
| **GLL Wireframe Geometry** | GLL Geometry Viewer | *Show Faces* off — edges only |
| **GLL Rotating Geometry** | GLL Geometry Viewer | *Auto-Rotate* on |
| **GLL Documentation** | GLL Resources | *Show Data Files* off |
| **GLL Rigging Configuration** | GLL Configuration | *Show Filter Groups* and *Show Filter Details* off |
| **GLL Filter Configuration** | GLL Configuration | *Show Box Types*, *Show Frames*, *Show Rigging Limits*, *Show Rigging Warnings* and *Show Geometry Summary* off — filters only |

Like patterns, variations carry no file: you still select one after inserting.
