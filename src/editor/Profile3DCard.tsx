import { useState, useMemo, useCallback, useEffect } from 'react';
import type { FC } from 'react';
import { motion } from 'motion/react';
import { ROUNDED_SQUARE_BORDER_RADIUS, DESIGN_TOKENS } from '../arena/constants';

interface Profile3DCardProps {
  avatar?: string | null;
  name?: string | null;
  size?: number;
  tilt?: { rotateX: number; rotateY: number };
}

/**
 * 3D Avatar Card Component
 * 
 * Displays a centered, tactile 3D avatar card with:
 * - Mouse-following rotation effect
 * - Dynamic shadow based on 3D tilt
 * - Spring physics animations
 * - Subtle floating motion loop
 * 
 * This is a pure presentation component with no text display.
 */
export const Profile3DCard: FC<Profile3DCardProps> = ({ avatar, name, size = 120, tilt }) => {
  const [mouseRotateX, setMouseRotateX] = useState(0);
  const [mouseRotateY, setMouseRotateY] = useState(0);


  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const nx = Math.max(-1, Math.min(1, (x / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, (y / rect.height) * 2 - 1));
    const maxTilt = 18; // degrees
    setMouseRotateX(-ny * maxTilt); // tilt toward cursor vertically
    setMouseRotateY(nx * maxTilt);  // tilt toward cursor horizontally
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMouseRotateX(0);
    setMouseRotateY(0);
  }, []);



  // Dynamic shadow responds to 3D rotation
  const dynamicShadow = useMemo(() => {
    const shadowOffsetX = -mouseRotateY * 0.3;
    const shadowOffsetY = mouseRotateX * 0.4;
    const shadowBlur = 16 + Math.sqrt(mouseRotateX ** 2 + mouseRotateY ** 2) * 0.4;
    const shadowSpread = Math.sqrt(mouseRotateX ** 2 + mouseRotateY ** 2) * 0.15;
    return `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px rgba(0,0,0,0.1), ${shadowOffsetX * 0.5}px ${shadowOffsetY * 0.5}px ${shadowBlur * 0.4}px 0px rgba(0,0,0,0.1)`;
  }, [mouseRotateX, mouseRotateY]);

  const rotateX = tilt ? tilt.rotateX : mouseRotateX;
  const rotateY = tilt ? tilt.rotateY : mouseRotateY;

  const interactionHandlers = tilt
    ? {}
    : {
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
      };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible', // allow shadow/glow to show
      }}
      {...interactionHandlers}
    >


      {/* 3D Card with motion animations */}
      <motion.div
        animate={{
          rotateX,
          rotateY,
          y: [0, -1.5, 0],
          boxShadow: dynamicShadow,
        }}
        transition={{
          rotateX: { type: 'spring', stiffness: 400, damping: 30 },
          rotateY: { type: 'spring', stiffness: 400, damping: 30 },
          y: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          boxShadow: { type: 'spring', stiffness: 400, damping: 30 },
        }}
        whileHover={{
          scale: 1.02,
          transition: { type: 'spring', stiffness: 400, damping: 25 },
        }}
        style={{
          width: size,
          height: size,
          borderRadius: ROUNDED_SQUARE_BORDER_RADIUS,
          overflow: 'hidden',
          userSelect: 'none',
          zIndex: 1,
          transformStyle: 'preserve-3d',
          transform: 'perspective(1200px)',
        }}
      >
        {avatar ? (
          <img
            src={avatar}
            alt="avatar"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onDragStart={(e) => e.preventDefault()}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: DESIGN_TOKENS.colors.surfaceBackgroundDense,
              border: `1px solid ${DESIGN_TOKENS.colors.border}`,
              boxShadow: DESIGN_TOKENS.shadows.shape,
            }}
          >
            <span
              style={{
                fontSize: size * 0.35,
                fontWeight: 800,
                color: DESIGN_TOKENS.colors.textPrimary,
              }}
            >
              {(name || 'A').slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </motion.div>
    </div>
  );
};

