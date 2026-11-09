import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cam } from './camera'
import type { ViewId } from './camera'
import { world } from './data'
import { DEFAULT_SYSTEMS, ORGAN_SYSTEMS, organMembers, regionCount, useStore } from './store'
import { LAYERS, ORGANS, REGIONS, SYSTEMS } from './types'
import type { Entry } from './types'

const ICONS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  front: '<circle cx="12" cy="5.5" r="2.5"/><path d="M12 9v6M7.5 11h9M10 21l2-6 2 6"/>',
  orbit: '<ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-25 12 12)"/><circle cx="12" cy="12" r="1.6"/>',
  pan: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  reset: '<path d="M4 11l8-7 8 7M6 10v10h12V10"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  explode: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  isolate: '<circle cx="12" cy="12" r="3"/><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>',
}
const Icon = ({ n }: { n: string }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[n] }} />
)

const Toggle = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
  <button className={'tg' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={onClick}><i /></button>
)
function Seg<T extends string>({ items, value, onChange }: { items: [T, string][]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {items.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  )
}
const Panel = ({ className = '', delay = 0, children }: { className?: string; delay?: number; children: React.ReactNode }) => (
  <motion.div className={'panel ' + className} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}>{children}</motion.div>
)

export function Branding() {
  return (
    <motion.div className="brand" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <div className="eyebrow">INTERACTIVE ANATOMY</div>
      <h1>Human Atlas<sup>3D</sup></h1>
      <div className="meta">{world.pieces.length} modeled pieces · {world.placeholder ? 'placeholder geometry' : 'BodyParts3D'}</div>
    </motion.div>
  )
}

export function SystemsPanel() {
  const systems = useStore((s) => s.systems)
  const { setSystem, preset } = useStore.getState()
  const counts = useMemo(() => Object.fromEntries(SYSTEMS.map((s) => [s.id, world.pieces.filter((p) => p.e.system === s.id).length])), [])
  const on = SYSTEMS.filter((s) => systems[s.id])
  const visible = on.reduce((a, s) => a + counts[s.id], 0)
  const only = (ids: string[]) => on.length === ids.length && on.every((s) => ids.includes(s.id))
  const isDefault = SYSTEMS.every((s) => systems[s.id] === DEFAULT_SYSTEMS[s.id])
  const active = isDefault ? 'all' : only(['skeleton']) ? 'skeleton' : only(ORGAN_SYSTEMS) ? 'organs' : null
  const [tab, setTab] = useState<'systems' | 'layers'>('systems')
  const shown = SYSTEMS.filter((s) => counts[s.id] > 0) // placeholder mode has fewer systems
  return (
    <Panel className="systems" delay={0.1}>
      <div className="ph">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'systems'} className={tab === 'systems' ? 'on' : ''} onClick={() => setTab('systems')}>Systems</button>
          <button role="tab" aria-selected={tab === 'layers'} className={tab === 'layers' ? 'on' : ''} onClick={() => setTab('layers')}>Layers</button>
        </div>
        {tab === 'systems' && <span className="badge">{on.length}/{shown.length}</span>}
      </div>
      {tab === 'layers' ? <LayersTab /> : <>
      <Seg items={[['all', 'All'], ['skeleton', 'Skeleton'], ['organs', 'Organs']]} value={active} onChange={preset} />
      <div className="rows">
        {shown.map((s) => (
          <div className="row" key={s.id}>
            <span className="dot" style={{ background: s.color }} />
            <span className="grow">{s.label}</span>
            <span className="num">{counts[s.id]}</span>
            <Toggle on={systems[s.id]} label={s.label} onClick={() => setSystem(s.id, !systems[s.id])} />
          </div>
        ))}
      </div>
      <div className="pf"><span>{visible} pieces visible</span><button className="link" onClick={() => preset('none')}>Hide all</button></div>
      </>}
    </Panel>
  )
}

function LayersTab() {
  const layers = useStore((s) => s.layers)
  const systems = useStore((s) => s.systems)
  const { setLayer, peelBack, restoreLayers } = useStore.getState()
  const present = LAYERS.filter((l) => world.pieces.some((p) => (l.systems as readonly string[]).includes(p.e.system)))
  return (
    <>
      <p className="sub tight">Peel away a layer to see what lies beneath.</p>
      {present.map((l) => {
        const pct = l.systems.some((x) => systems[x]) ? Math.round(layers[l.id] * 100) : 0 // systems off reads as 0%
        return (
          <label className="layer" key={l.id}>
            <span className="lh"><span>{l.label}</span><em>{pct}%</em></span>
            <input type="range" min={0} max={100} value={pct} style={{ ['--p' as string]: pct + '%' }} aria-label={`${l.label} layer opacity`}
              onChange={(e) => setLayer(l.id, +e.target.value / 100)} />
          </label>
        )
      })}
      <div className="pf"><button className="peel" onClick={peelBack}>Peel back</button><button className="link" onClick={restoreLayers}>Restore layers</button></div>
    </>
  )
}

