import { useEffect, useState } from 'react'

export function useAnchorPosition(anchor: HTMLElement | null) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!anchor) return

    const update = () => {
      setRect(anchor.getBoundingClientRect())
    }

    // Initial measurement
    update()

    // Update on scroll/resize
    window.addEventListener('resize', update, { passive: true })
    window.addEventListener('scroll', update, { passive: true, capture: true })
    
    // Also poll with RAF for smooth updates during transform animations
    let raf: number
    const loop = () => {
      update()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, { capture: true })
      cancelAnimationFrame(raf)
    }
  }, [anchor])

  return rect
}

