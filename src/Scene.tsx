import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Environment, GizmoHelper, Lightformer, OrbitControls } from '@react-three/drei'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { BatchedMesh, Box3, CanvasTexture, DoubleSide, FrontSide, Color, Group, MathUtils, Matrix4, MOUSE, TOUCH, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, Plane, Ray, Raycaster, Spherical, SRGBColorSpace, Vector2, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { cam, currentBox, viewBox } from './camera'
import { focus, isSkinSurface, sheet, world } from './data'
import type { Garment } from './data'
import type { Piece } from './data'
import { easeInOutCubic } from './lib'
import { useStore } from './store'
import { LAYERS, SYSTEMS } from './types'
import type { Vec3 } from './types'

const FRONT = new Vector3(0, 0.05, 1).normalize()

/** Anything animating (camera, explode, fades) pushes this forward; ambient occlusion only runs once it has passed. */
const activity = { until: 0 }
const markBusy = (ms = 250) => { activity.until = Math.max(activity.until, performance.now() + ms) }

function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const setEvents = useThree((s) => s.setEvents)
  const tw = useRef<{ t0: number; dur: number; p0: Vector3; p1: Vector3; c0: Vector3; c1: Vector3 } | null>(null)

  useEffect(() => {
    if (!controls) return
    const go = (pos: Vector3, target: Vector3, dur = 800) => {
      tw.current = { t0: performance.now(), dur, p0: camera.position.clone(), p1: pos, c0: controls.target.clone(), c1: target }
    }
    cam.fitBox = (box: Box3, pad = 1.2, front: boolean | Vector3 = false) => {
      const c = box.getCenter(new Vector3()), sz = box.getSize(new Vector3())
      const t = Math.tan(MathUtils.degToRad(camera.fov) / 2)
      // fit inside the area the floating panels leave clear, not the whole canvas
      const W = innerWidth, H = innerHeight
      const mx = W > 760 ? 250 : W * 0.05, my = H > 500 ? 120 : H * 0.1 // panel margins; mobile panels overlay anyway
      const fx = 1 - (2 * mx) / W, fy = 1 - (2 * my) / H
      const d = Math.max(0.12, Math.max(sz.y / (2 * t * fy), sz.x / (2 * t * camera.aspect * fx)) * pad + sz.z / 2)
      const dir = front instanceof Vector3 ? front.clone().normalize() : front ? FRONT.clone() : camera.position.clone().sub(controls.target).normalize()
      go(c.clone().addScaledVector(dir, d), c)
    }
    cam.zoom = (f) => {
      const v = camera.position.clone().sub(controls.target)
      go(controls.target.clone().addScaledVector(v, f), controls.target.clone(), 350)
    }
    const leavePreset = () => { if (useStore.getState().view) useStore.setState({ view: null }) }
    cam.orbit = (dTheta, dPhi) => {
      const sph = new Spherical().setFromVector3(camera.position.clone().sub(controls.target))
      sph.theta += dTheta
      sph.phi = MathUtils.clamp(sph.phi + dPhi, 0.05, Math.PI - 0.05)
      go(controls.target.clone().add(new Vector3().setFromSpherical(sph)), controls.target.clone(), 250)
      leavePreset()
    }
    cam.pan = (dx, dy) => {
      const dist = camera.position.distanceTo(controls.target)
      const right = new Vector3().setFromMatrixColumn(camera.matrix, 0)
      const up = new Vector3().setFromMatrixColumn(camera.matrix, 1)
      const delta = right.multiplyScalar(dx * dist * 0.08).add(up.multiplyScalar(dy * dist * 0.08))
      go(camera.position.clone().add(delta), controls.target.clone().add(delta), 250)
    }
    // hover hit-testing 2,000+ meshes on every mouse move is wasted work while dragging the camera
    const dragStart = () => { leavePreset(); setEvents({ enabled: false }); if (useStore.getState().hoverId) useStore.setState({ hoverId: null }) }
    const dragEnd = () => setEvents({ enabled: true })
    controls.addEventListener('start', dragStart)
    controls.addEventListener('end', dragEnd)
    const onChange = () => markBusy() // fires while dragging and while damping settles
    controls.addEventListener('change', onChange)
    // initial framing, no animation
    const b = viewBox()
    cam.fitBox(b, 1.1, true)
    const t = tw.current!
    camera.position.copy(t.p1)
    controls.target.copy(t.c1)
    tw.current = null
    controls.update()
    return () => { controls.removeEventListener('start', dragStart); controls.removeEventListener('end', dragEnd); controls.removeEventListener('change', onChange) }
  }, [camera, controls, setEvents])

  useFrame(() => {
    const t = tw.current
    if (!t || !controls) return
    markBusy()
    const k = Math.min(1, (performance.now() - t.t0) / t.dur)
    const e = easeInOutCubic(k)
    camera.position.lerpVectors(t.p0, t.p1, e)
    controls.target.lerpVectors(t.c0, t.c1, e)
    if (k >= 1) tw.current = null
  })
  return null
}

