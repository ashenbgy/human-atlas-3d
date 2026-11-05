import { Box3, Vector3 } from 'three'
import { easeInOutCubic } from './lib'
import { sheet, world } from './data'
import { useStore } from './store'
import type { Piece } from './data'

/** Filled in by CameraRig (Scene.tsx). Lets non-React code (store, UI) drive the camera. */
export const cam = {
  fitBox: (_b: Box3, _pad?: number, _front?: boolean) => {},
  zoom: (_f: number) => {},
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