export function Organs() {
  const organ = useStore((s) => s.organ)
  const counts = useMemo(() => ORGANS.map((o) => organMembers(o.id).length), [])
  return (
    <motion.nav className="organs" aria-label="Organs in 3D" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
      <span className="eyebrow">ORGANS</span>
      {ORGANS.map((o, i) => counts[i] > 0 && (
        <button key={o.id} className={organ === o.id ? 'on' : ''} aria-pressed={organ === o.id} onClick={() => useStore.getState().setOrgan(o.id)}>
          <span className="dot" style={{ background: SYSTEMS.find((s) => s.id === o.systems[0])!.color }} />{o.label}
        </button>
      ))}
    </motion.nav>
  )
}

export function Collections() {
  const region = useStore((s) => s.region)
  const side = useStore((s) => s.side)
  const { setRegion, setSide } = useStore.getState()
  const [open, setOpen] = useState(() => window.innerWidth > 760)
  return (
    <Panel className="collections" delay={0.2}>
      <button className="ph hbtn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <b>Specimen collections</b>
        <span className={'chev' + (open ? '' : ' shut')}><Icon n="chevron" /></span>
      </button>
      {open && (
        <>
          <p className="sub">Study the body, region by region.</p>
          <div className="grid2">
            {REGIONS.map((r) => (
              <button key={r} className={'rb' + (region === r ? ' on' : '')} onClick={() => setRegion(r)}>
                <span>{r[0].toUpperCase() + r.slice(1)}</span><em>{regionCount(r)}</em>
              </button>
            ))}
          </div>
          <Seg items={[['both', 'Both'], ['left', 'Left'], ['right', 'Right']]} value={side} onChange={setSide} />
        </>
      )}
    </Panel>
  )
}

