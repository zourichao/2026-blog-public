import assert from 'node:assert/strict'
import { File as NodeFile } from 'node:buffer'
import test from 'node:test'
import {
	COVER_IMAGE_WEBP_NORMALIZE_OPTIONS,
	IMAGE_WEBP_NORMALIZE_OPTIONS,
	buildWebPFilename,
	calculateContainedImageSize,
	isWebPEncodedBlob,
	normalizeCoverImageToWebP,
	shouldNormalizeImageToWebP
} from './image-webp-normalize'

const webpHeader = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

test('正文图片参数继续保持最大宽度 1000、Q88，高度不设上限', () => {
	assert.deepEqual(IMAGE_WEBP_NORMALIZE_OPTIONS, {
		maxWidth: 1000,
		quality: 0.88,
		mimeType: 'image/webp'
	})
})

test('封面图片参数固定为最大尺寸 400×300、Q90', () => {
	assert.deepEqual(COVER_IMAGE_WEBP_NORMALIZE_OPTIONS, {
		maxWidth: 400,
		maxHeight: 300,
		quality: 0.9,
		mimeType: 'image/webp'
	})
})

test('在限制边界内等比缩小；正文仅限宽度，封面限制最大尺寸 400×300；小图不放大', () => {
	assert.deepEqual(calculateContainedImageSize(2000, 1500, 1000), { width: 1000, height: 750 })
	assert.deepEqual(calculateContainedImageSize(1600, 900, 1000), { width: 1000, height: 563 })
	assert.deepEqual(calculateContainedImageSize(2000, 3000, 1000), { width: 1000, height: 1500 })
	assert.deepEqual(calculateContainedImageSize(1200, 800, 400, 300), { width: 400, height: 267 })
	assert.deepEqual(calculateContainedImageSize(800, 1600, 400, 300), { width: 150, height: 300 })
	assert.deepEqual(calculateContainedImageSize(300, 900, 400, 300), { width: 100, height: 300 })
	assert.deepEqual(calculateContainedImageSize(300, 200, 400, 300), { width: 300, height: 200 })
})

test('输出文件名统一改为 .webp', () => {
	assert.equal(buildWebPFilename('photo.PNG'), 'photo.webp')
	assert.equal(buildWebPFilename('screen.capture.jpg'), 'screen.capture.webp')
	assert.equal(buildWebPFilename(''), 'pasted-image.webp')
})

test('PNG/JPEG/WebP 进入归一化，GIF 为避免动画丢失保持原样', () => {
	assert.equal(shouldNormalizeImageToWebP({ type: 'image/png' }), true)
	assert.equal(shouldNormalizeImageToWebP({ type: 'image/jpeg' }), true)
	assert.equal(shouldNormalizeImageToWebP({ type: 'image/webp' }), true)
	assert.equal(shouldNormalizeImageToWebP({ type: 'image/gif' }), false)
})

test('WebP 校验同时检查 MIME 与 RIFF/WEBP 文件头', async () => {
	assert.equal(await isWebPEncodedBlob(new Blob([webpHeader], { type: 'image/webp' })), true)
	assert.equal(await isWebPEncodedBlob(new Blob([webpHeader], { type: 'image/png' })), false)
	assert.equal(await isWebPEncodedBlob(new Blob([new Uint8Array(12)], { type: 'image/webp' })), false)
})

test('封面实际转换使用 400×300 边界与 Q90，并输出真正 .webp File', async () => {
	const previousFile = globalThis.File
	const previousDocument = globalThis.document
	const previousCreateImageBitmap = globalThis.createImageBitmap
	const encodeCalls: Array<{ width: number; height: number; type: string; quality: number }> = []

	Object.defineProperty(globalThis, 'File', { configurable: true, writable: true, value: NodeFile })
	Object.defineProperty(globalThis, 'createImageBitmap', {
		configurable: true,
		writable: true,
		value: async () => ({ width: 1200, height: 800, close() {} })
	})
	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		writable: true,
		value: {
			createElement(tag: string) {
				assert.equal(tag, 'canvas')
				const canvas = {
					width: 0,
					height: 0,
					getContext() {
						return { drawImage() {} }
					},
					toBlob(callback: (blob: Blob | null) => void, type: string, quality: number) {
						encodeCalls.push({ width: canvas.width, height: canvas.height, type, quality })
						callback(new Blob([webpHeader], { type: 'image/webp' }))
					}
				}
				return canvas
			}
		}
	})

	try {
		const input = new NodeFile([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' }) as unknown as File
		const output = await normalizeCoverImageToWebP(input)
		assert.equal(output.name, 'cover.webp')
		assert.equal(output.type, 'image/webp')
		assert.equal(await isWebPEncodedBlob(output), true)
		assert.deepEqual(encodeCalls, [{ width: 400, height: 267, type: 'image/webp', quality: 0.9 }])
	} finally {
		Object.defineProperty(globalThis, 'File', { configurable: true, writable: true, value: previousFile })
		Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: previousDocument })
		Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true, value: previousCreateImageBitmap })
	}
})


test('封面强制转换模式不会让 GIF 原格式直接进入图片列表', async () => {
	const previousFile = globalThis.File
	const previousDocument = globalThis.document
	const previousCreateImageBitmap = globalThis.createImageBitmap

	Object.defineProperty(globalThis, 'File', { configurable: true, writable: true, value: NodeFile })
	Object.defineProperty(globalThis, 'createImageBitmap', {
		configurable: true,
		writable: true,
		value: async () => ({ width: 300, height: 900, close() {} })
	})
	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		writable: true,
		value: {
			createElement() {
				return {
					width: 0,
					height: 0,
					getContext() {
						return { drawImage() {} }
					},
					toBlob(callback: (blob: Blob | null) => void) {
						callback(new Blob([webpHeader], { type: 'image/webp' }))
					}
				}
			}
		}
	})

	try {
		const input = new NodeFile([new Uint8Array([1])], 'animated.gif', { type: 'image/gif' }) as unknown as File
		const output = await normalizeCoverImageToWebP(input)
		assert.equal(output.name, 'animated.webp')
		assert.equal(output.type, 'image/webp')
	} finally {
		Object.defineProperty(globalThis, 'File', { configurable: true, writable: true, value: previousFile })
		Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: previousDocument })
		Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true, value: previousCreateImageBitmap })
	}
})
