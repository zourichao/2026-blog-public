import assert from 'node:assert/strict'
import { File as NodeFile } from 'node:buffer'
import test from 'node:test'
import { importStandaloneClipboardImages } from './clipboard-image-import'

const webpHeader = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

test('多图粘贴转换为 WebP 时保持顺序，单图失败不拖垮整次导入', async () => {
	const previousFile = globalThis.File
	const previousDocument = globalThis.document
	const previousCreateImageBitmap = globalThis.createImageBitmap
	const encodeCalls: Array<{ width: number; height: number; type: string; quality: number }> = []
	const watermarkTexts: string[] = []

	Object.defineProperty(globalThis, 'File', { configurable: true, writable: true, value: NodeFile })
	Object.defineProperty(globalThis, 'createImageBitmap', {
		configurable: true,
		writable: true,
		value: async (file: File) => {
			if (file.name.includes('broken')) throw new Error('模拟解码失败')
			const small = file.name.includes('small')
			const tall = file.name.includes('tall')
			return {
				width: small ? 800 : 2000,
				height: small ? 600 : tall ? 3000 : 1500,
				close() {}
			}
		}
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
						return {
							globalAlpha: 1,
							fillStyle: '',
							font: '',
							textAlign: 'start',
							textBaseline: 'alphabetic',
							drawImage() {},
							save() {},
							restore() {},
							translate() {},
							rotate() {},
							beginPath() {},
							roundRect() {},
							fill() {},
							fillRect() {},
							measureText() { return { width: 180 } },
							fillText(text: string) { watermarkTexts.push(text) }
						}
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
		const files = [
			new NodeFile([new Uint8Array([1])], 'first.png', { type: 'image/png' }),
			new NodeFile([new Uint8Array([2])], 'broken.jpg', { type: 'image/jpeg' }),
			new NodeFile([new Uint8Array([3])], 'tall.png', { type: 'image/png' }),
			new NodeFile([new Uint8Array([4])], 'small.webp', { type: 'image/webp' })
		] as unknown as File[]
		const receivedFiles: File[] = []
		const addFilesWithMapping = async (incoming: File[]) => {
			receivedFiles.push(...incoming)
			return incoming.map((file, originalIndex) => ({
				originalIndex,
				status: 'added' as const,
				item: {
					id: `image-${originalIndex + 1}`,
					type: 'file' as const,
					file,
					previewUrl: `blob:image-${originalIndex + 1}`,
					filename: file.name,
					hash: `hash-${originalIndex + 1}`
				}
			}))
		}

		const imported = await importStandaloneClipboardImages(files, addFilesWithMapping)

		assert.deepEqual(receivedFiles.map(file => file.name), ['first.webp', 'tall.webp', 'small.webp'])
		assert.deepEqual(receivedFiles.map(file => file.type), ['image/webp', 'image/webp', 'image/webp'])
		assert.deepEqual(imported.results.map(result => result.status), ['added', 'failed', 'added', 'added'])
		assert.equal(imported.results[0].markdown, '![](local-image:image-1)')
		assert.equal(imported.results[1].markdown.includes('local-image:'), false)
		assert.equal(imported.results[2].markdown, '![](local-image:image-2)')
		assert.equal(imported.results[3].markdown, '![](local-image:image-3)')
		assert.match(imported.results[1].error || '', /WebP|图片转换/)
		assert.deepEqual(encodeCalls, [
			{ width: 1000, height: 750, type: 'image/webp', quality: 0.88 },
			{ width: 1000, height: 1500, type: 'image/webp', quality: 0.88 },
			{ width: 800, height: 600, type: 'image/webp', quality: 0.88 }
		])
		assert.deepEqual(watermarkTexts, [
			'原型半径', '原型半径 · Zourichao',
			'原型半径', '原型半径 · Zourichao',
			'原型半径', '原型半径 · Zourichao'
		])
	} finally {
		Object.defineProperty(globalThis, 'File', { configurable: true, writable: true, value: previousFile })
		Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: previousDocument })
		Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true, value: previousCreateImageBitmap })
	}
})
