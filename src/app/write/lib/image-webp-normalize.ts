// 本次改动：最大 1000×750 → 仅限制最大宽度 1000，高度不限制，等比缩小。
export const IMAGE_WEBP_NORMALIZE_OPTIONS = {
	maxWidth: 1000,
	quality: 0.88,
	mimeType: 'image/webp'
} as const

const NORMALIZABLE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type ContainedImageSize = {
	width: number
	height: number
}

// 本次改动：宽高同时限制 → 仅限制最大宽度，高度按原比例自然计算且不设上限。
export function calculateContainedImageSize(width: number, height: number, maxWidth = 1000): ContainedImageSize {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		throw new Error('图片尺寸无效')
	}
	if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
		throw new Error('图片最大宽度无效')
	}

	const scale = Math.min(1, maxWidth / width)
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
	if (blob.type.split(';', 1)[0].trim().toLowerCase() !== IMAGE_WEBP_NORMALIZE_OPTIONS.mimeType) return false
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

function canvasToWebPBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			blob => {
				if (!blob) {
					reject(new Error('当前浏览器无法生成 WebP 图片'))
					return
				}
				resolve(blob)
			},
			IMAGE_WEBP_NORMALIZE_OPTIONS.mimeType,
			IMAGE_WEBP_NORMALIZE_OPTIONS.quality
		)
	})
}

/**
 * 将粘贴进入编辑器的静态图片统一归一化为：最大宽度 1000、高度不限制、等比缩小、不放大、WebP Q88。
 * GIF 为避免动画丢失保持原文件，不进入 Canvas 重编码。
 */
export async function normalizeImageToWebP(file: File): Promise<File> {
	if (!shouldNormalizeImageToWebP(file)) return file
	if (typeof document === 'undefined') throw new Error('当前环境不支持浏览器图片转换')

	const decoded = await decodeImage(file)
	try {
		const target = calculateContainedImageSize(
			decoded.width,
			decoded.height,
			IMAGE_WEBP_NORMALIZE_OPTIONS.maxWidth
		)
		const canvas = document.createElement('canvas')
		canvas.width = target.width
		canvas.height = target.height
		const context = canvas.getContext('2d')
		if (!context) throw new Error('当前浏览器无法创建图片处理画布')
		context.drawImage(decoded.source, 0, 0, target.width, target.height)

		const webpBlob = await canvasToWebPBlob(canvas)
		if (!(await isWebPEncodedBlob(webpBlob))) {
			throw new Error('当前浏览器未真正生成 WebP 图片')
		}

		return new File([webpBlob], buildWebPFilename(file.name), {
			type: IMAGE_WEBP_NORMALIZE_OPTIONS.mimeType,
			lastModified: file.lastModified || Date.now()
		})
	} finally {
		decoded.cleanup()
	}
}
