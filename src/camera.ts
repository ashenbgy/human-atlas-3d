import { Box3, Vector3 } from 'three'
import { easeInOutCubic } from './lib'
import { focus, sheet, world } from './data'
import { useStore } from './store'
import type { Piece } from './data'

/** Filled in by CameraRig (Scene.tsx). Lets non-React code (store, UI) drive the camera. */
export const cam = {
  /** dir: true = front, a vector = look from that side, omitted = keep the current direction */
  fitBox: (_b: Box3, _pad?: number, _dir?: boolean | Vector3) => {},
  zoom: (_f: number) => {},
  orbit: (_dTheta: number, _dPhi: number) => {},
  pan: (_dx: number, _dy: number) => {},
  /** id of the visible structure at the centre of the screen */
  pickCenter: (): string | null => null,
}

export const VIEWS = {
  front: new Vector3(0, 0.05, 1),
  back: new Vector3(0, 0.05, -1),
  side: new Vector3(1, 0.05, 0), // from the subject's left (+x)
  quarter: new Vector3(0.75, 0.3, 1),
} as const
export type ViewId = keyof typeof VIEWS

/** What the camera should frame right now: organ, region sheet, selection or body/atlas. */
export function currentBox(): Box3 {
  const s = useStore.getState()
  if (s.organ) return focus.box
  if (s.region) return sheet.box
  const p = s.selectedId ? world.byId.get(s.selectedId) : undefined
  return p ? pieceBox(p) : viewBox()
}

/** Box around what is currently on screen: body, atlas or somewhere between. */
export function viewBox(): Box3 {
  const e = easeInOutCubic(useStore.getState().explode)
  const { min: a, max: b } = world.bodyBox
  const { min: c, max: d } = world.atlasBox
  return new Box3(a.clone().lerp(c, e), b.clone().lerp(d, e))
}

/** Target-state world box of one piece (where it will be once animations settle). */
export function pieceBox(p: Piece): Box3 {
  const s = useStore.getState()
  const sp = s.region ? sheet.pos.get(p.e.id) : undefined
  const a = p.e.assembledPosition, x = p.e.explodedPosition, e = easeInOutCubic(s.explode)
  const at = sp ?? [a[0] + (x[0] - a[0]) * e, a[1] + (x[1] - a[1]) * e, a[2] + (x[2] - a[2]) * e]
  return p.geo.boundingBox!.clone().translate(new Vector3(at[0], at[1], at[2]))
}

/** focusOnObject: bounding box -> centre + distance -> tween camera & controls target. */
export const focusPiece = (id: string) => {
  const p = world.byId.get(id)
  if (p) cam.fitBox(pieceBox(p), 1.7)
}
