/**
 * PLACEHOLDER GEOMETRY — primitives only, NOT anatomy. Used when public/anatomy/manifest.json is
 * absent so the whole app (explode, search, regions, isolate…) can be developed and tested.
 * Run `npm run build:anatomy` with BodyParts3D in assets/anatomy/raw to replace it with real data.
 * Body is ~1.75 m tall, feet on y=0, facing +z; anatomical right = -x.
 */
import { BoxGeometry, BufferGeometry, CapsuleGeometry, SphereGeometry, TorusGeometry, Vector3 } from 'three'
import { ATLAS_CENTER, layoutAtlas } from './lib'
import type { Entry, SystemId, Vec3 } from './types'

type G = ['cap', number, number] | ['sph', number, number, number] | ['box', number, number, number] | ['tor', number, number]
const H = Math.PI / 2
const rows: { name: string; system: SystemId; region: string; pos: Vec3; g: G; rot: Vec3 }[] = []

/** `x` is distance from midline; bilateral pieces are mirrored (right = -x). */
function add(name: string, system: SystemId, region: string, pos: Vec3, g: G, rot: Vec3 = [0, 0, 0], bilateral = true) {
  if (!bilateral) return void rows.push({ name, system, region, pos, g, rot })
  rows.push({ name: `Right ${name}`, system, region, pos: [-pos[0], pos[1], pos[2]], g, rot: [rot[0], -rot[1], -rot[2]] })
  rows.push({ name: `Left ${name}`, system, region, pos, g, rot })
}
const one = (n: string, s: SystemId, r: string, p: Vec3, g: G, rot?: Vec3) => add(n, s, r, p, g, rot, false)

