import React from 'react'
import { createPortal } from 'react-dom'

export interface TilingDebugControlsProps {
  showSpiralPath: boolean
  showGridLines: boolean
  showCollisionBoxes: boolean
  showDebugSamples: boolean
  onToggleSpiralPath: () => void
  onToggleGridLines: () => void
  onToggleCollisionBoxes: () => void
  onToggleDebugSamples: () => void
  className?: string
}

export const TilingDebugControls: React.FC<TilingDebugControlsProps> = ({
  showSpiralPath,
  showGridLines,
  showCollisionBoxes,
  showDebugSamples,
  onToggleSpiralPath,
  onToggleGridLines,
  onToggleCollisionBoxes,
  onToggleDebugSamples,
  className = ''
}) => {
  const debugControls = (
    <div className={`tiling-debug-controls ${className}`} style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      backgroundColor: 'rgba(0,0,0,0.9)',
      color: 'white',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '12px',
      zIndex: 999999,
      fontFamily: 'monospace',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.1)',
      pointerEvents: 'auto',
      maxWidth: '200px'
    }}>
      <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Tiling Debug</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showDebugSamples}
            onChange={onToggleDebugSamples}
            style={{ cursor: 'pointer' }}
          />
          Candidate Samples
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showSpiralPath}
            onChange={onToggleSpiralPath}
            style={{ cursor: 'pointer' }}
          />
          Spiral Path
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showGridLines}
            onChange={onToggleGridLines}
            style={{ cursor: 'pointer' }}
          />
          Grid Lines
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showCollisionBoxes}
            onChange={onToggleCollisionBoxes}
            style={{ cursor: 'pointer' }}
          />
          Collision Boxes
        </label>
      </div>
      <div style={{ marginTop: '8px', fontSize: '10px', color: '#ccc' }}>
        Hover for details
      </div>
    </div>
  )

  // Use portal to render at document body level for true fixed positioning
  return createPortal(debugControls, document.body)
}
