import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImageFileAddResult, ImageItem } from '../types'
import { importRichTextImages } from './clipboard-image-import'
import type { RichTextImageDescriptor } from './rich-text-import'
import {
	captureWordClipboard,
	classifyWordImageSource,
	dedupeWordClipboardImageFiles,
	getWordImportFeedback,
	hasDirectWordImageBinary,
	isWordClipboardHtml
} from './word-clipboard-import'

function fakeClipboardData(options: {
	html: string
	plain?: string
	rtf?: string
	items?: Array<{ kind: string; type: string; file: File | null }>
	files?: File[]
}): DataTransfer {
	const values: Record<string, string> = {
		'text/html': options.html,
		'text/plain': options.plain || '',
		'text/rtf': options.rtf || ''
	}
	const types = Object.entries(values)
		.filter(([, value]) => Boolean(value))
		.map(([type]) => type)
	const items = (options.items || []).map(item => ({
		kind: item.kind,
		type: item.type,
		getAsFile: () => item.file
	}))
	return {
		types,
		items,
		files: options.files || [],
		getData: (type: string) => values[type] || ''
	} as unknown as DataTransfer
}

function fileItem(file: File, id: string): Extract<ImageItem, { type: 'file' }> {
	return { id, type: 'file', file, previewUrl: `blob:${id}`, filename: file.name, hash: `hash-${id}` }
}

test('recognizes Word HTML without classifying an ordinary web fragment as Word', () => {
	assert.equal(isWordClipboardHtml('<p class="MsoNormal" style="mso-margin-top-alt:auto">Word</p>'), true)
	assert.equal(isWordClipboardHtml('<v:imagedata src="file:///clip_image001.png" />'), true)
	assert.equal(isWordClipboardHtml('<article><p>Ordinary webpage</p><img src="https://example.com/a.png"></article>'), false)
})

test('captures both clipboard item and file image candidates and reports only redacted metadata', () => {
	const itemImage = new File(['first'], 'C:\\Users\\Alice\\AppData\\clip_image001.png', { type: 'image/png' })
	const fileImage = new File(['second'], 'D:\\private\\clip_image002.jpg', { type: 'image/jpeg' })
	const html = [
		'<meta name="Generator" content="Microsoft Word">',
		'<img src="file:///C:/Users/Alice/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png">',
		'<v:imagedata src="cid:clip_image002.jpg"></v:imagedata>',
		'<v:shape style="width:1px"></v:shape>'
	].join('')
	const snapshot = captureWordClipboard(
		fakeClipboardData({
			html,
			plain: 'Word',
			rtf: '{\\rtf1{\\pict\\pngblip 89504e47}}',
			items: [
				{ kind: 'string', type: 'text/html', file: null },
				{ kind: 'file', type: 'image/png', file: itemImage }
			],
			files: [fileImage]
		}),
		html
	)

	assert.equal(snapshot.imageFiles.length, 2)
	assert.deepEqual(snapshot.diagnostic.items, [
		{ kind: 'string', type: 'text/html', getAsFile: false },
		{ kind: 'file', type: 'image/png', getAsFile: true }
	])
	assert.deepEqual(snapshot.diagnostic.files, {
		count: 1,
		entries: [{ type: 'image/jpeg', size: 6, extension: '.jpg' }]
	})
	assert.deepEqual(snapshot.diagnostic.formats, { hasHtml: true, hasPlainText: true, hasRtf: true })
	assert.deepEqual(snapshot.diagnostic.rtf, {
		length: 31,
		pictCount: 1,
		pngCount: 1,
		jpegCount: 0,
		unsupportedPictCount: 0
	})
	assert.deepEqual(snapshot.diagnostic.htmlImages.nodes, [
		{ node: 'img', source: 'msohtmlclip' },
		{ node: 'v:imagedata', source: 'cid' },
		{ node: 'shape/VML', source: 'other' }
	])
	const serialized = JSON.stringify(snapshot.diagnostic)
	assert.doesNotMatch(serialized, /Alice|Users|AppData|private|clip_image/i)
})

test('uses an image item MIME when the browser-provided File has no MIME', () => {
	const anonymousType = new File(['image'], 'clip.png', { type: '' })
	const html = '<p class="MsoNormal">Word</p>'
	const snapshot = captureWordClipboard(fakeClipboardData({ html, items: [{ kind: 'file', type: 'image/png', file: anonymousType }] }), html)
	assert.equal(snapshot.imageFiles.length, 1)
	assert.equal(snapshot.imageFiles[0].type, 'image/png')
})

test('deduplicates mirrored item/files candidates by SHA-256 content', async () => {
	const first = new File(['same bytes'], 'item.png', { type: 'image/png' })
	const mirrored = new File(['same bytes'], 'files.png', { type: 'image/png' })
	const second = new File(['different bytes'], 'second.png', { type: 'image/png' })
	const unique = await dedupeWordClipboardImageFiles([
		{ file: first, source: 'items' },
		{ file: mirrored, source: 'files' },
		{ file: second, source: 'files' }
	])
	assert.deepEqual(unique, [mirrored, second])
})

test('deduplicates mirrored sources without removing repeated image occurrences', async () => {
	const itemFirst = new File(['same image'], 'item-first.png', { type: 'image/png' })
	const itemSecond = new File(['same image'], 'item-second.png', { type: 'image/png' })
	const fileFirst = new File(['same image'], 'file-first.png', { type: 'image/png' })
	const fileSecond = new File(['same image'], 'file-second.png', { type: 'image/png' })
	const merged = await dedupeWordClipboardImageFiles([
		{ file: itemFirst, source: 'items' },
		{ file: itemSecond, source: 'items' },
		{ file: fileFirst, source: 'files' },
		{ file: fileSecond, source: 'files' }
	])
	assert.deepEqual(merged, [fileFirst, fileSecond])
})

