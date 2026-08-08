'use client'

import { useRef } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { normalizeCoverImageToWebP } from '../../lib/image-webp-normalize'
import { useWriteStore } from '../../stores/write-store'

type CoverSectionProps = {
	delay?: number
}

export function CoverSection({ delay = 0 }: CoverSectionProps) {
	const { images, setCover, cover, addFiles } = useWriteStore()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const coverPreviewUrl = cover ? (cover.type === 'url' ? cover.url : cover.previewUrl) : null

	// 本次改动：封面原图直接 addFiles → 先逐张转换为最大尺寸 400×300、WebP Q90，再进入现有图片列表与 setCover 链路。
	const addCoverFiles = async (files: FileList | File[]) => {
		const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
		if (imageFiles.length === 0) {
			toast.error('请选择图片文件')
			return
		}

		const normalizedFiles: File[] = []
		let failedCount = 0
		for (const file of imageFiles) {
			try {
				normalizedFiles.push(await normalizeCoverImageToWebP(file))
			} catch (error) {
				failedCount += 1
				console.error('封面图片转换失败:', error)
			}
		}

		if (normalizedFiles.length === 0) {
			toast.error('封面图片转换为 WebP 失败')
			return
		}

		const resultImages = await addFiles(normalizedFiles)
		if (resultImages.length > 0) {
			// 使用第一个成功加入图片列表的图片作为封面
			setCover(resultImages[0])
			toast.success(failedCount > 0 ? `已设置封面，${failedCount} 张图片转换失败` : '已设置封面')
			return
		}

		toast.error('封面图片加入列表失败')
	}

	const handleCoverDrop = async (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		// 处理从图片列表中拖入的情况
		const md = e.dataTransfer.getData('text/markdown') || e.dataTransfer.getData('text/plain') || ''
		const m = /!\[\]\(([^)]+)\)/.exec(md.trim())
		if (m) {
			const target = m[1]
			let foundItem
			if (target.startsWith('local-image:')) {
				const id = target.replace(/^local-image:/, '')
				foundItem = images.find(it => it.id === id)
			} else {
				foundItem = images.find(it => it.type === 'url' && it.url === target)
			}
			if (foundItem) {
				// 本次改动：图片列表中的现有图片再次转码 → 直接设置为封面，避免 WebP 二次有损压缩。
				setCover(foundItem)
				toast.success('已设置封面')

				return
			}
		}
		// 处理直接拖入文件的情况
		const files = e.dataTransfer.files
		if (files && files.length > 0) {
			const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
			if (imageFiles.length === 0) {
				toast.error('请拖入图片文件')
				return
			}

			await addCoverFiles(imageFiles)
			return
		}
	}
	const handleClickUpload = () => {
		fileInputRef.current?.click()
	}

	const handleRemoveCover = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation()
		setCover(null)
		toast.success('已删除封面')
	}
	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files || files.length === 0) return

		await addCoverFiles(files)

		// 重置 input 以便可以选择相同的文件
		e.target.value = ''
	}
	return (
		<motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay }} className='card relative'>
			<h2 className='text-sm'>封面</h2>
			{/* 本次改动：选择/拖入封面后直接进入图片列表 → 先转换为最大尺寸 400×300、WebP Q90，再进入图片列表。 */}
			<input ref={fileInputRef} type='file' accept='image/*' className='hidden' onChange={handleFileChange} />
			<div
				className='bg-card relative mt-3 h-[150px] overflow-hidden rounded-xl border'
				onDragOver={e => {
					e.preventDefault()
				}}
				onDrop={handleCoverDrop}>
				{/* 本次改动：已有封面仅展示图片 → 可点击封面更换，并提供明确的“更改封面”“删除封面”按钮。 */}
				{!!coverPreviewUrl ? (
					<>
						<button type='button' className='block h-full w-full cursor-pointer' aria-label='更改封面' onClick={handleClickUpload}>
							<img src={coverPreviewUrl} alt='封面预览' className='h-full w-full object-cover' />
						</button>
						<div className='pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/55 to-transparent p-3 pt-8'>
							<button
								type='button'
								className='pointer-events-auto rounded-md bg-white/95 px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm transition-colors hover:bg-white'
								onClick={handleClickUpload}>
								更改封面
							</button>
							<button
								type='button'
								className='pointer-events-auto rounded-md bg-black/55 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-black/70'
								onClick={handleRemoveCover}>
								删除封面
							</button>
						</div>
					</>
				) : (
					<button
						type='button'
						className='grid h-full w-full cursor-pointer place-items-center transition-colors hover:bg-white/60'
						onClick={handleClickUpload}
						aria-label='添加封面'>
						<span className='text-3xl leading-none text-neutral-400'>+</span>
					</button>
				)}
			</div>
		</motion.div>
	)
}
