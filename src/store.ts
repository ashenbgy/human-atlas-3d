import { create } from 'zustand'
import { cam, currentBox, focusPiece, VIEWS, viewBox } from './camera'
import type { ViewId } from './camera'
import { buildFocus, buildSheet, focus, sheet, world } from './data'
import { LAYERS, ORGANS, REGIONS, SYSTEMS } from './types'
import type { LayerId, OrganId, RegionId, Side, SystemId } from './types'

type Systems = Record<SystemId, boolean>
const all = (on: boolean) => Object.fromEntries(SYSTEMS.map((s) => [s.id, on])) as Systems
/** Everything except skin, which would hide all the rest. */
export const DEFAULT_SYSTEMS: Systems = { ...all(true), skin: false }
export const ORGAN_SYSTEMS: SystemId[] = ['heart', 'sensory', 'nervous', 'respiratory', 'digestive', 'urinary', 'endocrine', 'reproductive', 'lymphatic']
const fullLayers = () => Object.fromEntries(LAYERS.map((l) => [l.id, 1])) as Record<LayerId, number>

interface State {
  systems: Systems
  selectedId: string | null
  isolate: boolean
  hoverId: string | null
  explode: number // 0..1 target; Scene eases toward it
  region: RegionId | null
  side: 'both' | Side
  tool: 'orbit' | 'pan'
  creditsOpen: boolean
  layers: Record<LayerId, number> // 0..1 opacity per depth layer
  organ: OrganId | null
  view: ViewId | null // null once the user orbits away from a preset
  setLayer: (id: LayerId, v: number) => void
  peelBack: () => void
  restoreLayers: () => void
  setOrgan: (o: OrganId | null) => void
  setView: (v: ViewId) => void
  setSystem: (id: SystemId, on: boolean) => void
  preset: (p: 'all' | 'skeleton' | 'organs' | 'none') => void
  select: (id: string) => void
  clear: () => void
  setExplode: (v: number) => void
  setRegion: (r: RegionId | null) => void
  setSide: (s: 'both' | Side) => void
}

export const useStore = create<State>()((set, get) => ({
  systems: DEFAULT_SYSTEMS, selectedId: null, isolate: false, hoverId: null, explode: 0,
  region: null, side: 'both', tool: 'orbit', creditsOpen: false,
  layers: fullLayers(), organ: null, view: 'front',
  setLayer: (id, v) =>
    set((s) => {
      // raising a layer turns its systems on (e.g. skin is off by default)
      const on = v > 0 ? Object.fromEntries(LAYERS.find((l) => l.id === id)!.systems.map((x) => [x, true])) : {}
      return { layers: { ...s.layers, [id]: v }, systems: { ...s.systems, ...on } }
    }),
  peelBack: () => {
    const { layers, systems } = get()
    // outermost layer that is still showing something
    const next = LAYERS.find((l) => layers[l.id] > 0 && l.systems.some((x) => systems[x]) && l.id !== 'skeleton')
    if (next) set({ layers: { ...layers, [next.id]: 0 } })
  },
  restoreLayers: () => set({ layers: fullLayers() }),
  setOrgan: (o) => {
    const next = o === get().organ ? null : o
    if (!next) {
      set({ organ: null })
      cam.fitBox(viewBox(), 1.1)
      return
    }
    buildFocus(next)
    const sys = Object.fromEntries(ORGANS.find((x) => x.id === next)!.systems.map((x) => [x, true]))
    set((s) => ({ organ: next, region: null, explode: 0, selectedId: null, isolate: false, systems: { ...s.systems, ...sys } }))
    cam.fitBox(focus.box, 1.3, true)
  },
  setView: (v) => {
    set({ view: v })
    cam.fitBox(currentBox(), get().selectedId ? 1.7 : get().organ || get().region ? 1.3 : 1.1, VIEWS[v].clone())
  },
  setSystem: (id, on) => set((s) => ({ systems: { ...s.systems, [id]: on } })),
  preset: (p) =>
    set({
      systems:
        p === 'all' ? DEFAULT_SYSTEMS : p === 'none' ? all(false)
        : { ...all(false), ...(p === 'skeleton' ? { skeleton: true } : Object.fromEntries(ORGAN_SYSTEMS.map((x) => [x, true]))) },
    }),
  select: (id) => {
    const piece = world.byId.get(id)
    if (!piece) return
    set((s) => ({ selectedId: id, systems: { ...s.systems, [piece.e.system]: true } }))
    focusPiece(id)
  },
  clear: () => set({ selectedId: null, isolate: false }),
  setExplode: (v) => {
    set({ explode: v, region: null, organ: null })
    cam.fitBox(viewBox(), 1.1)
  },
  setRegion: (r) => {
    const next = r === get().region ? null : r
    if (!next) {
      set({ region: null, selectedId: null, isolate: false })
      cam.fitBox(viewBox(), 1.1)
      return
    }
    buildSheet(next, get().side)
    set({ region: next, organ: null, explode: 0, systems: DEFAULT_SYSTEMS, selectedId: null, isolate: false })
    cam.fitBox(sheet.box, 1.3, true)
  },
  setSide: (side) => {
    set({ side })
    const r = get().region
    if (r) {
      buildSheet(r, side)
      cam.fitBox(sheet.box, 1.3, true)
    }
  },
}))

export const regionCount = (r: RegionId) => world.pieces.filter((p) => p.e.region === r).length
export { REGIONS }
export { organMembers } from './data'
