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
  { id: 'digestive', label: 'Digestive', category: 'Digestive', color: '#C98B6B' },
  { id: 'urinary', label: 'Urinary', category: 'Urinary', color: '#B8865B' },
  { id: 'endocrine', label: 'Endocrine', category: 'Endocrine', color: '#8E7CC3' },
  { id: 'reproductive', label: 'Reproductive', category: 'Reproductive', color: '#C47A9A' },
  { id: 'lymphatic', label: 'Lymphatic', category: 'Lymphatic', color: '#6FA36B' },
  { id: 'connective', label: 'Connective tissue', category: 'Connective tissue', color: '#D8CCB4' },
  { id: 'skin', label: 'Skin', category: 'Skin', color: '#E2B9A0' },
] as const
export type SystemId = (typeof SYSTEMS)[number]['id']

/** Depth layers, outermost first, for "peel back". */
export const LAYERS = [
  { id: 'skin', label: 'Skin', systems: ['skin'] },
  { id: 'muscles', label: 'Muscles', systems: ['muscles', 'connective'] },
  { id: 'vessels', label: 'Vessels', systems: ['arteries', 'veins', 'lymphatic'] },
  { id: 'organs', label: 'Organs', systems: ['heart', 'sensory', 'nervous', 'respiratory', 'digestive', 'urinary', 'endocrine', 'reproductive'] },
  { id: 'skeleton', label: 'Skeleton', systems: ['skeleton'] },
] as const satisfies readonly { id: string; label: string; systems: readonly SystemId[] }[]
export type LayerId = (typeof LAYERS)[number]['id']

/** One-click organ views: pieces whose system is listed and whose name matches. */
export const ORGANS = [
  { id: 'heart', label: 'Heart', systems: ['heart'], match: /./ },
  { id: 'brain', label: 'Brain', systems: ['nervous'], match: /brain|cerebr|cerebell|gyrus|lobe|lobule|thalam|colliculus|geniculate|insula|pons|medulla oblongata|midbrain|hippocamp|amygdal|corpus callosum|caudate|putamen|fornix|capsule|commissure|mammillary|habenula|ventricle/i },
  { id: 'lungs', label: 'Lungs', systems: ['respiratory'], match: /lung|bronch|trachea/i },
  { id: 'liver', label: 'Liver', systems: ['digestive'], match: /liver|hepatic|gallbladder|cystic duct|biliary/i },
  { id: 'stomach', label: 'Stomach', systems: ['digestive'], match: /stomach|esophag/i },
  { id: 'pancreas', label: 'Pancreas', systems: ['digestive'], match: /pancrea/i },
  { id: 'small-intestine', label: 'Small intestine', systems: ['digestive'], match: /duoden|jejun|ileum|mesentery of small/i },
  { id: 'large-intestine', label: 'Large intestine', systems: ['digestive'], match: /cecum|appendix|colon|rectum|taenia|mesentery of large/i },
  { id: 'kidneys', label: 'Kidneys', systems: ['urinary'], match: /kidney|renal|ureter/i },
  { id: 'eye', label: 'Eye', systems: ['sensory'], match: /eye|cornea|iris|retina|lens|sclera|choroid|vitreous|ciliary|optic/i },
] as const satisfies readonly { id: string; label: string; systems: readonly SystemId[]; match: RegExp }[]
export type OrganId = (typeof ORGANS)[number]['id']

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
