/**
 * Loader. If /anatomy/manifest.json exists (written by scripts/build-anatomy.ts) every piece is
 * read from its system GLB (node name == piece id). Otherwise falls back to placeholder primitives.
 */
import { Box3, BufferGeometry, Mesh, Vector3 } from 'three'
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
}
/** Current region specimen-sheet: piece id -> position. Only members are present. */
export const sheet = { pos: new Map<string, Vec3>(), box: new Box3() }

const pieceBox = (p: Piece, at: Vec3) => p.geo.boundingBox!.clone().translate(new Vector3(...at))

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
