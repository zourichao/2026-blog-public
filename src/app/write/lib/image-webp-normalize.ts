export type ImageWebPNormalizeOptions = {
	maxWidth: number
	maxHeight?: number
	quality: number
	mimeType: 'image/webp'
}

// 本次改动：正文图片参数保持最大宽度 1000 / Q88 → 继续保持不变，避免影响既有正文粘贴链路。
export const IMAGE_WEBP_NORMALIZE_OPTIONS: ImageWebPNormalizeOptions = {
	maxWidth: 1000,
	quality: 0.88,
	mimeType: 'image/webp'
}

// 本次改动：封面原图直接进入图片列表 → 封面先按最大尺寸 400×300 / Q90 转为真正 WebP，再进入图片列表。
export const COVER_IMAGE_WEBP_NORMALIZE_OPTIONS: ImageWebPNormalizeOptions = {
	maxWidth: 400,
	maxHeight: 300,
	quality: 0.9,
	mimeType: 'image/webp'
}

const NORMALIZABLE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type ContainedImageSize = {
	width: number
	height: number
}

// 本次改动：正文继续仅限制最大宽度；封面改为限制最大尺寸 400×300。统一使用“边界内等比缩小，不放大”。
export function calculateContainedImageSize(
	width: number,
	height: number,
	maxWidth = 1000,
	maxHeight?: number
): ContainedImageSize {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		throw new Error('图片尺寸无效')
	}
	if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
		throw new Error('图片最大宽度无效')
	}
	if (typeof maxHeight !== 'undefined' && (!Number.isFinite(maxHeight) || maxHeight <= 0)) {
		throw new Error('图片最大高度无效')
	}

	const widthScale = maxWidth / width
	const heightScale = typeof maxHeight === 'number' ? maxHeight / height : Number.POSITIVE_INFINITY
	const scale = Math.min(1, widthScale, heightScale)
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	}
}

export function buildWebPFilename(filename: string): string {
	const trimmed = filename.trim()
	const base = trimmed ? trimmed.replace(/\.[^./\\]+$/, '') : 'pasted-image'
	return `${base || 'pasted-image'}.webp`
}

export function shouldNormalizeImageToWebP(file: Pick<Blob, 'type'>): boolean {
	return NORMALIZABLE_IMAGE_MIME_TYPES.has(file.type.split(';', 1)[0].trim().toLowerCase())
}

export async function isWebPEncodedBlob(blob: Blob): Promise<boolean> {
	if (blob.type.split(';', 1)[0].trim().toLowerCase() !== 'image/webp') return false
	if (blob.size < 12) return false
	const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
	return (
		header[0] === 0x52 &&
		header[1] === 0x49 &&
		header[2] === 0x46 &&
		header[3] === 0x46 &&
		header[8] === 0x57 &&
		header[9] === 0x45 &&
		header[10] === 0x42 &&
		header[11] === 0x50
	)
}

type DecodedImage = {
	source: CanvasImageSource
	width: number
	height: number
	cleanup: () => void
}

async function decodeWithImageBitmap(file: File): Promise<DecodedImage | null> {
	if (typeof globalThis.createImageBitmap !== 'function') return null
	try {
		const bitmap = await globalThis.createImageBitmap(file)
		return {
			source: bitmap,
			width: bitmap.width,
			height: bitmap.height,
			cleanup: () => bitmap.close()
		}
	} catch {
		return null
	}
}

async function decodeWithImageElement(file: File): Promise<DecodedImage> {
	if (typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
		throw new Error('当前浏览器无法解码图片')
	}

	const objectUrl = URL.createObjectURL(file)
	const image = new Image()
	image.decoding = 'async'
	try {
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve()
			image.onerror = () => reject(new Error('图片解码失败'))
			image.src = objectUrl
		})
		return {
			source: image,
			width: image.naturalWidth,
			height: image.naturalHeight,
			cleanup: () => URL.revokeObjectURL(objectUrl)
		}
	} catch (error) {
		URL.revokeObjectURL(objectUrl)
		throw error
	}
}

async function decodeImage(file: File): Promise<DecodedImage> {
	const bitmap = await decodeWithImageBitmap(file)
	if (bitmap) return bitmap
	return decodeWithImageElement(file)
}

function canvasToWebPBlob(canvas: HTMLCanvasElement, options: ImageWebPNormalizeOptions): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			blob => {
				if (!blob) {
					reject(new Error('当前浏览器无法生成 WebP 图片'))
					return
				}
				resolve(blob)
			},
			options.mimeType,
			options.quality
		)
	})
}

/**
 * 按传入规则重新编码为真正 WebP。
 * 默认正文模式仅处理 PNG/JPEG/WebP；GIF 为避免动画丢失保持原文件。
 * forceNormalize=true 用于封面：浏览器能够解码的 image/* 会转为静态 WebP。
 */
export async function normalizeImageToWebP(
	file: File,
	options: ImageWebPNormalizeOptions = IMAGE_WEBP_NORMALIZE_OPTIONS,
	forceNormalize = false
): Promise<File> {
	if (!forceNormalize && !shouldNormalizeImageToWebP(file)) return file
	if (forceNormalize && !file.type.split(';', 1)[0].trim().toLowerCase().startsWith('image/')) {
		throw new Error('文件不是可处理的图片')
	}
	if (typeof document === 'undefined') throw new Error('当前环境不支持浏览器图片转换')

	const decoded = await decodeImage(file)
	try {
		const target = calculateContainedImageSize(decoded.width, decoded.height, options.maxWidth, options.maxHeight)
		const canvas = document.createElement('canvas')
		canvas.width = target.width
		canvas.height = target.height
		const context = canvas.getContext('2d')
		if (!context) throw new Error('当前浏览器无法创建图片处理画布')
		context.drawImage(decoded.source, 0, 0, target.width, target.height)

		const webpBlob = await canvasToWebPBlob(canvas, options)
		if (!(await isWebPEncodedBlob(webpBlob))) {
			throw new Error('当前浏览器未真正生成 WebP 图片')
		}

		return new File([webpBlob], buildWebPFilename(file.name), {
			type: options.mimeType,
			lastModified: file.lastModified || Date.now()
		})
	} finally {
		decoded.cleanup()
	}
}

/**
 * 封面专用：最大尺寸 400×300、等比缩小、不放大、真正 WebP Q90。
 * 已经存在于图片列表中的图片直接设为封面时不调用本函数，避免二次有损转码。
 * 动态 GIF 若作为新封面导入，会按浏览器 Canvas 能力转换为静态 WebP。
 */
export async function normalizeCoverImageToWebP(file: File): Promise<File> {
	const normalized = await normalizeImageToWebP(file, COVER_IMAGE_WEBP_NORMALIZE_OPTIONS, true)
	if (normalized.type !== COVER_IMAGE_WEBP_NORMALIZE_OPTIONS.mimeType || !normalized.name.toLowerCase().endsWith('.webp')) {
		throw new Error('封面图片未成功转换为 WebP')
	}
	return normalized
}
