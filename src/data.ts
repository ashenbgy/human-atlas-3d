/**
 * Loader. If /anatomy/manifest.json exists (written by scripts/build-anatomy.ts) every piece is
 * read from its system GLB (node name == piece id). Otherwise falls back to placeholder primitives.
 */
import { Box3, BufferAttribute, BufferGeometry, Mesh, Sphere, Vector3 } from 'three'
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
  shorts.computeBoundingSphere()
  inflate(shorts, 0.007, axisFor(skin)) // 11 mm off the original skin in total
  // the flattened groin is folded underneath; give it one forward-facing normal so the fabric shades as a smooth panel
  const zone = (i: number) => { const x = P[i * 3] + S[0], y = P[i * 3 + 1] + S[1]; return y > 0.7 && y < 0.88 && Math.abs(x) < 0.08 }
  let front = 0 // which way do this mesh's normals face on the front of the body? (it is wound inside-out)
  for (let i = 0; i < pos.count; i++) if (!zone(i) && P[i * 3 + 2] + S[2] > 0.06) front += N[i * 3 + 2]
  const nz = front >= 0 ? 1 : -1
  for (let i = 0; i < pos.count; i++) if (zone(i) && P[i * 3 + 2] + S[2] > 0.03) N.set([0, 0, nz], i * 3)
  world.garment = shorts
}

function processGeometry(o: Mesh): BufferGeometry {
  const origGeo = o.geometry
  const posAttr = origGeo.attributes.position
  const count = posAttr.count
  const indexAttr = origGeo.index
  const e = o.matrixWorld.elements
  const pos = new Float32Array(count * 3)
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  const isInterleaved = !!(posAttr as any).isInterleavedBufferAttribute
  const isNormalized = !!posAttr.normalized
  // normalised integer positions (meshopt quantisation) map to [-1, 1] / [0, 1] by array type
  const arr = posAttr.array
  const scaleFactor = !isNormalized ? 1 : arr instanceof Int16Array ? 1 / 32767 : arr instanceof Uint16Array ? 1 / 65535 : arr instanceof Int8Array ? 1 / 127 : arr instanceof Uint8Array ? 1 / 255 : 1
  const isDiag = (e[1] === 0 && e[2] === 0 && e[3] === 0 &&
                  e[4] === 0 && e[6] === 0 && e[7] === 0 &&
                  e[8] === 0 && e[9] === 0 && e[11] === 0 &&
                  e[12] === 0 && e[13] === 0 && e[14] === 0 && e[15] === 1)
  const m00 = e[0], m11 = e[5], m22 = e[10]

  if (isInterleaved) {
    const src = (posAttr as any).data.array as ArrayLike<number>
    const stride = (posAttr as any).data.stride as number
    const offset = (posAttr as any).offset as number
    for (let i = 0, j = 0; i < count; i++, j += 3) {
      const srcIdx = i * stride + offset
      let x = src[srcIdx] * scaleFactor
      let y = src[srcIdx + 1] * scaleFactor
      let z = src[srcIdx + 2] * scaleFactor
      if (isDiag) {
        x *= m00; y *= m11; z *= m22
      } else {
        const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15])
        const nx = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w
        const ny = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w
        const nz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
        x = nx; y = ny; z = nz
      }
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
  } else {
    const src = posAttr.array
    for (let i = 0, j = 0; i < count; i++, j += 3) {
      let x = src[j] * scaleFactor
      let y = src[j + 1] * scaleFactor
      let z = src[j + 2] * scaleFactor
      if (isDiag) {
        x *= m00; y *= m11; z *= m22
      } else {
        const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15])
        const nx = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w
        const ny = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w
        const nz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
        x = nx; y = ny; z = nz
      }
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
  }

  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  if (indexAttr) g.setIndex(indexAttr)
  g.boundingBox = new Box3(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ))

  const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, cz = (minZ + maxZ) * 0.5
  let maxRadiusSq = 0
  for (let j = 0; j < pos.length; j += 3) {
    const dx = pos[j] - cx, dy = pos[j + 1] - cy, dz = pos[j + 2] - cz
    const rSq = dx * dx + dy * dy + dz * dz
    if (rSq > maxRadiusSq) maxRadiusSq = rSq
  }
  g.boundingSphere = new Sphere(new Vector3(cx, cy, cz), Math.sqrt(maxRadiusSq))

  const norm = new Float32Array(count * 3)
  const idx = indexAttr ? indexAttr.array : null
  if (idx) {
    for (let i = 0; i < idx.length; i += 3) {
      const ia = idx[i] * 3, ib = idx[i + 1] * 3, ic = idx[i + 2] * 3
      const ax = pos[ia], ay = pos[ia + 1], az = pos[ia + 2]
      const bx = pos[ib], by = pos[ib + 1], bz = pos[ib + 2]
      const cx_ = pos[ic], cy_ = pos[ic + 1], cz_ = pos[ic + 2]
      const cbx = cx_ - bx, cby = cy_ - by, cbz = cz_ - bz
      const abx = ax - bx, aby = ay - by, abz = az - bz
      const nx = cby * abz - cbz * aby
      const ny = cbz * abx - cbx * abz
      const nz = cbx * aby - cby * abx
      norm[ia] += nx; norm[ia + 1] += ny; norm[ia + 2] += nz
      norm[ib] += nx; norm[ib + 1] += ny; norm[ib + 2] += nz
      norm[ic] += nx; norm[ic + 1] += ny; norm[ic + 2] += nz
    }
  }
  for (let j = 0; j < norm.length; j += 3) {
    const x = norm[j], y = norm[j + 1], z = norm[j + 2]
    const len = Math.hypot(x, y, z) || 1
    norm[j] = x / len; norm[j + 1] = y / len; norm[j + 2] = z / len
  }
  g.setAttribute('normal', new BufferAttribute(norm, 3))
  return g
}

export async function loadWorld() {
  let pieces: Piece[] = []
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}anatomy/manifest.json`)
    const manifest = (await res.json()) as { pieces: Entry[] }
    const geos = new Map<string, BufferGeometry>()
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const files = Array.from(new Set(manifest.pieces.map((p) => p.meshFile)))
    await Promise.all(
      files.map(async (file) => {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}anatomy/${file}`)
        gltf.scene.updateMatrixWorld(true)
        gltf.scene.traverse((o) => {
          if (!(o as Mesh).isMesh) return
          geos.set(o.name, processGeometry(o as Mesh))
        })
      }),
    )
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