const HILITE = '#1FB5A5'
/** Tissue-like colour by structure name; falls back to the system colour. */
function tissue(name: string, system: string, fallback: string, region: string): string {
  if (/tendon|aponeurosis|ligament|fascia|retinaculum/i.test(name)) return '#E4D8BF'
  if (/cartilage/i.test(name)) return '#D9E2E0'
  if (/eyeball|sclera|cornea/i.test(name)) return '#EFECE4'
  if (system === 'nervous') return region === 'brain' ? '#D9B7B0' : '#E8D68A'
  if (system === 'respiratory') return /trachea|bronch|larynx/i.test(name) ? '#CDB9B0' : '#D99C98'
  if (system === 'muscles') return '#A8483E'
  if (system === 'veins') return '#4B5E9E'
  if (/tooth/i.test(name)) return '#F1EDE2'
  if (/liver|spleen/i.test(name)) return '#7A3A30'
  if (/kidney/i.test(name)) return '#8A4236'
  if (/gallbladder|biliary|hepatic duct|cystic duct/i.test(name)) return '#6F8A4A'
  if (system === 'digestive') return '#D49A88'
  if (system === 'skin') return /hair|eyebrow/i.test(name) ? '#5A4636' : '#E6C2A8'
  return fallback
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const GHOST = 0.09 // opacity of everything else while a structure is selected

/** Skin gets a soft sheen (a stand-in for light scattering under the surface); other tissue stays standard. */
const SKIN = { roughness: 0.55, sheen: 0.45, sheenRoughness: 0.5, sheenColor: new Color('#ffcbb0') }
const tissueMaterial = (sys: string, params: ConstructorParameters<typeof MeshStandardMaterial>[0]) =>
  sys === 'skin' ? new MeshPhysicalMaterial({ ...params, ...SKIN }) : new MeshStandardMaterial(params)

/**
 * The generated hair is cut along a smooth hairline in the fragment shader (the skin's triangles are too coarse for a
 * clean edge): forehead at 1.615 m sweeping down to the nape at 1.47 m, with an oval cut-out so it tucks behind each ear. Body coordinates.
 */
const HAIRLINE = `
  float hl = 1.615 - 0.145 * clamp((-0.01 - vBodyPos.z) / 0.12, 0.0, 1.0);
  vec2 ear = vec2((vBodyPos.y - 1.555) / 0.045, (vBodyPos.z + 0.05) / 0.035); // oval around each ear
  if (vBodyPos.y < hl || (abs(vBodyPos.x) > 0.07 && dot(ear, ear) < 1.0)) discard;`

/** Fabric with a cloth sheen, hair with a soft glossy sheen; both fade with the skin. */
function garmentMaterial(g: Garment) {
  const params = g.kind === 'hair'
    ? { color: '#3a281d', roughness: 0.45, sheen: 1, sheenRoughness: 0.3, sheenColor: new Color('#a07a5c') }
    : { color: '#2E3B44', roughness: 0.85, sheen: 1, sheenRoughness: 0.6, sheenColor: new Color('#7d8f9b') }
  const planes = g.clip ? [new Plane(new Vector3(0, 1, 0)), new Plane(new Vector3(0, -1, 0)), ...(g.clip.x ? [new Plane(new Vector3(-1, 0, 0)), new Plane(new Vector3(1, 0, 0))] : [])] : []
  const mat = new MeshPhysicalMaterial({ ...params, metalness: 0, side: DoubleSide, transparent: true, opacity: 0, clippingPlanes: planes })
  if (g.kind === 'hair') {
    const offset = new Vector3() // how far the body has moved from its assembled position (explode)
    mat.userData.offset = offset
    mat.customProgramCacheKey = () => 'hairline'
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uOffset = { value: offset }
      sh.vertexShader = 'uniform vec3 uOffset;\nvarying vec3 vBodyPos;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n  vBodyPos = (modelMatrix * vec4(transformed, 1.0)).xyz - uOffset;')
      sh.fragmentShader = 'varying vec3 vBodyPos;\n' + sh.fragmentShader.replace('void main() {', 'void main() {' + HAIRLINE)
    }
  }
  return mat
}
/** Hems and the hairline are in body coordinates; move them with the body when it is exploded. */
function placeHems(g: Garment, mat: MeshPhysicalMaterial, dx: number, dy: number, dz: number) {
  mat.userData.offset?.set(dx, dy, dz)
  if (!g.clip) return
  const [lo, hi] = g.clip.y, p = mat.clippingPlanes!
  p[0].constant = -(lo + dy)
  p[1].constant = hi + dy
  if (g.clip.x) { p[2].constant = g.clip.x + dx; p[3].constant = g.clip.x - dx }
}

