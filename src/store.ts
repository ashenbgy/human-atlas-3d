import { create } from 'zustand'
import { cam, focusPiece, viewBox } from './camera'
import { buildSheet, sheet, world } from './data'
import { REGIONS, SYSTEMS } from './types'
import type { RegionId, Side, SystemId } from './types'

type Systems = Record<SystemId, boolean>
const all = (on: boolean) => Object.fromEntries(SYSTEMS.map((s) => [s.id, on])) as Systems

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
  setSystem: (id: SystemId, on: boolean) => void
  preset: (p: 'all' | 'skeleton' | 'organs' | 'none') => void
  select: (id: string) => void
  clear: () => void
  setExplode: (v: number) => void
  setRegion: (r: RegionId | null) => void
  setSide: (s: 'both' | Side) => void
}

export const useStore = create<State>()((set, get) => ({
  systems: all(true), selectedId: null, isolate: false, hoverId: null, explode: 0,
  region: null, side: 'both', tool: 'orbit', creditsOpen: false,
  setSystem: (id, on) => set((s) => ({ systems: { ...s.systems, [id]: on } })),
  preset: (p) =>
    set({
      systems:
        p === 'all' ? all(true) : p === 'none' ? all(false)
        : { ...all(false), ...(p === 'skeleton' ? { skeleton: true } : { heart: true, sensory: true, nervous: true, respiratory: true }) },
    }),
  select: (id) => {
    const piece = world.byId.get(id)
    if (!piece) return
    set((s) => ({ selectedId: id, systems: { ...s.systems, [piece.e.system]: true } }))
    focusPiece(id)
  },
  clear: () => set({ selectedId: null, isolate: false }),
  setExplode: (v) => {
    set({ explode: v, region: null })
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
    set({ region: next, explode: 0, systems: all(true), selectedId: null, isolate: false })
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
