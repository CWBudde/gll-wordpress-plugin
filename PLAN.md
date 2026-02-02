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
- [ ] Source selector dropdown (InspectorControls)
- [ ] Frequency dropdown (populated from source's available frequencies)
- [ ] Frequency slider (logarithmic mapping, syncs with dropdown)
- [ ] Plane visibility toggles (ToggleControl for horizontal/vertical)
- [ ] Normalization checkbox (ToggleControl)
- [ ] Chart height slider (RangeControl 200-800px)

### Task 5.6: Polar Metadata Display
- [ ] Show selected frequency (formatted: "1.0 kHz", "50 Hz")
- [ ] Display symmetry type (if applicable from balloon_data)
- [ ] Show angular resolution (meridian/parallel step sizes)
- [ ] Show normalization status badge
- [ ] Display measurement conditions (front-half only, uses on-axis, etc.)
- [ ] Style badges with responsive flexbox layout

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

### Task 6.3: Three.js Scene Setup
- [ ] Create WebGL renderer with antialias, transparent alpha
- [ ] Configure PerspectiveCamera (45° FOV, position at (0, 0.6, 2.6))
- [ ] Add ambient light (0xffffff, intensity 0.65)
- [ ] Add directional light (0xffffff, intensity 0.85, position (2.5, 2.5, 2))
- [ ] Create reference wireframe sphere (unit radius, opacity 0.28)
- [ ] Add axes helper (color-coded: R=X, G=Y, B=Z)
- [ ] Implement animation loop with requestAnimationFrame

### Task 6.4: Balloon Mesh Generation
- [ ] Port `buildBalloonGeometry()` from visualization.js
- [ ] Extract balloon_data grid from source via WASM
- [ ] Build full sphere grid (parallels 0°-180°, meridians 0°-360°)
- [ ] Handle symmetry-based data mirroring (canMirrorMeridian, canMirrorParallel)
- [ ] Compute global max SPL level across all frequencies (cached in WeakMap)
- [ ] Map levels to vertex positions using formula:
  ```
  radius = baseRadius + amplitude * normalized
  where normalized = (level - displayMin) / dbRange
        baseRadius = 0.3 * scale
        amplitude = 0.9 * scale
        displayMin = displayMax - dbRange
  ```
- [ ] Implement coordinate conversion (GLL Z-up → Three.js Y-up):
  ```javascript
  toViewPoint: { x: gllPoint.x, y: gllPoint.z, z: gllPoint.y }
  ```

### Task 6.5: Color Mapping System
- [ ] Implement HSL color mapping for SPL levels:
  - Hue range: 0 (red, max) to 0.66 (blue, min)
  - Saturation: 0.75 (vivid)
  - Lightness: 0.5 (medium)
  - Missing data: Gray (0.65, 0.65, 0.65)
- [ ] Create per-vertex color buffer for BufferGeometry
- [ ] Update colors when frequency or range changes

### Task 6.6: Interactive Camera Controls
- [ ] Implement OrbitControls-style dragging:
  - Left click drag → rotate (update azimuth/polar angles)
  - Right click drag → pan camera
  - Scroll → zoom in/out
- [ ] Bound rotation angles (φ ∈ [0.05, π-0.05] to avoid gimbal lock)
- [ ] Add pointer capture for smooth dragging
- [ ] Implement auto-rotate feature (0.0035 rad/frame around Y-axis)

### Task 6.7: Balloon Controls (InspectorControls)
- [ ] Source selector dropdown
- [ ] Frequency dropdown (populated from source's available frequencies)
- [ ] Frequency slider (logarithmic mapping, syncs with dropdown)
- [ ] dB Range slider (RangeControl 20-80 dB, affects mesh shape)
- [ ] Scale slider (RangeControl 0.6-1.6×)
- [ ] Wireframe toggle (ToggleControl, switches material mode)
- [ ] Auto-rotate toggle (ToggleControl)
- [ ] Canvas height slider (RangeControl 200-800px)

### Task 6.8: Balloon Metadata Display
- [ ] Show selected frequency (formatted)
- [ ] Display current level range (min/max dB)
- [ ] Show display min/max (displayMax - dbRange, displayMax)
- [ ] Display grid dimensions (meridian count × parallel count)
- [ ] Show symmetry type
- [ ] Show normalization status badge
- [ ] Create color bar legend (SPL scale visualization)
- [ ] Style badges and legend with responsive layout

### Task 6.9: Performance Optimization
- [ ] Implement lazy loading (only initialize when block in viewport)
- [ ] Use IntersectionObserver for visibility detection
- [ ] Cache global max levels in WeakMap (prevent recomputation)
- [ ] Dispose mesh geometry/material before rebuilding
- [ ] Pause animation loop when not visible
- [ ] Add quality presets:
  - Low: 10° angular resolution, simple shading
  - Medium: 5° angular resolution (default)
  - High: 2.5° angular resolution, enhanced lighting
- [ ] Implement proper cleanup in useEffect return function:
  ```javascript
  return () => {
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    cancelAnimationFrame(animationId);
  }
  ```

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

### Task 7.4: Per-Source Response Controls [NEW]
- [ ] Add response selector dropdown (if source has responses)
- [ ] Populate options with response indices
- [ ] Display angle labels for each response (Azimuth/Elevation)
- [ ] Add phase mode selector (unwrapped, wrapped, group-delay)
- [ ] Add normalization checkbox toggle
- [ ] Add azimuth slider (-180° to 180°, step 1°)
- [ ] Add elevation slider (-90° to 90°, step 1°)
- [ ] Display current angle values beside sliders
- [ ] Sync sliders with response index selection
- [ ] Handle sources without response data gracefully

### Task 7.5: Per-Source Response Charts [NEW]
- [ ] Embed Chart.js frequency response chart per source
- [ ] Reuse charting utilities from Phase 4
- [ ] Create canvas element with unique ID per source
- [ ] Render dual-axis chart (Level dB + Phase)
- [ ] Update chart when controls change (response, phase, angles)
- [ ] Display response metadata below chart
- [ ] Handle chart lifecycle (create/update/destroy)
- [ ] Add "No frequency response data" empty state
- [ ] Optimize: lazy-load charts only when source expanded

### Task 7.6: Source Response Utilities [PARTIALLY COMPLETED]
- [ ] Port `computeResponseAngles()` function (pending Task 7.4)
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

### Task 7.8: Styling Enhancements [PARTIALLY COMPLETED]
- [x] Port source card styles from web demo
- [x] Style collapsible header with hover effects
- [x] Style source details section with proper spacing
- [ ] Style placement list with nested indentation (pending Task 7.3)
- [ ] Style response controls grid layout (pending Task 7.4)
- [ ] Style slider labels and value displays (pending Task 7.4)
- [x] Add responsive breakpoints for mobile
- [x] Support WordPress theme color variables
- [ ] Add loading skeleton for chart rendering (pending Task 7.5)

### Task 7.9: Performance Optimization
- [ ] Implement virtualization for long source lists (>20 sources)
- [ ] Lazy-load response charts (render only when expanded)
- [ ] Debounce slider input handlers
- [ ] Memoize computed placements map
- [ ] Cache formatted values (bandwidth, angles)
- [ ] Dispose Chart.js instances on collapse/unmount

---

## Phase 8: Geometry Viewer Block

**Reference:** `gll-tools/web/modules/geometry.js` (953 lines), `app.js` (geometry section)

### Task 8.1: Three.js Geometry Scene Setup
- [ ] Add Three.js dependency if not already present (from Phase 6)
- [ ] Create geometry viewer React component with proper cleanup
- [ ] Configure WebGL renderer (antialias, alpha, pixelRatio ≤ 2)
- [ ] Setup PerspectiveCamera (42° FOV, position at (0, 0.4, 2.2))
- [ ] Add ambient light (0xffffff, intensity 0.7)
- [ ] Add directional key light (0xffffff, intensity 0.85, position (2.5, 2.5, 2))
- [ ] Create grid helper (2 units, 12 divisions)
- [ ] Add axes helper (0.8 unit size, semi-transparent opacity 0.5)
- [ ] Implement animation loop with requestAnimationFrame

### Task 8.2: Geometry Block Structure
- [ ] Create block registration (`gll-info/geometry`)
- [ ] Define attributes:
  - `fileId`, `fileUrl`, `fileName` (GLL file reference)
  - `geometryIndex` (which case geometry to display)
  - `showFaces` (boolean, default true)
  - `showEdges` (boolean, default true)
  - `showMarkers` (object: {ref: true, com: true, pivot: false})
  - `showSources` (boolean, display acoustic source cones)
  - `centerReference` (boolean, center on reference point vs origin)
  - `autoRotate` (boolean, OrbitControls auto-rotation)
  - `canvasHeight` (200-800px, default 500px)
- [ ] Create edit.js with InspectorControls
- [ ] Create save.js with data attributes
- [ ] Create view.js for frontend Three.js rendering
- [ ] Create editor.scss and style.scss

### Task 8.3: OrbitControls Integration
- [ ] Add Three.js OrbitControls to dependencies
- [ ] Configure OrbitControls settings:
  - Enable damping (dampingFactor: 0.08)
  - Enable screen space panning
  - Enable zoom, pan, rotate, keys
  - Set distance limits (min: 0.25, max: 25)
  - Configure mouse buttons (LEFT: rotate, MIDDLE: dolly, RIGHT: pan)
  - Set rotation/pan speeds (0.6, 0.9)
  - Enable auto-rotate option (controlled by attribute)
- [ ] Add fallback pointer controls when OrbitControls unavailable
- [ ] Implement manual orbit calculation (theta, phi, radius, target)

### Task 8.4: Geometry Mesh Building
- [ ] Extract case_geometry data from GLL via WASM
- [ ] Resolve vertex positions using `resolveGeometryVertex()` helper
- [ ] Build sequential edge pairs from face/edge definitions
- [ ] Create BufferGeometry for faces:
  - Position buffer (Float32Array)
  - Color buffer (per-vertex colors from face/edge definitions)
  - Index buffer (triangle indices)
  - Compute vertex normals
- [ ] Apply MeshStandardMaterial:
  - vertexColors: true
  - flatShading: true
  - metalness: 0.05, roughness: 0.75
  - side: DoubleSide
- [ ] Create LineSegments for edges:
  - LineBasicMaterial with vertexColors
  - Transparent with opacity 0.9

### Task 8.5: Coordinate Conversion & Centering
- [ ] Implement GLL Z-up to Three.js Y-up conversion:
  ```javascript
  toViewPoint: { x: gllPoint.x, y: gllPoint.z, z: gllPoint.y }
  ```
- [ ] Compute bounding box (minX/Y/Z, maxX/Y/Z)
- [ ] Calculate geometry center and size
- [ ] Apply scale factor (targetSize 1.2 / actualSize)
- [ ] Center geometry group based on:
  - Reference point if `centerReference` is true
  - Bounding box center otherwise
- [ ] Convert Euler angles (HVR) to quaternion for source orientations

### Task 8.6: Marker System
- [ ] Create sphere markers with radius 0.01 world units
- [ ] Reference Point marker (red #ef4444 sphere)
- [ ] Center of Mass marker (green #22c55e sphere)
- [ ] Next Pivot marker (amber #f59e0b sphere)
- [ ] Add marker visibility toggles in InspectorControls
- [ ] Scale markers appropriately with geometry scale factor
- [ ] Position markers in world space using toViewPoint conversion

### Task 8.7: Acoustic Source Visualization
- [ ] Create cone meshes for each acoustic source
- [ ] Position cones at source reference points
- [ ] Orient cones using source rotation quaternions
- [ ] Color cones with distinct hues per source
- [ ] Add source labels (TextSprite or HTML overlay)
- [ ] Toggle source visibility with `showSources` attribute
- [ ] Show source coverage angles visually

### Task 8.8: Theme-Aware Grid Colors
- [ ] Read CSS variables for grid colors:
  - `--geom-grid-major` (default: #94a3b8)
  - `--geom-grid-minor` (default: #e2e8f0)
  - `--geom-grid-opacity` (default: 0.45)
  - `--geom-edge-default` (fallback edge color)
  - `--geom-face-default` (fallback face color)
- [ ] Apply theme colors to GridHelper materials
- [ ] Update on WordPress theme change (if applicable)
- [ ] Support dark mode variants

### Task 8.9: Geometry Controls (InspectorControls)
- [ ] Geometry selector dropdown (if multiple case geometries)
- [ ] Show Faces toggle (ToggleControl)
- [ ] Show Edges toggle (ToggleControl)
- [ ] Marker visibility controls (separate toggles for ref/com/pivot)
- [ ] Show Sources toggle (ToggleControl)
- [ ] Center on Reference toggle (ToggleControl)
- [ ] Auto-rotate toggle (ToggleControl)
- [ ] Canvas height slider (RangeControl 200-800px)

### Task 8.10: Geometry Metadata Display
- [ ] Show geometry bounds (min/max X/Y/Z)
- [ ] Display geometry size (largest dimension)
- [ ] Show vertex/face/edge counts
- [ ] Display reference point coordinates (if available)
- [ ] Show center of mass coordinates (if available)
- [ ] Display source count (if showSources enabled)
- [ ] Style metadata badges with responsive layout

### Task 8.11: Performance Optimization
- [ ] Implement lazy loading (IntersectionObserver)
- [ ] Dispose geometry/materials on rebuild
- [ ] Pause animation when not visible
- [ ] Limit pixel ratio to 2× for performance
- [ ] Implement proper cleanup in useEffect:
  ```javascript
  return () => {
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    controls?.dispose();
    cancelAnimationFrame(animationId);
  }
  ```
- [ ] Cache resolved vertices to avoid recomputation

---

## Phase 9: Resources Block

### Task 9.1: Resources Block Structure
- [ ] Create block registration (`gll-info/resources`)
- [ ] Define attributes (resource types to show)

### Task 9.2: Documentation Display
- [ ] List embedded PDFs with download links
- [ ] Preview images inline
- [ ] Show file sizes

### Task 9.3: Data Files Display
- [ ] List geometry files (XED)
- [ ] Show data file metadata

### Task 9.4: Download Handling
- [ ] Generate data URIs for downloads
- [ ] Add download buttons
- [ ] Handle large file downloads gracefully

---

## Phase 10: Configuration Block

### Task 10.1: Config Block Structure
- [ ] Create block registration (`gll-info/config`)
- [ ] Define attributes (sections to show, collapsed state)

### Task 10.2: Collapsible Cards Component
- [ ] Port collapsible card UI from web demo
- [ ] Persist collapsed state

### Task 10.3: Box Types Display
- [ ] List box types with specifications
- [ ] Show geometry if available

### Task 10.4: Other Config Sections
- [ ] Frames display
- [ ] Filter groups display
- [ ] Limits display
- [ ] Warnings display

---

## Phase 11: Integration & Polish

### Task 11.1: Block Patterns
- [ ] Create "Full GLL Viewer" pattern (all blocks)
- [ ] Create "Quick Overview" pattern
- [ ] Create "Acoustic Analysis" pattern

### Task 11.2: Block Variations
- [ ] Register block variations for common configurations

### Task 11.3: Internationalization
- [ ] Add translation support
- [ ] Extract all strings to translation functions

### Task 11.4: Accessibility
- [ ] Add ARIA labels to interactive elements
- [ ] Ensure keyboard navigation works
- [ ] Test with screen readers

### Task 11.5: Documentation
- [ ] Add inline block help
- [ ] Create user documentation
- [ ] Add example patterns

---

## Phase 12: Testing & Release

### Task 12.1: Unit Tests
- [ ] Test WASM loader
- [ ] Test data parsing utilities
- [ ] Test React components

### Task 12.2: Integration Tests
- [ ] Test block registration
- [ ] Test media library integration
- [ ] Test frontend rendering

### Task 12.3: Browser Testing
- [ ] Test WASM in Chrome, Firefox, Safari, Edge
- [ ] Test WebGL in different browsers (for 3D blocks)
- [ ] Test fallback for older browsers

### Task 12.4: Performance Testing
- [ ] Test with large GLL files (100MB+)
- [ ] Measure memory usage
- [ ] Test Three.js scene performance with complex geometries
- [ ] Optimize if needed

### Task 12.5: Release Preparation
- [ ] Update readme.txt
- [ ] Create changelog
- [ ] Build production assets
- [ ] Create plugin ZIP

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
│   ├── polar-plot/             # PARTIAL Phase 5 (5.1-5.4 done)
│   ├── balloon-3d/             # PARTIAL Phase 6 (6.1-6.2 done)
│   ├── geometry/               # TODO Phase 8
│   ├── resources/              # TODO Phase 9
│   └── config/                 # TODO Phase 10
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
| 5. Polar Plot | 6 | Medium-High | TODO |
| 6. 3D Balloon | 9 | Very High | TODO |
| 7. Sources List | 9 | Medium-High | PARTIAL (3/9 tasks complete, 2 partial) |
| 8. Geometry Viewer | 11 | Very High | TODO |
| 9. Resources | 4 | Medium | TODO |
| 10. Configuration | 4 | Medium | TODO |
| 11. Integration | 5 | Medium | TODO |
| 12. Testing | 5 | Medium | TODO |

**Total: 70 tasks across 12 phases**
**Completed: ~33 tasks (Phases 1-4, Phase 7: Tasks 7.1, 7.2, 7.7)**
**Partially Completed: ~2 tasks (Phase 7: Tasks 7.6, 7.8)**
**Remaining: ~35 tasks (Phases 5-6, 8-12, Phase 7: Tasks 7.3-7.5, 7.9)**

---

## Getting Started

Begin with Phase 1 to establish the foundation, then proceed sequentially. The most complex phases requiring close reference to the web demo are:

- **Phase 4** (Frequency Response) - COMPLETED
- **Phase 5** (Polar Plot) - PARTIAL (4/6 tasks complete: 5.1-5.4 done, 5.5-5.6 remaining)
- **Phase 6** (3D Balloon) - Very High complexity, advanced Three.js mesh generation
- **Phase 8** (Geometry Viewer) - Very High complexity, Three.js with OrbitControls

The existing web demo at `https://meko-christian.github.io/gll-tools/` serves as the reference implementation for all visualizations.

## Implementation Notes

### Shared Dependencies
Phases 6 (3D Balloon) and 8 (Geometry Viewer) both use Three.js and can share:
- Three.js core library
- OrbitControls (for Phase 8, custom controls for Phase 6)
- Coordinate conversion utilities (GLL Z-up → Three.js Y-up)
- Theme-aware color system
- Animation loop patterns
- WebGL context management

Consider implementing Phase 6 before Phase 8 to establish the Three.js foundation.

### Reference Files by Phase
- **Phase 5:** `gll-tools/web/modules/visualization.js` (lines 1-842), `charting.js`
- **Phase 6:** `gll-tools/web/modules/visualization.js` (lines 843-1226)
- **Phase 8:** `gll-tools/web/modules/geometry.js` (all 953 lines)
- **Phase 9:** `gll-tools/web/modules/exporters.js`, `app.js` (resources section)
- **Phase 10:** `gll-tools/web/app.js` (configuration cards section)
