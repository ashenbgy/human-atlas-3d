# Human Atlas 3D

Interactive 3D anatomy explorer: React + TypeScript + Three.js (react-three-fiber). Orbit the body, toggle 8 systems,
search any structure, isolate it, study regions as specimen sheets, and explode every piece into a catalogued atlas.

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
> ([license page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) — check the wording before publishing).

## Run

```bash
npm install
npm run dev
```

With no anatomy data the app shows ~190 **placeholder primitives** (capsules/spheres, clearly not anatomy; the header says
"placeholder geometry") so every feature can be tried. Node 20+ is needed for the asset script.

## Real anatomy

1. Download the BodyParts3D OBJ archive (99% polygon reduction) **and** the name tables from
   <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>; unzip into `assets/anatomy/raw` (git-ignored).
2. `npm run build:anatomy` — reads each OBJ, maps id→English name, classifies into the 8 systems, detects side, assigns a
   region, computes the atlas layout, writes one meshopt-compressed GLB per system plus `public/anatomy/manifest.json`.
   Anything it can't name or classify goes to `scripts/unclassified.log` instead of being guessed.
3. `npm run dev` — the loader picks up the manifest automatically.

Verified against the real `isa_BP3D_4.0_obj_99` archive: 2,234 OBJs → 1,868 classified pieces (366 logged in
`scripts/unclassified.log`, mostly organs outside the 8 systems such as liver/stomach/skin). BodyParts3D is Z-up in mm; the
script remaps axes, names each file by its most specific concept, and infers left/right for mirrored `FJnnnnM` pairs from position.
The generated `public/anatomy/*.glb` (~19 MB) can be committed; `assets/anatomy/raw` must not be.

## Layout

| File | Role |
|---|---|
| `scripts/build-anatomy.ts` | OBJ → GLB + manifest pipeline |
| `src/data.ts` / `src/placeholder.ts` | manifest/GLB loader, placeholder fallback, region sheets |
| `src/lib.ts` | atlas shelf-packing layout, easing, side detection |
| `src/Scene.tsx` | render loop (explode, fades, hover glow), raycasting, camera rig |
| `src/store.ts`, `src/camera.ts` | UI state (zustand), `focusPiece`/`fitBox` camera focus |
| `src/ui.tsx`, `src/styles.css` | floating panels |

All per-frame animation runs in `useFrame`; React state only changes on user actions.

## Known gaps

No instancing/LOD/ambient occlusion (draw calls = piece count; add if the full dataset lags).
Switching regions while another sheet is open snaps the old sheet's pieces home instead of animating. No verified
muscle-attachment data ships with BodyParts3D, so the info panel only lists "nearby" pieces unless `attachments` is set in the manifest.
