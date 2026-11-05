import type { Side, Vec3 } from './types'

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const sideOf = (name: string): Side =>
  /\bright\b/i.test(name) ? 'right' : /\bleft\b/i.test(name) ? 'left' : 'midline'
export const ATLAS_CENTER: Vec3 = [0, 0.9, 0]

/**
 * Specimen-sheet layout: shelf packing, largest pieces on the top rows, smaller (and
 * tighter-spaced) pieces toward the bottom. Returns centres around the origin on z = 0.
 */
export function layoutAtlas(sizes: Vec3[]): Vec3[] {
  const gap = (s: Vec3) => 0.008 + 0.1 * Math.max(...s)
  const order = sizes.map((_, i) => i).sort((a, b) => Math.max(...sizes[b]) - Math.max(...sizes[a]))
  let area = 0
  for (const s of sizes) area += (s[0] + gap(s)) * (s[1] + gap(s))
  const W = Math.max(Math.sqrt(area * 2.2), 0.2)
  type Row = { h: number; items: { i: number; x: number }[] }
  const rows: Row[] = []
  let row: Row = { h: 0, items: [] }
  let x = 0
  for (const i of order) {
    const s = sizes[i]
    const g = gap(s)
    if (x + s[0] + g > W && row.items.length) {
      rows.push(row)
      row = { h: 0, items: [] }
      x = 0
    }
    row.items.push({ i, x: x + s[0] / 2 })
    row.h = Math.max(row.h, s[1] + g)
    x += s[0] + g
  }
  rows.push(row)
  const out: Vec3[] = sizes.map(() => [0, 0, 0])
  let y = rows.reduce((a, r) => a + r.h, 0) / 2
  for (const r of rows) {
    for (const it of r.items) out[it.i] = [it.x - W / 2, y - r.h / 2, 0]
    y -= r.h
  }
  return out
}
