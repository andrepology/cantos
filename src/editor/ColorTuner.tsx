import React, { useEffect, useState } from 'react'

export const ColorTuner = () => {
  const [hue, setHue] = useState(45)
  const [satBase, setSatBase] = useState(3)
  const [satText, setSatText] = useState(5)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--theme-hue', String(hue))
    root.style.setProperty('--theme-sat-base', `${satBase}%`)
    root.style.setProperty('--theme-sat-text', `${satText}%`)
  }, [hue, satBase, satText])

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 10000,
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1px solid rgba(0,0,0,0.1)',
          background: 'var(--theme-surface, white)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16
        }}
        title="Open Theme Tuner"
      >
        🎨
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 70,
      right: 20,
      width: 260,
      padding: 20,
      background: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(20px)',
      borderRadius: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      border: '1px solid rgba(0,0,0,0.05)',
      zIndex: 10000,
      fontFamily: '-apple-system, system-ui, sans-serif',
      fontSize: 13,
      color: '#333'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Theme Tuner</h3>
        <button 
          onClick={() => setVisible(false)}
          style={{ 
            background: 'none', 
            border: 'none', 
            padding: 4, 
            cursor: 'pointer', 
            opacity: 0.5,
            fontSize: 18,
            lineHeight: 1
          }}
        >
          ×
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontWeight: 500 }}>Mood</label>
          <span style={{ opacity: 0.5, fontVariantNumeric: 'tabular-nums' }}>{hue}°</span>
        </div>
        <input
          type="range"
          min="0"
          max="360"
          value={hue}
          onChange={(e) => setHue(Number(e.target.value))}
          style={{ width: '100%', cursor: 'grab' }}
        />
        <div style={{ 
          height: 6, 
          marginTop: 10, 
          borderRadius: 3, 
          background: `linear-gradient(to right, 
            hsl(0, ${satBase}%, 80%), 
            hsl(60, ${satBase}%, 80%), 
            hsl(120, ${satBase}%, 80%), 
            hsl(180, ${satBase}%, 80%), 
            hsl(240, ${satBase}%, 80%), 
            hsl(300, ${satBase}%, 80%), 
            hsl(360, ${satBase}%, 80%)
          )` 
        }} />
        <div style={{ 
          width: 8, 
          height: 8, 
          borderRadius: '50%', 
          background: '#333',
          border: '1px solid white',
          marginTop: -7,
          marginLeft: `calc(${hue/3.6}% - 4px)`,
          transition: 'margin-left 0.1s linear',
          pointerEvents: 'none'
        }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontWeight: 500 }}>Atmosphere</label>
          <span style={{ opacity: 0.5, fontVariantNumeric: 'tabular-nums' }}>{satBase}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="40"
          value={satBase}
          onChange={(e) => setSatBase(Number(e.target.value))}
          style={{ width: '100%', cursor: 'grab' }}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontWeight: 500 }}>Vibrancy</label>
          <span style={{ opacity: 0.5, fontVariantNumeric: 'tabular-nums' }}>{satText}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="60"
          value={satText}
          onChange={(e) => setSatText(Number(e.target.value))}
          style={{ width: '100%', cursor: 'grab' }}
        />
      </div>
    </div>
  )
}


