/**
 * Human Reference Atlas female body -> simplified, classified, meshopt-compressed GLBs + manifest.
 *   npx tsx scripts/build-female.ts [in=assets/anatomy/raw/hra/3d-vh-f-united.glb] [out=public/anatomy/female]
 *
 * Source: 3d-vh-f-united.glb.7z from https://github.com/hubmapconsortium/ccf-releases/tree/main/v2.0/models
 * (Human Reference Atlas, CC BY 4.0, built from the Visible Human female). Unzip it into assets/anatomy/raw/hra.
 * Units are metres, +Y up, facing +z, left = +x: the same conventions as the male build, so there is no axis remap.
 * The source is ~5.5M vertices; every mesh is simplified to ~12% so the body loads in a browser.
 */
import { NodeIO } from '@gltf-transform/core'
import type { Node as GNode } from '@gltf-transform/core'
import { MeshoptSimplifier } from 'meshoptimizer'
import { sideOf } from '../src/lib'
import type { Entry, SystemId, Vec3 } from '../src/types'
import { classify, regionOf, simplify, writeOutput } from './common'
import type { Built } from './common'

const input = process.argv[2] ?? 'assets/anatomy/raw/hra/3d-vh-f-united.glb'
const out = process.argv[3] ?? 'public/anatomy/female'
const KEEP = 0.12 // fraction of triangles kept by simplification
const KEEP_SKIN = 0.5 // the skin is one large, visible surface: keep more of it so the face and hems stay smooth

/** "VH_F_renal_pyramid_R_i" -> "Right Renal Pyramid I"; "Allen_cingulate_gyrus_L" -> "Left Cingulate Gyrus" */
function clean(raw: string) {
  let side = ''
  const n = raw.replace(/^(VH_F_|Allen_|Yao_)/, '')
    .replace(/_(L|R)(?=_|$)/, (_m, s: string) => { side = s === 'L' ? 'Left ' : 'Right '; return '' })
    .replace(/_/g, ' ').trim()
  return (side + n).replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** World-space positions + indices of one node's mesh (all primitives merged, duplicate vertices welded). */
function extract(node: GNode) {
  const m = node.getWorldMatrix()
  const pos: number[] = [], idx: number[] = []
  const seen = new Map<string, number>()
  const el = [0, 0, 0]
  for (const prim of node.getMesh()!.listPrimitives()) {
    const a = prim.getAttribute('POSITION')!
    const local: number[] = []
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, el)
      const x = m[0] * el[0] + m[4] * el[1] + m[8] * el[2] + m[12]
      const y = m[1] * el[0] + m[5] * el[1] + m[9] * el[2] + m[13]
      const z = m[2] * el[0] + m[6] * el[1] + m[10] * el[2] + m[14]
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`
      let v = seen.get(key)
      if (v === undefined) { v = pos.length / 3; pos.push(x, y, z); seen.set(key, v) }
      local.push(v)
    }
    const ind = prim.getIndices()
    if (ind) for (let i = 0; i < ind.getCount(); i++) idx.push(local[ind.getScalar(i)])
    else for (let i = 0; i < local.length; i++) idx.push(local[i])
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) }
}


await MeshoptSimplifier.ready
const doc = await new NodeIO().read(input)
type Part = { id: string; name: string; system: SystemId; raw: string; pos: Float32Array; idx: Uint32Array }
const parts: Part[] = []
const unclassified: string[] = []
const ids = new Set<string>()
let before = 0, after = 0
doc.getRoot().getDefaultScene()!.traverse((node) => {
  if (!node.getMesh()) return
  const raw = node.getName()
  const name = clean(raw)
  // the atlas places its separate placenta reference organ inside this body; it is not part of a non-pregnant female
  if (/placenta|chorionic|amnion|umbilical cord|basal plate/i.test(name)) { unclassified.push(`${raw}\t${name}\tplacenta reference organ, excluded`); return }
  // the Allen brain atlas parts are all brain, the Yao parts are ovarian follicles, and the liver's segments are
  // named only by position ("right posteroinferior segment")
  const system = classify(name) ?? (raw.startsWith('Allen_') ? 'nervous' : raw.startsWith('Yao_') ? 'reproductive'
    : /^VH_F_(left|right)_\w+_segment\d*$/.test(raw) ? 'digestive' : undefined)
  if (!system) { unclassified.push(`${raw}\t${name}\tno system rule matched`); return }
  const g = extract(node)
  if (!g.idx.length) { unclassified.push(`${raw}\t${name}\tempty mesh`); return }
  const s = simplify(g.pos, g.idx, system === 'skin' ? KEEP_SKIN : KEEP)
  before += g.pos.length / 3; after += s.pos.length / 3
  let id = raw, k = 2
  while (ids.has(id)) id = `${raw}_${k++}`
  ids.add(id)
  parts.push({ id, name, system, raw, ...s })
})
console.log(`simplified ${before} -> ${after} vertices`)

// feet on y = 0, centred on x/z (same as the male model)
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.pos[i + k]); hi[k] = Math.max(hi[k], p.pos[i + k]) }
const off = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]
const H = hi[1] - lo[1]

const built: Built[] = parts.map((p) => {
  const w = p.pos
  const l = [Infinity, Infinity, Infinity], h = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < w.length; i += 3) for (let k = 0; k < 3; k++) { w[i + k] -= off[k]; l[k] = Math.min(l[k], w[i + k]); h[k] = Math.max(h[k], w[i + k]) }
  const c: Vec3 = [(l[0] + h[0]) / 2, (l[1] + h[1]) / 2, (l[2] + h[2]) / 2]
  for (let i = 0; i < w.length; i += 3) for (let k = 0; k < 3; k++) w[i + k] -= c[k]
  const region = p.raw.startsWith('Allen_') ? 'brain' : regionOf(p.name, p.system, c[1], H)
  const e: Entry = {
    id: p.id, name: p.name, system: p.system, region, side: sideOf(p.name), meshFile: `${p.system}.glb`,
    assembledPosition: c, explodedPosition: [0, 0, 0], size: [h[0] - l[0], h[1] - l[1], h[2] - l[2]],
  }
  return { e, pos: w, idx: p.idx }
})
console.log(`height ${H.toFixed(3)} m`)
await writeOutput(built, out, 'Human Reference Atlas', unclassified, 'scripts/unclassified-female.log')