/**
 * Drawing ~2,200 pieces as separate meshes costs ~2,200 draw calls per frame, which is what made rotation slow.
 * Settled pieces are drawn through one BatchedMesh per system instead (one draw call each): a solid batch for
 * fully visible pieces and a see-through batch for dimmed ones. Only pieces that are fading, hovered, selected or
 * on a partly peeled layer fall back to their own mesh. The per-piece meshes stay in the scene as click targets.
 */
interface Batches { solid: BatchedMesh[]; ghost: BatchedMesh[]; solidOf: BatchedMesh[]; ghostOf: BatchedMesh[]; inst: Int32Array }
function buildBatches(pieces: Piece[], mats: MeshStandardMaterial[], initOps: number[]): Batches | null {
  try {
    const bySys = new Map<string, number[]>()
    pieces.forEach((p, i) => { const l = bySys.get(p.e.system) ?? []; l.push(i); bySys.set(p.e.system, l) })
    const out: Batches = { solid: [], ghost: [], solidOf: [], ghostOf: [], inst: new Int32Array(pieces.length) }
    const m = new Matrix4()
    for (const [sys, idx] of bySys) {
      let verts = 0, inds = 0
      for (const i of idx) { verts += pieces[i].geo.getAttribute('position').count; inds += pieces[i].geo.index?.count ?? 0 }
      const base = { roughness: sys === 'skeleton' ? 0.75 : 0.42, metalness: 0, side: sys === 'skin' ? DoubleSide : FrontSide }
      const solid = new BatchedMesh(idx.length, verts, inds, tissueMaterial(sys, base))
      const ghost = new BatchedMesh(idx.length, verts, inds, tissueMaterial(sys, { ...base, transparent: true, opacity: GHOST, depthWrite: false }))
      for (const b of [solid, ghost]) {
        b.raycast = () => {} // clicks go to the per-piece meshes
        for (const i of idx) {
          const id = b.addInstance(b.addGeometry(pieces[i].geo))
          out.inst[i] = id // same order in both batches, so the ids match
          b.setColorAt(id, mats[i].color)
          b.setMatrixAt(id, m.makeTranslation(...pieces[i].e.assembledPosition))
          b.setVisibleAt(id, b === solid && initOps[i] === 1)
        }
      }
      for (const i of idx) { out.solidOf[i] = solid; out.ghostOf[i] = ghost }
      out.solid.push(solid)
      out.ghost.push(ghost)
    }
    return out
  } catch (err) {
    console.warn('Batched rendering unavailable; drawing pieces individually.', err)
    return null
  }
}

