/** Shared by the male (BodyParts3D) and female (Human Reference Atlas) builds: classification and output. */
import fs from 'node:fs'
import path from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { ATLAS_CENTER, layoutAtlas } from '../src/lib'
import type { Entry, SystemId } from '../src/types'

// First matching rule wins. Order matters (e.g. brain ventricles before heart ventricles).
export const RULES: [SystemId, RegExp][] = [
  ['endocrine', /(adrenal|suprarenal) gland|thyroid gland|parathyroid|pituitary|pineal|hypophysis/i],
  ['skin', /integumentary|\bskin\b|hair of|eyebrow|eyelash/i],
  ['nervous', /brain|cerebr|cerebell|lateral ventricle|third ventricle|fourth ventricle|spinal cord|nerve(?!.*eye)|ganglion|plexus|gyrus|thalam|medulla|\bpons\b|midbrain|hippocamp|amygdal|corpus callosum|caudate(?! lobe)|putamen|globus|fornix|brainstem|(frontal|parietal|occipital|temporal|limbic) lobe|lobule|insula|colliculus|geniculate|mammillary|habenula|commissure|internal capsule|lamina terminalis|stria terminalis|archicortex|metencephalon|telencephalon|neuraxis|decussation|dura mater|subarachnoid/i],
  ['sensory', /eyeball|\beye\b|cornea|\biris\b|retina|\blens\b|sclera|choroid|vitreous|cochlea|semicircular|tympanic membrane|auricle|\btongue\b|olfactory|optic|eyelid|fovea|macula lutea|\bpupil\b|ciliary|schlemm|aqueous humor|trabecular meshwork|conjunctiva/i],
  ['heart', /\bheart\b|ventricle|atrium|atrial|cardiac|mitral|tricuspid|papillary|chordae|myocardi|pericardi|endocardi|cusp of (pulmonary|aortic) valve|pulmonary valve|coronary sinus|interventricular septum/i],
  ['respiratory', /\blung|bronch|trachea|larynx|pleura|alveol|epiglottis|nasal cavity|vocal ligament|conus elasticus|thyro-epiglottic|cricothyroid ligament|internal nose|nasal septum|\bhilum\b(?! of (kidney|spleen))|\bcarina\b/i],
  ['arteries', /\bartery\b|arteries|aorta|aortic|arteriole|arteria\b|arterial|palmar arch|celiac trunk|thyrocervical trunk|costocervical trunk|pulmonary trunk|marginal branch|ventricular branch/i],
  ['veins', /\bvein\b|veins|vena cava|venous/i],
  ['muscles', /muscle|brachii|femoris|gracilis|sartorius|deltoid|pectoralis|trapezius|latissimus|gluteus|gastrocnemius|soleus|\brectus\b|oblique|iliacus|psoas|masseter|temporalis|sternocleidomastoid|tendon|aponeurosis|serratus|rhomboid|teres|supraspinatus|infraspinatus|subscapularis|brachialis|brachioradialis|pronator|supinator|flexor|extensor|abductor|adductor|lumbrical|interosse|opponens|tibialis|peroneus|fibularis|plantaris|popliteus|semimembranosus|semitendinosus|vastus|tensor fasciae|pectineus|piriformis|obturator|gemellus|quadratus|diaphragm|levator|platysma|buccinator|orbicularis|zygomaticus|mentalis|digastric|omohyoid|sternohyoid|thyrohyoid|splenius|longissimus|iliocostalis|multifidus|erector|obliquus|scalenus|spinalis|rotator|intertransvers|interspinal|longus (capitis|colli)|subclavius|sternothyroid|transversus thoracis|palmaris|anconeus|coccygeus|puborectalis|genioglossus|hyoglossus|constrictor|stylopharyngeus|palatopharyngeus|salpingopharyngeus|tensor veli|vocalis|arytenoid|cricothyroid|aryepiglotticus/i],
  ['lymphatic', /spleen|thymus|lymph|tonsil/i],
  ['digestive', /esophag|stomach|duoden|jejun|ileum|cecum|appendix|colon|rectum|anal canal|\bliver\b|hepatic duct|biliary|gallbladder|cystic duct|pancrea|mesentery|taenia|tooth|gingiva|salivary|submandibular gland|sublingual gland|parotid|pharyn|uvula|caecum|jejenum|ileocecal|bile duct|porta hepatis|quadrate lobe|caudate lobe|u(n)?cinate process/i],
  ['urinary', /kidney|ureter|urinary bladder|urethra|renal (papilla|pyramid|column|pelvis)|calyx/i],
  ['reproductive', /testis|epididym|deferent duct|seminal vesicle|prostate|penis|corpus cavernosum|corpus spongiosum|scrot|uter(us|ine)|ovar(y|ian)|fallopian|cervix|cervical os|cervical canal|vagin|vulva|clitoris|labium|labia|mammary|lactiferous|areol|nipple|placenta|chorionic|follicle|endometri|myometri|perimetri|broad ligament|round ligament|mesosalpinx|mesovarium|uterovesical|cornua/i],
  ['connective', /fascia|ligament|raphe|tendinous ring|retinaculum|meniscus/i],
  ['skeleton', /bone|vertebra|\brib\b|sternum|skull|cranium|femur|tibia|fibula|humerus|\bradius|\bulna|scapula|clavicle|patella|phalanx|phalanges|metacarpal|metatarsal|carpal|tarsal|sacrum|coccyx|mandible|maxilla|hyoid|talus|calcaneus|cuneiform|cuboid|navicular|scaphoid|lunate|triquetr|pisiform|trapezium|trapezoid|capitate|hamate|ilium|ischium|pubis|cartilage|sphenoid|ethmoid|vomer|palatine|lacrimal|malleus|incus|stapes|\batlas\b|\baxis\b|pelvic girdle/i],
]
export const REGION_RULES: [string, RegExp][] = [
  ['brain', /brain|cerebr|cerebell|gyrus|thalam|medulla|\bpons\b|midbrain|hippocamp|amygdal|corpus callosum|caudate|putamen|globus|fornix|ventricle of brain|lateral ventricle|third ventricle|fourth ventricle/i],
  ['hand', /\bhand\b|finger|thumb|metacarpal|carpal|scaphoid|lunate|triquetr|pisiform|trapezium|trapezoid|capitate|hamate|lumbrical|opponens/i],
  ['foot', /\bfoot\b|\btoe|metatarsal|tarsal|talus|calcaneus|cuneiform|cuboid|navicular|hallux/i],
  ['shoulder', /shoulder|scapula|clavicle|deltoid|supraspinatus|infraspinatus|subscapularis|\bteres|acromi|glenoid/i],
  ['thigh', /thigh|femur|femoris|femoral|gracilis|sartorius|vastus|adductor|pectineus|semimembranosus|semitendinosus|patella/i],
]

