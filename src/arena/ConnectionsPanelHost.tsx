import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { stopEventPropagation } from 'tldraw'
import { ConnectionsPanel, type ConnectionsPanelProps } from './ConnectionsPanel'

const FRONT_LAYER_SELECTOR = '[data-tldraw-front-layer]'

type ConnectionsPanelHostProps = Omit<ConnectionsPanelProps, 'x' | 'y' | 'z'> & {
  screenX: number
  screenY: number
  z?: number
}

function getPortalRoot(): HTMLElement {
  if (typeof document === 'undefined') return {} as HTMLElement
  const frontLayer = document.querySelector(FRONT_LAYER_SELECTOR) as HTMLElement | null
  if (frontLayer) return frontLayer
  return document.body
}

export function ConnectionsPanelHost(props: ConnectionsPanelHostProps) {
  const { screenX, screenY, z = 1, ...panelProps } = props

  const root = useMemo(() => {
    if (typeof document === 'undefined') return null
    return getPortalRoot()
  }, [])

  if (!root) return null

  return createPortal(
    <div
      data-interactive="connections-panel-overlay"
      style={{
        position: 'fixed',
        transform: `translate3d(${Math.round(screenX)}px, ${Math.round(screenY)}px, 0)`,
        zIndex: 5000,
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        stopEventPropagation(e as any)
      }}
    >
      <ConnectionsPanel {...panelProps} x={0} y={0} z={z} />
    </div>,
    root
  )
}


