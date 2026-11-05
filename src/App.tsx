import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { loadWorld } from './data'
import { Scene } from './Scene'
import { useStore } from './store'
import { Branding, Collections, Credits, ExplodeControl, InfoPanel, Search, SystemsPanel, Toolbar, Tooltip } from './ui'

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
      if (e.key === 'Escape') s.selectedId ? s.clear() : useStore.setState({ creditsOpen: false })
      if ((e.key === 'i' || e.key === 'I') && s.selectedId) useStore.setState({ isolate: !s.isolate })
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  if (!ready) return <div className="loading">Loading anatomy…</div>
  return (
    <>
      <div className="stage" onPointerDown={(e) => (down.current = [e.clientX, e.clientY])}>
        <Canvas gl={{ alpha: true }} camera={{ fov: 30, near: 0.01, far: 200, position: [0, 1, 6] }} dpr={[1, 2]}
          onPointerMissed={(e) => { if (Math.hypot(e.clientX - down.current[0], e.clientY - down.current[1]) < 5) useStore.getState().clear() }}>
          <Scene />
        </Canvas>
      </div>
      <Branding />
      <div className="left"><SystemsPanel /><Collections /></div>
      <Search />
      <Toolbar />
      <ExplodeControl />
      <InfoPanel />
      <Tooltip />
      <Credits />
    </>
  )
}
