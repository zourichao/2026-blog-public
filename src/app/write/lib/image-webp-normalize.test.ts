import assert from 'node:assert/strict'
import test from 'node:test'
import {
	IMAGE_WEBP_NORMALIZE_OPTIONS,
	buildWebPFilename,
	calculateContainedImageSize,
	isWebPEncodedBlob,
	shouldNormalizeImageToWebP
} from './image-webp-normalize'

test('WebP 归一化参数固定为最大宽度 1000、Q88，高度不设上限', () => {
	assert.deepEqual(IMAGE_WEBP_NORMALIZE_OPTIONS, {
		maxWidth: 1000,
		quality: 0.88,
		mimeType: 'image/webp'
	})
})

test('仅按最大宽度 1000 等比缩小，高度不限制且小图不放大', () => {
	assert.deepEqual(calculateContainedImageSize(2000, 1500), { width: 1000, height: 750 })
	assert.deepEqual(calculateContainedImageSize(1600, 900), { width: 1000, height: 563 })
	assert.deepEqual(calculateContainedImageSize(2000, 3000), { width: 1000, height: 1500 })
	assert.deepEqual(calculateContainedImageSize(700, 1000), { width: 700, height: 1000 })
	assert.deepEqual(calculateContainedImageSize(800, 600), { width: 800, height: 600 })
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
	const validHeader = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
	assert.equal(await isWebPEncodedBlob(new Blob([validHeader], { type: 'image/webp' })), true)
	assert.equal(await isWebPEncodedBlob(new Blob([validHeader], { type: 'image/png' })), false)
	assert.equal(await isWebPEncodedBlob(new Blob([new Uint8Array(12)], { type: 'image/webp' })), false)
})
