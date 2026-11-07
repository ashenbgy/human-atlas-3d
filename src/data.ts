/**
 * Loader. If /anatomy/manifest.json exists (written by scripts/build-anatomy.ts) every piece is
 * read from its system GLB (node name == piece id). Otherwise falls back to placeholder primitives.
 */
import { Box3, BufferAttribute, BufferGeometry, Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { layoutAtlas } from './lib'
import { placeholderPieces } from './placeholder'
import type { Entry, OrganId, RegionId, Side, Vec3 } from './types'
import { ORGANS } from './types'

export interface Piece { e: Entry; geo: BufferGeometry }

export const world = {
  pieces: [] as Piece[],
  byId: new Map<string, Piece>(),
  placeholder: false,
  bodyBox: new Box3(),
  atlasBox: new Box3(),
  /** Modesty shorts cut from the skin surface (skin-local coordinates), shown whenever the skin is. */
  garment: null as BufferGeometry | null,
}
/** Current region specimen-sheet: piece id -> position. Only members are present. */
export const sheet = { pos: new Map<string, Vec3>(), box: new Box3() }

const pieceBox = (p: Piece, at: Vec3) => p.geo.boundingBox!.clone().translate(new Vector3(...at))

/**
 * Push a surface outward along its normals (works whether or not the mesh is inside-out).
 * "Outward" means away from `axis` (a vertical line through the body, in the geometry's local x/z),
 * or away from the mesh's own centre when no axis is given.
 */
function inflate(g: BufferGeometry, d: number, axis?: { x: number; z: number }) {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal')
  if (!nor) return
  const c = g.boundingBox!.getCenter(new Vector3())
  const ax = axis ?? { x: c.x, z: c.z }
  let out = 0 // do the normals point away from the body? BodyParts3D's skin is wound inside-out
  for (let i = 0; i < pos.count; i += 7) out += (pos.getX(i) - ax.x) * nor.getX(i) + (axis ? 0 : (pos.getY(i) - c.y) * nor.getY(i)) + (pos.getZ(i) - ax.z) * nor.getZ(i)
  const k = out >= 0 ? d : -d
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * k, pos.getY(i) + nor.getY(i) * k, pos.getZ(i) + nor.getZ(i) * k)
  pos.needsUpdate = true
  g.computeBoundingBox()
  g.computeBoundingSphere()
}

/**
 * The skin surface is coarse, so: lift it 4 mm off the muscles, lift hair 8 mm (it sits on the scalp and
 * would otherwise vanish under the lifted skin), and cut a pair of shorts from the skin between thigh and waist.
 */
function dressSkin(pieces: Piece[]) {
  const skin = pieces.find((p) => p.e.system === 'skin' && /integumentary/i.test(p.e.name))
  if (!skin) return
  const S = skin.e.assembledPosition
  const axisFor = (p: Piece) => ({ x: S[0] - p.e.assembledPosition[0], z: S[2] - p.e.assembledPosition[2] })
  // flatten the groin back to the line of the thigh fronts, so neither skin nor shorts show the genitals' shape
  const sp = skin.geo.getAttribute('position')
  let thighs = -Infinity
  for (let i = 0; i < sp.count; i++) {
    const ax = Math.abs(sp.getX(i) + S[0]), y = sp.getY(i) + S[1]
    if (y > 0.72 && y < 0.88 && ax > 0.04 && ax < 0.16) thighs = Math.max(thighs, sp.getZ(i) + S[2])
  }
  if (thighs > -Infinity) {
    const plane = thighs + 0.002
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i) + S[0], y = sp.getY(i) + S[1]
      if (y > 0.7 && y < 0.88 && Math.abs(x) < 0.08 && sp.getZ(i) + S[2] > plane) sp.setZ(i, plane - S[2])
    }
    skin.geo.computeVertexNormals()
  }
  inflate(skin.geo, 0.004, axisFor(skin))
  for (const p of pieces) if (p.e.system === 'skin' && p !== skin) inflate(p.geo, 0.008, axisFor(p))

  const g = skin.geo, pos = g.getAttribute('position'), nor = g.getAttribute('normal'), idx = g.getIndex()
  if (!idx || !nor) return
  // waist to upper thigh; |x| < 0.2 m keeps the hanging hands and wrists out
  const keep = (i: number) => { const y = pos.getY(i) + S[1], x = pos.getX(i) + S[0]; return y > 0.7 && y < 0.98 && Math.abs(x) < 0.2 }
  const tris: number[] = []
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2)
    if (keep(a) && keep(b) && keep(c)) tris.push(a, b, c)
  }
  const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    P.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3)
    N.set([nor.getX(i), nor.getY(i), nor.getZ(i)], i * 3)
  }
  const shorts = new BufferGeometry()
  shorts.setAttribute('position', new BufferAttribute(P, 3))
  shorts.setAttribute('normal', new BufferAttribute(N, 3))
  shorts.setIndex(tris)
  shorts.computeBoundingBox()
  inflate(shorts, 0.007, axisFor(skin)) // 11 mm off the original skin in total
  // the flattened groin is folded underneath; give it one forward-facing normal so the fabric shades as a smooth panel
  const zone = (i: number) => { const x = P[i * 3] + S[0], y = P[i * 3 + 1] + S[1]; return y > 0.7 && y < 0.88 && Math.abs(x) < 0.08 }
  let front = 0 // which way do this mesh's normals face on the front of the body? (it is wound inside-out)
  for (let i = 0; i < pos.count; i++) if (!zone(i) && P[i * 3 + 2] + S[2] > 0.06) front += N[i * 3 + 2]
  const nz = front >= 0 ? 1 : -1
  for (let i = 0; i < pos.count; i++) if (zone(i) && P[i * 3 + 2] + S[2] > 0.03) N.set([0, 0, nz], i * 3)
  world.garment = shorts
}