// skeleton
one('Skull', 'skeleton', 'head', [0, 1.64, 0], ['sph', 0.095, 0.115, 0.11])
one('Mandible', 'skeleton', 'head', [0, 1.55, 0.02], ['box', 0.1, 0.04, 0.09])
for (let i = 0; i < 7; i++) one(`Cervical vertebra C${i + 1}`, 'skeleton', 'neck', [0, 1.5 - 0.02 * i, -0.03], ['box', 0.035, 0.018, 0.035])
for (let i = 0; i < 12; i++) one(`Thoracic vertebra T${i + 1}`, 'skeleton', 'trunk', [0, 1.38 - 0.028 * i, -0.05], ['box', 0.045, 0.022, 0.045])
for (let i = 0; i < 5; i++) one(`Lumbar vertebra L${i + 1}`, 'skeleton', 'trunk', [0, 1.02 - 0.035 * i, -0.04], ['box', 0.055, 0.03, 0.05])
one('Sacrum', 'skeleton', 'pelvis', [0, 0.86, -0.06], ['box', 0.1, 0.1, 0.04])
one('Sternum', 'skeleton', 'trunk', [0, 1.33, 0.085], ['box', 0.03, 0.17, 0.012])
for (let i = 0; i < 12; i++) add(`Rib ${i + 1}`, 'skeleton', 'trunk', [0.07 + 0.01 * Math.min(i, 6), 1.4 - 0.027 * i, 0.02], ['cap', 0.006, 0.12], [0, 0.3, H])
add('Clavicle', 'skeleton', 'shoulder', [0.09, 1.45, 0.06], ['cap', 0.008, 0.13], [0, 0, H])
add('Scapula', 'skeleton', 'shoulder', [0.14, 1.35, -0.07], ['box', 0.1, 0.12, 0.01])
add('Humerus', 'skeleton', 'arm', [0.2, 1.25, 0], ['cap', 0.02, 0.25])
add('Ulna', 'skeleton', 'arm', [0.255, 0.95, 0.01], ['cap', 0.011, 0.22])
add('Radius', 'skeleton', 'arm', [0.285, 0.95, 0], ['cap', 0.01, 0.2])
add('Carpal bones', 'skeleton', 'hand', [0.29, 0.78, 0], ['box', 0.05, 0.03, 0.025])
for (let j = 0; j < 5; j++) {
  add(`Metacarpal ${j + 1}`, 'skeleton', 'hand', [0.27 + 0.012 * j, 0.72, 0], ['cap', 0.006, 0.05])
  add(`Proximal phalanx of finger ${j + 1}`, 'skeleton', 'hand', [0.27 + 0.012 * j, 0.66, 0], ['cap', 0.005, 0.03])
}
add('Hip bone', 'skeleton', 'pelvis', [0.1, 0.88, 0], ['sph', 0.09, 0.07, 0.05])
add('Femur', 'skeleton', 'thigh', [0.09, 0.62, 0], ['cap', 0.024, 0.38])
add('Patella', 'skeleton', 'thigh', [0.09, 0.4, 0.03], ['sph', 0.02, 0.025, 0.01])
add('Tibia', 'skeleton', 'leg', [0.085, 0.2, 0], ['cap', 0.02, 0.34])
add('Fibula', 'skeleton', 'leg', [0.115, 0.21, -0.005], ['cap', 0.01, 0.32])
add('Calcaneus', 'skeleton', 'foot', [0.085, 0.03, -0.04], ['box', 0.04, 0.035, 0.07])
add('Talus', 'skeleton', 'foot', [0.085, 0.07, -0.01], ['box', 0.04, 0.03, 0.05])
for (let j = 0; j < 5; j++) add(`Metatarsal ${j + 1}`, 'skeleton', 'foot', [0.07 + 0.012 * j, 0.02, 0.06], ['cap', 0.007, 0.05], [H, 0, 0])
// muscles
add('Deltoid', 'muscles', 'shoulder', [0.2, 1.42, 0], ['sph', 0.045, 0.07, 0.05])
add('Pectoralis major', 'muscles', 'trunk', [0.08, 1.35, 0.09], ['sph', 0.1, 0.07, 0.02])
add('Biceps brachii', 'muscles', 'arm', [0.21, 1.25, 0.03], ['cap', 0.025, 0.2])
add('Triceps brachii', 'muscles', 'arm', [0.21, 1.25, -0.03], ['cap', 0.025, 0.2])
add('Brachioradialis', 'muscles', 'arm', [0.28, 1.0, 0.02], ['cap', 0.02, 0.18])
add('Trapezius', 'muscles', 'trunk', [0.07, 1.42, -0.07], ['sph', 0.12, 0.1, 0.02])
add('Latissimus dorsi', 'muscles', 'trunk', [0.1, 1.2, -0.09], ['box', 0.15, 0.2, 0.015])
add('Rectus abdominis', 'muscles', 'trunk', [0.035, 1.1, 0.09], ['cap', 0.035, 0.22])
add('External oblique', 'muscles', 'trunk', [0.12, 1.1, 0.07], ['sph', 0.07, 0.12, 0.03])
add('Gluteus maximus', 'muscles', 'pelvis', [0.09, 0.88, -0.08], ['sph', 0.09, 0.08, 0.05])
add('Rectus femoris', 'muscles', 'thigh', [0.09, 0.65, 0.04], ['cap', 0.035, 0.3])
add('Vastus lateralis', 'muscles', 'thigh', [0.13, 0.62, 0], ['cap', 0.03, 0.3])
add('Sartorius', 'muscles', 'thigh', [0.1, 0.62, 0.045], ['cap', 0.014, 0.4], [0, 0, 0.15])
add('Gracilis', 'muscles', 'thigh', [0.05, 0.6, 0], ['cap', 0.015, 0.32])
add('Biceps femoris', 'muscles', 'thigh', [0.1, 0.62, -0.045], ['cap', 0.03, 0.3])
add('Gastrocnemius', 'muscles', 'leg', [0.09, 0.28, -0.04], ['cap', 0.035, 0.16])
add('Tibialis anterior', 'muscles', 'leg', [0.095, 0.2, 0.03], ['cap', 0.02, 0.25])
add('Soleus', 'muscles', 'leg', [0.09, 0.22, -0.025], ['cap', 0.03, 0.2])
// heart
one('Right atrium', 'heart', 'heart', [-0.02, 1.33, 0.05], ['sph', 0.025, 0.025, 0.025])
one('Left atrium', 'heart', 'heart', [0.025, 1.33, 0.04], ['sph', 0.025, 0.025, 0.025])
one('Right ventricle', 'heart', 'heart', [-0.01, 1.27, 0.06], ['sph', 0.03, 0.04, 0.03])
one('Left ventricle', 'heart', 'heart', [0.025, 1.27, 0.045], ['sph', 0.03, 0.045, 0.03])
// sensory
add('Eyeball', 'sensory', 'head', [0.032, 1.65, 0.095], ['sph', 0.012, 0.012, 0.012])
add('Auricle', 'sensory', 'head', [0.095, 1.64, 0], ['box', 0.01, 0.05, 0.03])
one('Tongue', 'sensory', 'head', [0, 1.56, 0.04], ['sph', 0.03, 0.01, 0.04])
// arteries
one('Aorta', 'arteries', 'trunk', [0.015, 1.1, -0.01], ['cap', 0.012, 0.4])
add('Common carotid artery', 'arteries', 'neck', [0.025, 1.5, 0], ['cap', 0.006, 0.1])
add('Brachial artery', 'arteries', 'arm', [0.22, 1.22, 0], ['cap', 0.005, 0.25])
add('Common iliac artery', 'arteries', 'pelvis', [0.04, 0.84, 0], ['cap', 0.008, 0.08], [0, 0, 0.5])
add('Femoral artery', 'arteries', 'thigh', [0.07, 0.6, 0.03], ['cap', 0.008, 0.4])
add('Anterior tibial artery', 'arteries', 'leg', [0.09, 0.2, 0.035], ['cap', 0.005, 0.3])
// veins
one('Superior vena cava', 'veins', 'trunk', [-0.02, 1.38, 0], ['cap', 0.01, 0.12])
one('Inferior vena cava', 'veins', 'trunk', [-0.025, 1.05, -0.01], ['cap', 0.012, 0.35])
add('Internal jugular vein', 'veins', 'neck', [0.03, 1.5, 0.005], ['cap', 0.008, 0.1])
add('Brachial vein', 'veins', 'arm', [0.2, 1.22, -0.01], ['cap', 0.005, 0.25])
add('Femoral vein', 'veins', 'thigh', [0.065, 0.6, 0.025], ['cap', 0.01, 0.4])
add('Great saphenous vein', 'veins', 'leg', [0.06, 0.4, 0.04], ['cap', 0.005, 0.7])
// nervous
one('Brain', 'nervous', 'brain', [0, 1.67, 0], ['sph', 0.075, 0.06, 0.09])
one('Cerebellum', 'nervous', 'brain', [0, 1.6, -0.07], ['sph', 0.04, 0.03, 0.04])
one('Brainstem', 'nervous', 'brain', [0, 1.58, -0.03], ['cap', 0.012, 0.05])
one('Spinal cord', 'nervous', 'trunk', [0, 1.15, -0.04], ['cap', 0.006, 0.6])
add('Median nerve', 'nervous', 'arm', [0.24, 1.05, 0.015], ['cap', 0.004, 0.45])
add('Sciatic nerve', 'nervous', 'thigh', [0.08, 0.65, -0.03], ['cap', 0.006, 0.4])
// respiratory
one('Trachea', 'respiratory', 'neck', [0, 1.43, 0], ['cap', 0.01, 0.1])
one('Larynx', 'respiratory', 'neck', [0, 1.5, 0.03], ['box', 0.03, 0.035, 0.025])
add('Lung', 'respiratory', 'trunk', [0.09, 1.3, 0], ['sph', 0.08, 0.12, 0.07])
add('Bronchus', 'respiratory', 'trunk', [0.03, 1.36, 0], ['cap', 0.006, 0.05], [0, 0, 1])

