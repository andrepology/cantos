import React, { createContext, type ReactNode, useContext, useState } from 'react'
import { atom, structuredClone, uniqueId } from 'tldraw'

export const SLIDE_SIZE = { x: 0, y: 0, w: 4000, h: 900 }
export const SLIDE_MARGIN = 128

interface Slide {
  id: string
  index: number
  name: string
}

const DEFAULT_SLIDES: Slide[] = [
  { id: '1', index: 0, name: 'cantos preview' },
]

class SlidesManager {
  private _slides = atom<Slide[]>('slide', [])

  getCurrentSlides() {
    return this._slides.get().sort((a, b) => (a.index < b.index ? -1 : 1))
  }

  private _currentSlideId = atom('currentSlide', '')

  getCurrentSlideId() {
    return this._currentSlideId.get()
  }

  getCurrentSlide() {
    const currentId = this.getCurrentSlideId()
    const slides = this._slides.get()
    const slide = slides.find((slide) => slide.id === currentId)
    if (slide) return slide
    return slides[0]
  }

  setCurrentSlide(id: string) {
    this._currentSlideId.set(id)
  }

  setSlides(slides: Slide[], currentSlideId?: string) {
    this._slides.set(slides)
    if (currentSlideId) {
      this._currentSlideId.set(currentSlideId)
      return
    }
    this._currentSlideId.set(slides[0]?.id ?? '')
  }

  seedDefaults() {
    this.setSlides(DEFAULT_SLIDES, DEFAULT_SLIDES[0].id)
  }

  moveBy(delta: number) {
    const slides = this.getCurrentSlides()
    const currentIndex = slides.findIndex((slide) => slide.id === this.getCurrentSlideId())
    const next = slides[currentIndex + delta]
    if (!next) return
    this._currentSlideId.set(next.id)
  }

  nextSlide() {
    this.moveBy(1)
  }

  prevSlide() {
    this.moveBy(-1)
  }

  newSlide(index: number) {
    const slides = structuredClone(this.getCurrentSlides())

    let bumping = false
    for (const slide of slides) {
      if (slide.index === index) {
        bumping = true
      }
      if (bumping) {
        slide.index++
      }
    }

    const newSlide = {
      id: uniqueId(),
      index,
      name: `Slide ${slides.length + 1}`,
    }

    this._slides.set([...slides, newSlide])

    return newSlide
  }

  updateSlideName(slideId: string, newName: string) {
    const slides = structuredClone(this.getCurrentSlides())
    const slide = slides.find((s) => s.id === slideId)
    if (slide) {
      slide.name = newName
      this._slides.set(slides)
    }
  }
}

const slidesContext = createContext({} as SlidesManager)

export const SlidesProvider = ({ children }: { children: ReactNode }) => {
  const [slideManager] = useState(() => new SlidesManager())
  return <slidesContext.Provider value={slideManager}>{children}</slidesContext.Provider>
}

export function useSlides() {
  return useContext(slidesContext)
}