function Specimens() {
  const pieces = world.pieces
  const n = pieces.length
  const sysIdx = useMemo(() => pieces.map((p) => SYSTEMS.findIndex((s) => s.id === p.e.system)), [pieces])
  const layerOf = useMemo(() => pieces.map((p) => LAYERS.find((l) => (l.systems as readonly string[]).includes(p.e.system))!.id), [pieces])
  const initOps = useMemo(() => {
    const s = useStore.getState()
    return pieces.map((p, i) => {
      if (!s.systems[p.e.system]) return 0
      return s.layers[layerOf[i]] ?? 1
    })
  }, [pieces, layerOf])
  const mats = useMemo(
    () => pieces.map((p, i) => {
      const sys = p.e.system
      const c = new Color(tissue(p.e.name, sys, SYSTEMS.find((x) => x.id === sys)!.color, p.e.region))
      c.offsetHSL((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.07) // per-piece variation
      const op = initOps[i]
      const tr = op < 1
      return tissueMaterial(sys, {
        color: c, roughness: sys === 'skeleton' ? 0.75 : 0.42, metalness: 0,
        transparent: tr, opacity: op, depthWrite: !tr, emissive: HILITE, emissiveIntensity: 0,
        side: sys === 'skin' ? DoubleSide : FrontSide, // the skin surface is inside-out in BodyParts3D
      })
    }),
    [pieces, initOps],
  )
  const batches = useMemo(() => buildBatches(pieces, mats, initOps), [pieces, mats, initOps])
  const group = useRef<Group>(null)
  const skinIdx = useMemo(() => pieces.findIndex(isSkinSurface), [pieces])
  const garments = useRef<(Mesh | null)[]>([])
  const garmentMats = useMemo(() => world.garments.map(garmentMaterial), [])
  const gl = useThree((s) => s.gl)
  useEffect(() => { gl.localClippingEnabled = true }, [gl]) // hems are cut with clipping planes
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const ray = new Raycaster()
    cam.pickCenter = () => {
      if (!group.current) return null
      ray.setFromCamera(new Vector2(0, 0), camera)
      const h = ray.intersectObjects(group.current.children, false).find((x) => st.hit[x.object.userData.i])
      return h ? pieces[h.object.userData.i].e.id : null
    }
  })
  const meshes = useRef<(Mesh | null)[]>([])
  const st = useMemo(() => ({
    op: Float32Array.from(initOps), em: new Float32Array(n), hit: Uint8Array.from(initOps, (o) => (o > 0.05 ? 1 : 0)), ex: 0, rt: 0, lastE: 0, lastR: 0,
    // 0 = hidden, 1 = own mesh, 2 = solid batch, 3 = ghost batch
    mode: Uint8Array.from(initOps, (o) => (o === 1 && batches ? 2 : o > 0.01 ? 1 : 0)),
  }), [n, initOps, batches])
  const tmp = useMemo(() => new Matrix4(), [])

  const invMat = useMemo(() => new Matrix4(), [])
  const localRay = useMemo(() => new Ray(), [])
  useEffect(() => {
    meshes.current.forEach((m) => {
      if (!m) return
      m.raycast = function (raycaster, intersects) {
        const i = this.userData.i
        if (!st.hit[i]) return
        const bb = this.geometry.boundingBox
        if (bb) {
          invMat.copy(this.matrixWorld).invert()
          localRay.copy(raycaster.ray).applyMatrix4(invMat)
          if (!localRay.intersectsBox(bb)) return
        }
        Mesh.prototype.raycast.call(this, raycaster, intersects)
      }
    })
  }, [pieces, st, invMat, localRay])

  // All animation lives here: no React state per frame.
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05)
    const s = useStore.getState()
    st.ex += clamp(s.explode - st.ex, -dt / 1.4, dt / 1.4)
    st.rt += clamp((s.region ? 1 : 0) - st.rt, -dt / 1.2, dt / 1.2)
    const e = easeInOutCubic(st.ex), r = easeInOutCubic(st.rt)
    const moving = e !== st.lastE || r !== st.lastR
    let fading = false
    // opaque skin hides everything under it; drawing those layers anyway only lets coarse muscles poke through
    const skinCover = s.systems.skin && s.layers.skin > 0.97 && !s.organ && !s.region && s.explode === 0 && st.ex < 0.01
    st.lastE = e
    st.lastR = r
    for (let i = 0; i < n; i++) {
      const m = meshes.current[i]
      if (!m) continue
      const p = pieces[i].e
      if (moving) {
        const a = p.assembledPosition, x = p.explodedPosition
        let px = a[0] + (x[0] - a[0]) * e, py = a[1] + (x[1] - a[1]) * e, pz = a[2] + (x[2] - a[2]) * e
        const sp = r > 0 ? sheet.pos.get(p.id) : undefined
        if (sp) { px += (sp[0] - px) * r; py += (sp[1] - py) * r; pz += (sp[2] - pz) * r }
        m.position.set(px, py, pz)
        if (batches) {
          tmp.makeTranslation(px, py, pz)
          batches.solidOf[i].setMatrixAt(batches.inst[i], tmp)
          batches.ghostOf[i].setMatrixAt(batches.inst[i], tmp)
        }
      }
      let target = s.systems[p.system] ? 1 : 0
      const layer = s.organ ? 1 : skinCover && layerOf[i] !== 'skin' && p.id !== s.selectedId ? 0 : s.layers[layerOf[i]]
      if (s.organ) target = focus.ids.has(p.id) ? 1 : 0
      else target *= layer
      if (target && s.region && !sheet.pos.has(p.id)) target = 0
      if (target && s.selectedId) target = p.id === s.selectedId ? 1 : s.isolate ? 0 : 0.09
      if (p.id === s.selectedId && s.systems[p.system]) target = 1 // the selected piece is always fully solid, whatever its layer slider says
      st.op[i] += (target - st.op[i]) * Math.min(1, dt * (9 - 0.5 * sysIdx[i])) // per-system rate = slight stagger
      if (Math.abs(target - st.op[i]) < 0.003) st.op[i] = target
      else fading = true
      const o = st.op[i], mat = mats[i]
      st.hit[i] = o > 0.05 && layer >= 0.5 ? 1 : 0 // peeled-back layers are click-through
      const isSel = p.id === s.selectedId
      // The selected piece joins the transparent pass (fully opaque, drawn last, ignoring depth) so the faded
      // pieces in front of it cannot paint over it; every other piece is transparent only while fading.
      const tr = o < 1 || isSel
      if (mat.opacity !== o || mat.transparent !== tr) {
        mat.opacity = o
        mat.depthWrite = !tr
        // three compiles opaque materials with an OPAQUE shader flag that forces alpha to 1, so a material
        // changing between opaque and transparent must be rebuilt (only on a state change, never per frame)
        if (mat.transparent !== tr) { mat.transparent = tr; mat.needsUpdate = true }
      }
      if (mat.depthTest === isSel) { mat.depthTest = !isSel; m.renderOrder = isSel ? 10 : 0 }
      const et = !isSel && p.id === s.hoverId ? 0.35 : 0 // selected keeps its true colour; only hover glows
      if (st.em[i] !== 0 || et !== 0) {
        st.em[i] += (et - st.em[i]) * Math.min(1, dt * 14)
        if (Math.abs(st.em[i] - et) < 0.002) st.em[i] = et
        mat.emissiveIntensity = st.em[i]
        fading = true
      }
      // who draws this piece: a batch when it is settled and plain, otherwise its own mesh
      const plain = !isSel && st.em[i] === 0 && batches
      const mode = o <= 0.01 ? 0 : plain && o === 1 ? 2 : plain && Math.abs(o - GHOST) < 1e-4 ? 3 : 1
      if (mode !== st.mode[i]) {
        st.mode[i] = mode
        if (batches) {
          batches.solidOf[i].setVisibleAt(batches.inst[i], mode === 2)
          batches.ghostOf[i].setVisibleAt(batches.inst[i], mode === 3)
        }
      }
      m.visible = mode === 1
      if (i === skinIdx) {
        // clothing and hair follow the skin, but stay opaque even when the skin is see-through
        const go = Math.min(1, o * 4), S = p.assembledPosition
        world.garments.forEach((gd, gi) => {
          const g = garments.current[gi], gm = garmentMats[gi]
          if (!g) return
          g.position.copy(m.position)
          g.visible = go > 0.01
          if (g.visible) placeHems(gd, gm, m.position.x - S[0], m.position.y - S[1], m.position.z - S[2])
          if (gm.opacity !== go) {
            gm.opacity = go
            const tr = go < 1
            gm.depthWrite = !tr
            if (gm.transparent !== tr) { gm.transparent = tr; gm.needsUpdate = true }
          }
        })
      }
    }
    if (moving || fading) markBusy()
  })

  // Raycasting: r3f casts the pointer ray through every mesh; take the first visible hit.
  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const h = e.intersections.find((x) => st.hit[x.object.userData.i])
    return h ? pieces[h.object.userData.i].e.id : null
  }
  const { getState: get } = useStore
  const lastMove = useRef(0)
  return (
    <group
      ref={group}
      onPointerMove={(e) => {
        const now = performance.now()
        if (now - lastMove.current < 25) return
        lastMove.current = now
        const id = pick(e)
        if (id !== get().hoverId) useStore.setState({ hoverId: id })
      }}
      onPointerOut={() => useStore.setState({ hoverId: null })}
      onClick={(e) => { if (e.delta > 4) return; const id = pick(e); if (id) { e.stopPropagation(); get().select(id) } }}
    >
      {pieces.map((p, i) => (
        <mesh key={p.e.id} ref={(m) => { meshes.current[i] = m }} geometry={p.geo} material={mats[i]}
          position={p.e.assembledPosition} userData={{ i }} visible={st.mode[i] === 1} />
      ))}
      {batches?.solid.map((b) => <primitive key={b.uuid} object={b} />)}
      {batches?.ghost.map((b) => <primitive key={b.uuid} object={b} />)}
      {world.garments.map((g, gi) => (
        <mesh key={gi} ref={(m) => { garments.current[gi] = m }} geometry={g.geo} material={garmentMats[gi]} visible={false}
          raycast={() => {}} />
      ))}
    </group>
  )
}

