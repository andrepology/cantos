# Tactile Shadow & Performance Blueprint

This document synthesizes key learnings from industry-leading CSS practitioners on how to build shadows that are both visually "real" and performantly "silky."

## 1. Performance Lessons (Tobias Ahlin)
*Source: [How to animate box-shadow](https://tobiasahlin.com/blog/how-to-animate-box-shadow/)*

### The "Slow" Path
Animating the `box-shadow` property directly is a performance killer. It forces the browser to recalculate and **re-paint** the shadow on the main thread for every single frame (typically 60 times per second).

### The "Fast" Path (Layering)
To achieve 60 FPS, we must stick to properties handled by the **GPU Compositor**: `opacity` and `transform`.
- **Strategy**: Instead of transitioning the shadow value, create multiple layers (pseudo-elements or absolute divs) each with a static shadow.
- **Action**: Transition the `opacity` of these layers to "fade" between different elevation states.

---

## 2. Design Principles (Josh W. Comeau)
*Source: [Designing Beautiful Shadows](https://www.joshwcomeau.com/css/designing-shadows/)*

### Cohesion & Light Sources
- **The Global Light Source**: All shadows in the app should share the same "light source." In CSS terms, this means they must all share the **same ratio** of horizontal offset (`x`) to vertical offset (`y`).
- **Tactile Intuition**: Use your intuition as a human in a physical world. If an object is "closer" to you, its shadow moves further away, becomes blurrier, and actually becomes **less opaque**.

### The Anatomy of High Elevation
As an element "rises" (elevates):
1. **Offset increases**: The distance from the element grows.
2. **Blur increases**: The shadow diffuses more.
3. **Opacity decreases**: The shadow spreads out and becomes fainter (more "soft").
4. **Stacking**: For maximum realism, stack 3–5 shadows with varying offsets/blurs to mimic natural light diffusion (ambient occlusion).

---

## 3. The Cantos Strategy
We will apply these lessons to `TactilePortalShape.tsx` and `ArenaBlockShape.tsx` using the following technical architecture:

1. **Shadow Layers**: Replace single `box-shadow` declarations with a stack of absolute-positioned `div` layers.
   - `Layer-Idle`: Static standard shadow.
   - `Layer-Elevated`: Static high-elevation shadow (larger blur, lower opacity).
2. **Opacity Cross-fades**: Use `motion.div` or CSS transitions to cross-fade the `opacity` of these layers based on `isHovered`, `isSelected`, or `isFocused`.
3. **Background Decoupling**: Separate `background-color` into its own layer to avoid repaints during focus transitions.
4. **Filter vs. Box**: Use `box-shadow` for rectangular containers for maximum compatibility, but consider `filter: drop-shadow` for complex shapes if hardware acceleration is stable.



