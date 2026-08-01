import { create } from 'zustand'
import { toast } from 'sonner'
import { hashFileSHA256 } from '@/lib/file-utils'
import { loadBlog } from '@/lib/load-blog'
import { DEFAULT_BLOG_AUTHOR, getBlogAuthor } from '@/lib/blog-author'
import type { PublishForm, ImageFileAddResult, ImageItem } from '../types'

export const formatDateTimeLocal = (date: Date = new Date()): string => {
	const pad = (n: number) => String(n).padStart(2, '0')
	const year = date.getFullYear()
	const month = pad(date.getMonth() + 1)
	const day = pad(date.getDate())
	const hours = pad(date.getHours())
	const minutes = pad(date.getMinutes())
	return `${year}-${month}-${day}T${hours}:${minutes}`
}

type WriteStore = {
	// Mode state
	mode: 'create' | 'edit'
	originalSlug: string | null
	setMode: (mode: 'create' | 'edit', originalSlug?: string) => void

	// Form state
	form: PublishForm
	updateForm: (updates: Partial<PublishForm>) => void
	setForm: (form: PublishForm) => void

	// Image state
	images: ImageItem[]
	imageSession: number
	addUrlImage: (url: string) => void
	addFilesWithMapping: (files: FileList | File[], shouldApply?: () => boolean) => Promise<ImageFileAddResult[]>
	addFiles: (files: FileList | File[]) => Promise<ImageItem[]>
	deleteImage: (id: string) => void

	// Cover state
	cover: ImageItem | null
	setCover: (cover: ImageItem | null) => void

	// Publish state
	loading: boolean
	setLoading: (loading: boolean) => void

	// Load blog for editing
	loadBlogForEdit: (slug: string) => Promise<void>

	// Reset to create mode
	reset: () => void
}

const initialForm: PublishForm = {
	slug: '',
	title: '',
	author: DEFAULT_BLOG_AUTHOR,
	md: '',
	tags: [],
	date: formatDateTimeLocal(),
	summary: '',
	hidden: false,
	category: ''
}

