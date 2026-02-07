# Flash 8 "True Vector" Clipboard (Flash 8 Picture / CPicShape) Notes

Last updated: 2026-02-07
Repo: `<REPO_ROOT>`

## Goal

Extract Flash Professional 8 "true vector" from clipboard and convert to SVG.

Current status:
- EMF/WMF route is lossy (often single-color).
- Clipboard DIB/PNG route preserves color but is raster.
- Best candidate for "true vector" is the private clipboard format:
  - Name: `Flash 8 Picture`
  - ID: `50612`
  - Signature: ASCII `CPicShape` at offset `27` in dumps.

## What Works Now (Confirmed)

### 1) Stable sampling without clipboard being overwritten

The app has a button:
- `Sample Flash 8 Picture x10`

It reads `Flash 8 Picture` 10 times and writes:
- `stable.bin` (canonical stable payload)
- `stable.mask.bin` (stable/unstable mask)
- `stability.json`
- `Flash 8 Picture.01.bin` .. `.10.bin`

This avoids the common failure where copying the "Output path" overwrites the clipboard.

### 2) Stroke (line) color + width can be parsed from `Flash 8 Picture`

We found a style block at:
- `styleOffset = 0x50`

Observed layout ("cpicshape-v1", used by current parser):
- `u16 fillCount`
- `fillCount * RGBA` (solid only)
- `u16 lineCount`
- `lineCount * (RGBA + u32 widthTwips)`

Units:
- `widthTwips` is likely twips: `1 px = 20 twips`
  - Example: 10px => 200
  - Example: 1px  => 20
  - Example: very thin => 1 (0.05px)

Renderer UI confirmation (example):
`fills(0) / lines(1): #000000FF w=1.00px`

## Key Findings From Samples

### S1 vs S2 (stroke color differs)

S1: stroke black (fill none), width 10px
- `%APPDATA%\\fl-shape-app\\dumps\\sample-2026-02-07T14-37-24-033Z`

S2: stroke blue (fill none), width 10px
- `%APPDATA%\\fl-shape-app\\dumps\\sample-2026-02-07T14-38-25-967Z`

Diff summary:
- `0x00..0x4F` identical
- `0x50..0x7F` very small diffs
- `0x80..end` large diffs (geometry/payload or caches)

### S3 + W1 (isolating width)

S3: stroke red (fill none), width 10px
- `%APPDATA%\\fl-shape-app\\dumps\\sample-2026-02-07T15-13-44-288Z`

W1: stroke black (fill none), width 1px
- `%APPDATA%\\fl-shape-app\\dumps\\sample-2026-02-07T15-14-36-870Z`

W1 extra: "very thin" stroke black (fill none)
- `%APPDATA%\\fl-shape-app\\dumps\\sample-2026-02-07T15-15-32-819Z`

Confirmed bytes (from `stable.bin`):
- stroke RGBA appears at:
  - `0x54..0x57` (RGBA)
  - and duplicated at `0x64..0x67` (RGBA)
- stroke widthTwips appears at:
  - `0x58..0x5B` (u32 LE)

Examples:
- S3: `0x54..0x57 = ff 00 00 ff` and `widthTwips = 200`
- W1: `0x54..0x57 = 00 00 00 ff` and `widthTwips = 20`
- W1(thin): `widthTwips = 1`

## Repo Changes (So Far)

- UI: single preview area with tabs (SVG / Metafile PNG / Clipboard PNG).
- Dump Bundle modal:
  - added `Details` column
  - now shows fills and lines (color + width in px)
- Main: updated `parseFlash8PictureStyleArrays()` to support the observed "cpicshape-v1" layout.
- Scripts: updated comparison tools to accept sample dirs (`stable.bin`) or direct bin paths.

Relevant files:
- `src/main/main.ts` (parser, IPC)
- `src/main/preload.ts` (types)
- `src/renderer/src/App.tsx` (Dump Bundle details rendering)
- `src/renderer/src/vite-env.d.ts` (types)
- `scripts/segment_diff_flash8_picture.py`
- `scripts/compare_flash8_picture.py`
- `scripts/diff_bin_ranges.py`

## What Is Still Missing

We still do NOT parse:
- geometry/path data (the actual vector outlines)
- multi-shape grouping, fills beyond solid, gradients, etc.

The big remaining task is to find and decode the geometry encoding inside `stable.bin`.

## Next Session: Required Samples (Geometry Isolation)

We need 2 (ideally 3) samples where ONLY geometry changes.

Common settings for all:
- Fill: none
- Stroke: black `#000000`
- Stroke width: `1px`

### G1
- Draw a square (e.g. 100px x 100px)
- `Ctrl+C` in Flash
- In app: `Sample Flash 8 Picture x10`
- Save the Output path as `G1`

### G2
- Draw a rectangle (e.g. 200px x 100px)
- `Ctrl+C`
- In app: `Sample Flash 8 Picture x10`
- Save the Output path as `G2`

### (Optional) G3 (translation only)
- Same as G1 (same size/shape)
- Move it to the right by ~50px (position only)
- `Ctrl+C` -> `Sample Flash 8 Picture x10`
- Save the Output path as `G3`

Important:
- Click `Sample Flash 8 Picture x10` BEFORE copying any Output path text.
  Copying the path can overwrite the clipboard content and breaks the capture.

## Quick Sanity Check (Before sending paths)

After sampling, open `Dump Clipboard Bundle`:
- `Flash 8 Picture` should show something like:
  - `fills(0) / lines(1): #000000FF w=1.00px`

If that is missing, the clipboard capture likely did not contain the vector payload.