export function Search() {
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== input.current) { e.preventDefault(); input.current?.focus() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? world.pieces.filter((p) => p.e.name.toLowerCase().includes(t)).slice(0, 8) : []
  }, [q])
  const pick = (id: string) => { useStore.getState().select(id); setQ(''); input.current?.blur() }
  return (
    <motion.div className="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
      <div className="sbox">
        <Icon n="search" />
        <input ref={input} value={q} placeholder="Find a structure" aria-label="Find a structure"
          onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) pick(results[0].e.id); if (e.key === 'Escape') input.current?.blur() }} />
        <kbd>/</kbd>
      </div>
      <AnimatePresence>
        {focus && q.trim() && (
          <motion.ul className="panel drop" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {results.length === 0 && <li className="none">No match</li>}
            {results.map((p) => (
              <li key={p.e.id}><button onMouseDown={() => pick(p.e.id)}><span>{p.e.name}</span><em>{SYSTEMS.find((s) => s.id === p.e.system)!.category}</em></button></li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function Toolbar() {
  const tool = useStore((s) => s.tool)
  const set = (tool: 'orbit' | 'pan') => useStore.setState({ tool })
  const front = () => useStore.getState().setView('front')
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === 'f' || e.key === 'F') && !(e.target instanceof HTMLInputElement)) front()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const B = ({ n, t, on, f }: { n: string; t: string; on?: boolean; f: () => void }) => (
    <button className={on ? 'on' : ''} title={t} aria-label={t} onClick={f}><Icon n={n} /></button>
  )
  return (
    <motion.div className="toolbar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
      <B n="plus" t="Zoom in" f={() => cam.zoom(0.7)} />
      <B n="front" t="Front view (F)" f={front} />
      <B n="minus" t="Zoom out" f={() => cam.zoom(1.4)} />
      <hr />
      <B n="orbit" t="Orbit" on={tool === 'orbit'} f={() => set('orbit')} />
      <B n="pan" t="Pan" on={tool === 'pan'} f={() => set('pan')} />
      <hr />
      <B n="reset" t="Reset camera" f={front} />
      <B n="full" t="Fullscreen" f={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())} />
    </motion.div>
  )
}

export function ExplodeControl() {
  const explode = useStore((s) => s.explode)
  const region = useStore((s) => s.region)
  const organ = useStore((s) => s.organ)
  const view = useStore((s) => s.view)
  const pct = Math.round(explode * 100)
  const reset = () => { const s = useStore.getState(); s.setRegion(null); s.setExplode(0); s.clear(); s.restoreLayers(); s.setView('front') }
  const mode = organ ? 'ORGAN · ' + ORGANS.find((o) => o.id === organ)!.label.toUpperCase()
    : region ? 'SPECIMEN SHEET · ' + region.toUpperCase() : explode > 0 ? 'SPECIMEN ATLAS' : 'ANATOMICAL POSITION'
  const views: [ViewId, string][] = [['front', 'FRONT'], ['back', 'BACK'], ['side', 'SIDE'], ['quarter', '¾']]
  return (
    <div className="explode-wrap">
      <div className="caption">
        <span>{mode}</span>
        {views.map(([v, l]) => (
          <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => useStore.getState().setView(v)}>{l}</button>
        ))}
      </div>
      <Panel className="explode" delay={0.3}>
        <div className="ex-main">
          <div className="ex-head"><Icon n="explode" /><b>Explode anatomy</b><span className="pct">{pct}%</span></div>
          <input type="range" min={0} max={100} value={pct} style={{ ['--p' as string]: pct + '%' }} aria-label="Explode anatomy"
            onChange={(e) => useStore.getState().setExplode(+e.target.value / 100)} />
          <div className="ends"><span>Assembled</span><span>Every piece</span></div>
        </div>
        <div className="vr" />
        <button className="link" onClick={reset}>Reset</button>
      </Panel>
    </div>
  )
}

function infoText(e: Entry, cat: string) {
  const side = e.side === 'midline' ? 'on the midline' : `on the ${e.side} side`
  return world.placeholder
    ? `Placeholder shape standing in for the ${e.name.toLowerCase()} (${cat.toLowerCase()}). Replace it by building the BodyParts3D assets.`
    : `${cat} of the ${e.region} region, ${side}. Geometry from BodyParts3D; use Isolate to study it on its own.`
}

export function Tooltip() {
  const id = useStore((s) => s.hoverId)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const m = (e: PointerEvent) => { if (ref.current) ref.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 16}px)` }
    window.addEventListener('pointermove', m)
    return () => window.removeEventListener('pointermove', m)
  }, [])
  const p = id ? world.byId.get(id) : null
  return (
    <div ref={ref} className="tip" style={{ opacity: p ? 1 : 0 }}>
      {p && <><b>{p.e.name}</b><span>{SYSTEMS.find((s) => s.id === p.e.system)!.category}</span></>}
    </div>
  )
}

export function InfoPanel() {
  const selectedId = useStore((s) => s.selectedId)
  const isolate = useStore((s) => s.isolate)
  const p = selectedId ? world.byId.get(selectedId) : null
  const near = useMemo(() => {
    if (!p) return []
    const a = p.e.assembledPosition
    const d = (q: Entry) => Math.hypot(q.assembledPosition[0] - a[0], q.assembledPosition[1] - a[1], q.assembledPosition[2] - a[2])
    return world.pieces.filter((q) => q !== p).sort((x, y) => d(x.e) - d(y.e)).slice(0, 4)
  }, [p])
  const sys = p && SYSTEMS.find((s) => s.id === p.e.system)!
  const verified = p?.e.attachments?.map((id) => world.byId.get(id)).filter(Boolean) ?? []
  const List = ({ title, items }: { title: string; items: typeof near }) => (
    <div className="rel"><h4>{title}</h4>{items.map((q) => <button key={q!.e.id} onClick={() => useStore.getState().select(q!.e.id)}>{q!.e.name}</button>)}</div>
  )
  return (
    <AnimatePresence>
      {p && sys && (
        <motion.aside key="info" className="panel info" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.25 }}>
          <div className="eyebrow">{sys.category.toUpperCase()}</div>
          <h2>{p.e.name}</h2>
          <p>{infoText(p.e, sys.category)}</p>
          <dl>
            <div><dt>ID</dt><dd>{p.e.id}</dd></div>
            <div><dt>System</dt><dd>{sys.label}</dd></div>
            <div><dt>Region</dt><dd>{p.e.region}</dd></div>
            <div><dt>Side</dt><dd>{p.e.side}</dd></div>
          </dl>
          {verified.length > 0 && <List title="Attachments" items={verified as typeof near} />}
          {near.length > 0 && <List title="Nearby (not a verified connection)" items={near} />}
          <button className="primary" onClick={() => useStore.setState({ isolate: !isolate })}><Icon n="isolate" />{isolate ? 'Show everything' : 'Isolate structure'}</button>
          <button className="link center" onClick={() => useStore.getState().clear()}>Clear selection</button>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

export function Credits() {
  const sel = useStore((s) => !!s.selectedId)
  return (
    <>
      <div className="hint">{sel ? 'Esc to clear · I to isolate · F for front view' : 'Drag to orbit · Scroll to zoom · Tap to inspect'}</div>
      <div className="built-by">Built by alphash</div>
    </>
  )
}
