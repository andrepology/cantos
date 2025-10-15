import { useState, useMemo, useCallback, useEffect } from 'react';
import type { FC } from 'react';
import { motion } from 'motion/react';
import { TEXT_SECONDARY, ROUNDED_SQUARE_BORDER_RADIUS } from '../constants';
import extractPaletteFromImage from '../../color/palette';

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
  const [palette, setPalette] = useState<{ background: string; color: string; alternative: string, accents: string[] } | null>(null);

  // Compute responsive dimensions
  const thumbnailSize = useMemo(() => {
    const minDimension = Math.min(width, height);
    // Account for 12px padding on all sides (24px total)
    const availableSpace = Math.min(width - 24, height - 24);
    // At very small sizes, use the available space (accounting for padding) for better visibility
    return minDimension < 50 ? Math.max(20, availableSpace) : Math.max(30, minDimension * 0.40);
  }, [width, height]);
  const textMaxWidth = useMemo(() => Math.min(width, height) * 0.8, [width, height]);
  const shouldShowText = useMemo(() => width >= 10, [width]);

  const handleMouseMoveRaw = useCallback((e: React.MouseEvent) => {
    // Guard against null currentTarget (can happen when component unmounts)
    if (!e.currentTarget) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Calculate rotation to make card tilt towards mouse cursor
    // Normalize mouse position to [-1, 1] range relative to card center
    const normalizedX = (x / rect.width) * 2 - 1;  // -1 (left) to 1 (right)
    const normalizedY = (y / rect.height) * 2 - 1; // -1 (top) to 1 (bottom)
    
    // Apply rotation with appropriate scaling to tilt towards cursor
    const newRotateY = normalizedX * 25; // Tilt left/right towards cursor
    const newRotateX = -normalizedY * 25; // Tilt up/down towards cursor (inverted for natural feel)
    setMouseRotateX(newRotateX);
    setMouseRotateY(newRotateY);
  }, []);

  // No throttling - let React and browser handle native mousemove efficiently
  const handleMouseMove = handleMouseMoveRaw;

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setMouseRotateX(0);
    setMouseRotateY(0);
  }, []);

  // Extract palette from the avatar and set palette state
  useEffect(() => {
    let isMounted = true;
    const url = userAvatar;
    if (!url) { setPalette(null); return; }
    (async () => {
      try {
        const p = await extractPaletteFromImage(url);
        if (isMounted) setPalette({ background: p.background, color: p.color, alternative: p.alternative, accents: p.accents });
      } catch {
        if (isMounted) setPalette(null);
      }
    })();
    return () => { isMounted = false; };
  }, [userAvatar]);

  // Calculate realistic shadow based on 3D rotation
  // Light source is above and in front, so shadow moves opposite to tilt
  const dynamicShadow = useMemo(() => {
    const shadowOffsetX = -mouseRotateY * 0.3; // Tilt right = shadow left
    const shadowOffsetY = mouseRotateX * 0.4; // Tilt toward viewer = shadow down
    const shadowBlur = 16 + Math.sqrt(mouseRotateX ** 2 + mouseRotateY ** 2) * 0.4;
    const shadowSpread = Math.sqrt(mouseRotateX ** 2 + mouseRotateY ** 2) * 0.15;

    // Contact shadow (close to object) + projected shadow (further away)
    // Always calculate dynamically so rotation animations drive smooth shadow transitions
    return `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px rgba(0,0,0,0.1), ${shadowOffsetX * 0.5}px ${shadowOffsetY * 0.5}px ${shadowBlur * 0.4}px 0px rgba(0,0,0,0.1)`;
  }, [mouseRotateX, mouseRotateY]);

  // Generate stable but varied gradient position based on username
  const gradientPosition = useMemo(() => {
    if (!userName) return { x: 15, y: 15 };
    // Simple hash to generate consistent variation per card
    let hash = 0;
    for (let i = 0; i < userName.length; i++) {
      hash = ((hash << 5) - hash) + userName.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    // Vary position within bottom-left quadrant (0-30% from edges)
    const xOffset = Math.abs(hash % 30);
    const yOffset = Math.abs((hash >> 8) % 30);
    return { x: xOffset, y: yOffset };
  }, [userName]);

  return (
    <div
        style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', padding: '12px', overflow: 'hidden' }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
    >
      {/* Blurred gradient background positioned at bottom right with variation */}
      {palette?.background && (
        <div
          style={{
            position: 'absolute',
            bottom: `${gradientPosition.y}%`,
            right: `${gradientPosition.x}%`,
            width: '30%',
            height: '30%',
            background: palette.background,
            opacity: 0.6,
            pointerEvents: 'none',
            filter: 'blur(16px)',
            zIndex: 0,
          }}
        />
      )}
      <motion.div
        animate={{
          rotateX: mouseRotateX - 4, // Slight continuous tilt + mouse interaction
          rotateY: mouseRotateY,
          // rotateZ: mouseRotateY * 0.5,
          y: [0, -1.5, 0], // Very subtle floating motion
          boxShadow: dynamicShadow
        }}
        transition={{
          rotateX: { type: "spring", stiffness: 400, damping: 30 },
          rotateY: { type: "spring", stiffness: 400, damping: 30 },
          y: {
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          },
          boxShadow: { type: "spring", stiffness: 400, damping: 30 }
        }}
        whileHover={{
          scale: 1.02,
          transition: { type: "spring", stiffness: 400, damping: 25 }
        }}
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          width: thumbnailSize,
          height: thumbnailSize,
          borderRadius: ROUNDED_SQUARE_BORDER_RADIUS,
          overflow: 'hidden',
          userSelect: 'none',
          zIndex: 1,
          transformStyle: 'preserve-3d',
          transform: 'perspective(1200px)',
          backgroundColor: palette?.background ?? undefined,
        }}
        
        title={userName || 'Profile'}
      >
        {userAvatar ? (
          <img
            src={userAvatar}
            alt={userName || 'avatar'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onDragStart={(e) => e.preventDefault()}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1), inset 0 1px 2px rgba(0,0,0,0.05)'
          }}>
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
            top: 4,
            left: 4,
            padding: 4,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'Alte Haas Grotesk', system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '-0.0085em',
              color: palette?.color,
              paddingRight: 18,
              lineHeight: 1.125,
              hyphens: 'auto',
              wordBreak: 'break-word',
              maxWidth: textMaxWidth,
              display: 'block',
            }}
          >
            { userName || 'Profile'}
          </span>
        </div>
      )}
    </div>
  );
};
