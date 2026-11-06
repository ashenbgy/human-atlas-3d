import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Environment, GizmoHelper, Lightformer, OrbitControls } from '@react-three/drei'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { Box3, CanvasTexture, DoubleSide, FrontSide, Color, Group, MathUtils, MOUSE, TOUCH, Mesh, MeshPhysicalMaterial, PerspectiveCamera, Raycaster, Spherical, SRGBColorSpace, Vector2, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { cam, currentBox, viewBox } from './camera'
import { focus, sheet, world } from './data'
import { easeInOutCubic } from './lib'
import { useStore } from './store'
import { LAYERS, SYSTEMS } from './types'
import type { Vec3 } from './types'

const FRONT = new Vector3(0, 0.05, 1).normalize()

function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
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
    controls.addEventListener('start', leavePreset)
    // initial framing, no animation
    const b = viewBox()
    cam.fitBox(b, 1.1, true)
    const t = tw.current!
    camera.position.copy(t.p1)
    controls.target.copy(t.c1)
    tw.current = null
    controls.update()
    return () => controls.removeEventListener('start', leavePreset)
  }, [camera, controls])

  useFrame(() => {
    const t = tw.current
    if (!t || !controls) return
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

function Specimens() {
  const pieces = world.pieces
  const n = pieces.length
  const mats = useMemo(
    () => pieces.map((p) => {
      const sys = p.e.system
      const c = new Color(tissue(p.e.name, sys, SYSTEMS.find((x) => x.id === sys)!.color, p.e.region))
      c.offsetHSL((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.07) // per-piece variation
      return new MeshPhysicalMaterial({
        color: c, roughness: sys === 'skeleton' ? 0.75 : 0.45, metalness: 0,
        clearcoat: sys === 'skeleton' ? 0 : 0.2, clearcoatRoughness: 0.5, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new Color('#ffd9cf'), // soft moist tissue, matte bone
        transparent: true, opacity: 0, emissive: HILITE, emissiveIntensity: 0,
        side: sys === 'skin' ? DoubleSide : FrontSide, // the skin surface is inside-out in BodyParts3D
      })
    }),
    [pieces],
  )
  const sysIdx = useMemo(() => pieces.map((p) => SYSTEMS.findIndex((s) => s.id === p.e.system)), [pieces])
  const layerOf = useMemo(() => pieces.map((p) => LAYERS.find((l) => (l.systems as readonly string[]).includes(p.e.system))!.id), [pieces])
  const group = useRef<Group>(null)
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
    op: new Float32Array(n), em: new Float32Array(n), hit: new Uint8Array(n), ex: 0, rt: 0, lastE: -1, lastR: -1,
  }), [n])

  // All animation lives here: no React state per frame.
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05)
    const s = useStore.getState()
    st.ex += clamp(s.explode - st.ex, -dt / 1.4, dt / 1.4)
    st.rt += clamp((s.region ? 1 : 0) - st.rt, -dt / 1.2, dt / 1.2)
    const e = easeInOutCubic(st.ex), r = easeInOutCubic(st.rt)
    const moving = e !== st.lastE || r !== st.lastR
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
      }
      let target = s.systems[p.system] ? 1 : 0
      const layer = s.organ ? 1 : s.layers[layerOf[i]]
      if (s.organ) target = focus.ids.has(p.id) ? 1 : 0
      else target *= layer
      if (target && s.region && !sheet.pos.has(p.id)) target = 0
      if (target && s.selectedId) target = p.id === s.selectedId ? 1 : s.isolate ? 0 : 0.09
      st.op[i] += (target - st.op[i]) * Math.min(1, dt * (9 - 0.5 * sysIdx[i])) // per-system rate = slight stagger
      const o = st.op[i], mat = mats[i]
      m.visible = o > 0.01
      st.hit[i] = o > 0.05 && layer >= 0.5 ? 1 : 0 // peeled-back layers are click-through
      if (mat.opacity !== o) { mat.opacity = o; mat.depthWrite = o > 0.9 }
      const isSel = p.id === s.selectedId
      // selected piece draws on top of everything (visible even when buried in muscle)
      if (mat.depthTest === isSel) { mat.depthTest = !isSel; m.renderOrder = isSel ? 10 : 0 }
      const et = isSel ? 0.75 : p.id === s.hoverId ? 0.35 : 0
      st.em[i] += (et - st.em[i]) * Math.min(1, dt * 14)
      mat.emissiveIntensity = st.em[i]
    }
  })

  // Raycasting: r3f casts the pointer ray through every mesh; take the first visible hit.
  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const h = e.intersections.find((x) => st.hit[x.object.userData.i])
    return h ? pieces[h.object.userData.i].e.id : null
  }
  const { getState: get } = useStore
  return (
    <group
      ref={group}
      onPointerMove={(e) => { const id = pick(e); if (id !== get().hoverId) useStore.setState({ hoverId: id }) }}
      onPointerOut={() => useStore.setState({ hoverId: null })}
      onClick={(e) => { if (e.delta > 4) return; const id = pick(e); if (id) { e.stopPropagation(); get().select(id) } }}
    >
      {pieces.map((p, i) => (
        <mesh key={p.e.id} ref={(m) => { meshes.current[i] = m }} geometry={p.geo} material={mats[i]}
          position={p.e.assembledPosition} userData={{ i }} visible={false} />
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
  return <ContactShadows ref={ref} position={[0, 0.001, 0]} opacity={0.18} scale={3} blur={3} far={1.2} />
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
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={0.05} distanceFalloff={1} intensity={2.5} quality="medium" halfRes />
      </EffectComposer>
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
