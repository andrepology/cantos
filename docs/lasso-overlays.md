### Lasso Overlays: Rendering the Lasso Path in TLDraw

This document describes how our lasso overlay rendering works and how to integrate it into any TLDraw editor in this repo.

#### Files

- `src/tools/lasso/LassoSelectTool.ts` — Tool state machine that captures lasso points and performs selection
- `src/tools/lasso/LassoOverlays.tsx` — Reusable overlay component that draws the lasso path
- `src/examples/SlideShowTrackExample.tsx` — Example editor integrating the tool and overlays

#### What the overlays do

- Read the reactive lasso points from the tool’s `LassoingState.points` atom
- Convert points into an SVG path via `getSvgPathFromPoints(points, true)`
- Render that path into TLDraw’s overlay layer (`className="tl-overlays__item"`), styled to match selection visuals and scaled for zoom

```12:40:src/tools/lasso/LassoOverlays.tsx
export function LassoOverlays() {
	const editor = useEditor()

	const lassoPoints = useValue(
		'lasso points',
		() => {
			if (!editor.isIn('lasso-select.lassoing')) return []
			const lassoing = editor.getStateDescendant('lasso-select.lassoing') as LassoingState
			return lassoing.points.get()
		},
		[editor]
	)

	const svgPath = useMemo(() => {
		return getSvgPathFromPoints(lassoPoints, true)
	}, [lassoPoints])

	return (
		<>
			<TldrawOverlays />
			{lassoPoints.length > 0 && (
				<svg className="tl-overlays__item" aria-hidden="true">
					<path
						d={svgPath}
						fill="var(--color-selection-fill)"
						opacity={0.5}
						stroke="var(--color-selection-stroke)"
						strokeWidth="calc(2px / var(--tl-zoom))"
					/>
				</svg>
			)}
		</>
	)
}
```

#### Integration steps

1) Register the lasso tool in your `<Tldraw>` instance’s `tools` prop.

```180:187:src/examples/SlideShowTrackExample.tsx
<Tldraw
  onMount={handleMount}
  components={components}
  shapeUtils={[SlideShapeUtil, VoiceMemoShapeUtil, ThreeDBoxShapeUtil, ArenaBlockShapeUtil]}
  tools={[VoiceMemoTool, ThreeDBoxTool, LaserTool, LassoSelectTool]}
  overrides={uiOverrides}
  assetUrls={customAssetUrls}
/>
```

2) Add a UI override to expose the tool in the toolbar and bind a shortcut.

```404:413:src/examples/SlideShowTrackExample.tsx
'lasso-select': {
  id: 'lasso-select',
  label: 'Lasso',
  icon: 'lasso',
  kbd: 'shift+l',
  onSelect() {
    editor.setCurrentTool('lasso-select')
  },
},
```

3) Use the reusable overlays component in your editor’s `components.Overlays`.

```379:385:src/examples/SlideShowTrackExample.tsx
Overlays: () => (
  <>
    <LassoOverlays />
  </>
),
```

That’s it—the overlay will render while lassoing. When the user releases the pointer, the tool selects all shapes fully contained by the lasso (see `doesLassoFullyContainShape` in `LassoSelectTool.ts`).

#### Notes

- We intentionally use `getSvgPathFromPoints` from `tldraw` to avoid version-specific imports for stroke processing.
- The overlay uses TLDraw’s CSS variables so the path’s apparent stroke width remains consistent as you zoom.

#### References

- TLDraw freehand utility (context for smoothing & stroke points): `getStrokePoints` in v4: `https://github.com/tldraw/tldraw/blob/v4.0.1/packages/tldraw/src/lib/shapes/shared/freehand/getStrokePoints.ts`

