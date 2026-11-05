export type Vec3 = [number, number, number]
export type Side = 'left' | 'right' | 'midline'

export const SYSTEMS = [
  { id: 'skeleton', label: 'Skeleton', category: 'Bone', color: '#CFC6B0' },
  { id: 'muscles', label: 'Muscles', category: 'Muscle', color: '#B8695A' },
  { id: 'heart', label: 'Heart', category: 'Heart', color: '#A63D40' },
  { id: 'sensory', label: 'Sensory organs', category: 'Sense organ', color: '#7C9BB8' },
  { id: 'arteries', label: 'Arteries', category: 'Artery', color: '#C4453C' },
  { id: 'veins', label: 'Veins', category: 'Vein', color: '#4A6AA5' },
  { id: 'nervous', label: 'Nervous system', category: 'Nervous system', color: '#D9B44A' },
  { id: 'respiratory', label: 'Respiratory', category: 'Respiratory', color: '#93B8AA' },
] as const
export type SystemId = (typeof SYSTEMS)[number]['id']

export const REGIONS = ['hand', 'shoulder', 'thigh', 'foot', 'heart', 'brain'] as const
export type RegionId = (typeof REGIONS)[number]

/** One anatomical piece. `size` is the geometry bounding-box extent in metres. */
export interface Entry {
  id: string
  name: string
  system: SystemId
  region: string
  side: Side
  meshFile: string // GLB containing this piece (node name == id). '' for placeholders.
  assembledPosition: Vec3
  explodedPosition: Vec3
  size: Vec3
  /** Only filled from verified attachment data (none ships with BodyParts3D). Entry ids. */
  attachments?: string[]
}
