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

### Task 4.3: Response Chart Component
- [ ] Port chart configuration from web demo
- [ ] Implement dual Y-axis (Level dB, Phase)
- [ ] Add logarithmic X-axis (frequency)
- [ ] Support phase modes: unwrapped, wrapped, group delay

### Task 4.4: Interactive Controls
- [ ] Source selector dropdown
- [ ] Response index selector
- [ ] Azimuth/Elevation sliders
- [ ] Phase mode toggle
- [ ] Normalized (on-axis) checkbox

### Task 4.5: Response Metadata Display
- [ ] Show measurement conditions
- [ ] Display angular position
- [ ] Show frequency range

---

## Phase 5: Polar Plot Block

### Task 5.1: Polar Chart Setup
- [ ] Configure Chart.js for polar/radar chart
- [ ] Create polar chart React component

### Task 5.2: Polar Plot Block Structure
- [ ] Create block registration (`gll-info/polar-plot`)
- [ ] Define attributes (plane, frequency, source)

### Task 5.3: Polar Visualization
- [ ] Port polar chart from web demo
- [ ] Implement horizontal/vertical plane toggle
- [ ] Add frequency selector with slider
- [ ] Display dB scale rings

### Task 5.4: Polar Controls
- [ ] Plane selector (Horizontal/Vertical)
- [ ] Frequency dropdown and slider
- [ ] Source selector (if multiple sources)

---

## Phase 6: 3D Balloon Block

### Task 6.1: Three.js Integration
- [ ] Add Three.js as dependency
- [ ] Create React wrapper for Three.js scene
- [ ] Handle WebGL context lifecycle

### Task 6.2: 3D Balloon Block Structure
- [ ] Create block registration (`gll-info/balloon-3d`)
- [ ] Define attributes (frequency, range, scale, wireframe, autoRotate)

### Task 6.3: Balloon Visualization
- [ ] Port balloon mesh generation from web demo
- [ ] Implement SPL-based color mapping
- [ ] Add coordinate axes
- [ ] Create interactive camera controls

### Task 6.4: Balloon Controls
- [ ] Frequency selector with slider
- [ ] Range (dB) slider
- [ ] Scale slider
- [ ] Wireframe toggle
- [ ] Auto-rotate toggle

### Task 6.5: Performance Optimization
- [ ] Implement lazy loading (only render when in viewport)
- [ ] Add quality presets (low/medium/high)
- [ ] Dispose Three.js resources properly

---

## Phase 7: Sources List Block [PARTIALLY COMPLETED]

*Note: Sources list is integrated into the main GLL Info block with toggle option.*

### Task 7.1: Sources Block Structure [COMPLETED - integrated]
- [x] Integrated into main block with `showSources` attribute
- [ ] Define attributes (display mode, columns to show) - basic mode done

### Task 7.2: Sources Table Component [COMPLETED]
- [x] Port sources list from web demo
- [x] Display: Label, Bandwidth
- [ ] Add expandable details per source

### Task 7.3: Source Details
- [ ] Measurement conditions
- [ ] Coverage angles
- [ ] Response count

---

## Phase 8: Resources Block

### Task 8.1: Resources Block Structure
- [ ] Create block registration (`gll-info/resources`)
- [ ] Define attributes (resource types to show)

### Task 8.2: Documentation Display
- [ ] List embedded PDFs with download links
- [ ] Preview images inline
- [ ] Show file sizes

### Task 8.3: Data Files Display
- [ ] List geometry files (XED)
- [ ] Show data file metadata

### Task 8.4: Download Handling
- [ ] Generate data URIs for downloads
- [ ] Add download buttons
- [ ] Handle large file downloads gracefully

---

## Phase 9: Configuration Block

### Task 9.1: Config Block Structure
- [ ] Create block registration (`gll-info/config`)
- [ ] Define attributes (sections to show, collapsed state)

### Task 9.2: Collapsible Cards Component
- [ ] Port collapsible card UI from web demo
- [ ] Persist collapsed state

### Task 9.3: Box Types Display
- [ ] List box types with specifications
- [ ] Show geometry if available

### Task 9.4: Other Config Sections
- [ ] Frames display
- [ ] Filter groups display
- [ ] Limits display
- [ ] Warnings display

---

## Phase 10: Integration & Polish

### Task 10.1: Block Patterns
- [ ] Create "Full GLL Viewer" pattern (all blocks)
- [ ] Create "Quick Overview" pattern
- [ ] Create "Acoustic Analysis" pattern

### Task 10.2: Block Variations
- [ ] Register block variations for common configurations

### Task 10.3: Internationalization
- [ ] Add translation support
- [ ] Extract all strings to translation functions

### Task 10.4: Accessibility
- [ ] Add ARIA labels to interactive elements
- [ ] Ensure keyboard navigation works
- [ ] Test with screen readers

### Task 10.5: Documentation
- [ ] Add inline block help
- [ ] Create user documentation
- [ ] Add example patterns

---

## Phase 11: Testing & Release

### Task 11.1: Unit Tests
- [ ] Test WASM loader
- [ ] Test data parsing utilities
- [ ] Test React components

### Task 11.2: Integration Tests
- [ ] Test block registration
- [ ] Test media library integration
- [ ] Test frontend rendering

### Task 11.3: Browser Testing
- [ ] Test WASM in Chrome, Firefox, Safari, Edge
- [ ] Test fallback for older browsers

### Task 11.4: Performance Testing
- [ ] Test with large GLL files (100MB+)
- [ ] Measure memory usage
- [ ] Optimize if needed

### Task 11.5: Release Preparation
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
│   │   └── chart.scss          # [DONE]
│   ├── frequency-response/     # PARTIAL (structure done, chart impl pending)
│   │   ├── block.json          # [DONE]
│   │   ├── index.js            # [DONE]
│   │   ├── edit.js             # [DONE]
│   │   ├── save.js             # [DONE]
│   │   ├── view.js             # [DONE - placeholder chart]
│   │   ├── editor.scss         # [DONE]
│   │   └── style.scss          # [DONE]
│   ├── polar-plot/             # TODO
│   ├── balloon-3d/             # TODO
│   ├── resources/              # TODO
│   └── config/                 # TODO
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
| 4. Frequency Response | 5 | High | PARTIAL (structure done, chart impl pending) |
| 5. Polar Plot | 4 | Medium | TODO |
| 6. 3D Balloon | 5 | High | TODO |
| 7. Sources List | 3 | Low | PARTIAL (integrated) |
| 8. Resources | 4 | Medium | TODO |
| 9. Configuration | 4 | Medium | TODO |
| 10. Integration | 5 | Medium | TODO |
| 11. Testing | 5 | Medium | TODO |

**Total: 47 tasks across 11 phases**
**Completed: ~25 tasks (Phases 1-3, 4.1-4.2, partial 7)**

---

## Getting Started

Begin with Phase 1 to establish the foundation, then proceed sequentially. Phase 4 (Frequency Response) and Phase 6 (3D Balloon) are the most complex and may benefit from referencing the web demo code closely.

The existing web demo at `https://meko-christian.github.io/gll-tools/` serves as the reference implementation for all visualizations.
