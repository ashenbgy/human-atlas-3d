import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { Box3, Color, MathUtils, MOUSE, TOUCH, Mesh, MeshPhysicalMaterial, PerspectiveCamera, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { cam, viewBox } from './camera'
import { sheet, world } from './data'
import { easeInOutCubic } from './lib'
import { useStore } from './store'
import { SYSTEMS } from './types'

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
    cam.fitBox = (box: Box3, pad = 1.2, front = false) => {
      const c = box.getCenter(new Vector3()), sz = box.getSize(new Vector3())
      const t = Math.tan(MathUtils.degToRad(camera.fov) / 2)
      const d = Math.max(0.12, Math.max(sz.y / (2 * t), sz.x / (2 * t * camera.aspect)) * pad + sz.z / 2)
      const dir = front ? FRONT.clone() : camera.position.clone().sub(controls.target).normalize()
      go(c.clone().addScaledVector(dir, d), c)
    }
    cam.zoom = (f) => {
      const v = camera.position.clone().sub(controls.target)
      go(controls.target.clone().addScaledVector(v, f), controls.target.clone(), 350)
    }
    // initial framing, no animation
    const b = viewBox()
    cam.fitBox(b, 1.5, true)
    const t = tw.current!
    camera.position.copy(t.p1)
    controls.target.copy(t.c1)
    tw.current = null
    controls.update()
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
      })
    }),
    [pieces],
  )
  const sysIdx = useMemo(() => pieces.map((p) => SYSTEMS.findIndex((s) => s.id === p.e.system)), [pieces])
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
      if (target && s.region && !sheet.pos.has(p.id)) target = 0
      if (target && s.selectedId) target = p.id === s.selectedId ? 1 : s.isolate ? 0 : 0.09
      st.op[i] += (target - st.op[i]) * Math.min(1, dt * (9 - 0.5 * sysIdx[i])) // per-system rate = slight stagger
      const o = st.op[i], mat = mats[i]
      m.visible = o > 0.01
      st.hit[i] = o > 0.05 ? 1 : 0
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

function Ground() {
  const ref = useRef<any>(null)
  useFrame(() => { if (ref.current) ref.current.visible = useStore.getState().explode < 0.02 && !useStore.getState().region })
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
    </>
  )
}