/** Anatomical compass: S/I superior-inferior, L/R left-right, A/P anterior-posterior. Click a letter to look from that side. */
const AXES: [string, Vec3, boolean][] = [['S', [0, 1, 0], true], ['I', [0, -1, 0], false], ['L', [1, 0, 0], true], ['R', [-1, 0, 0], false], ['A', [0, 0, 1], true], ['P', [0, 0, -1], false]]
function letter(t: string, solid: boolean) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = solid ? '#13242D' : '#FCFCFB'
  g.strokeStyle = '#13242D'
  g.lineWidth = 4
  g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill(); g.stroke()
  g.fillStyle = solid ? '#FFFFFF' : '#13242D'
  g.font = '600 30px Inter, system-ui, sans-serif'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(t, 32, 34)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}
function Compass() {
  const tex = useMemo(() => AXES.map(([t, , solid]) => letter(t, solid)), [])
  return (
    <GizmoHelper alignment="bottom-right" margin={[78, 120]} renderPriority={2}>
      <group scale={34}>
        {AXES.map(([t, d], i) => (
          <group key={t}>
            <mesh position={[d[0] * 0.4, d[1] * 0.4, d[2] * 0.4]} rotation={[d[2] ? Math.PI / 2 : 0, 0, d[0] ? Math.PI / 2 : 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.8, 6]} />
              <meshBasicMaterial color="#9AA3A8" />
            </mesh>
            <sprite position={d} scale={0.42}
              onClick={(e) => { e.stopPropagation(); useStore.setState({ view: null }); cam.fitBox(currentBox(), 1.1, new Vector3(d[0], d[1] || 0.001, d[2])) }}
              onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
              <spriteMaterial map={tex[i]} depthTest={false} />
            </sprite>
          </group>
        ))}
      </group>
    </GizmoHelper>
  )
}