function geometry([k, a, b, c]: G, [rx, ry, rz]: Vec3): BufferGeometry {
  const g: BufferGeometry =
    k === 'cap' ? new CapsuleGeometry(a, b, 4, 10)
    : k === 'sph' ? new SphereGeometry(1, 16, 12).scale(a, b, c!)
    : k === 'box' ? new BoxGeometry(a, b, c!)
    : new TorusGeometry(a, b, 6, 20)
  g.rotateX(rx).rotateY(ry).rotateZ(rz)
  g.computeBoundingBox()
  return g
}

export function placeholderPieces(): { e: Entry; geo: BufferGeometry }[] {
  const geos = rows.map((r) => geometry(r.g, r.rot))
  const sizes = geos.map((g) => g.boundingBox!.getSize(new Vector3()).toArray() as Vec3)
  const atlas = layoutAtlas(sizes)
  return rows.map((r, i) => ({
    geo: geos[i],
    e: {
      id: `PH${String(i + 1).padStart(4, '0')}`, name: r.name, system: r.system, region: r.region,
      side: /^Right /.test(r.name) ? 'right' : /^Left /.test(r.name) ? 'left' : 'midline',
      meshFile: '', assembledPosition: r.pos, size: sizes[i],
      explodedPosition: [atlas[i][0] + ATLAS_CENTER[0], atlas[i][1] + ATLAS_CENTER[1], atlas[i][2] + ATLAS_CENTER[2]],
    },
  }))
}
