export type ImageWebPNormalizeOptions = {
	maxWidth: number
	maxHeight?: number
	quality: number
	mimeType: 'image/webp'
	watermark?: 'article' | 'share'
}

export type ArticleWatermarkOptions = {
	cornerText: string
	centerText: string
	fontFamily: string
	cornerFontSize: number
	cornerFontWeight: number
	cornerTextAlpha: number
	cornerBackgroundAlpha: number
	cornerMargin: number
	cornerPaddingX: number
	cornerPaddingY: number
	cornerRadius: number
	centerFontSize: number
	centerFontWeight: number
	centerAlpha: number
	centerRotationDeg: number
	centerYRatio: number
}

// 正文公开图继续保持“右下角品牌水印 + 中央极淡水印”；分享图只使用同一套右下角水印参数。
export const ARTICLE_WATERMARK_OPTIONS: ArticleWatermarkOptions = {
	cornerText: '原型半径 · Zourichao',
	centerText: '原型半径',
	fontFamily: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
	cornerFontSize: 18,
	cornerFontWeight: 500,
	cornerTextAlpha: 0.88,
	cornerBackgroundAlpha: 0.28,
	cornerMargin: 20,
	cornerPaddingX: 10,
	cornerPaddingY: 5,
	cornerRadius: 7,
	centerFontSize: 70,
	centerFontWeight: 600,
	centerAlpha: 0.055,
	centerRotationDeg: -15,
	centerYRatio: 0.58
}

// 正文图片参数冻结：最大宽度 1000 / Q88 / WebP / 双水印。
export const IMAGE_WEBP_NORMALIZE_OPTIONS: ImageWebPNormalizeOptions = {
	maxWidth: 1000,
	quality: 0.88,
	mimeType: 'image/webp',
	watermark: 'article'
}

// 本次改动：新增外部分享图；压缩转换参数与正文保持一致，只保留右下角单水印。
export const SHARE_IMAGE_WEBP_NORMALIZE_OPTIONS: ImageWebPNormalizeOptions = {
	maxWidth: 1000,
	quality: 0.88,
	mimeType: 'image/webp',
	watermark: 'share'
}

// 封面继续保持最大尺寸 400×300 / Q90 / 无水印。
export const COVER_IMAGE_WEBP_NORMALIZE_OPTIONS: ImageWebPNormalizeOptions = {
	maxWidth: 400,
	maxHeight: 300,
	quality: 0.9,
	mimeType: 'image/webp'
}

const NORMALIZABLE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

// normalizeImageToWebP 的返回值仍然是原来的 File；分享副本只在当前编辑会话内用 WeakMap 绑定，避免改动现有调用签名。
const generatedShareImages = new WeakMap<File, File>()
const generatedArticleImages = new WeakSet<File>()

export type ContainedImageSize = {
	width: number
	height: number
}

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

function fillRoundedRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
) {
	context.beginPath()
	if (typeof context.roundRect === 'function') {
		context.roundRect(x, y, width, height, radius)
		context.fill()
		return
	}

	// 兼容不支持 roundRect 的旧浏览器：退化成普通矩形，不影响水印可读性。
	context.fillRect(x, y, width, height)
}

export function drawArticleCornerWatermark(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	options: ArticleWatermarkOptions = ARTICLE_WATERMARK_OPTIONS
) {
	context.save()
	context.textAlign = 'left'
	context.textBaseline = 'middle'
	context.font = `${options.cornerFontWeight} ${options.cornerFontSize}px ${options.fontFamily}`
	const textWidth = context.measureText(options.cornerText).width
	const boxWidth = textWidth + options.cornerPaddingX * 2
	const boxHeight = options.cornerFontSize + options.cornerPaddingY * 2
	const boxX = width - options.cornerMargin - boxWidth
	const boxY = height - options.cornerMargin - boxHeight
	context.globalAlpha = options.cornerBackgroundAlpha
	context.fillStyle = '#000000'
	fillRoundedRect(context, boxX, boxY, boxWidth, boxHeight, options.cornerRadius)

	context.globalAlpha = options.cornerTextAlpha
	context.fillStyle = '#ffffff'
	context.fillText(options.cornerText, boxX + options.cornerPaddingX, boxY + boxHeight / 2)
	context.restore()
}

