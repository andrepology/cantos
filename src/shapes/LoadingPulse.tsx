import React from 'react'

interface LoadingPulseProps {
  size?: number
  color?: string
  centerDotSize?: number
  animationDuration?: string
  rippleCount?: number
}

/**
 * LoadingPulse - A pulsing circle animation component
 * Creates sequential ripple effects emanating from a central dot
 */
export function LoadingPulse({
  size = 32,
  color = 'rgba(0,0,0,0.06)',
  centerDotSize = 12,
  animationDuration = '1.8s',
  rippleCount = 3
}: LoadingPulseProps) {
  const centerDotColor = 'rgba(0,0,0,0.15)'

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {/* Center dot */}
        <div
          style={{
            position: 'absolute',
            width: centerDotSize,
            height: centerDotSize,
            borderRadius: '50%',
            backgroundColor: centerDotColor,
            zIndex: 10
          }}
        />

        {/* Sequential ripple rings */}
        {Array.from({ length: rippleCount }, (_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: '50%',
              border: `1px solid ${color}`,
              animation: `pulse-ring-${i} ${animationDuration} cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite`,
              animationDelay: `${i * (parseFloat(animationDuration) / rippleCount)}s`
            }}
          />
        ))}

        <style>{`
          ${Array.from({ length: rippleCount }, (_, i) => `
            @keyframes pulse-ring-${i} {
              0% {
                transform: scale(0.5);
                opacity: 0.8;
              }
              50% {
                transform: scale(1);
                opacity: 0.4;
              }
              100% {
                transform: scale(1.5);
                opacity: 0;
              }
            }
          `).join('')}
        `}</style>
      </div>
    </div>
  )
}
