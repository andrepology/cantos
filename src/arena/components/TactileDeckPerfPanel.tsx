import { useEffect, useState } from 'react'
import { getTactilePerfSnapshot, resetTactilePerf } from '../tactilePerf'
import { getTimingColor, getMorphColor } from '../tactileUtils'

export function TactileDeckPerfPanel() {
  const [perfSnapshot, setPerfSnapshot] = useState(() => getTactilePerfSnapshot())

  useEffect(() => {
    const id = window.setInterval(() => {
      setPerfSnapshot(getTactilePerfSnapshot())
    }, 250)
    return () => {
      window.clearInterval(id)
    }
  }, [])

  const layoutColor = getTimingColor(perfSnapshot.layout.avgMs, perfSnapshot.layout.maxMs)
  const cullColor = getTimingColor(perfSnapshot.culling.avgMs, perfSnapshot.culling.maxMs)
  const scrollColor = getTimingColor(perfSnapshot.scrollBounds.avgMs, perfSnapshot.scrollBounds.maxMs)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          deck {perfSnapshot.deckRenderCount}r{' '}
          {perfSnapshot.cardSamples.length > 0 && (
            <>
              •{' '}
              {perfSnapshot.cardSamples
                .map(
                  (s) =>
                    `c${s.id}:${s.renders}r/${s.layoutChanges}l/${s.handlerChanges}h`
                )
                .join(' • ')}
            </>
          )}
        </span>
        <button
          onClick={() => {
            resetTactilePerf()
            setPerfSnapshot(getTactilePerfSnapshot())
          }}
          style={{
            padding: '2px 6px',
            fontSize: 8,
            borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(0,0,0,0.3)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          reset stats
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 8, opacity: 0.85 }}>
        <span>
          layout{' '}
          <span style={{ color: layoutColor }}>
            {perfSnapshot.layout.avgMs.toFixed(2)} / {perfSnapshot.layout.maxMs.toFixed(2)}ms
          </span>
        </span>
        <span>
          cull{' '}
          <span style={{ color: cullColor }}>
            {perfSnapshot.culling.avgMs.toFixed(2)} / {perfSnapshot.culling.maxMs.toFixed(2)}ms
          </span>
        </span>
        <span>
          scroll{' '}
          <span style={{ color: scrollColor }}>
            {perfSnapshot.scrollBounds.avgMs.toFixed(2)} / {perfSnapshot.scrollBounds.maxMs.toFixed(2)}ms
          </span>
        </span>
        {perfSnapshot.lastMorphDurationMs != null && (
          <span>
            morph{' '}
            <span style={{ color: getMorphColor(perfSnapshot.lastMorphDurationMs) }}>
              {Math.round(perfSnapshot.lastMorphDurationMs)}ms
            </span>
          </span>
        )}
      </div>
    </>
  )
}

