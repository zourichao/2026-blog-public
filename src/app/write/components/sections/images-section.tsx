'use client'

import { useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useWriteStore } from '../../stores/write-store'
import Link from 'next/link'
import type { ImageItem } from '../../types'

type ImagesSectionProps = {
	delay?: number
}

type ImageTab = 'article' | 'share'

type ShareImageView = {
	id: string
	src: string | null
	filename: string
	publishedUrl: string | null
	error?: string
}

const IMAGE_EXTENSION_PATTERN = /\.[^.]+$/

function toShareFilename(filename: string): string {
	const stem = filename.replace(IMAGE_EXTENSION_PATTERN, '') || 'image'
	return `${stem}.webp`
}

function toPublishedShareUrl(url: string): string | null {
	const value = url.trim()
	if (!value) return null

	// 已发布正文图默认使用 /blogs/{slug}/{filename}。分享图只做平行资源，不参与正文 URL。
	const relativeMatch = value.match(/^\/blogs\/([^/]+)\/([^/?#]+)(?:[?#].*)?$/i)
	if (relativeMatch) {
		return `/blogs/${relativeMatch[1]}/share/${toShareFilename(relativeMatch[2])}`
	}

	// 仅兼容当前站点同源绝对地址，避免把普通外链误判为本站分享图。
	if (typeof window === 'undefined') return null
	try {
		const parsed = new URL(value)
		if (parsed.origin !== window.location.origin) return null
		const absoluteMatch = parsed.pathname.match(/^\/blogs\/([^/]+)\/([^/]+)$/i)
		if (!absoluteMatch) return null
		return `${parsed.origin}/blogs/${absoluteMatch[1]}/share/${toShareFilename(absoluteMatch[2])}`
	} catch {
		return null
	}
}

function getShareImageView(item: ImageItem): ShareImageView {
	if (item.type === 'file') {
		return {
			id: item.id,
			src: item.sharePreviewUrl ?? null,
			filename: item.shareFile?.name || toShareFilename(item.filename),
			publishedUrl: item.publishedShareUrl ?? null,
			error: item.shareError
		}
	}

	const publishedUrl = toPublishedShareUrl(item.url)
	return {
		id: item.id,
		src: publishedUrl,
		filename: publishedUrl ? toShareFilename(publishedUrl.split('/').pop() || 'image.webp') : 'image.webp',
		publishedUrl,
		error: publishedUrl ? undefined : '外部图片不生成分享图'
	}
}

export function ImagesSection({ delay = 0 }: ImagesSectionProps) {
	const { images, cover, addUrlImage, addFiles, deleteImage } = useWriteStore()
	const [urlInput, setUrlInput] = useState<string>('')
	const [activeTab, setActiveTab] = useState<ImageTab>('article')
	const [failedShareIds, setFailedShareIds] = useState<Set<string>>(() => new Set())
	const fileInputRef = useRef<HTMLInputElement>(null)
	const coverId = cover?.id ?? null
	const shareImages = useMemo(() => images.map(getShareImageView), [images])

	const copyShareUrl = async (url: string) => {
		try {
			const absoluteUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url
			await navigator.clipboard.writeText(absoluteUrl)
			toast.success('分享图地址已复制')
		} catch {
			toast.error('复制失败，请手动打开分享图后复制地址')
		}
	}

	return (
		<motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay }} className='card relative'>
			<div className='flex items-center justify-between'>
				<h2 className='text-sm'>图片管理</h2>
				<Link href='/image-toolbox' target='_blank' className='text-xs hover:underline'>
					压缩工具
				</Link>
			</div>

			{/* 本次改动：单一图片列表 → 正文图片 / 分享图片双 Tab；分享图不参与正文、封面和拖拽。 */}
			<div className='mt-3 flex rounded-lg border bg-white/40 p-1 text-xs'>
				<button
					type='button'
					className={`flex-1 rounded-md px-3 py-1.5 transition ${activeTab === 'article' ? 'bg-white shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
					onClick={() => setActiveTab('article')}>
					正文图片
				</button>
				<button
					type='button'
					className={`flex-1 rounded-md px-3 py-1.5 transition ${activeTab === 'share' ? 'bg-white shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
					onClick={() => setActiveTab('share')}>
					分享图片
				</button>
			</div>

			{activeTab === 'article' ? (
				<>
					<div className='mt-3 flex items-center gap-2'>
						<input
							type='text'
							placeholder='https://...'
							className='bg-card flex-1 rounded-lg border px-3 py-2 text-sm'
							value={urlInput}
							onChange={e => setUrlInput(e.target.value)}
						/>
						<button
							className='rounded-lg border bg-white/70 px-3 py-2 text-sm'
							onClick={() => {
								const v = urlInput.trim()
								if (!v) return
								addUrlImage(v)
								setUrlInput('')
							}}>
							添加
						</button>
					</div>
					<input
						ref={fileInputRef}
						type='file'
						accept='image/*'
						multiple
						className='hidden'
						onChange={e => {
							const files = e.target.files
							if (files && files.length > 0) {
								addFiles(files)
							}
							if (e.currentTarget) e.currentTarget.value = ''
						}}
					/>
					<div className='mt-3 grid grid-cols-4 gap-2'>
						{/* plus tile */}
						<div
							className='group bg-card hover:bg-secondary/20 relative grid aspect-square cursor-pointer place-items-center rounded-lg border'
							onClick={() => fileInputRef.current?.click()}
							onDragOver={e => {
								e.preventDefault()
							}}
							onDrop={e => {
								e.preventDefault()
								const files = e.dataTransfer.files
								if (files && files.length) addFiles(files)
							}}>
							<span className='text-2xl leading-none text-neutral-400'>+</span>
						</div>
						{images.map(item => {
							const isUrl = item.type === 'url'
							const src = isUrl ? item.url : item.previewUrl
							const markdown = isUrl ? `![](${item.url})` : `![](local-image:${item.id})`
							const isCover = coverId === item.id
							return (
								<div
									key={item.id}
									className={`group relative aspect-square overflow-hidden rounded-lg border bg-white/50 text-xs ${isCover ? 'ring-2 ring-blue-500' : ''}`}>
									<img
										src={src}
										alt=''
										className='h-full w-full object-cover'
										draggable
										onDragStart={e => {
											e.dataTransfer.setData('text/plain', markdown)
											e.dataTransfer.setData('text/markdown', markdown)
										}}
									/>
									{isCover && <div className='absolute top-1 left-1 rounded-md bg-blue-500 px-1.5 py-0.5 text-white shadow'>封面</div>}
									<div className='absolute top-1 right-1 hidden group-hover:flex'>
										<button type='button' className='rounded-md bg-white/80 px-1.5 py-0.5 shadow hover:bg-white' onClick={() => deleteImage(item.id)}>
											删除
										</button>
									</div>
								</div>
							)
						})}
					</div>
				</>
			) : (
				<div className='mt-3 grid grid-cols-4 gap-2'>
					{shareImages.length === 0 ? (
						<div className='col-span-4 rounded-lg border border-dashed px-3 py-6 text-center text-xs text-neutral-400'>暂无分享图片</div>
					) : (
						shareImages.map(item => {
							const failed = failedShareIds.has(item.id)
							const unavailable = !item.src || !!item.error || failed
							return (
								<div key={item.id} className='group relative aspect-square overflow-hidden rounded-lg border bg-white/50 text-xs'>
									{item.src && !item.error ? (
										<img
											src={item.src}
											alt='分享图片'
											className={`h-full w-full object-cover ${failed ? 'invisible' : ''}`}
											onLoad={() =>
												setFailedShareIds(current => {
													if (!current.has(item.id)) return current
													const next = new Set(current)
													next.delete(item.id)
													return next
												})
											}
											onError={() =>
												setFailedShareIds(current => {
													const next = new Set(current)
													next.add(item.id)
													return next
												})
											}
										/>
									) : null}
									{unavailable && (
										<div className='absolute inset-0 grid place-items-center px-2 text-center text-neutral-400'>
											{item.error || '暂无分享图'}
										</div>
									)}
									{!unavailable && item.src && (
										<div className='absolute inset-x-1 bottom-1 hidden items-center justify-end gap-1 group-hover:flex'>
											<a href={item.src} target='_blank' rel='noreferrer' className='rounded-md bg-white/85 px-1.5 py-0.5 shadow hover:bg-white'>
												预览
											</a>
											<a href={item.src} download={item.filename} className='rounded-md bg-white/85 px-1.5 py-0.5 shadow hover:bg-white'>
												下载
											</a>
											{item.publishedUrl && (
												<button
													type='button'
													className='rounded-md bg-white/85 px-1.5 py-0.5 shadow hover:bg-white'
													onClick={() => copyShareUrl(item.publishedUrl!)}>
													复制
												</button>
											)}
										</div>
									)}
								</div>
							)
						})
					)}
				</div>
			)}
		</motion.div>
	)
}
