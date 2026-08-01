import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImageFileAddResult, ImageItem } from '../types'
import { CLIPBOARD_IMAGE_LIMITS, importRichTextImages, importStandaloneClipboardImages } from './clipboard-image-import'
import type { RichTextImageDescriptor } from './rich-text-import'

function fileItem(file: File, id: string): Extract<ImageItem, { type: 'file' }> {
	return { id, type: 'file', file, previewUrl: `blob:${id}`, filename: file.name, hash: `hash-${id}` }
}

test('keeps each input position while duplicate files reuse one image item', async () => {
	const first = new File(['same image'], 'first.png', { type: 'image/png' })
	const second = new File(['same image'], 'second.png', { type: 'image/png' })
	const sharedItem = fileItem(first, 'shared-id')

	const result = await importStandaloneClipboardImages([first, second], async (): Promise<ImageFileAddResult[]> => [
		{ originalIndex: 0, item: sharedItem, status: 'added' },
		{ originalIndex: 1, item: sharedItem, status: 'existing' }
	])

	assert.equal(result.results.length, 2)
	assert.equal(result.results[0].markdown, '![](local-image:shared-id)')
	assert.equal(result.results[1].markdown, '![](local-image:shared-id)')
	assert.equal(result.localizedCount, 2)
	assert.equal(result.uniqueImageCount, 1)
})

test('isolates an invalid image without cancelling other clipboard images', async () => {
	const valid = new File(['image'], 'valid.png', { type: 'image/png' })
	const invalid = new File(['not supported'], 'invalid.svg', { type: 'image/svg+xml' })
	const validItem = fileItem(valid, 'valid-id')

	const result = await importStandaloneClipboardImages([valid, invalid], async (): Promise<ImageFileAddResult[]> => [
		{ originalIndex: 0, item: validItem, status: 'added' }
	])

	assert.equal(result.results[0].markdown, '![](local-image:valid-id)')
	assert.match(result.results[1].markdown, /图片导入失败/)
	assert.equal(result.localizedCount, 1)
	assert.equal(result.failedCount, 1)
})

test('keeps safe relative images external but never persists sensitive query parameters', async () => {
	const descriptors: RichTextImageDescriptor[] = [
		{
			index: 0,
			placeholder: 'RICHTEXTIMAGEPLACEHOLDER0000TOKEN',
			src: '/public/image.png',
			alt: '[Product]',
			kind: 'relative',
			filenameHint: 'image.png'
		},
		{
			index: 1,
			placeholder: 'RICHTEXTIMAGEPLACEHOLDER0001TOKEN',
			src: '/private/image.png?token=do-not-persist',
			alt: '',
			kind: 'relative',
			filenameHint: 'image.png'
		}
	]

	const result = await importRichTextImages(descriptors, [], async () => [])
	assert.equal(result.results[0].status, 'external')
	assert.equal(result.results[0].markdown, '![\\[Product\\]](</public/image.png>)')
	assert.equal(result.results[1].status, 'failed')
	assert.doesNotMatch(result.results[1].markdown, /do-not-persist/)
})

test('assigns a safe filename to an anonymous clipboard image before it enters the store', async () => {
	const anonymous = new File(['image'], '', { type: 'image/png' })
	let receivedName = ''
	await importStandaloneClipboardImages([anonymous], async files => {
		receivedName = files[0].name
		return [{ originalIndex: 0, item: fileItem(files[0], 'anonymous-id'), status: 'added' }]
	})

	assert.equal(receivedName, 'pasted-image-1.png')
})

test('does not expose common signed-image query parameters in an external fallback', async () => {
	const originalFetch = globalThis.fetch
	globalThis.fetch = async () => {
		throw new TypeError('CORS blocked')
	}
	try {
		const result = await importRichTextImages(
			[
				{
					index: 0,
					placeholder: 'RICHTEXTIMAGEPLACEHOLDER0000TOKEN',
					src: 'https://cdn.example.com/private.png?sig=do-not-persist',
					alt: '',
					kind: 'remote',
					filenameHint: 'private.png'
				}
			],
			[],
			async () => []
		)
		assert.equal(result.results[0].status, 'failed')
		assert.doesNotMatch(result.results[0].markdown, /sig=|do-not-persist/)
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('stops reading a remote image once the actual streamed body exceeds the per-image limit', async () => {
	const originalFetch = globalThis.fetch
	const firstChunk = new Uint8Array(6 * 1024 * 1024)
	const secondChunk = new Uint8Array(5 * 1024 * 1024)
	globalThis.fetch = async () =>
		new Response(
			new ReadableStream({
				start(controller) {
					controller.enqueue(firstChunk)
					controller.enqueue(secondChunk)
					controller.close()
				}
			}),
			{ headers: { 'content-type': 'image/png' } }
		)
	try {
		const result = await importRichTextImages(
			[
				{
					index: 0,
					placeholder: 'RICHTEXTIMAGEPLACEHOLDER0000TOKEN',
					src: 'https://cdn.example.com/oversized.png',
					alt: '',
					kind: 'remote',
					filenameHint: 'oversized.png'
				}
			],
			[],
			async () => []
		)
		assert.ok(firstChunk.byteLength < CLIPBOARD_IMAGE_LIMITS.maxImageBytes)
		assert.equal(result.results[0].status, 'failed')
		assert.match(result.results[0].error || '', /10 MB/)
		assert.equal(result.externalCount, 0)
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('does not request or preserve obvious private-network image URLs', async () => {
	const originalFetch = globalThis.fetch
	let fetchCalls = 0
	globalThis.fetch = async () => {
		fetchCalls += 1
		return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })
	}
	try {
		const result = await importRichTextImages(
			[
				{
					index: 0,
					placeholder: 'RICHTEXTIMAGEPLACEHOLDER0000TOKEN',
					src: 'http://127.0.0.1/private.png',
					alt: '',
					kind: 'remote',
					filenameHint: 'private.png'
				}
			],
			[],
			async () => []
		)
		assert.equal(fetchCalls, 0)
		assert.equal(result.results[0].status, 'failed')
		assert.doesNotMatch(result.results[0].markdown, /127\.0\.0\.1/)
	} finally {
		globalThis.fetch = originalFetch
	}
})
