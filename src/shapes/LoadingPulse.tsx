import React from 'react'

interface LoadingPulseProps {
  size?: number
  color?: string
  centerDotSize?: number
  animationDuration?: string
}

/**
 * LoadingPulse - A pulsing circle animation component
 * Creates a gentle ripple effect emanating from a central dot
 */
export function LoadingPulse({
  size = 32,
  color = 'rgba(0,0,0,0.1)',
  centerDotSize = 16,
  animationDuration = '2s'
}: LoadingPulseProps) {
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
          borderRadius: '50%',
          backgroundColor: color,
          animation: `pulse-ring ${animationDuration} cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite`
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: centerDotSize,
            height: centerDotSize,
            marginTop: -centerDotSize / 2,
            marginLeft: -centerDotSize / 2,
            borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.2)'
          }}
        />
      </div>
      <style>{`
        @keyframes pulse-ring {
          0% {
            transform: scale(0.33);
            opacity: 1;
          }
          40%, 50% {
            opacity: 0.8;
          }
          100% {
            transform: scale(1.33);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
