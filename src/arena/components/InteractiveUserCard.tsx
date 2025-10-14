import { useState, useMemo } from 'react';
import type { FC } from 'react';
import { motion } from 'motion/react';
import { TEXT_SECONDARY, ROUNDED_SQUARE_BORDER_RADIUS } from '../constants';

interface InteractiveUserCardProps {
  userName?: string;
  userAvatar?: string;
  width: number;
  height: number;
}

export const InteractiveUserCard: FC<InteractiveUserCardProps> = ({
  userName,
  userAvatar,
  width,
  height,
}) => {
  const [mouseRotateX, setMouseRotateX] = useState(0);
  const [mouseRotateY, setMouseRotateY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Compute responsive dimensions
  const thumbnailSize = useMemo(() => {
    const minDimension = Math.min(width, height);
    // Account for 12px padding on all sides (24px total)
    const availableSpace = Math.min(width - 24, height - 24);
    // At very small sizes, use the available space (accounting for padding) for better visibility
    return minDimension < 50 ? Math.max(20, availableSpace) : Math.max(30, minDimension * 0.40);
  }, [width, height]);
  const textMaxWidth = useMemo(() => Math.min(width, height) * 0.8, [width, height]);
  const shouldShowText = width >= 50;

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Much gentler rotation - max 12 degrees instead of 40
    const newRotateY = ((x / rect.width) - 0.5) * 60;
    const newRotateX = (0.5 - (y / rect.height)) * 60;
    setMouseRotateX(newRotateX);
    setMouseRotateY(newRotateY);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setMouseRotateX(0);
    setMouseRotateY(0);
  };

  // Calculate realistic shadow based on 3D rotation
  // Light source is above and in front, so shadow moves opposite to tilt
  const shadowOffsetX = -mouseRotateY * 0.3; // Tilt right = shadow left
  const shadowOffsetY = mouseRotateX * 0.4; // Tilt toward viewer = shadow down
  const shadowBlur = 16 + Math.sqrt(mouseRotateX ** 2 + mouseRotateY ** 2) * 0.4;
  const shadowSpread = 2 + Math.sqrt(mouseRotateX ** 2 + mouseRotateY ** 2) * 0.15;
  
  // Contact shadow (close to object) + projected shadow (further away)
  // Always calculate dynamically so rotation animations drive smooth shadow transitions
  const dynamicShadow = `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px rgba(0,0,0,0.15), ${shadowOffsetX * 0.5}px ${shadowOffsetY * 0.5}px ${shadowBlur * 0.4}px 0px rgba(0,0,0,0.15)`;

  return (
    <div
        style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '12px' }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
    >
      <motion.div
        animate={{
          rotateX: mouseRotateX - 4, // Slight continuous tilt + mouse interaction
          rotateY: mouseRotateY,
          // rotateZ: mouseRotateY * 0.5,
          y: [0, -1, 0], // Very subtle floating motion
          boxShadow: dynamicShadow
        }}
        transition={{
          rotateX: { type: "spring", stiffness: 300, damping: 20 },
          rotateY: { type: "spring", stiffness: 300, damping: 20 },
          y: {
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          },
          boxShadow: { type: "spring", stiffness: 300, damping: 20 }
        }}
        whileHover={{
          scale: 1.02,
          transition: { type: "spring", stiffness: 400, damping: 25 }
        }}
        style={{
          width: thumbnailSize,
          height: thumbnailSize,
          borderRadius: ROUNDED_SQUARE_BORDER_RADIUS,
          overflow: 'hidden',
          userSelect: 'none',
          zIndex: 1,
          transformStyle: 'preserve-3d',
          transform: 'perspective(1200px)',
          flexShrink: 0,
        }}
        
        title={userName || 'Profile'}
      >
        {userAvatar ? (
          <img src={userAvatar} alt={userName || 'avatar'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'rgba(0,0,0,.6)' }}>
              {(userName || 'P').slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </motion.div>

      {shouldShowText && (
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            left: 4,
            padding: 4,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '-0.0125em',
              color: TEXT_SECONDARY,
              paddingRight: 10,
              lineHeight: 1.0,
              hyphens: 'auto',
              wordBreak: 'break-word',
              maxWidth: textMaxWidth,
              display: 'block',
            }}
          >
            {userName || 'Profile'}
          </span>
        </div>
      )}
    </div>
  );
};
