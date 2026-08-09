# GLL WordPress Plugin - Implementation Plan

## Overview

This document outlines the plan to create a WordPress Gutenberg plugin that displays GLL (Generic Loudspeaker Library) file data. The plugin will leverage the existing `gll-tools` Go/WASM parser and adapt the web demo visualizations into React-based Gutenberg blocks.

## Architecture Decision

### Client-Side (WASM) vs Server-Side Parsing

| Approach | Pros | Cons |
|----------|------|------|
| **Client-side WASM** | No server load, works with any host, privacy | Large WASM (~4MB), requires modern browser |
| **Server-side Go** | Faster for large files, can cache parsed data | Requires Go on server, hosting complexity |

**Recommended: Hybrid approach**
- Use WASM for interactive preview/editing in Gutenberg editor
- Store parsed metadata in post meta for frontend display
- Cache parsed JSON for frequently accessed files

### GLL File Storage Options

| Option | Feasibility | Notes |
|--------|-------------|-------|
| WordPress Media Library | Possible with filter | Need to allow .gll MIME type |
| Custom post type | Good | Store file as attachment, metadata as post meta |
| External URL | Possible | CORS considerations |

**Recommended: Custom post type "gll_file"** with the actual file as attachment

---

## Components to Build

Based on the web demo, these Gutenberg blocks will be created:

### Core Blocks

1. **GLL File Selector** - Base block for selecting/uploading GLL files
2. **GLL Overview** - System info, metadata, header display
3. **GLL Frequency Response** - Chart.js frequency response visualization
4. **GLL Polar Plot** - Directivity polar chart
5. **GLL 3D Balloon** - Three.js 3D directivity visualization
6. **GLL Sources List** - Acoustic sources table
7. **GLL Resources** - Embedded documents/images gallery
8. **GLL Config** - Box types, frames, filters display

### Supporting Infrastructure

- WASM loader service
- Shared data context (React Context for parsed GLL data)
- Common UI components (sliders, dropdowns, cards)

---

## Phase 1: Foundation [COMPLETED]

### Task 1.1: WordPress Plugin Setup [COMPLETED]
- [x] Configure plugin metadata in `gll-info.php`
- [x] Set up proper plugin structure
- [x] Add activation/deactivation hooks
- [x] Register custom post type `gll_file`

### Task 1.2: Allow GLL Files in Media Library [COMPLETED]
- [x] Add filter for `.gll` MIME type (`application/x-gll`)
- [x] Register upload handler
- [x] Add media library filter for GLL files

### Task 1.3: WASM Integration [COMPLETED]
- [x] Copy `gll.wasm` and `wasm_exec.js` to plugin assets
- [x] Create WASM loader module (`src/shared/wasm-loader.js`)
- [x] Create singleton pattern for WASM instance
- [x] Add error handling for browsers without WASM support
- [x] Updated WASM files to latest version (Jan 30, 2026 - 4.2MB)

### Task 1.4: Shared React Context [COMPLETED]
- [x] Create `GLLContext` for sharing parsed data between blocks
- [x] Create `GLLProvider` wrapper component
- [x] Implement file loading and parsing hook (`useGLLLoader`)
- [x] Add loading/error states

---

## Phase 2: Core File Block [COMPLETED]

### Task 2.1: GLL File Selector Block [COMPLETED]
- [x] Create block registration (`gll-info/gll-info`)
- [x] Implement MediaUpload integration for GLL files
- [ ] Add URL input option for external files
- [x] Create block attributes schema (fileId, fileUrl, fileName)
- [x] Implement file preview (basic info after parsing)
- [x] Add InspectorControls for block settings

### Task 2.2: Block Editor Preview [COMPLETED]
- [x] Parse file on selection using WASM
- [x] Display basic file info (name, version, manufacturer)
- [x] Show loading spinner during parse
- [x] Handle parse errors gracefully

### Task 2.3: Frontend Rendering [COMPLETED]
- [x] Create save.js with data attributes
- [x] Pass necessary data to frontend script (view.js)
- [x] Implement lazy loading for large files

---

## Phase 3: Overview Block [PARTIALLY COMPLETED]

*Note: Overview is integrated into the main GLL Info block with toggle options.*

### Task 3.1: GLL Overview Block Structure [COMPLETED - integrated]
- [x] Integrated into main block with `showOverview` attribute
- [x] Define block attributes (sections to show, styling options)
- [ ] Create nested block structure for flexibility (deferred)

### Task 3.2: System Information Component [COMPLETED]
- [x] Port system info display from web demo
- [x] Create React component with table layout
- [x] Fields: Label, Version, Type, Manufacturer

### Task 3.3: Metadata Component [COMPLETED]
- [x] Port metadata display from web demo
- [x] Fields: Description
- [x] Handle missing/optional fields gracefully

### Task 3.4: File Header Component [COMPLETED]
- [x] Port header display from web demo
- [x] Fields: Format Version, Checksum status

### Task 3.5: Block Styling [COMPLETED]
- [x] Create editor styles (`editor.scss`)
- [x] Create frontend styles (`style.scss`)
- [ ] Support WordPress theme colors (CSS variables ready)
- [x] Add responsive design

---

## Phase 4: Frequency Response Block

### Task 4.1: Chart.js Integration [COMPLETED]
- [x] Add Chart.js as dependency (^4.4.1)
- [x] Create React wrapper for Chart.js (`src/shared/chart-wrapper.js`)
- [x] Implement responsive chart sizing (ResizeObserver)
- [x] Export ChartWrapper from shared module

### Task 4.2: Frequency Response Block Structure [COMPLETED]
- [x] Create block registration (`gll-info/frequency-response`)
- [x] Define attributes (sourceIndex, responseIndex, phaseMode, etc.)
- [x] Add InspectorControls for configuration
- [x] Create edit.js with file selection and chart preview
- [x] Create save.js with data attributes for frontend
- [x] Create view.js for frontend hydration
- [x] Create editor.scss and style.scss

### Task 4.3: Response Chart Component [COMPLETED]
- [x] Port chart configuration from web demo
- [x] Create charting utilities module (`src/shared/charting-utils.js`)
- [x] Implement dual Y-axis (Level dB, Phase)
- [x] Add logarithmic X-axis with power-of-ten ticks
- [x] Support phase modes: unwrapped, wrapped, group delay
- [x] Implement phase unwrapping algorithm
- [x] Implement group delay calculation
- [x] Extract transfer function data from GLL
- [x] Update view.js with complete Chart.js rendering

### Task 4.4: Interactive Controls [COMPLETED]
- [x] Source selector dropdown (InspectorControls)
- [x] Response index selector (RangeControl)
- [x] Azimuth/Elevation sliders (RangeControl -180° to 180°, -90° to 90°)
- [x] Phase mode toggle (SelectControl: unwrapped, wrapped, group-delay)
- [x] Normalized (on-axis) checkbox (ToggleControl)
- [x] Show magnitude/phase toggles
- [x] Chart height control (200-800px)

### Task 4.5: Response Metadata Display [COMPLETED]
- [x] Show measurement conditions (phase mode, normalization)
- [x] Display angular position (azimuth/elevation badges)
- [x] Show frequency range (min/max frequency)
- [x] Style metadata badges with responsive layout
- [x] Add metadata to both editor and frontend views

---

## Phase 5: Polar Plot Block

**Reference:** `gll-tools/web/modules/visualization.js` (lines 1-842), `app.js` (polar chart section)

