/**
 * BodyParts3D OBJ -> grouped, meshopt-compressed GLBs + manifest.
 *   npx tsx scripts/build-anatomy.ts [rawDir=assets/anatomy/raw] [outDir=public/anatomy]
 *
 * ASSUMPTIONS to verify against your actual download (written without the archive on hand):
 *  - OBJ files are named by element id (FJxxxx.obj or FMAxxxx.obj), units are millimetres, +Y is up.
 *    Change MM / the axis remap in `toWorld` if not.
 *  - The name tables are tab-separated text files; every line holding a file id (FJ#### / FMA####)
 *    plus a human-readable name column is used. Pieces without a name or a rule match are logged
 *    to scripts/unclassified.log and left out of the manifest (never guessed).
 *  - Output: one GLB per system (node name == piece id, geometry centred on its own centre; the
 *    centre is stored as assembledPosition). Normals are computed at load time.
 */
import fs from 'node:fs'
import path from 'node:path'
import { sideOf } from '../src/lib'
import type { Entry, SystemId, Vec3 } from '../src/types'
import { MeshoptSimplifier } from 'meshoptimizer'
import { classify, regionOf, simplify, writeOutput } from './common'
import type { Built } from './common'

const raw = process.argv[2] ?? 'assets/anatomy/raw'
const out = process.argv[3] ?? 'public/anatomy'
const MM = 0.001
// fraction of triangles kept per mesh: muscles keep their fibre striations, the skin is one large visible surface,
// and fine detail on vessels, nerves, bones and organs barely shows at viewing distance
const KEEP = 0.3, KEEP_MUSCLE = 0.5, KEEP_SKIN = 0.7

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))


function parseObj(file: string) {
  const v: number[] = []
  const idx: number[] = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/)
      v.push(+x, +y, +z)
    } else if (line.startsWith('f ')) {
      const n = v.length / 3
      const f = line.trim().split(/\s+/).slice(1).map((t) => { const i = parseInt(t.split('/')[0], 10); return i < 0 ? n + i : i - 1 })
      for (let k = 1; k + 1 < f.length; k++) idx.push(f[0], f[k], f[k + 1])
    }
  }
  return { v, idx }
}

// ---- 1. names ----
// *_element_parts.txt rows: concept id <tab> concept name <tab> element file id. A file is listed under every
// concept containing it (incl. broad ones like "muscle organ"), so keep the most specific = fewest elements.
const files = walk(raw)
const concepts = new Map<string, { name: string; ids: string[] }>()
for (const f of files.filter((f) => /element_parts\.txt$/.test(f)).sort()) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const [cid, name, fid] = line.split('\t').map((x) => x?.trim())
    if (!fid || line.startsWith('#') || !/^FJ\d+M?$/i.test(fid)) continue
    const c = concepts.get(cid) ?? { name, ids: [] }
    c.ids.push(fid.toUpperCase())
    concepts.set(cid, c)
  }
}
const names = new Map<string, string>()
const best = new Map<string, number>()
for (const c of concepts.values()) for (const id of c.ids) {
  if (c.ids.length < (best.get(id) ?? Infinity)) { best.set(id, c.ids.length); names.set(id, c.name) }
}
const objs = files.filter((f) => f.toLowerCase().endsWith('.obj'))
if (!objs.length) { console.error(`No .obj files under ${raw}. Download BodyParts3D first (see README).`); process.exit(1) }

await MeshoptSimplifier.ready

// ---- 2. parse + classify ----
type P = { id: string; name: string; system: SystemId; v: number[]; idx: number[] }
const parts: P[] = []
const unclassified: string[] = []
for (const f of objs) {
  const id = path.basename(f, path.extname(f)).toUpperCase()
  const name = names.get(id)
  if (!name) { unclassified.push(`${id}\tno name in tables`); continue }
  const system = classify(name)
  if (!system) { unclassified.push(`${id}\t${name}\tno system rule matched`); continue }
  const { v, idx } = parseObj(f)
  if (!idx.length) { unclassified.push(`${id}\t${name}\tempty mesh`); continue }
  parts.push({ id, name: name.replace(/\b[a-z]/g, (c) => c.toUpperCase()), system, v, idx })
}

// ---- 3. normalise to metres, feet on y=0, centred on x/z ----
const toWorld = (x: number, y: number, z: number): Vec3 => [x * MM, z * MM, -y * MM] // BP3D is Z-up
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
for (const p of parts) for (let i = 0; i < p.v.length; i += 3) {
  const w = toWorld(p.v[i], p.v[i + 1], p.v[i + 2])
  for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]) }
}
const off = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]
const H = hi[1] - lo[1]

const built: Built[] = parts.map((p) => {
  const w = new Float32Array(p.v.length)
  const l = [Infinity, Infinity, Infinity], h = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.v.length; i += 3) {
    const q = toWorld(p.v[i], p.v[i + 1], p.v[i + 2])
    for (let k = 0; k < 3; k++) { w[i + k] = q[k] - off[k]; l[k] = Math.min(l[k], w[i + k]); h[k] = Math.max(h[k], w[i + k]) }
  }
  const c: Vec3 = [(l[0] + h[0]) / 2, (l[1] + h[1]) / 2, (l[2] + h[2]) / 2]
  for (let i = 0; i < w.length; i += 3) for (let k = 0; k < 3; k++) w[i + k] -= c[k]
  const region = regionOf(p.name, p.system, c[1], H)
  const e: Entry = {
    id: p.id, name: p.name, system: p.system, region, side: sideOf(p.name), meshFile: `${p.system}.glb`,
    assembledPosition: c, explodedPosition: [0, 0, 0], size: [h[0] - l[0], h[1] - l[1], h[2] - l[2]],
  }
  // simplify: the "99% reduced" archive is still ~6M triangles; the skin is one large visible surface, so keep more of it
  const s = simplify(w, Uint32Array.from(p.idx), /integumentary/i.test(p.name) ? KEEP_SKIN : p.system === 'muscles' ? KEEP_MUSCLE : KEEP)
  return { e, pos: s.pos, idx: s.idx }
})

// ---- side for mirrored pairs (FJn / FJnM): names rarely say left/right, so use x position,
// with the sign convention calibrated on pieces whose names do ----
const has = new Set(built.map((b) => b.e.id))
const paired = (id: string) => has.has(id.endsWith('M') ? id.slice(0, -1) : id + 'M')
let vote = 0
for (const b of built) if (b.e.side !== 'midline' && b.e.assembledPosition[0] !== 0) vote += (b.e.side === 'left' ? 1 : -1) * Math.sign(b.e.assembledPosition[0])
const leftIsPositiveX = vote >= 0
for (const b of built) {
  if (b.e.side !== 'midline' || !paired(b.e.id) || Math.abs(b.e.assembledPosition[0]) < 0.005) continue
  b.e.side = (b.e.assembledPosition[0] > 0) === leftIsPositiveX ? 'left' : 'right'
  b.e.name = `${b.e.side === 'left' ? 'Left' : 'Right'} ${b.e.name}`
}
console.log(`side convention: left = ${leftIsPositiveX ? '+x' : '-x'} (votes ${vote})`)

// ---- 4. atlas layout, GLBs (one per system), manifest ----
await writeOutput(built, out, 'BodyParts3D', unclassified, 'scripts/unclassified.log')