export async function loadWorld() {
  let pieces: Piece[] = []
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}anatomy/manifest.json`)
    const manifest = (await res.json()) as { pieces: Entry[] }
    const geos = new Map<string, BufferGeometry>()
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    for (const file of new Set(manifest.pieces.map((p) => p.meshFile))) {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}anatomy/${file}`)
      gltf.scene.updateMatrixWorld(true)
      gltf.scene.traverse((o) => {
        if (!(o as Mesh).isMesh) return
        const g = (o as Mesh).geometry.clone().applyMatrix4(o.matrixWorld) // bakes meshopt quantisation transform
        if (!g.getAttribute('normal')) g.computeVertexNormals()
        g.computeBoundingBox()
        geos.set(o.name, g)
      })
    }
    pieces = manifest.pieces.filter((e) => geos.has(e.id)).map((e) => ({ e, geo: geos.get(e.id)! }))
    dressSkin(pieces)
    pieces = pieces.filter((p) => !/hair of trunk/i.test(p.e.name)) // pubic hair; covered by the shorts
  } catch (err) {
    console.warn('Anatomy assets failed to load; showing placeholder geometry.', err)
    pieces = []
  }
  world.placeholder = pieces.length === 0
  if (world.placeholder) pieces = placeholderPieces()
  world.pieces = pieces
  world.byId = new Map(pieces.map((p) => [p.e.id, p]))
  for (const p of pieces) {
    world.bodyBox.union(pieceBox(p, p.e.assembledPosition))
    world.atlasBox.union(pieceBox(p, p.e.explodedPosition))
  }
}

export const regionMembers = (region: RegionId, side: 'both' | Side) =>
  world.pieces.filter((p) => p.e.region === region && (side === 'both' || p.e.side === 'midline' || p.e.side === side))

/** Lay a region out as a specimen sheet floating in front of where it sits in the body. */
export function buildSheet(region: RegionId, side: 'both' | Side) {
  const m = regionMembers(region, side)
  const lay = layoutAtlas(m.map((p) => p.e.size))
  const c = new Box3()
  m.forEach((p) => c.union(pieceBox(p, p.e.assembledPosition)))
  const ctr = c.getCenter(new Vector3())
  sheet.pos = new Map()
  sheet.box = new Box3()
  m.forEach((p, i) => {
    const at: Vec3 = [ctr.x + lay[i][0], ctr.y + lay[i][1], ctr.z + 0.25]
    sheet.pos.set(p.e.id, at)
    sheet.box.union(pieceBox(p, at))
  })
}

/** Current organ view: the pieces shown and their assembled bounding box. */
export const focus = { ids: new Set<string>(), box: new Box3() }

export const organMembers = (id: OrganId) => {
  const o = ORGANS.find((x) => x.id === id)!
  return world.pieces.filter((p) => (o.systems as readonly string[]).includes(p.e.system) && o.match.test(p.e.name))
}

export function buildFocus(id: OrganId) {
  const m = organMembers(id)
  focus.ids = new Set(m.map((p) => p.e.id))
  focus.box = new Box3()
  m.forEach((p) => focus.box.union(pieceBox(p, p.e.assembledPosition)))
}
