// Centralized deck/container styling constants

export const getDeckContainerStyle = (width: number, height: number, layoutMode: 'mini' | 'stack' | 'row' | 'column' | 'grid' | 'tabs' | 'htabs' | 'vtabs'): React.CSSProperties => ({
  position: 'relative',
  width,
  height,
  overflow: 'hidden',
  pointerEvents: 'auto',
  background: 'transparent',
  cursor: 'default',
  touchAction: 'none',
  display: 'flex',
  flexDirection: 'column',
})

export const getStackContainerStyle = (stageSide: number, stackStageOffset: number): React.CSSProperties => ({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  width: '100%',
  height: '100%',
  paddingTop: '18px',
})

export const getMiniContainerStyle = (miniDesignSide: number, miniScale: number): React.CSSProperties => ({
  position: 'relative',
  flex: 1,
  minHeight: 0,
})

export const getMiniInnerContainerStyle = (miniDesignSide: number, miniScale: number): React.CSSProperties => ({
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: miniDesignSide,
  height: miniDesignSide,
  transform: `translate(-50%, -50%) scale(${miniScale})`,
  transformOrigin: 'center',
  perspective: 500,
  perspectiveOrigin: '50% 60%',
  overflow: 'visible',
})

export const getMini3DContainerStyle = (): React.CSSProperties => ({
  position: 'absolute',
  inset: 0,
  transform: 'rotateX(26deg) rotateZ(-10deg)',
  transformStyle: 'preserve-3d',
  opacity: 0.45,
  overflow: 'visible',
})

export const getMiniTitleStyle = (miniScale: number): React.CSSProperties => ({
  position: 'absolute',
  top: 16 * miniScale,
  right: 12 * miniScale,
  transform: 'none',
  width: 140 * miniScale,
  textAlign: 'right',
  pointerEvents: 'none',
  color: 'rgba(0,0,0,.75)',
  fontWeight: 700,
  letterSpacing: '-0.0125em',
  fontSize: Math.max(10, Math.round(14 * miniScale)),
  lineHeight: 1.2,
  whiteSpace: 'normal',
  wordBreak: 'normal',
  overflowWrap: 'normal',
  padding: '4px 8px',
  backgroundColor: 'rgba(255,255,255,0.9)',
  borderRadius: '4px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  zIndex: 9999,
})

export const getRowContainerStyle = (gap: number, paddingRowTB: number, paddingRowLR: number): React.CSSProperties => ({
  position: 'absolute',
  inset: 0,
  overflowX: 'auto',
  overflowY: 'hidden',
  display: 'flex',
  alignItems: 'center',
  gap,
  padding: `${paddingRowTB}px ${paddingRowLR}px`,
  overscrollBehavior: 'contain',
})

export const getColumnContainerStyle = (gap: number, paddingColTB: number, paddingColLR: number): React.CSSProperties => ({
  position: 'absolute',
  inset: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap,
  padding: `${paddingColTB}px ${paddingColLR}px`,
  overscrollBehavior: 'contain',
})

export const getGridContainerStyle = (gap: number, paddingColTB: number, cardW: number): React.CSSProperties => ({
  position: 'absolute',
  inset: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  display: 'grid',
  justifyContent: 'center',
  alignItems: 'start',
  gap,
  padding: `${paddingColTB}px 0`,
  overscrollBehavior: 'contain',
  gridTemplateColumns: `repeat(auto-fit, ${cardW}px)`,
})

export const getTabsContainerStyle = (gap: number, paddingTabsTB: number, paddingTabsLR: number): React.CSSProperties => ({
  position: 'absolute',
  inset: 0,
  overflowX: 'hidden',
  overflowY: 'hidden',
  display: 'flex',
  alignItems: 'center',
  gap,
  padding: `${paddingTabsTB}px ${paddingTabsLR}px`,
  overscrollBehavior: 'contain',
  background: 'transparent',
})

export const getTabsChannelTitleStyle = (): React.CSSProperties => ({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
  fontSize: 10,
  fontWeight: 700,
  color: '#333',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  position: 'relative',
  // Use whole-pixel offset to avoid subpixel jitter during selection/zoom

  // Fix line-height to stabilize vertical metrics
  lineHeight: '12px',
})



export const getScrubberContainerStyle = (isVisible: boolean, scrubberHeight: number): React.CSSProperties => ({
  flex: '0 0 auto',
  height: scrubberHeight,
  display: 'flex',
  alignItems: 'center',
  transform: `translateY(${isVisible ? '0' : '8px'})`,
  opacity: isVisible ? 1 : 0,
  transition: isVisible
    ? `transform 280ms cubic-bezier(0.25, 1, 0.5, 1) 30ms, opacity 280ms cubic-bezier(0.4, 0, 0.2, 1)`
    : `transform 250ms cubic-bezier(0.4, 0, 0.6, 1), opacity 250ms cubic-bezier(0.4, 0, 0.6, 1)`,
  pointerEvents: isVisible ? 'auto' : 'none',
})
