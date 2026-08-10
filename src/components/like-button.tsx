import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'
import { motion, AnimatePresence } from 'motion/react'
import { Heart } from 'lucide-react'
import clsx from 'clsx'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type LikeButtonProps = {
	slug?: string
	className?: string
	delay?: number
}

const ENDPOINT = '/api/like'

export default function LikeButton({ slug, delay, className }: LikeButtonProps) {
	const likeSlug = slug?.trim() || ''
	const [liked, setLiked] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [show, setShow] = useState(false)
	const [justLiked, setJustLiked] = useState(false)
	const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([])

	useEffect(() => {
		setTimeout(() => {
			setShow(true)
		}, delay || 1000)
	}, [])

	useEffect(() => {
		if (justLiked) {
			const timer = setTimeout(() => setJustLiked(false), 600)
			return () => clearTimeout(timer)
		}
	}, [justLiked])

	const fetcher = useCallback(async (url: string): Promise<number | null> => {
		const res = await fetch(url, { method: 'GET', cache: 'no-store' })
		if (!res.ok) throw new Error(`读取点赞数失败: ${res.status}`)

		const data = await res.json().catch(() => ({}))
		return typeof data?.count === 'number' ? data.count : null
	}, [])

	const { data: fetchedCount, mutate } = useSWR(likeSlug ? `${ENDPOINT}?slug=${encodeURIComponent(likeSlug)}` : null, fetcher, {
		revalidateOnFocus: false,
		dedupingInterval: 1000 * 10
	})

	const handleLike = useCallback(async () => {
		if (!likeSlug || isSubmitting) return

		setIsSubmitting(true)
		setLiked(true)
		setJustLiked(true)

		// Create particle effects
		const newParticles = Array.from({ length: 6 }, (_, i) => ({
			id: Date.now() + i,
			x: Math.random() * 60 - 30,
			y: Math.random() * 60 - 30
		}))
		setParticles(newParticles)

		// Clear particles after animation
		setTimeout(() => setParticles([]), 1000)

		try {
			const url = `${ENDPOINT}?slug=${encodeURIComponent(likeSlug)}`
			const res = await fetch(url, { method: 'POST', cache: 'no-store' })
			if (!res.ok) throw new Error(`点赞失败: ${res.status}`)

			const data = await res.json().catch(() => ({}))
			if (typeof data?.count !== 'number') throw new Error('点赞接口未返回有效 count')

			await mutate(data.count, { revalidate: false })

			if (data.reason === 'rate_limited') {
				setJustLiked(false)
				setParticles([])
				toast('谢谢啦😘，今天已经不能再点赞啦💕')
			}
		} catch (error) {
			setLiked(false)
			setJustLiked(false)
			setParticles([])
			console.error('Like request failed:', error)
			toast.error('点赞失败，请稍后再试')
		} finally {
			setIsSubmitting(false)
		}
	}, [likeSlug, isSubmitting, mutate])

	const count = typeof fetchedCount === 'number' ? fetchedCount : null

	if (!likeSlug) return null

	if (show)
		return (
			<motion.button
				initial={{ opacity: 0, scale: 0.6 }}
				animate={{ opacity: 1, scale: 1 }}
				whileHover={{ scale: 1.05 }}
				whileTap={{ scale: 0.95 }}
				aria-label='Like this post'
				aria-busy={isSubmitting}
				disabled={isSubmitting}
				onClick={handleLike}
				className={clsx('card heartbeat-container relative overflow-visible rounded-full p-3 disabled:cursor-default', className)}>
				<AnimatePresence>
					{particles.map(particle => (
						<motion.div
							key={particle.id}
							className='pointer-events-none absolute inset-0 flex items-center justify-center'
							initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
							animate={{
								opacity: [1, 1, 0],
								scale: [0, 1.2, 0.8],
								x: particle.x,
								y: particle.y
							}}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.8, ease: 'easeOut' }}>
							<Heart className='fill-rose-400 text-rose-400' size={12} />
						</motion.div>
					))}
				</AnimatePresence>

				{typeof count === 'number' && (
					<motion.span
						initial={{ scale: 0.4 }}
						animate={{ scale: 1 }}
						className={cn(
							'absolute -top-2 left-9 min-w-6 rounded-full px-1.5 py-1 text-center text-xs text-white tabular-nums',
							liked ? 'bg-rose-400' : 'bg-gray-300'
						)}>
						{count}
					</motion.span>
				)}
				<motion.div animate={justLiked ? { scale: [1, 1.4, 1], rotate: [0, -10, 10, 0] } : {}} transition={{ duration: 0.6, ease: 'easeOut' }}>
					<Heart className={clsx('heartbeat', liked ? 'fill-rose-400 text-rose-400' : 'fill-rose-200 text-rose-200')} size={28} />
				</motion.div>
			</motion.button>
		)
}
