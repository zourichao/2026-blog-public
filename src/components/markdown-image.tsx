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
			type: 'pinch'
			startDistance: number
			startScale: number
			startMidpoint: Point
			startOffset: Point
	  }
	| null

const MIN_SCALE = 0.5
const MAX_SCALE = 4

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
		setActiveIndex(sourceIndex)
		setDisplay(true)
	}, [resetViewer, sourceIndex])

	const handleClose = useCallback(() => {
		resetViewer()
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

		if (scaleRef.current > 1) {
			gestureRef.current = {
				type: 'drag',
				pointerId: event.pointerId,
				startPoint: { x: event.clientX, y: event.clientY },
				startOffset: offsetRef.current,
			}
			setIsDragging(true)
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

		if (gesture.pointerId !== event.pointerId || scaleRef.current <= 1) return

		applyTransform(scaleRef.current, {
			x: gesture.startOffset.x + event.clientX - gesture.startPoint.x,
			y: gesture.startOffset.y + event.clientY - gesture.startPoint.y,
		})
	}

	const finishPointer = (event: ReactPointerEvent<HTMLImageElement>) => {
		pointersRef.current.delete(event.pointerId)
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId)
		}

		if (pointersRef.current.size >= 2) {
			startPinch()
			return
		}

		if (pointersRef.current.size === 1 && scaleRef.current > 1) {
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

	const handleViewerClick = (event: ReactMouseEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget) handleClose()
	}

	const stopWheelPropagation = (event: ReactWheelEvent<HTMLElement>) => event.stopPropagation()

	return (
		<>
			<img src={src} alt={alt} title={title} loading='lazy' onClick={handleOpen} className='cursor-pointer transition-opacity hover:opacity-80' />
			<DialogModal open={display} onClose={handleClose} className='max-w-none bg-transparent p-0'>
				{/* 本次改动：单图预览 → 正文图片画廊；保留跨端缩放/拖拽，并增加左右切图、方向键和张数提示。 */}
				<div
					ref={viewerRef}
					onWheel={handleWheel}
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
						onPointerCancel={finishPointer}
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
						className='absolute right-2 top-2 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.32] text-[22px] leading-none text-white/95 shadow-sm backdrop-blur-sm transition hover:bg-black/[0.48] focus:outline-none focus:ring-2 focus:ring-white/70'>
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
								className='absolute left-2 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/[0.36] text-[24px] leading-none text-white/95 shadow-sm backdrop-blur-sm transition hover:bg-black/[0.50] focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-20'>
								←
							</button>
							<button
								type='button'
								disabled={!hasNext}
								onClick={() => goToImage(activeIndex + 1)}
								onWheel={stopWheelPropagation}
								aria-label='查看下一张正文图片'
								title='下一张'
								className='absolute right-2 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/[0.36] text-[24px] leading-none text-white/95 shadow-sm backdrop-blur-sm transition hover:bg-black/[0.50] focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-20'>
								→
							</button>
							<div className='pointer-events-none absolute bottom-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-black/[0.28] px-2.5 py-1 text-[13px] text-white/90 shadow-sm backdrop-blur-sm' aria-live='polite'>
								{activeIndex + 1} / {gallery.length}
							</div>
						</>
					)}
				</div>
			</DialogModal>
		</>
	)
}