export const useWriteStore = create<WriteStore>((set, get) => ({
	// Mode state
	mode: 'create',
	originalSlug: null,
	setMode: (mode, originalSlug) => set({ mode, originalSlug: originalSlug || null }),

	// Form state
	form: { ...initialForm },
	updateForm: updates => set(state => ({ form: { ...state.form, ...updates } })),
	setForm: form => set({ form }),

	// Image state
	images: [],
	imageSession: 0,
	addUrlImage: url => {
		const { images } = get()
		const exists = images.some(it => it.type === 'url' && it.url === url)
		if (exists) {
			toast.info('该图片已在列表中')
			return
		}
		const id = Math.random().toString(36).slice(2, 10)
		set(state => ({ images: [{ id, type: 'url', url }, ...state.images] }))
	},
	addFilesWithMapping: async (files: FileList | File[], shouldApply?: () => boolean) => {
		const inputFiles = Array.from(files)
		if (inputFiles.length === 0) return []
		const imageSession = get().imageSession
		const canApply = () => {
			if (get().imageSession !== imageSession) return false
			try {
				return shouldApply ? shouldApply() : true
			} catch {
				return false
			}
		}

		const computed = await Promise.all(
			inputFiles.map(async (file, originalIndex) => {
				if (!file.type.startsWith('image/')) {
					return { originalIndex, file, error: '不支持的文件类型' } as const
				}

				try {
					const hash = await hashFileSHA256(file)
					return { originalIndex, file, hash } as const
				} catch (error) {
					return {
						originalIndex,
						file,
						error: error instanceof Error ? error.message : '计算图片哈希失败'
					} as const
				}
			})
		)

		const results: ImageFileAddResult[] = computed.map(result => ({
			originalIndex: result.originalIndex,
			item: null,
			status: 'failed',
			...('error' in result ? { error: result.error } : {})
		}))
		const successful = computed.filter(
			(result): result is Extract<(typeof computed)[number], { hash: string }> => 'hash' in result
		)

		if (successful.length === 0) return results
		if (!canApply()) {
			for (const result of successful) {
				results[result.originalIndex] = {
					originalIndex: result.originalIndex,
					item: null,
					status: 'failed',
					error: '图片导入已取消'
				}
			}
			return results
		}

		set(state => {
			if (state.imageSession !== imageSession || !canApply()) {
				for (const result of successful) {
					results[result.originalIndex] = {
						originalIndex: result.originalIndex,
						item: null,
						status: 'failed',
						error: '图片导入已取消'
					}
				}
				return state
			}

			const fileItemsByHash = new Map<string, Extract<ImageItem, { type: 'file' }>>()
			const usedIds = new Set(state.images.map(item => item.id))
			const newItems: Extract<ImageItem, { type: 'file' }>[] = []

			for (const item of state.images) {
				if (item.type === 'file' && item.hash && !fileItemsByHash.has(item.hash)) {
					fileItemsByHash.set(item.hash, item)
				}
			}

			for (const result of successful) {
				const existingItem = fileItemsByHash.get(result.hash)
				if (existingItem) {
					results[result.originalIndex] = {
						originalIndex: result.originalIndex,
						item: existingItem,
						status: 'existing'
					}
					continue
				}

				try {
					let id = Math.random().toString(36).slice(2, 10)
					while (usedIds.has(id)) id = Math.random().toString(36).slice(2, 10)
					usedIds.add(id)

					const item: Extract<ImageItem, { type: 'file' }> = {
						id,
						type: 'file',
						file: result.file,
						previewUrl: URL.createObjectURL(result.file),
						filename: result.file.name,
						hash: result.hash
					}

					fileItemsByHash.set(result.hash, item)
					newItems.push(item)
					results[result.originalIndex] = {
						originalIndex: result.originalIndex,
						item,
						status: 'added'
					}
				} catch (error) {
					results[result.originalIndex] = {
						originalIndex: result.originalIndex,
						item: null,
						status: 'failed',
						error: error instanceof Error ? error.message : '创建图片预览失败'
					}
				}
			}

			return newItems.length > 0 ? { images: [...newItems, ...state.images] } : state
		})

		return results
	},
	addFiles: async (files: FileList | File[]) => {
		const results = await get().addFilesWithMapping(files)
		if (results.length > 0 && results.every(result => result.status === 'existing')) {
			toast.info('图片已存在，不重复添加')
		}
		return results.flatMap(result => (result.item ? [result.item] : []))
	},
	deleteImage: id =>
		set(state => {
			for (const it of state.images) {
				if (it.type === 'file' && it.id === id) {
					URL.revokeObjectURL(it.previewUrl)

					if (it.id === state.cover?.id) {
						set({ cover: null })
					}
				}
			}
			return { images: state.images.filter(it => it.id !== id) }
		}),

	// Cover state
	cover: null,
	setCover: cover => set({ cover }),

	// Publish state
	loading: false,
	setLoading: loading => set({ loading }),

	// Load blog for editing
	loadBlogForEdit: async (slug: string) => {
		const loadSession = get().imageSession + 1
		try {
			set({ loading: true, imageSession: loadSession })
			const blog = await loadBlog(slug)
			if (get().imageSession !== loadSession) return

			// Parse images from markdown
			const images: ImageItem[] = []
			const imageRegex = /!\[.*?\]\((.*?)\)/g
			let match
			while ((match = imageRegex.exec(blog.markdown)) !== null) {
				const url = match[1]
				// Skip cover image and only collect content images
				if (url && url !== blog.cover && !url.startsWith('local-image:')) {
					// Check if already added
					if (!images.some(img => img.type === 'url' && img.url === url)) {
						const id = Math.random().toString(36).slice(2, 10)
						images.push({ id, type: 'url', url })
					}
				}
			}

			// Set cover
			let cover: ImageItem | null = null
			if (blog.cover) {
				const coverId = Math.random().toString(36).slice(2, 10)
				cover = { id: coverId, type: 'url', url: blog.cover }
			}

			// Set form
			set({
				mode: 'edit',
				originalSlug: slug,
				form: {
					slug,
					title: blog.config.title || '',
					author: getBlogAuthor(blog.config.author),
					md: blog.markdown,
					tags: blog.config.tags || [],
					date: blog.config.date ? formatDateTimeLocal(new Date(blog.config.date)) : formatDateTimeLocal(),
					summary: blog.config.summary || '',
					hidden: blog.config.hidden || false,
					category: blog.config.category || ''
				},
				images,
				cover,
				loading: false
			})

			if (get().imageSession === loadSession) toast.success('博客加载成功')
		} catch (err: any) {
			if (get().imageSession !== loadSession) return
			console.error('Failed to load blog:', err)
			toast.error(err?.message || '加载博客失败')
			set({ loading: false })
			throw err
		}
	},

	// Reset to create mode
	reset: () => {
		// Revoke object URLs
		const { images, cover } = get()
		for (const img of images) {
			if (img.type === 'file') {
				URL.revokeObjectURL(img.previewUrl)
			}
		}
		if (cover?.type === 'file') {
			URL.revokeObjectURL(cover.previewUrl)
		}

		set(state => ({
			mode: 'create',
			originalSlug: null,
			form: { ...initialForm, date: formatDateTimeLocal() },
			images: [],
			cover: null,
			imageSession: state.imageSession + 1
		}))
	}
}))