// 正文公开图继续按“中央极淡 → 右下角品牌”顺序绘制，现有视觉不改。
export function drawArticleWatermark(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	options: ArticleWatermarkOptions = ARTICLE_WATERMARK_OPTIONS
) {
	context.save()
	context.translate(width / 2, height * options.centerYRatio)
	context.rotate((options.centerRotationDeg * Math.PI) / 180)
	context.textAlign = 'center'
	context.textBaseline = 'middle'
	context.font = `${options.centerFontWeight} ${options.centerFontSize}px ${options.fontFamily}`
	context.globalAlpha = options.centerAlpha
	context.fillStyle = '#000000'
	context.fillText(options.centerText, 0, 0)
	context.restore()

	drawArticleCornerWatermark(context, width, height, options)
}

function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	const context = canvas.getContext('2d')
	if (!context) throw new Error('当前浏览器无法创建图片处理画布')
	return { canvas, context }
}

async function createWebPFile(canvas: HTMLCanvasElement, sourceFile: File, options: ImageWebPNormalizeOptions): Promise<File> {
	const webpBlob = await canvasToWebPBlob(canvas, options)
	if (!(await isWebPEncodedBlob(webpBlob))) {
		throw new Error('当前浏览器未真正生成 WebP 图片')
	}
	return new File([webpBlob], buildWebPFilename(sourceFile.name), {
		type: options.mimeType,
		lastModified: sourceFile.lastModified || Date.now()
	})
}

/**
 * 取得 normalizeImageToWebP 在同一次正文处理里生成的分享副本。
 * 只在当前编辑会话有效；真正发布后由 ImageItem.shareFile 持有，不依赖此缓存。
 */
export function getGeneratedShareImage(file: File): File | undefined {
	return generatedShareImages.get(file)
}

/**
 * 标记文件是否由正文双水印处理生成，用于避免分享图生成失败后再从双水印图二次加工。
 */
export function isGeneratedArticleImage(file: File): boolean {
	return generatedArticleImages.has(file)
}

/**
 * 单独生成外部分享图：最大宽度 1000、WebP Q88、仅右下角“原型半径 · Zourichao”。
 * 不处理 GIF 等现有正文归一化链路明确跳过的格式，避免改变原有格式策略。
 */
export async function normalizeShareImageToWebP(file: File): Promise<File | null> {
	if (!shouldNormalizeImageToWebP(file)) return null
	return normalizeImageToWebP(file, SHARE_IMAGE_WEBP_NORMALIZE_OPTIONS)
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
		const { canvas, context } = createCanvas(target.width, target.height)
		context.drawImage(decoded.source, 0, 0, target.width, target.height)

		let shareFile: File | undefined
		if (options.watermark === 'article') {
			// 本次改动：分享图从“已缩放但尚未烧入正文水印”的同一处理源分叉，避免中央水印残留和二次压缩。
			try {
				const { canvas: shareCanvas, context: shareContext } = createCanvas(target.width, target.height)
				shareContext.drawImage(canvas, 0, 0, target.width, target.height)
				drawArticleCornerWatermark(shareContext, target.width, target.height)
				shareFile = await createWebPFile(shareCanvas, file, SHARE_IMAGE_WEBP_NORMALIZE_OPTIONS)
			} catch {
				// 分享图是附属能力：失败不能阻断现有正文图片生成与发布主链路。
				shareFile = undefined
			}
			drawArticleWatermark(context, target.width, target.height)
		} else if (options.watermark === 'share') {
			drawArticleCornerWatermark(context, target.width, target.height)
		}

		const normalizedFile = await createWebPFile(canvas, file, options)
		if (options.watermark === 'article') {
			generatedArticleImages.add(normalizedFile)
			if (shareFile) generatedShareImages.set(normalizedFile, shareFile)
		}
		return normalizedFile
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
