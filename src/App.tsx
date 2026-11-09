import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { loadWorld } from './data'
import { Scene } from './Scene'
import { useStore } from './store'
import { cam } from './camera'
import { Branding, Collections, Credits, ExplodeControl, InfoPanel, Organs, Search, SystemsPanel, Toolbar, Tooltip } from './ui'

export default function App() {
  const [ready, setReady] = useState(false)
  const down = useRef([0, 0])
  useEffect(() => { loadWorld().then(() => setReady(true)) }, [])
  useEffect(() => useStore.subscribe((s, p) => {
    if (s.hoverId !== p.hoverId) document.body.style.cursor = s.hoverId ? 'pointer' : ''
  }), [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const s = useStore.getState()
      if (e.key === 'Escape') s.selectedId ? s.clear() : s.organ ? s.setOrgan(null) : s.region && s.setRegion(null)
      if ((e.key === 'i' || e.key === 'I') && s.selectedId) useStore.setState({ isolate: !s.isolate })
      // model navigation only when focus is on the page or the 3D view, so sliders and buttons keep their own keys
      const t = e.target as HTMLElement
      if (t !== document.body && !t.closest('.stage')) return
      const step = 0.15
      const nav: Record<string, () => void> = {
        ArrowLeft: () => (e.shiftKey ? cam.pan(-1, 0) : cam.orbit(-step, 0)),
        ArrowRight: () => (e.shiftKey ? cam.pan(1, 0) : cam.orbit(step, 0)),
        ArrowUp: () => (e.shiftKey ? cam.pan(0, 1) : cam.orbit(0, -step)),
        ArrowDown: () => (e.shiftKey ? cam.pan(0, -1) : cam.orbit(0, step)),
        '+': () => cam.zoom(0.8), '=': () => cam.zoom(0.8), '-': () => cam.zoom(1.25),
        Home: () => s.setView('front'),
        Enter: () => { const id = cam.pickCenter(); if (id) s.select(id) },
      }
      if (nav[e.key]) { e.preventDefault(); nav[e.key]() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  if (!ready) return <div className="loading">Loading anatomy…</div>
  return (
    <>
      <div className="stage" tabIndex={0} role="application"
        aria-label="Interactive anatomy. Drag to orbit and scroll to zoom. Arrow keys orbit, Shift + arrows pan, plus or minus zoom, Home resets, Enter selects the structure at the centre."
        onPointerDown={(e) => (down.current = [e.clientX, e.clientY])}>
        <Canvas gl={{ alpha: true, powerPreference: 'high-performance' }} camera={{ fov: 30, near: 0.01, far: 200, position: [0, 1, 6] }} dpr={[1, 1.5]}
          onPointerMissed={(e) => { if (Math.hypot(e.clientX - down.current[0], e.clientY - down.current[1]) < 5) useStore.getState().clear() }}>
          <Scene />
        </Canvas>
      </div>
      <Branding />
      <div className="left"><SystemsPanel /><Collections /></div>
      <Organs />
      <Search />
      <Toolbar />
      <ExplodeControl />
      <InfoPanel />
      <Tooltip />
      <Credits />
    </>
  )
}