function Ground() {
  const ref = useRef<any>(null)
  useFrame(() => { if (ref.current) { const s = useStore.getState(); ref.current.visible = s.explode < 0.02 && !s.region && !s.organ } })
  return <ContactShadows ref={ref} frames={1} position={[0, 0.001, 0]} opacity={0.18} scale={3} blur={3} far={1.2} />
}

/**
 * Ambient occlusion is the single most expensive pass (~25x the frame cost in testing), so it only runs
 * when nothing is moving. While busy the scene is rendered directly instead.
 */
function PostFX() {
  const [ao, setAo] = useState(true)
  useFrame(() => {
    const idle = performance.now() >= activity.until
    if (idle !== ao) setAo(idle)
  })
  // the compass HUD (render priority 2) disables r3f's automatic render, so draw the scene ourselves when AO is off
  useFrame(({ gl, scene, camera }) => { if (!ao) gl.render(scene, camera) }, 1)
  return (
    <EffectComposer multisampling={0} enabled={ao}>
      <N8AO aoRadius={0.05} distanceFalloff={1} intensity={2.5} quality="medium" halfRes />
    </EffectComposer>
  )
}

export function Scene() {
  const tool = useStore((s) => s.tool)
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[2, 4, 5]} intensity={0.9} />
      <directionalLight position={[-3, 2, -2]} intensity={0.3} />
      <directionalLight position={[0, 3, -5]} intensity={0.5} />
      {/* procedural studio softboxes: reflections without downloading an HDR */}
      <Environment resolution={256} environmentIntensity={0.7}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 4]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-5, 1, 2]} scale={[4, 6, 1]} />
        <Lightformer form="rect" intensity={1} position={[5, 1, -2]} scale={[4, 6, 1]} />
      </Environment>
      <Specimens />
      <Ground />
      <PostFX />
      <OrbitControls
        makeDefault enableDamping dampingFactor={0.05} screenSpacePanning minDistance={0.05} maxDistance={60}
        mouseButtons={{ LEFT: tool === 'pan' ? MOUSE.PAN : MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
        touches={{ ONE: tool === 'pan' ? TOUCH.PAN : TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      />
      <CameraRig />
      <Compass />
    </>
  )
}