export const classify = (name: string) => RULES.find(([, re]) => re.test(name))?.[0]
export const regionOf = (name: string, system: SystemId, centreY: number, height: number) =>
  system === 'heart' ? 'heart' : REGION_RULES.find(([, re]) => re.test(name))?.[0] ?? (centreY > 0.85 * height ? 'head' : 'body')

/**
 * Reduce a mesh to about `keep` of its triangles (meshoptimizer, 1% error budget relative to the mesh's size) and drop
 * unused vertices. Small meshes are left alone. Call `await MeshoptSimplifier.ready` first.
 */
export function simplify(pos: Float32Array, idx: Uint32Array, keep: number) {
  if (idx.length < 3000) return { pos, idx }
  const target = Math.max(900, Math.floor((idx.length * keep) / 3) * 3)
  const [s] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.01)
  // drop vertices the simplified triangles no longer use
  const remap = new Int32Array(pos.length / 3).fill(-1)
  const p: number[] = []
  const out = new Uint32Array(s.length)
  for (let i = 0; i < s.length; i++) {
    let r = remap[s[i]]
    if (r < 0) { r = remap[s[i]] = p.length / 3; p.push(pos[s[i] * 3], pos[s[i] * 3 + 1], pos[s[i] * 3 + 2]) }
    out[i] = r
  }
  return { pos: new Float32Array(p), idx: out }
}

/** Geometry centred on its own centre (stored as assembledPosition), in metres, Y up, feet on y = 0. */
export type Built = { e: Entry; pos: Float32Array; idx: Uint32Array }

/** Lay out the atlas, then write one meshopt-compressed GLB per system plus the manifest. */
export async function writeOutput(built: Built[], out: string, source: string, unclassified: string[], logFile: string) {
  layoutAtlas(built.map((b) => b.e.size)).forEach((p, i) => {
    built[i].e.explodedPosition = [p[0] + ATLAS_CENTER[0], p[1] + ATLAS_CENTER[1], p[2] + ATLAS_CENTER[2]]
  })
  await MeshoptEncoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  fs.mkdirSync(out, { recursive: true })
  for (const sys of new Set(built.map((b) => b.e.system))) {
    const doc = new Document()
    const buf = doc.createBuffer()
    const scene = doc.createScene()
    for (const b of built.filter((b) => b.e.system === sys)) {
      const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(b.pos).setBuffer(buf))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(b.idx).setBuffer(buf))
      scene.addChild(doc.createNode(b.e.id).setMesh(doc.createMesh(b.e.id).addPrimitive(prim)))
    }
    // 12-bit positions are relative to each piece's own size: under half a millimetre even on the 1.7 m skin
    await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 12 }))
    await io.write(path.join(out, `${sys}.glb`), doc)
  }
  // round to 0.01 mm: float32 noise like 0.20000000298023224 doubles the manifest for no visible gain
  const round = (_k: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v)
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ source, pieces: built.map((b) => b.e) }, round))
  fs.writeFileSync(logFile, unclassified.join('\n'))
  console.log(`${built.length} pieces written to ${out}, ${unclassified.length} unclassified (${logFile})`)
}