test('folds a VML shape wrapper around imagedata into one logical diagnostic node', () => {
	const html = '<v:shape><v:imagedata src="file:///C:/redacted/image001.png" /></v:shape>'
	const diagnostic = captureWordClipboard(fakeClipboardData({ html }), html).diagnostic
	assert.equal(diagnostic.htmlImages.rawNodeCount, 2)
	assert.equal(diagnostic.htmlImages.logicalNodeCount, 1)
	assert.deepEqual(diagnostic.htmlImages.nodes, [{ node: 'v:imagedata', source: 'file' }])
})

test('classifies image sources without returning their path or URL', () => {
	assert.equal(classifyWordImageSource('file:///C:/Users/Alice/image.png'), 'file')
	assert.equal(classifyWordImageSource('file:///C:/Temp/msohtmlclip1/image.png'), 'msohtmlclip')
	assert.equal(classifyWordImageSource('cid:image001.png'), 'cid')
	assert.equal(classifyWordImageSource('https://example.com/image.png?token=secret'), 'https')
})

test('two Word image files map to the two original local-image positions', async () => {
	const descriptors: RichTextImageDescriptor[] = [
		{
			index: 0,
			placeholder: 'RICHTEXTIMAGEPLACEHOLDER0000TOKEN',
			src: 'file:///C:/redacted/clip_image001.png',
			alt: '第一张图',
			kind: 'local',
			filenameHint: 'clip_image001.png'
		},
		{
			index: 1,
			placeholder: 'RICHTEXTIMAGEPLACEHOLDER0001TOKEN',
			src: 'cid:clip_image002.png',
			alt: '',
			kind: 'local',
			filenameHint: 'clip_image002.png'
		}
	]
	const files = [new File(['one'], 'clip_image001.png', { type: 'image/png' }), new File(['two'], 'clip_image002.png', { type: 'image/png' })]
	const result = await importRichTextImages(
		descriptors,
		files,
		async (addedFiles: File[]): Promise<ImageFileAddResult[]> =>
			addedFiles.map((file, originalIndex) => ({
				originalIndex,
				item: fileItem(file, `word-${originalIndex + 1}`),
				status: 'added'
			}))
	)

	assert.equal(result.localizedCount, 2)
	assert.equal(result.failedCount, 0)
	assert.equal(result.replacements.get(descriptors[0].placeholder), '![第一张图](local-image:word-1)')
	assert.equal(result.replacements.get(descriptors[1].placeholder), '![](local-image:word-2)')
})

test('reuses one stored image ID at two Word positions with identical image bytes', async () => {
	const descriptors: RichTextImageDescriptor[] = [0, 1].map(index => ({
		index,
		placeholder: `RICHTEXTIMAGEPLACEHOLDER000${index}TOKEN`,
		src: `file:///C:/redacted/clip_image00${index + 1}.png`,
		alt: '',
		kind: 'local',
		filenameHint: `clip_image00${index + 1}.png`
	}))
	const files = [new File(['same bytes'], 'first.png', { type: 'image/png' }), new File(['same bytes'], 'second.png', { type: 'image/png' })]
	const shared = fileItem(files[0], 'word-shared')
	const result = await importRichTextImages(
		descriptors,
		files,
		async (): Promise<ImageFileAddResult[]> => [
			{ originalIndex: 0, item: shared, status: 'added' },
			{ originalIndex: 1, item: shared, status: 'existing' }
		]
	)

	assert.equal(result.uniqueImageCount, 1)
	assert.equal(result.replacements.get(descriptors[0].placeholder), '![](local-image:word-shared)')
	assert.equal(result.replacements.get(descriptors[1].placeholder), '![](local-image:word-shared)')
})

test('does not claim an RTF or File binary candidate when Word exposes only local references', () => {
	const html = '<p class="MsoNormal">A</p><v:imagedata src="file:///C:/redacted/image001.png" />'
	const snapshot = captureWordClipboard(fakeClipboardData({ html, plain: 'A' }), html)
	assert.equal(hasDirectWordImageBinary(snapshot), false)
})

test('uses warning feedback for partial and total Word image failures', () => {
	assert.deepEqual(getWordImportFeedback({ localizedCount: 2, failedCount: 0, noUsableBinary: false, hasRtfRaster: false, fallbackMessage: 'all good' }), {
		level: 'success',
		message: 'all good'
	})
	assert.deepEqual(getWordImportFeedback({ localizedCount: 1, failedCount: 1, noUsableBinary: false, hasRtfRaster: false, fallbackMessage: 'partial' }), {
		level: 'warning',
		message: 'partial'
	})
	assert.deepEqual(getWordImportFeedback({ localizedCount: 0, failedCount: 2, noUsableBinary: true, hasRtfRaster: false, fallbackMessage: 'old message' }), {
		level: 'warning',
		message: 'Word 未向浏览器提供这 2 张图片，请单独粘贴图片，或使用后续的 Word 文件导入功能。'
	})
	assert.deepEqual(getWordImportFeedback({ localizedCount: 0, failedCount: 2, noUsableBinary: true, hasRtfRaster: true, fallbackMessage: 'old message' }), {
		level: 'warning',
		message: 'Word 仅向浏览器提供了 RTF 图片数据，这 2 张图片暂时无法安全读取，请单独粘贴图片。'
	})
})
