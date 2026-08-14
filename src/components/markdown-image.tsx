'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { DialogModal } from '@/components/dialog-modal'

export type MarkdownImageItem = {
	src: string
	alt?: string
	title?: string
}

type MarkdownImageProps = {
	src: string
	alt?: string
	title?: string
	images?: MarkdownImageItem[]
	index?: number
}

type Point = {
	x: number
	y: number
}

type GestureState =
	| {
			type: 'drag'
			pointerId: number
			startPoint: Point
			startOffset: Point
	  }
	| {
			type: 'swipe'
			pointerId: number
			startPoint: Point
	  }
	| {
			type: 'pinch'
			startDistance: number
			startScale: number
			startMidpoint: Point
			startOffset: Point
	  }
	| null

const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SWIPE_THRESHOLD = 56
const SWIPE_AXIS_RATIO = 1.1
const BASE_SCALE_EPSILON = 0.02
const DESKTOP_NAV_ZONE_RATIO = 0.22

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getDistance = (first: Point, second: Point) => Math.hypot(second.x - first.x, second.y - first.y)

const getMidpoint = (first: Point, second: Point): Point => ({
	x: (first.x + second.x) / 2,
	y: (first.y + second.y) / 2,
})

export function MarkdownImage({ src, alt = '', title = '', images, index = 0 }: MarkdownImageProps) {
	const gallery = images?.length ? images : [{ src, alt, title }]
	const sourceIndex = clamp(index, 0, gallery.length - 1)

	const [display, setDisplay] = useState(false)
	const [activeIndex, setActiveIndex] = useState(sourceIndex)
	const [scale, setScale] = useState(1)
	const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
	const [isDragging, setIsDragging] = useState(false)
	const [hoverNavigation, setHoverNavigation] = useState<'previous' | 'next' | null>(null)

	const viewerRef = useRef<HTMLDivElement>(null)
	const imageRef = useRef<HTMLImageElement>(null)
	const scaleRef = useRef(1)
	const offsetRef = useRef<Point>({ x: 0, y: 0 })
	const pointersRef = useRef(new Map<number, Point>())
	const gestureRef = useRef<GestureState>(null)

	const activeImage = gallery[activeIndex] ?? gallery[sourceIndex] ?? { src, alt, title }
	const hasPrevious = activeIndex > 0
	const hasNext = activeIndex < gallery.length - 1

	const clampOffset = useCallback((nextOffset: Point, nextScale: number): Point => {
		const viewer = viewerRef.current
		const image = imageRef.current

		if (!viewer || !image || nextScale <= 1) return { x: 0, y: 0 }

		const maxX = Math.max(0, (image.clientWidth * nextScale - viewer.clientWidth) / 2)
		const maxY = Math.max(0, (image.clientHeight * nextScale - viewer.clientHeight) / 2)

		return {
			x: clamp(nextOffset.x, -maxX, maxX),
			y: clamp(nextOffset.y, -maxY, maxY),
		}
	}, [])

	const applyTransform = useCallback(
		(nextScale: number, nextOffset: Point = offsetRef.current) => {
			const safeScale = clamp(nextScale, MIN_SCALE, MAX_SCALE)
			const safeOffset = clampOffset(nextOffset, safeScale)

			scaleRef.current = safeScale
			offsetRef.current = safeOffset
			setScale(safeScale)
			setOffset(safeOffset)
		},
		[clampOffset]
	)

	const resetViewer = useCallback(() => {
		scaleRef.current = 1
		offsetRef.current = { x: 0, y: 0 }
		pointersRef.current.clear()
		gestureRef.current = null
		setScale(1)
		setOffset({ x: 0, y: 0 })
		setIsDragging(false)
	}, [])

	const handleOpen = useCallback(() => {
		resetViewer()
		setHoverNavigation(null)
		setActiveIndex(sourceIndex)
		setDisplay(true)
	}, [resetViewer, sourceIndex])

	const handleClose = useCallback(() => {
		resetViewer()
		setHoverNavigation(null)
		setDisplay(false)
	}, [resetViewer])

	const goToImage = useCallback(
		(nextIndex: number) => {
			const safeIndex = clamp(nextIndex, 0, gallery.length - 1)
			if (safeIndex === activeIndex) return

			resetViewer()
			setActiveIndex(safeIndex)
		},
		[activeIndex, gallery.length, resetViewer]
	)

	useEffect(() => {
		if (!display) return

		const handleResize = () => applyTransform(scaleRef.current, offsetRef.current)
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [applyTransform, display])

	useEffect(() => {
		if (!display || gallery.length <= 1) return

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'ArrowLeft' && hasPrevious) {
				event.preventDefault()
				goToImage(activeIndex - 1)
			}
			if (event.key === 'ArrowRight' && hasNext) {
				event.preventDefault()
				goToImage(activeIndex + 1)
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [activeIndex, display, gallery.length, goToImage, hasNext, hasPrevious])

	const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
		event.preventDefault()
		const factor = Math.exp(-event.deltaY * 0.0015)
		applyTransform(scaleRef.current * factor, offsetRef.current)
	}

	const startPinch = () => {
		const points = Array.from(pointersRef.current.values())
		if (points.length < 2) return

		const [first, second] = points
		gestureRef.current = {
			type: 'pinch',
			startDistance: Math.max(1, getDistance(first, second)),
			startScale: scaleRef.current,
			startMidpoint: getMidpoint(first, second),
			startOffset: offsetRef.current,
		}
		setIsDragging(false)
	}

	const handlePointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
		if (event.pointerType === 'mouse' && event.button !== 0) return

		event.preventDefault()
		event.currentTarget.setPointerCapture(event.pointerId)
		pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

		if (pointersRef.current.size >= 2) {
			startPinch()
			return
		}

		if (scaleRef.current > 1 + BASE_SCALE_EPSILON) {
			gestureRef.current = {
				type: 'drag',
				pointerId: event.pointerId,
				startPoint: { x: event.clientX, y: event.clientY },
				startOffset: offsetRef.current,
			}
			setIsDragging(true)
			return
		}

		if (event.pointerType === 'touch' && gallery.length > 1 && scaleRef.current <= 1 + BASE_SCALE_EPSILON) {
			gestureRef.current = {
				type: 'swipe',
				pointerId: event.pointerId,
				startPoint: { x: event.clientX, y: event.clientY },
			}
		}
	}

	const handlePointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
		if (!pointersRef.current.has(event.pointerId)) return

		event.preventDefault()
		pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
		const gesture = gestureRef.current
		if (!gesture) return

		if (gesture.type === 'pinch') {
			const points = Array.from(pointersRef.current.values())
			if (points.length < 2) return

			const [first, second] = points
			const currentDistance = Math.max(1, getDistance(first, second))
			const currentMidpoint = getMidpoint(first, second)
			const nextScale = clamp(gesture.startScale * (currentDistance / gesture.startDistance), MIN_SCALE, MAX_SCALE)

			const viewerRect = viewerRef.current?.getBoundingClientRect()
			const viewerCenter = viewerRect
				? { x: viewerRect.left + viewerRect.width / 2, y: viewerRect.top + viewerRect.height / 2 }
				: gesture.startMidpoint
			const focalPoint = {
				x: gesture.startMidpoint.x - viewerCenter.x,
				y: gesture.startMidpoint.y - viewerCenter.y,
			}
			const scaleRatio = gesture.startScale === 0 ? 1 : nextScale / gesture.startScale
			const nextOffset = {
				x: gesture.startOffset.x + (currentMidpoint.x - gesture.startMidpoint.x) - focalPoint.x * (scaleRatio - 1),
				y: gesture.startOffset.y + (currentMidpoint.y - gesture.startMidpoint.y) - focalPoint.y * (scaleRatio - 1),
			}

			applyTransform(nextScale, nextOffset)
			return
		}

		if (gesture.type === 'swipe') return

		if (gesture.pointerId !== event.pointerId || scaleRef.current <= 1 + BASE_SCALE_EPSILON) return

		applyTransform(scaleRef.current, {
			x: gesture.startOffset.x + event.clientX - gesture.startPoint.x,
			y: gesture.startOffset.y + event.clientY - gesture.startPoint.y,
		})
	}

	const finishPointer = (event: ReactPointerEvent<HTMLImageElement>, cancelled = false) => {
		const gesture = gestureRef.current
		const shouldHandleSwipe =
			!cancelled &&
			gesture?.type === 'swipe' &&
			gesture.pointerId === event.pointerId &&
			pointersRef.current.size === 1 &&
			scaleRef.current <= 1 + BASE_SCALE_EPSILON

		const swipeDelta = shouldHandleSwipe
			? { x: event.clientX - gesture.startPoint.x, y: event.clientY - gesture.startPoint.y }
			: null

		pointersRef.current.delete(event.pointerId)
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId)
		}

		if (swipeDelta) {
			gestureRef.current = null
			setIsDragging(false)

			const isHorizontalSwipe = Math.abs(swipeDelta.x) >= SWIPE_THRESHOLD && Math.abs(swipeDelta.x) > Math.abs(swipeDelta.y) * SWIPE_AXIS_RATIO
			if (!isHorizontalSwipe) return

			if (swipeDelta.x < 0 && hasNext) goToImage(activeIndex + 1)
			if (swipeDelta.x > 0 && hasPrevious) goToImage(activeIndex - 1)
			return
		}

		if (pointersRef.current.size >= 2) {
			startPinch()
			return
		}

		if (pointersRef.current.size === 1 && scaleRef.current > 1 + BASE_SCALE_EPSILON) {
			const [pointerId, point] = Array.from(pointersRef.current.entries())[0]
			gestureRef.current = {
				type: 'drag',
				pointerId,
				startPoint: point,
				startOffset: offsetRef.current,
			}
			setIsDragging(true)
			return
		}

		gestureRef.current = null
		setIsDragging(false)
	}

	const handleViewerMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
		if (gallery.length <= 1) {
			setHoverNavigation(null)
			return
		}

		const rect = event.currentTarget.getBoundingClientRect()
		const relativeX = event.clientX - rect.left
		const previousBoundary = rect.width * DESKTOP_NAV_ZONE_RATIO
		const nextBoundary = rect.width * (1 - DESKTOP_NAV_ZONE_RATIO)

		const nextNavigation = relativeX <= previousBoundary && hasPrevious ? 'previous' : relativeX >= nextBoundary && hasNext ? 'next' : null
		setHoverNavigation(current => (current === nextNavigation ? current : nextNavigation))
	}

	const handleViewerClick = (event: ReactMouseEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget) handleClose()
	}

	const stopWheelPropagation = (event: ReactWheelEvent<HTMLElement>) => event.stopPropagation()

	return (
		<>
			<img src={src} alt={alt} title={title} loading='lazy' onClick={handleOpen} className='cursor-pointer transition-opacity hover:opacity-80' />
			<DialogModal open={display} onClose={handleClose} className='max-w-none bg-transparent p-0'>
				{/* 本次改动：PC 左右区域 Hover 显示导航；手机 100%/未放大状态左右滑切图，放大后继续拖图。 */}
				<div
					ref={viewerRef}
					onWheel={handleWheel}
					onMouseMove={handleViewerMouseMove}
					onMouseLeave={() => setHoverNavigation(null)}
					onClick={handleViewerClick}
					className='relative flex h-[90vh] w-[calc(100vw-2rem)] max-w-none touch-none select-none items-center justify-center overflow-hidden rounded-2xl'>
					<img
						key={`${activeIndex}-${activeImage.src}`}
						ref={imageRef}
						src={activeImage.src}
						alt={activeImage.alt ?? ''}
						title={activeImage.title ?? ''}
						draggable={false}
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={finishPointer}
						onPointerCancel={(event: ReactPointerEvent<HTMLImageElement>) => finishPointer(event, true)}
						className='max-h-[90vh] max-w-full touch-none rounded-2xl object-contain will-change-transform'
						style={{
							transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
							transformOrigin: 'center center',
							cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
						}}
					/>

					<button
						type='button'
						onClick={handleClose}
						onWheel={stopWheelPropagation}
						aria-label='关闭图片预览'
						title='关闭'
						className='absolute right-2 top-2 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/[0.12] text-[22px] leading-none text-black/55 transition hover:bg-white/[0.20] focus:outline-none focus:ring-2 focus:ring-black/20'>
						×
					</button>

					{gallery.length > 1 && (
						<>
							<button
								type='button'
								disabled={!hasPrevious}
								onClick={() => goToImage(activeIndex - 1)}
								onWheel={stopWheelPropagation}
								aria-label='查看上一张正文图片'
								title='上一张'
								tabIndex={-1}
								className={`absolute left-2 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-white/[0.08] text-[24px] leading-none text-black/60 transition-[opacity,background-color] duration-150 hover:bg-white/[0.16] focus:outline-none focus:ring-2 focus:ring-black/20 md:flex ${hoverNavigation === 'previous' && hasPrevious ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
								←
							</button>
							<button
								type='button'
								disabled={!hasNext}
								onClick={() => goToImage(activeIndex + 1)}
								onWheel={stopWheelPropagation}
								aria-label='查看下一张正文图片'
								title='下一张'
								tabIndex={-1}
								className={`absolute right-2 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-white/[0.08] text-[24px] leading-none text-black/60 transition-[opacity,background-color] duration-150 hover:bg-white/[0.16] focus:outline-none focus:ring-2 focus:ring-black/20 md:flex ${hoverNavigation === 'next' && hasNext ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
								→
							</button>
							<div className='pointer-events-none absolute bottom-2 left-1/2 z-30 -translate-x-1/2 px-1 py-0.5 text-[13px] font-medium text-black/50 [text-shadow:0_1px_2px_rgba(255,255,255,0.85)]' aria-live='polite'>
								{activeIndex + 1} / {gallery.length}
							</div>
						</>
					)}
				</div>
			</DialogModal>
		</>
	)
}
