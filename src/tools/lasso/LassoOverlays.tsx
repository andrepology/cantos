import { useEffect, useMemo } from 'react'
import { TldrawOverlays, getSvgPathFromPoints, useEditor, useValue } from 'tldraw'
import { LassoingState } from './LassoSelectTool'

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
		return getSvgPathFromPoints(lassoPoints, false)
	}, [lassoPoints])


    // Animate a "boiling line" continuously; only applies when filter nodes exist
    useEffect(() => {
        // More intense but still tasteful
        const baseFrequency = 0.02
        const offsets = [-0.02, 0.015, -0.025, 0.018]
        let i = 0

        const tick = () => {
            const turbulence = document.getElementById('lasso-turbulence') as SVGElement | null
            const displacement = document.getElementById('lasso-displace') as SVGElement | null
            if (!turbulence || !displacement) return

            const factor = 1
            const nextFreq = Math.max(0.0001, baseFrequency + offsets[i] * factor)
            turbulence.setAttribute('baseFrequency', String(nextFreq))

            const baseScale = 3
            const scaleJitter = 0.8
            const nextScale = baseScale + offsets[i] * scaleJitter
            displacement.setAttribute('scale', String(nextScale))

            i = (i + 1) % offsets.length
        }

        const interval = window.setInterval(tick, 90)
        // prime tick so first frame updates quickly when nodes appear
        tick()
        return () => window.clearInterval(interval)
    }, [])

	return (
		<>
			<TldrawOverlays />
			{lassoPoints.length > 0 && (
                <svg
					className="tl-overlays__item"
					aria-hidden="true"
					style={{
						position: 'absolute',
						pointerEvents: 'none'
					}}
				>
					<defs>
						{/* Textured crayon-like stroke pattern */}
						<pattern id="lasso-crayon-pattern" patternUnits="userSpaceOnUse" width="6" height="6">
							<rect width="1" height="1" style={{ fill: 'currentColor', opacity: 0.82 }} />
						</pattern>

						{/* Subtle displacement + blur for organic edge */}
                        <filter id="lasso-crayon-filter" x="-200%" y="-200%" width="400%" height="400%" filterUnits="objectBoundingBox">
                            <feTurbulence id="lasso-turbulence" type="fractalNoise" baseFrequency="0.02" numOctaves="1" seed="2" result="noise" />
                            <feDisplacementMap id="lasso-displace" in="SourceGraphic" in2="noise" scale="1" xChannelSelector="R" yChannelSelector="G" result="displaced" />
							<feGaussianBlur in="displaced" stdDeviation="0.2" result="soft" />
							<feMerge>
								<feMergeNode in="soft" />
							</feMerge>
						</filter>
					</defs>

					<path
						d={svgPath}
						fill="none"
						stroke="url(#lasso-crayon-pattern)"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="calc(40px / var(--tl-zoom))"
						filter="url(#lasso-crayon-filter)"
						style={{ color: 'var(--color-selection-stroke)' }}
						opacity={1.0}
					/>

				
				</svg>
			)}
		</>
	)
}


