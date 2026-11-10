# Human Atlas 3D

**Live demo: _TODO — add your Vercel link after deploying_**

An interactive 3D anatomy explorer that feels like a digital museum. Rotate the body, switch between a male and a female body,
toggle 15 anatomical systems, search any of 2,205 (male) or 863 (female) real structures, and drag one slider to pull the whole body apart into a catalogued specimen atlas.

![Explode slider: the assembled body separates into a specimen atlas and back](docs/explode.gif)

_Inspired by TODO — link the original creator/post you remade this from._

## Run it

```bash
npm install
npm run dev
```

The processed anatomy (`public/anatomy`) is committed, so that is all you need.

## Features

- **Male and female bodies**: 2,205 labelled meshes for the male (BodyParts3D) and 863 for the female (Human Reference
  Atlas), grouped into 15 systems, from skeleton, muscles and vessels to digestive, urinary, endocrine and skin
- **Organs in 3D**: one click shows a single organ (heart, brain, lungs, liver, stomach, pancreas, intestines, kidneys, eye) on its own
- **Layers**: peel the body back from skin to muscles, vessels, organs and skeleton, or set each layer's opacity
- **Skin** with a soft sheen and hair, dressed in clothing cut from the skin surface with clean, clipped hems (shorts, plus a
  top on the female body). The female dataset has no hair, so a short style is generated from the scalp with a shader-cut hairline. The reproductive system is off by default and one click away in Systems
- **Explode slider**: every piece eases from its anatomical position into a specimen sheet (larger pieces on top, smaller ones denser below), and stays clickable
- Hover tooltips, the selected structure in its true colours while everything else fades to a ghost, an info panel, and isolate mode
- Search that flies the camera to any structure (`/` to focus)
- Region collections (hand, shoulder, thigh, foot, heart, brain) laid out as specimen sheets, filterable by side
- Front, back, side and ¾ view presets, plus an anatomical compass (superior/inferior, left/right, anterior/posterior) you can click
- Keyboard: arrow keys orbit · `Shift` + arrows pan · `+`/`−` zoom · `Home` reset · `Enter` select the structure at the centre ·
  `F` front view · `I` isolate · `Esc` back out

Stack: React, TypeScript, Vite, three.js via react-three-fiber and drei, Framer Motion, zustand, N8AO ambient occlusion.

## How it works

- **Raycasting.** A ray from the camera through the cursor finds the first visible mesh it hits. Faded pieces are skipped.
- **Interpolation.** Each piece stores an `assembledPosition` and an `explodedPosition`. The slider is one number from 0 to 1, and
  every frame each piece moves to the eased point between the two.
- **Render loop vs React state.** All per-frame animation (positions, fades, highlights) runs in `useFrame` and mutates three.js
  objects directly. React re-renders only on user actions.
- **Camera focus.** A structure's bounding box gives its centre and size. The camera backs off just far enough to fit it
  inside the area the floating panels leave clear, then tweens there.
- **Batched rendering.** Settled pieces are drawn through one `BatchedMesh` per system (about 30 draw calls instead of
  about 2,200), and only fading, hovered or selected pieces use their own mesh.
- **Data pipeline.** `scripts/build-anatomy.ts` turns 2,234 OBJ files named by ID into named, classified, compressed GLBs plus a manifest.

## Rebuilding the anatomy data

1. Download the OBJ archive (`isa_BP3D_4.0_obj_99.zip`) and the `*_element_parts.txt` tables from the
   [BodyParts3D download page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), and unzip them into
   `assets/anatomy/raw` (git-ignored).
2. Run `npm run build:anatomy` (needs Node 20+).

The script:
- names each file by its most specific concept;
- classifies it into a system with keyword rules;
- infers left/right for mirrored `FJnnnnM` pairs from position;
- remaps BodyParts3D's Z-up millimetres to Y-up metres;
- lays out the atlas;
- simplifies dense meshes (muscles keep 50% of their triangles for the fibre detail, skin 70%, everything else 30%),
  taking the male model from 24 MB to 12 MB;
- writes one meshopt-compressed GLB per system (12-bit positions, rounded manifest).

The 28 files it can't classify (vague groupings such as "portion of tissue" or "body of organ") are logged to
`scripts/unclassified.log` rather than guessed.

### Female body

1. Download `3d-vh-f-united.glb.7z` from the [Human Reference Atlas releases](https://github.com/hubmapconsortium/ccf-releases/tree/main/v2.0/models)
   and extract it into `assets/anatomy/raw/hra`.
2. Run `npm run build:female`. It simplifies the 5.5M-vertex source to about 400k vertices (4.1 MB), cleans names like
   `VH_F_renal_pyramid_R_i` into "Right Renal Pyramid I", and uses the same classification rules as the male build.
   The atlas's placenta reference organ is left out, and unclassified pieces go to `scripts/unclassified-female.log`.

## Known gaps

- The female body comes from a different dataset: it has few muscles and no arm, hand, foot or skull bones, and no hair.
- Switching between region sheets snaps the old sheet's pieces home instead of animating them.
- BodyParts3D has no verified muscle-attachment data. The info panel lists "nearby" structures and labels them as unverified.

## Credits

- Male body: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
  ([license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)).
- Female body: Human Reference Atlas 3D reference organs (HuBMAP / CNS, Indiana University), built from the Visible Human
  female, licensed under CC Attribution 4.0 International ([releases](https://github.com/hubmapconsortium/ccf-releases)).
