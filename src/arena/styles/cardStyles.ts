// Centralized card styling constants and utilities
import { CARD_BORDER_RADIUS } from '../constants'

export const cardStyleStaticBase: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transformOrigin: 'center',
  background: '#fff',
  border: '1px solid rgba(0,0,0,.08)',
  boxShadow: '0 6px 18px rgba(0,0,0,.08)',
  borderRadius: CARD_BORDER_RADIUS,
  userSelect: 'none',
  touchAction: 'none',
  pointerEvents: 'auto',
  willChange: 'transform',
  backfaceVisibility: 'hidden',
  overflow: 'hidden',
  // @ts-expect-error - vendor style
  WebkitUserDrag: 'none',
}

export const getCardBaseStyle = (imageLike: boolean, layoutMode: 'mini' | 'stack' | 'row' | 'column' | 'grid' | 'tab' | 'vtab'): React.CSSProperties => {
  const base = { ...cardStyleStaticBase }

  if (imageLike) {
    return {
      ...base,
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      borderRadius: 0,
    }
  }

  if (layoutMode === 'mini' && imageLike) {
    return {
      ...base,
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      borderRadius: 0,
      overflow: 'visible',
    }
  }

  return base
}

export const getRowColumnCardStyle = (imageLike: boolean, cardW: number, cardH: number, useSquareContainer?: boolean): React.CSSProperties => {
  if (imageLike && useSquareContainer) {
    return {
      height: cardH,
      width: cardH, // Square container: width = height
      flex: '0 0 auto',
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      borderRadius: 0,
      overflow: 'visible',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }
  }

  if (imageLike) {
    return {
      height: cardH,
      width: 'auto', // Allow width to scale to preserve aspect ratio
      flex: '0 0 auto',
      background: '#fff',
      border: '1px solid rgba(0,0,0,.08)',
      boxShadow: '0 6px 18px rgba(0,0,0,.08)',
      borderRadius: CARD_BORDER_RADIUS,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }
  }

  return {
    width: cardW,
    height: cardH,
    flex: '0 0 auto',
    background: '#fff',
    border: '1px solid rgba(0,0,0,.08)',
    boxShadow: '0 6px 18px rgba(0,0,0,.08)',
    borderRadius: CARD_BORDER_RADIUS,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  }
}

export const getGridCardStyle = (imageLike: boolean, cardW: number, cardH: number): React.CSSProperties => {
  if (imageLike) {
    return {
      width: cardW,
      height: 'auto',
      maxWidth: cardW,
      minHeight: cardH,
      background: '#fff',
      border: '1px solid rgba(0,0,0,.08)',
      boxShadow: '0 6px 18px rgba(0,0,0,.08)',
      borderRadius: CARD_BORDER_RADIUS,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }
  }

  return {
    width: cardW,
    height: cardH,
    background: '#fff',
    border: '1px solid rgba(0,0,0,.08)',
    boxShadow: '0 6px 18px rgba(0,0,0,.08)',
    borderRadius: CARD_BORDER_RADIUS,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  }
}

export const getColumnCardStyle = (imageLike: boolean, columnW: number, cardH: number): React.CSSProperties => {
  if (imageLike) {
    return {
      width: columnW,
      height: 'auto',
      flex: '0 0 auto',
      background: '#fff',
      border: '1px solid rgba(0,0,0,.08)',
      boxShadow: '0 6px 18px rgba(0,0,0,.08)',
      borderRadius: CARD_BORDER_RADIUS,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
    }
  }

  return {
    width: columnW,
    height: cardH,
    flex: '0 0 auto',
    background: '#fff',
    border: '1px solid rgba(0,0,0,.08)',
    boxShadow: '0 6px 18px rgba(0,0,0,.08)',
    borderRadius: CARD_BORDER_RADIUS,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  }
}