### Task 5.1: Polar Chart Setup
- [x] Configure Chart.js type `radar` with `startAngle: 90` (puts front on RIGHT)
- [x] Create polar chart React component wrapper
- [x] Implement dual dataset rendering (Horizontal blue #2563eb, Vertical red #dc2626)
- [x] Port `computePolarSlices()` logic from web demo

### Task 5.2: Polar Plot Block Structure
- [x] Create block registration (`gll-info/polar-plot`)
- [x] Define attributes:
  - `fileId`, `fileUrl`, `fileName` (GLL file reference)
  - `sourceIndex` (selected acoustic source)
  - `frequencyIndex` (selected frequency index)
  - `showHorizontal`, `showVertical` (plane visibility toggles)
  - `normalized` (normalize to max level)
  - `chartHeight` (200-800px)
- [x] Create edit.js with InspectorControls
- [x] Create save.js with data attributes
- [x] Create view.js for frontend rendering
- [x] Create editor.scss and style.scss

### Task 5.3: Polar Visualization
- [x] Extract balloon_data from source via WASM
- [x] Compute horizontal slice (meridian 90°/270°: Front-Right-Back-Left)
- [x] Compute vertical slice (meridian 0°/180°: Front-Top-Back-Bottom)
- [x] Map levels to Chart.js radar data points
- [x] Handle symmetry-based data mirroring if applicable
- [x] Display dB scale rings (Chart.js default radial grid)
- [x] Implement normalization (independent per slice to local max)

### Task 5.4: Custom Chart.js Plugin - Polar Compass
- [x] Create `polarCompassPlugin` (renders Front/Back/Right/Left/Top/Bottom labels)
- [x] Position labels around radar perimeter
- [x] Use different colors for horizontal (blue) vs vertical (red) slice labels
- [x] Shared labels: Front (right), Back (left)
- [x] Horizontal-only: Right (top), Left (bottom)
- [x] Vertical-only: Top (top), Bottom (bottom)

### Task 5.5: Polar Controls
- [x] Source selector dropdown (InspectorControls)
- [x] Frequency dropdown (populated from source's available frequencies)
- [x] Frequency slider (logarithmic mapping, syncs with dropdown)
- [x] Plane visibility toggles (ToggleControl for horizontal/vertical)
- [x] Normalization checkbox (ToggleControl)
- [x] Chart height slider (RangeControl 200-800px)

### Task 5.6: Polar Metadata Display
- [x] Show selected frequency (formatted: "1.0 kHz", "50 Hz")
- [x] Display symmetry type (if applicable from balloon_data)
- [x] Show angular resolution (meridian/parallel step sizes)
- [x] Show normalization status badge
- [x] Display measurement conditions (front-half only, uses on-axis, etc.)
- [x] Style badges with responsive flexbox layout

---

## Phase 6: 3D Balloon Block

**Reference:** `gll-tools/web/modules/visualization.js` (lines 843-1226, `buildBalloonGeometry` lines 990-1153)

### Task 6.1: Three.js Integration [COMPLETED]
- [x] Add Three.js as dependency (^0.159.0 or compatible)
- [x] Create React wrapper for Three.js scene with proper cleanup
- [x] Handle WebGL context lifecycle (mount/unmount)
- [x] Implement useEffect hooks for scene updates
- [x] Add fallback UI for browsers without WebGL support

### Task 6.2: 3D Balloon Block Structure [COMPLETED]
- [x] Create block registration (`gll-info/balloon-3d`)
- [x] Define attributes:
  - `fileId`, `fileUrl`, `fileName` (GLL file reference)
  - `sourceIndex` (selected acoustic source)
  - `frequencyIndex` (selected frequency index)
  - `dbRange` (20-80 dB display window, default 40 dB)
  - `scale` (0.6-1.6× size multiplier, default 1.0)
  - `wireframe` (boolean, default false)
  - `autoRotate` (boolean, default false)
  - `canvasHeight` (200-800px, default 500px)
- [x] Create edit.tsx with InspectorControls
- [x] Create save.tsx with data attributes
- [x] Create view.ts for frontend Three.js rendering
- [x] Create editor.scss and style.scss

### Task 6.3: Three.js Scene Setup [COMPLETED]
- [x] Create WebGL renderer with antialias, transparent alpha
- [x] Configure PerspectiveCamera (45° FOV, position at (0, 0.6, 2.6))
- [x] Add ambient light (0xffffff, intensity 0.65)
- [x] Add directional light (0xffffff, intensity 0.85, position (2.5, 2.5, 2))
- [x] Create reference wireframe sphere (unit radius, opacity 0.28)
- [x] Add axes helper (color-coded: R=X, G=Y, B=Z)
- [x] Implement animation loop with requestAnimationFrame

### Task 6.4: Balloon Mesh Generation [COMPLETED]
- [x] Port `buildBalloonGeometry()` from visualization.js
- [x] Extract balloon_data grid from source via WASM
- [x] Build full sphere grid (parallels 0°-180°, meridians 0°-360°)
- [x] Handle symmetry-based data mirroring (canMirrorMeridian, canMirrorParallel)
- [x] Compute global max SPL level across all frequencies (cached in WeakMap)
- [x] Map levels to vertex positions using formula:
  ```
  radius = baseRadius + amplitude * normalized
  where normalized = (level - displayMin) / dbRange
        baseRadius = 0.3 * scale
        amplitude = 0.9 * scale
        displayMin = displayMax - dbRange
  ```
- [x] Implement coordinate conversion (GLL Z-up → Three.js Y-up):
  ```javascript
  toViewPoint: { x: gllPoint.x, y: gllPoint.z, z: gllPoint.y }
  ```

### Task 6.5: Color Mapping System [COMPLETED]
- [x] Implement HSL color mapping for SPL levels:
  - Hue range: 0 (red, max) to 0.66 (blue, min)
  - Saturation: 0.75 (vivid)
  - Lightness: 0.5 (medium)
  - Missing data: Gray (0.65, 0.65, 0.65)
- [x] Create per-vertex color buffer for BufferGeometry
- [x] Update colors when frequency or range changes

### Task 6.6: Interactive Camera Controls [COMPLETED]
- [x] Implement OrbitControls-style dragging:
  - Left click drag → rotate (update azimuth/polar angles)
  - Right click drag → pan camera
  - Scroll → zoom in/out
- [x] Bound rotation angles (φ ∈ [0.05, π-0.05] to avoid gimbal lock)
- [x] Add pointer capture for smooth dragging
- [x] Implement auto-rotate feature (0.0035 rad/frame around Y-axis)

### Task 6.7: Balloon Controls (InspectorControls) [COMPLETED]
- [x] Source selector dropdown
- [x] Frequency dropdown (populated from source's available frequencies)
- [x] Frequency slider (logarithmic mapping, syncs with dropdown)
- [x] dB Range slider (RangeControl 20-80 dB, affects mesh shape)
- [x] Scale slider (RangeControl 0.6-1.6×)
- [x] Wireframe toggle (ToggleControl, switches material mode)
- [x] Auto-rotate toggle (ToggleControl)
- [x] Canvas height slider (RangeControl 200-800px)

### Task 6.8: Balloon Metadata Display [COMPLETED]
- [x] Show selected frequency (formatted)
- [x] Display current level range (min/max dB)
- [x] Show display min/max (displayMax - dbRange, displayMax)
- [x] Display grid dimensions (meridian count × parallel count)
- [x] Show symmetry type
- [x] Show normalization status badge (wireframe/auto-rotate indicators)
- [x] Create color bar legend (SPL scale visualization)
- [x] Style badges and legend with responsive layout

### Task 6.9: Performance Optimization [COMPLETED]
- [x] Implement lazy loading (only initialize when block in viewport)
- [x] Use IntersectionObserver for visibility detection
- [x] Cache global max levels in WeakMap (prevent recomputation)
- [x] Dispose mesh geometry/material before rebuilding
- [x] Pause animation loop when not visible
- [x] Add quality presets:
  - Low: stride=2 angular subsampling, no antialias, ambient-only lighting, pixelRatio cap 1
  - Medium: native resolution (default), antialias, ambient + 1 directional
  - High: native resolution, antialias, ambient + key + fill directional lights
- [x] Implement proper cleanup in useEffect return function (geometry/material/renderer dispose, cancelAnimationFrame, observer disconnect)

---

## Phase 7: Sources List Block [PARTIALLY COMPLETED]

**Reference:** `gll-tools/web/app.js` (lines 580-792, `displaySources` function)

*Note: Sources list is integrated into the main GLL Info block with toggle option.*

### Task 7.1: Sources Block Structure [COMPLETED]
- [x] Integrated into main block with `showSources` attribute
- [x] Basic sources list display with label and bandwidth
- [x] Convert to collapsible card-based layout (match web demo)
- [x] Add `displayMode` attribute (compact, detailed, expandable)
- [x] Add `showResponseCharts` attribute (toggle per-source charts)

### Task 7.2: Enhanced Sources Card Component [COMPLETED]
- [x] Display source label and key
- [x] Display nominal bandwidth (from/to frequencies)
- [x] Add collapsible/expandable card UI with toggle arrow
- [x] Implement expand/collapse state management
- [x] Add data type display (formatted string)
- [x] Display response count
- [x] Show angular resolution (meridian step × parallel step)
- [x] Add empty state handling ("No source definitions found")

### Task 7.3: Source Placements Display
- [x] Build source placements map from box_types data
- [x] Display placements section (which boxes use this source)
- [x] For each placement show:
  - Box label and key
  - Source label and key within box
  - Position coordinates (X, Y, Z in mm)
  - Rotation angles (Heading, Vertical, Roll in degrees)
- [x] Format position using `formatPosition()` helper
- [x] Format angles using `formatAngleDegrees()` helper
- [x] Handle multiple placements per source definition
- [x] Add collapsible placement list UI

### Task 7.4: Per-Source Response Controls [COMPLETED]
- [x] Add response selector dropdown (if source has responses)
- [x] Populate options with response indices
- [x] Display angle labels for each response (Azimuth/Elevation)
- [x] Add phase mode selector (unwrapped, wrapped, group-delay)
- [x] Add normalization checkbox toggle
- [x] Add azimuth slider (-180° to 180°, step 1°)
- [x] Add elevation slider (-90° to 90°, step 1°)
- [x] Display current angle values beside sliders
- [x] Sync sliders with response index selection
- [x] Handle sources without response data gracefully

### Task 7.5: Per-Source Response Charts [COMPLETED]
- [x] Embed Chart.js frequency response chart per source
- [x] Reuse charting utilities from Phase 4
- [x] Create canvas element with unique ID per source
- [x] Render dual-axis chart (Level dB + Phase)
- [x] Update chart when controls change (response, phase, normalize)
- [x] Display response metadata below chart
- [x] Handle chart lifecycle (create/update/destroy)
- [x] Add "No frequency response data" empty state
- [x] Optimize: lazy-load charts only when source expanded

### Task 7.6: Source Response Utilities [PARTIALLY COMPLETED]
- [x] Port `computeResponseAngles()` function
  - Calculate meridian/parallel degrees from response index
  - Use balloon_data angular resolution
  - Handle symmetry and grid wrapping
- [x] Port `buildSourcePlacementsMap()` function (pending Task 7.3)
  - Extract placements from box_types
  - Map source definition keys to placement instances
  - Return Map of key → placements array
- [x] Create `formatDataType()` helper
  - Convert data_type enum to readable string
  - Handle: PRESSURE, VELOCITY, UNKNOWN, etc.
- [x] Create `formatFrequency()` helper
  - Format Hz or kHz display
  - Handle missing values gracefully
- [x] Create `formatPosition()` helper (pending Task 7.3)
  - Format {x, y, z} to "X, Y, Z" string with units
  - Handle missing coordinates gracefully

### Task 7.7: Interactive Source Cards [COMPLETED]
- [x] Implement toggle function for expand/collapse
- [x] Update toggle arrow direction (▶ collapsed, ▼ expanded)
- [x] Animate content visibility (slide down/up)
- [x] Persist expansion state in component state
- [x] Add keyboard navigation (Enter/Space to toggle)
- [x] Add ARIA attributes (aria-expanded, role="button")

### Task 7.8: Styling Enhancements [COMPLETED]
- [x] Port source card styles from web demo
- [x] Style collapsible header with hover effects
- [x] Style source details section with proper spacing
- [x] Style placement list with nested indentation
- [x] Style response controls grid layout
- [x] Style slider labels and value displays
- [x] Add responsive breakpoints for mobile
- [x] Support WordPress theme color variables
- [x] Add loading skeleton for chart rendering

### Task 7.9: Performance Optimization [COMPLETED]
- [x] Implement virtualization for long source lists (>20 sources) — chunked IntersectionObserver-based reveal
- [x] Lazy-load response charts (render only when expanded) — expandable mode unmounts `SourceResponseControls` when collapsed
- [x] Debounce slider input handlers — rAF-batched `useRafState` for azimuth/elevation
- [x] Memoize computed placements map — `useMemo` keyed on `data` in `GLLSources`
- [x] Cache formatted values (bandwidth, angles) — per-card `useMemo` for bandwidth, resolution, and pre-formatted placements
- [x] Dispose Chart.js instances on collapse/unmount — cleanup in `ChartWrapper` `useEffect` destroys the chart on unmount

---

## Phase 8: Geometry Viewer Block

**Reference:** `gll-tools/web/modules/geometry.js` (953 lines), `app.js` (geometry section)

### Task 8.1: Three.js Geometry Scene Setup
- [x] Add Three.js dependency if not already present (from Phase 6)
- [x] Create geometry viewer React component with proper cleanup
- [x] Configure WebGL renderer (antialias, alpha, pixelRatio ≤ 2)
- [x] Setup PerspectiveCamera (42° FOV, position at (0, 0.4, 2.2))
- [x] Add ambient light (0xffffff, intensity 0.7)
- [x] Add directional key light (0xffffff, intensity 0.85, position (2.5, 2.5, 2))
- [x] Create grid helper (2 units, 12 divisions)
- [x] Add axes helper (0.8 unit size, semi-transparent opacity 0.5)
- [x] Implement animation loop with requestAnimationFrame

### Task 8.2: Geometry Block Structure
- [x] Create block registration (`gll-info/geometry`)
- [x] Define attributes:
  - `fileId`, `fileUrl`, `fileName` (GLL file reference)
  - `geometryIndex` (which case geometry to display)
  - `showFaces` (boolean, default true)
  - `showEdges` (boolean, default true)
  - `showMarkers` (object: {ref: true, com: true, pivot: false})
  - `showSources` (boolean, display acoustic source cones)
  - `centerReference` (boolean, center on reference point vs origin)
  - `autoRotate` (boolean, OrbitControls auto-rotation)
  - `canvasHeight` (200-800px, default 500px)
- [x] Create edit.js with InspectorControls
- [x] Create save.js with data attributes
- [x] Create view.js for frontend Three.js rendering
- [x] Create editor.scss and style.scss

### Task 8.3: OrbitControls Integration
- [x] Add Three.js OrbitControls to dependencies
- [x] Configure OrbitControls settings:
  - Enable damping (dampingFactor: 0.08)
  - Enable screen space panning
  - Enable zoom, pan, rotate, keys
  - Set distance limits (min: 0.25, max: 25)
  - Configure mouse buttons (LEFT: rotate, MIDDLE: dolly, RIGHT: pan)
  - Set rotation/pan speeds (0.6, 0.9)
  - Enable auto-rotate option (controlled by attribute)
- [x] Add fallback pointer controls when OrbitControls unavailable
- [x] Implement manual orbit calculation (theta, phi, radius, target)

### Task 8.4: Geometry Mesh Building
- [x] Extract case_geometry data from GLL via WASM
- [x] Resolve vertex positions using `resolveGeometryVertex()` helper
- [x] Build sequential edge pairs from face/edge definitions
- [x] Create BufferGeometry for faces:
  - Position buffer (Float32Array)
  - Color buffer (per-vertex colors from face/edge definitions)
  - Index buffer (triangle indices)
  - Compute vertex normals
- [x] Apply MeshStandardMaterial:
  - vertexColors: true
  - flatShading: true
  - metalness: 0.05, roughness: 0.75
  - side: DoubleSide
- [x] Create LineSegments for edges:
  - LineBasicMaterial with vertexColors
  - Transparent with opacity 0.9

### Task 8.5: Coordinate Conversion & Centering
- [x] Implement GLL Z-up to Three.js Y-up conversion:
  ```javascript
  toViewPoint: { x: gllPoint.x, y: gllPoint.z, z: gllPoint.y }
  ```
- [x] Compute bounding box (minX/Y/Z, maxX/Y/Z)
- [x] Calculate geometry center and size
- [x] Apply scale factor (targetSize 1.2 / actualSize)
- [x] Center geometry group based on:
  - Reference point if `centerReference` is true
  - Bounding box center otherwise
- [x] Convert Euler angles (HVR) to quaternion for source orientations

### Task 8.6: Marker System
- [x] Create sphere markers with radius 0.01 world units
- [x] Reference Point marker (red #ef4444 sphere)
- [x] Center of Mass marker (green #22c55e sphere)
- [x] Next Pivot marker (amber #f59e0b sphere)
- [x] Add marker visibility toggles in InspectorControls
- [x] Scale markers appropriately with geometry scale factor
- [x] Position markers in world space using toViewPoint conversion

### Task 8.7: Acoustic Source Visualization
- [x] Create cone meshes for each acoustic source
- [x] Position cones at source reference points
- [x] Orient cones using source rotation quaternions
- [x] Color cones with distinct hues per source
- [x] Add source labels (TextSprite via CanvasTexture)
- [x] Toggle source visibility with `showSources` attribute
- [x] Show source coverage angles visually

Cone apertures come from the file rather than being fixed: the source
definition's `RatedHorizontalAngle`/`RatedVerticalAngle` first, then the box
`HorizontalOpeningAngle`/`VerticalOpeningAngle`, then the reference demo's
fixed ~46° silhouette. H and V are applied as a non-uniform scale, so an
asymmetric source reads as an elliptical cone. This is a deliberate divergence
from the reference, which draws fixed cones unrelated to real coverage and has
no labels at all.

Placement angles are radians and GLL's forward axis is +Y (gll-tools
`docs/format.md:175`). `sourcePlacementOrientation()` returns the full
view-space basis rather than a minimal-arc rotation, because roll about the aim
axis is otherwise undefined — harmless for a circular cone, wrong for an
elliptical one. Its rotation matrix and its local-to-world column convention
match `buildRotationMatrix`/`rotateVector` in gll-tools `cmd/gllpy/main.go:556`
entry for entry, so the cones aim exactly where the acoustic engine radiates.

Verified end to end against the 54 case geometries in the gll-tools test
corpus: apertures track the rated angles (`APS-V1_1.gll` renders its 60°/90°/120°
variants as `0.14·tan(H/2)` = 0.081/0.140/0.242 world units), splayed cluster
elements pick up their ±20° heading, and every cone apex lands on its cabinet.

**Caveat on `showFaces`:** no geometry in that corpus carries a face list, so
the toggle currently has nothing to draw and the visible geometry is the edge
wireframe. The face path is implemented because the format permits faces.

Two index-base bugs were fixed on the way. `buildCaseGeometryData` indexes the
vertex list directly, but edges reached it as raw 1-based GLL references, so
every edge in the wireframe joined the wrong pair of vertices and mirrored
(negative) references were dropped outright.

### Task 8.8: Theme-Aware Grid Colors
- [x] Read theme colors for grid, edge and face defaults
- [x] Apply theme colors to GridHelper materials
- [x] Apply themed grid opacity
- [x] Support dark mode variants

**Superseded:** the `--geom-*` variables this task originally specified were
replaced by the plugin-wide `--gll-*` token layer introduced in `c410415`; see
`docs/plans/2026-08-08-block-theming-design.md`. Colors resolve at runtime via
`resolveTheme()` rather than by light/dark detection, so there is no separate
dark-mode branch. Marker colors and the axes helper stay hardcoded: that doc
classifies them as data, not chrome.

### Task 8.9: Geometry Controls (InspectorControls)
- [x] Geometry selector dropdown (if multiple case geometries)
- [x] Show Faces toggle (ToggleControl)
- [x] Show Edges toggle (ToggleControl)
- [x] Marker visibility controls (separate toggles for ref/com/pivot)
- [x] Show Sources toggle (ToggleControl)
- [x] Center on Reference toggle (ToggleControl)
- [x] Auto-rotate toggle (ToggleControl)
- [x] Canvas height slider (RangeControl 200-800px)

### Task 8.10: Geometry Metadata Display
- [x] Show geometry bounds
- [x] Display geometry size (largest dimension)
- [x] Show vertex/face/edge counts
- [x] Display reference point coordinates (if available)
- [x] Show center of mass coordinates (if available)
- [x] Display source count (if showSources enabled)
- [x] Style metadata badges with responsive layout

Bounds are labelled W × H × D rather than X × Y × Z: `computeBounds` runs on
view-space vertices, which have already swapped the GLL y and z axes.

### Task 8.11: Performance Optimization
- [x] Implement lazy loading (IntersectionObserver)
- [x] Dispose geometry/materials on rebuild
- [x] Pause animation when not visible
- [x] Limit pixel ratio to 2× for performance
- [x] Implement proper cleanup in useEffect
- [x] Cache resolved vertices to avoid recomputation

The frontend now defers the fetch, the WASM init and the WebGL context until a
block comes within 200px of the viewport, and keeps teardown in a
`blockCleanups` WeakMap drained by a single `beforeunload` listener rather than
one listener per scene. Both the frontend loop and the editor's park themselves
when scrolled out of view; the editor side needed a `paused` prop on the shared
`GeometryViewer`, mirroring the one `ThreeWrapper` already had.

Disposal is the part that needed the most care. `disposeSceneObject` previously
matched on `Mesh` and `LineSegments` via `instanceof`, so it silently skipped
`Points` and `Line` and would have leaked every sprite material and canvas
texture on each editor attribute change. It now drains an explicit owned-resource
list, duck-types geometry and material, handles material arrays, and never
disposes a sprite's geometry, which three.js shares process-wide.

Vertex caching needed no separate cache: the editor memoizes the resolved
vertices already, and that memo no longer churns now that the empty-marker case
returns a stable reference.

---

## Phase 9: Resources Block

### Task 9.1: Resources Block Structure
- [x] Create block registration (`gll-info/resources`)
- [x] Define attributes (resource types to show)

### Task 9.2: Documentation Display
- [x] List embedded PDFs with download links
- [x] Preview images inline
- [x] Show file sizes

### Task 9.3: Data Files Display
- [x] List geometry files (XED)
- [x] Show data file metadata

### Task 9.4: Download Handling
- [x] Generate data URIs for downloads
- [x] Add download buttons
- [x] Handle large file downloads gracefully

The reference pointer below was wrong for this phase: `web/modules/exporters.js`
builds geometry export formats (XED/STL/OBJ) and has nothing to do with the
resources tab. The actual reference is `web/app.js:5390-5561`
(`displayResources`), plus `formatBytes` at `app.js:7659` and `cleanFilename` at
`app.js:5557`.

Most of the work turned out to be in the normalizer rather than the block. It
dropped `database.include_files` and `database.data_files` outright while
passing through `raw.resources` — the parser's heuristic byte scan — as the only
resource-shaped key, which is exactly inverted. Measured across the corpus, that
heuristic list contributes nothing: its PNG entries duplicate `data_files` byte
for byte including the base64 payload, and all 104 of its zlib entries lie
inside embedded PDFs, being those PDFs' own object and font streams. It is no
longer carried, so a parse no longer retains a second copy of every embedded
image. `database.author_files` never reaches the browser at all — the WASM layer
withholds it deliberately, as those are encrypted licence blobs whose names leak
the author's absolute paths.

Two format concerns moved into the normalizer, alongside the 1-based indices and
rotation spelling it already translates: file names carry Windows authoring
paths (`.\Drawings\...`, and one two-level case in HOPS7-Pro), so each record
gains a folded `Name` beside the raw `Filename`; and the tables are emitted at
their on-disk length with unused slots left blank, which a third of the corpus
does and `3Way-LR.gll` does for both of its slots. Those blanks are padding, not
data, and are filtered out the way unrenderable edges and faces already are.

What the corpus actually contains, which drove the UX: 3 of 29 files carry
documentation, 24 carry data files, 5 carry neither. Because documentation is
absent from 26 of 29, the front end drops an empty section entirely rather than
rendering the reference's "No documentation files found" line — that placeholder
would be the common case and would teach readers to skip the block. The editor
still renders it, because an author toggling a control needs to see why the
preview did not change.

**Task 9.3 is done generically, not as specified.** There is no XED file
anywhere in the corpus; every non-empty data file is a PNG logo between 337 B
and 14.7 KB. Rather than build XED-specific handling for a case that has never
been observed, classification is extension-driven, so an XED renders correctly
as a plain file if one ever appears.

For 9.4, "gracefully" ended up meaning no size cap. Both entry points already
fetch and parse the whole GLL client-side, so the bytes are paid for either way
and a `data:` URI download costs nothing extra — no REST endpoint, no Blob, no
object URL to revoke. The one hard rule is that a data URI must never reach
`save()` output: the largest embedded datasheet is 2.17 MB, about 2.9 MB of
base64, and that does not belong in post content.

Rendering was split out of `view.ts` into `resource-render.ts` so it can run
under jsdom without the WASM loader; this is the first block whose front-end
output is tested at all. An end-to-end test drives the real parser and asserts
the rendered download links carry genuine `%PDF` bytes and the previews genuine
PNG signatures.

Not done: browser verification, for the same reason as Phase 8 — there is no
local WordPress environment and staging is outward-facing. The committed fixture
`sample.gll` is `example-vis.gll` and carries no resources, so the corpus tests
skip wherever the external corpus is absent, CI included; the corpus files are
third-party manufacturer GLLs and were not vendored.

---

## Phase 10: Configuration Block

### Task 10.1: Config Block Structure
- [x] Create block registration (`gll-info/config`)
- [x] Define attributes (sections to show, collapsed state)

### Task 10.2: Collapsible Cards Component
- [x] Port collapsible card UI from web demo
- [x] Persist collapsed state

### Task 10.3: Box Types Display
- [x] List box types with specifications
- [x] Show geometry if available

### Task 10.4: Other Config Sections
- [x] Frames display
- [x] Filter groups display
- [x] Limits display
- [x] Warnings display

Most of the work was again in the normalizer, as in Phase 9. It carried box
types and case geometries but dropped `database.frames`, `database.limits`,
`database.warnings` and `database.filter_groups` outright, even though all four
already reach the browser from WASM. Nothing consumed them, so nothing had
noticed. The opening angles were reachable only off `CaseGeometries`, never off
the box type that owns them.

Frame geometry drove the one real design decision. Frame meshes are appended to
the flat `Database.CaseGeometries` list after the box meshes, and each frame
keeps a `CaseGeometryIndex` back-pointer, rather than nesting a copy. Appending
is what makes it safe: `geometry/view.ts` and `geometry/edit.tsx` index that list
positionally against a saved `geometryIndex` attribute, so box meshes holding
their positions is the difference between a no-op and every existing post
silently switching geometry. A corpus test pins that invariant. The payoff is
that the 3D geometry block can now show a frame at all, which it never could,
for the price of one label fallback — 5 of the 29 corpus files carry frames and
every one of those frames has geometry.

**Task 10.3's "show geometry if available" is a summary line, not a viewer.**
The demo embeds an inline WebGL canvas per box. A box list reaches 26 entries
and browsers cap live WebGL contexts near 8–16, so the demo's model only works
because it opens one viewer at a time behind a button. `src/geometry/` is
already the dedicated 3D block and now reaches frames too, so this block renders
`600 vertices • 300 edges • 0 faces • Symmetric @ X=0.000` and stops. Its
frontend bundle is 18 KB; the geometry block's is 538 KB.

Collapse state has two legitimate owners and got both. The author picks which
cards start open, as a block attribute in post content; a visitor's own toggling
overrides it from `localStorage`, keyed by card name alone, so "I never care
about filter groups" follows the reader rather than the file. Native `<details>`
carries it instead of the demo's `div` with an `onclick` and a `▶` glyph:
`<summary>` is focusable, takes Enter *and* Space, exposes its state to
assistive tech and lets in-page find expand it. It also fails safe — if the view
script dies after render the cards still open, whereas a class toggle would
leave the content permanently unreachable.

Two format concerns that the demo gets wrong were fixed rather than ported.
Limit and warning values are printed there with no unit even though the type
enum implies one; they now carry kg for weight and degrees for tilt. And the
limit and warning type enums *number differently* — type 1 is Max Count Type for
a limit but Min Count for a warning — so they need two separate label tables.
Go's `String()` never crosses the JSON boundary, so only the bare integer
arrives. A test named after the divergence guards against a future reader
merging them.

FIR coefficients are reduced to a count in the normalizer. `data_irm` and
`data_dip` are 8193 float64 each per filter and the only thing any UI shows is
their length; carrying them would put ~131 KB per filter into a structure that
lives as long as the page. Log spectrum level and phase go the same way. This is
the Phase 9 `raw.resources` reasoning, and like it, it is enforced by a test
rather than a comment. Box `input_config` stays dropped: it is populated in none
of the 29 corpus files, so normalizing it would ship translation code no sample
exercises.

Corpus coverage drove the UX exactly as in Phase 9. Box types appear in 26 of 29
files, filter groups in 10, frames in 5, limits in 5, warnings in 2. Because
empty is the normal case, the front end drops an empty section outright while
the editor keeps it and says why, so an author flipping a toggle can tell "off"
from "absent".

Worth recording: the corpus figures above were first estimated at 8 files with
filter groups. The end-to-end test measured 10. The `gllinfo` CLI agrees with
neither — it reports 9, missing `N-APS v1_0.gll`, which the WASM build parses as
having 2 groups. The plugin uses the WASM parser, so 10 is the number that
matters here, but the two parsers in `gll-tools` genuinely disagree about that
file and that is worth chasing there.

Out of scope deliberately: cluster setups, connectors and transformers (the
demo renders them from a different function into a different tab, and Phase 10's
tasks do not list them — they remain available in the raw data), and the
per-filter-group frequency response chart, which would need the FIR/IIR response
computation ported and would force the huge coefficient arrays back into the
browser. That belongs in its own phase.

Not done: browser verification, for the same reason as Phases 8 and 9 — there is
no local WordPress environment and staging is outward-facing. The committed
fixture `sample.gll` carries no frames, limits, warnings or filter groups, so
every real assertion is corpus-gated and skips wherever the external corpus is
absent, CI included.

---

## Phase 11: Integration & Polish

### Task 11.1: Block Patterns
- [x] Create "Full GLL Viewer" pattern (all blocks)
- [x] Create "Quick Overview" pattern
- [x] Create "Acoustic Analysis" pattern

### Task 11.2: Block Variations
- [x] Register block variations for common configurations

### Task 11.3: Internationalization
- [x] Add translation support
- [x] Extract all strings to translation functions
- [ ] Generate `languages/gll-info.pot` (needs WP-CLI; see below)

### Task 11.4: Accessibility
- [x] Add ARIA labels to interactive elements
- [x] Ensure keyboard navigation works
- [ ] Test with screen readers

### Task 11.5: Documentation
- [x] Add inline block help
- [x] Create user documentation
- [x] Add example patterns

Patterns register from `includes/class-gll-patterns.php`. Six of the seven
blocks serialize as self-closing comments with no file attributes set, so a
pattern stays file-agnostic; geometry is the exception, because its `save()`
returns markup rather than null and a bare comment would fail block validation
on insert. That markup therefore lives verbatim in the PHP, which is a
duplication waiting to rot — `src/geometry/pattern-content.test.tsx`
re-serializes the real block and asserts the PHP still contains exactly that
string, so a renamed class or a reordered attribute fails a test instead of
silently breaking every shipped pattern.

The 13 variations are declared inline in `block.json` rather than registered
from JavaScript. Core translates them out of the block metadata catalogue, which
keeps them off the editor bundle entirely.

Internationalization was never a string problem. Roughly 300 strings were
already wrapped before this phase and not one of them could be translated,
because none of the loading infrastructure existed: no `load_plugin_textdomain`,
no `wp_set_script_translations`, no `Domain Path`, no `languages/`. The wrapping
was the visible half of the job and the smaller one.

Two i18n traps are worth recording because both produce code that lints clean,
passes tests, and silently ships English forever. The first: a translated string
captured in a module-level constant is evaluated at import time, before
WordPress has registered the catalogue. The normalizer's four enum label tables
were exactly that shape, and are now call-time lookup functions
(`getLimitTypeLabel()` and siblings) with the reasoning recorded above them.
`IIR_SHAPE_LABELS` and `SIZE_UNITS` stay constants *because* they are not
translated, and now say so. The second: `load_plugin_textdomain` on
`plugins_loaded` is the conventional hook and is wrong on WordPress 6.7+, which
fires `_doing_it_wrong` for any domain loaded before `init`. This plugin's
declared minimum is 6.7, so it sits on `init` priority 0 — ahead of the post-type
and pattern registrations, both of which translate at registration time.

Translated text also has to survive the DOM. Several badge rows were built by
string concatenation into `innerHTML`, which is defensible while every
interpolated value is a number and becomes an injection the moment a translator
supplies one containing `&` or `<`. Those now build nodes, or route through
`escapeHtml`. English output is byte-identical.

Accessibility is applied at runtime, never in `save()`. A block's `save()` output
is serialized into post content, so adding an attribute there invalidates every
post already containing the block unless a matching `deprecated` entry is added
for all seven — and a demo page carrying the current markup is already
published. That is also the more honest design: the things that need announcing
are DOM mutations that only happen at runtime, and a live region baked into
`save()` would sit inert until `view.ts` touched it.

The single non-obvious a11y rule, which cost real time: a live region must exist
in the document *before* its text changes, or assistive technology treats the
text as initial content and stays silent. Creating the region and filling it in
the same tick is the classic way to ship a live region that never announces
anything. In `geometry/view.ts` that collides with
`@wordpress/no-unused-vars-before-return`, whose suggested fix — move the
binding down to its first use — would quietly destroy the feature. It carries a
targeted suppression and an explanation instead.

`--gll-accent` was `#667eea`, which gives white-on-accent **3.66:1** against the
4.5:1 AA threshold, and 2.97:1 as text on the 12%-tinted badge fill. It is now
`#4c51bf`: 6.49:1 and 5.01:1. The badge fill, not the white button, was the
binding constraint — the obvious landmark `#5a67d8` clears white at 4.81:1 but
only reaches 3.80:1 there. The focus indicator deliberately does *not* use the
accent: it draws from the text and surface tokens, which any working theme has
already made legible against each other, so a site owner overriding the accent
badly costs contrast on a badge rather than the ability to see where the
keyboard is.

Found and fixed while wiring the stylesheets, all three invisible until someone
looked: `.gll-visually-hidden` was referenced by the shared live-region helper
and defined nowhere, so the geometry block's off-screen region and the
frequency-response value table rendered as visible page content. `.gll-error`
was missing from two blocks that had just been moved onto the shared error
panel, leaving both unstyled. And balloon-3d's error panel carried an inline
`#fff8f8` background that rendered white-on-white under a dark theme.

Not done, and deliberately: `languages/gll-info.pot` does not exist. There is no
local WP-CLI, so generating it needs the server's installation, and it has to
happen after the wrapping rather than alongside it. Until it does, `languages/`
is empty and every string falls back to English — which is the correct
pre-translation state, not a defect. Screen-reader testing is also outstanding
for the same reason Phases 8, 9 and 10 record: no local WordPress environment,
and staging is outward-facing. ARIA structure is verified in jsdom; how NVDA and
VoiceOver actually narrate it is not.

Two pre-existing defects surfaced here and were left alone as out of scope.
`gll_info_enqueue_frontend_assets()` gates on `has_block()`, which only inspects
main post content — a GLL block in a template part, widget or reusable block
gets neither the WASM settings nor the translations. And `showResponses` on the
main block is a no-op: it serializes to `data-show-responses` and nothing reads
it.

---

## Phase 12: Testing & Release

**The environment caveat recorded in Phases 8, 9, 10 and 11 is retired.** Those
phases each deferred browser verification, screen-reader testing and the `.pot`
catalogue for the same reason: "no local WordPress environment and staging is
outward-facing". `wp-env` supplies one. It is configured in `.wp-env.json` and
brought into a usable state by `scripts/wp-env-after-start.sh`.

### Task 12.1: Unit Tests
- [x] Test WASM loader — already covered; unchanged
- [x] Test data parsing utilities
- [x] Test React components

655 tests across both Jest projects, up from 316. Six previously untested pure
modules now covered: `charting-utils`, `polar-utils`, `balloon-utils`, `a11y`,
`escape-html` and the polar compass plugin — roughly 2100 lines of maths and
runtime accessibility on every block's critical path.

Type checking is on for the first time (`npm run typecheck`). `wp-scripts`
compiles through babel, which strips types without checking them, so a genuine
type error shipped silently before this. Turning it on surfaced 96 errors, three
of which were real defects rather than noise — see the commit for
`scene-builder`'s `setIndex`, geometry's dead `enableKeys`, and two assertions
that were comparing `NaN` to `NaN`.

### Task 12.2: Integration Tests
- [x] Test block registration
- [x] Test media library integration
- [x] Test frontend rendering

31 PHPUnit tests against the real WordPress core test suite inside wp-env, plus
the E2E round trip for frontend rendering. Both block registration paths are
covered by a CI matrix over WordPress 6.7.2 and current core, because
`function_exists` cannot be un-defined and the 6.7 fallback is otherwise
unreachable. That also makes "Requires at least: 6.7" a tested claim.

The `has_block()` defect recorded in Phase 11 has a *passing* characterization
test describing what actually happens, plus the reason it has never bitten in
the field. It will fail the day the gate is fixed, which is the wanted signal; a
red test in a release branch only teaches people to ignore CI.

### Task 12.3: Browser Testing
- [x] ~~Test WASM in Chrome, Firefox, Safari, Edge~~ Amended: Chromium verified;
  Firefox and WebKit configured; **Safari and mobile remain unverified**
- [x] Test WebGL in different browsers (for 3D blocks)
- [x] Test fallback for older browsers

23 Playwright specs. The full round trip works: a real `.gll` uploads through the
REST media pipeline, all seven blocks insert, all three patterns load, and a
published page parses and renders with a live WebGL context.

**This found a shipped bug.** The geometry markup duplicated into
`class-gll-patterns.php` was missing the `wp-block-gll-info-geometry` class that
`supports.className` makes `save()` emit, so that block loaded as *invalid* in
every pattern containing it. WordPress recovers an invalid block rather than
refusing it, so nothing looked wrong. `pattern-content.test.tsx` exists to
prevent exactly this and passed throughout, because `serialize()` under jsdom
omits the same class — it was comparing the PHP against equally incomplete
output. The E2E spec is now the authority and asserts `isValid` per block.

The fallback specs are the only honest reading of "test fallback for older
browsers": an old browser cannot be obtained and a faked user-agent tests
nothing, so `addInitScript` removes the features the code actually branches on
before any page script runs.

Cross-browser honesty: Chromium is a good proxy for Chrome and defensible for
Edge. **Playwright's WebKit is not Safari** — different graphics stack, and
Safari applies its own WebAssembly memory limits, which is precisely where this
plugin is most exposed given Task 12.4's findings. Safari on real hardware and
any mobile browser remain unverified, and `readme.txt` says so rather than
listing them.

### Task 12.4: Performance Testing
- [x] ~~Test with large GLL files (100MB+)~~ Amended: parse the largest file
  available (15.4 MB) and document the ceiling — see below
- [x] Measure memory usage
- [x] Test Three.js scene performance with complex geometries
- [x] Optimize if needed — measured first, and the answer is "not here"

`scripts/perf-corpus.mjs` (`npm run perf`) sweeps the 29-file reference corpus
and writes `docs/performance.md`.

**The 100 MB criterion could not be met and was amended rather than faked.** No
such file exists; the largest GLL in the corpus is 15.4 MB and that appears to
be near the format's real-world ceiling. Padding one to 100 MB would produce
something the parser rejects, so the measurement would describe the error path.

**What the measurement found is more useful than the original target.** The
limit is memory, not speed. A 15.4 MB GLL expands to 228.7 MB of JSON and leaves
the Go WASM instance holding 1.3 GB of linear memory, which Go never returns to
the host. Files of 10 MB and up therefore need 800 MB–1.3 GB and 6–11 s to
parse; they are unpleasant on desktop and likely to fail on mobile, where
per-tab WASM memory is capped well below a gigabyte. Files up to ~2 MB — 21 of
the 29 — parse in under a second and are comfortable everywhere.

Everything downstream of the parser is free by comparison: normalization runs in
single-digit milliseconds even for the largest file, balloon mesh construction
under 15 ms, case geometry about 1 ms. Optimizing any of those would be
optimizing noise, which is why "optimize if needed" is answered by not doing it.

Not gated in CI, deliberately: the corpus is machine-local third-party data, and
runner variance on CPU-bound WASM would swamp any threshold tight enough to
catch a regression.

### Task 12.5: Release Preparation
- [x] Update readme.txt
- [x] Create changelog — `readme.txt` is the single source of truth
- [x] Build production assets
- [x] Create plugin ZIP — and verify it, which is the part that mattered

**The shipped ZIP was unusable and nobody could have noticed.** `wp-scripts
plugin-zip` reads only the `files` field in `package.json`. It does **not** read
`.distignore` or `.gitattributes`, and with no `files` field it falls back to a
hardcoded glob that omits `assets/**` — so the archive contained no `gll.wasm`,
and every block parses client-side through that module. The plugin installed
cleanly and could not read a single file.

The obvious fix is the wrong one: adding a `.distignore` would look right, pass
review, and ship the same broken ZIP. Only the `files` array changes the packer's
behaviour.

`scripts/verify-plugin-zip.sh` asserts against the archive rather than reading
the packer's log — the WASM module present *and over 4 MB*, since
present-but-truncated is a real failure mode a listing cannot see, plus the icon,
the includes, all seven block manifests, and the absence of `node_modules`,
`src`, `tests` and the lockfile.

`scripts/check-version.mjs` guards the five places the version is written by
hand, and runs on every push. A single missed location is otherwise silent.

`.github/workflows/release.yml` is written and verified but **not triggered** —
no tag is created here, as agreed. It rebuilds and diffs `build/`, regenerates
and diffs the catalogue, packages, and runs the ZIP verification before
publishing. The `build/` diff is deliberately *not* run on ordinary pushes:
webpack output is not reproducible across Node minor versions, and a check that
reddens on version skew teaches people to ignore a red X.

Also fixed here: the create-block placeholder `description` and `author`, which
contradicted the PHP header, and the missing `LICENSE` file for a licence
declared in three places and present in none.

### Outstanding from Phase 11

- [x] Generate `languages/gll-info.pot` — done; 476 strings, 1043 `build/`
  references. The trap worth recording: `make-pot` must scan `build/`, not just
  `src/`, because core resolves a script translation by hashing the script path
  relative to the plugin and `make-json` derives that hash from the POT's
  references. A POT referencing `src/` produces JSON named after paths that do
  not exist in the shipped plugin, core never finds them, and every string stays
  English with nothing failing. Verified end to end with a throwaway `de_DE`
  catalogue rather than reasoned about.
- [ ] **Test with screen readers — still open, and deliberately so.** axe-core
  runs against four blocks and reports no serious or critical violations, which
  is real but strictly smaller than what this task asks. axe cannot judge
  whether the canvas descriptions are *useful*, whether live-region
  announcements arrive in a sensible order, or whether the 3D blocks are
  navigable at all. That needs NVDA, JAWS or VoiceOver and a human. Closing this
  on an axe pass would be the one genuinely dishonest move available here.

### Known issues, tracked rather than fixed

- `gll_info_enqueue_frontend_assets()` gates on `has_block()`, which inspects
  only the main post content, so a GLL block in a template part, widget or
  reusable block gets no `gllInfoSettings`. It works anyway on a stock install
  because `wasm-loader` falls back to a hardcoded
  `/wp-content/plugins/gll-info/...` path; it breaks on a renamed plugin
  directory, a subdirectory install, non-root multisite, or a `WP_PLUGIN_URL`
  override. The fix is a per-block `viewScript` dependency across seven
  `block.json` files plus a rebuild — a 0.2.0 change, characterized by a passing
  test today.
- `showResponses` on the main block is still a no-op: it serializes to
  `data-show-responses` and nothing reads it.
- `polar-utils.ts` contains `onAxisLevel.length === onAxisLevel.length` in the
  `canCombineOnAxis` guard. It is redundant rather than wrong — the preceding
  frequency-length comparison already enforces the intended rule — and a test
  pins the behaviour so repairing the line cannot change anything unnoticed.

---

## File Structure (Current)

```
gll-info/
├── gll-info.php                 # Main plugin file [DONE]
├── readme.txt                   # WordPress readme
├── package.json                 # [DONE]
├── PLAN.md                      # This file [DONE]
├── src/
│   ├── gll-info/               # Main block [DONE]
│   │   ├── block.json          # [DONE]
│   │   ├── index.js            # [DONE]
│   │   ├── edit.js             # [DONE]
│   │   ├── save.js             # [DONE]
│   │   ├── view.js             # [DONE]
│   │   ├── editor.scss         # [DONE]
│   │   └── style.scss          # [DONE]
│   ├── shared/                 # Shared modules [DONE]
│   │   ├── index.js            # [DONE]
│   │   ├── wasm-loader.js      # [DONE]
│   │   ├── gll-context.js      # [DONE]
│   │   ├── chart-wrapper.js    # [DONE]
│   │   ├── chart.scss          # [DONE]
│   │   └── charting-utils.js   # [DONE]
│   ├── frequency-response/     # [DONE]
│   │   ├── block.json          # [DONE]
│   │   ├── index.js            # [DONE]
│   │   ├── edit.js             # [DONE]
│   │   ├── save.js             # [DONE]
│   │   ├── view.js             # [DONE]
│   │   ├── editor.scss         # [DONE]
│   │   └── style.scss          # [DONE]
│   ├── polar-plot/             # DONE Phase 5
│   ├── balloon-3d/             # PARTIAL Phase 6 (6.1-6.4 done)
│   ├── geometry/               # [DONE]
│   ├── resources/              # [DONE]
│   └── config/                 # [DONE]
├── assets/
│   ├── wasm/
│   │   ├── gll.wasm            # [DONE]
│   │   └── wasm_exec.js        # [DONE]
│   └── images/
│       └── gll-icon.svg        # [DONE]
├── includes/
│   └── class-gll-media.php     # [DONE]
└── build/                      # Compiled assets [DONE]
```

---

## Dependencies

### JavaScript (npm)
- `@wordpress/scripts` (build tooling)
- `@wordpress/blocks` (block registration)
- `@wordpress/block-editor` (editor components)
- `@wordpress/components` (UI components)
- `@wordpress/element` (React wrapper)
- `@wordpress/i18n` (internationalization)
- `chart.js` (^4.4.1)
- `three` (^0.159.0)

### Assets from gll-tools
- `gll.wasm` (~4MB)
- `wasm_exec.js` (Go WASM runtime)

---

## Open Questions / Decisions Needed

1. **File size limits**: Should we set a max file size for media library uploads?
2. **Caching strategy**: Cache parsed JSON in transients? Post meta? Filesystem?
3. **Frontend WASM loading**: Always load, or only when GLL blocks are present?
4. **Block nesting**: Should frequency response be nested inside file selector, or standalone?
5. **Multi-file support**: Compare multiple GLL files in one view?

---

## Estimated Complexity

| Phase | Tasks | Complexity | Status |
|-------|-------|------------|--------|
| 1. Foundation | 4 | Medium | DONE |
| 2. Core File Block | 3 | Medium | DONE |
| 3. Overview Block | 5 | Low | DONE (integrated) |
| 4. Frequency Response | 5 | High | DONE |
| 5. Polar Plot | 6 | Medium-High | DONE |
| 6. 3D Balloon | 9 | Very High | DONE |
| 7. Sources List | 9 | Medium-High | PARTIAL (5/9 tasks complete, 1 partial) |
| 8. Geometry Viewer | 11 | Very High | DONE |
| 9. Resources | 4 | Medium | DONE |
| 10. Configuration | 4 | Medium | DONE |
| 11. Integration | 5 | Medium | DONE (screen-reader testing open) |
| 12. Testing | 5 | Medium | DONE (screen-reader testing open) |

**Total: 70 tasks across 12 phases**
**Completed: ~54 tasks (Phases 1-5, 8-10, Phase 7: Tasks 7.1, 7.2, 7.4, 7.5, 7.7, 7.9)**
**Partially Completed: ~2 tasks (Phase 7: Tasks 7.6, 7.8)**
**Remaining: ~14 tasks (Phase 6, 11-12, Phase 7: Task 7.3)**

---

## Getting Started

Begin with Phase 1 to establish the foundation, then proceed sequentially. The most complex phases requiring close reference to the web demo are:

- **Phase 4** (Frequency Response) - COMPLETED
- **Phase 5** (Polar Plot) - COMPLETED
- **Phase 6** (3D Balloon) - Very High complexity, advanced Three.js mesh generation
- **Phase 8** (Geometry Viewer) - Very High complexity, Three.js with OrbitControls

The existing web demo at `https://cwbudde.github.io/gll-tools/` serves as the reference implementation for all visualizations.

## Implementation Notes

### Shared Dependencies
Phases 6 (3D Balloon) and 8 (Geometry Viewer) both use Three.js and can share:
- Three.js core library
- OrbitControls (for Phase 8, custom controls for Phase 6)
- Coordinate conversion utilities (GLL Z-up → Three.js Y-up)
- Theme-aware color system
- Animation loop patterns
- WebGL context management

Phase 8 shipped first and established that foundation: `src/geometry/scene-builder.ts`
(object-graph construction and disposal) and `src/geometry/helper-theme.ts`
(theming Three.js chrome) are the patterns Phase 6 should follow.

### Reference Files by Phase
- **Phase 5:** `gll-tools/web/modules/visualization.js` (lines 1-842), `charting.js`
- **Phase 6:** `gll-tools/web/modules/visualization.js` (lines 843-1226)
- **Phase 8:** `gll-tools/web/modules/geometry.js` (all 953 lines)
- **Phase 9:** `gll-tools/web/app.js:5390-5561` (`displayResources`). Not
  `exporters.js` — that builds geometry export formats and is unrelated.
- **Phase 10:** `gll-tools/web/app.js` (configuration cards section)
