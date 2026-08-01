import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImageFileAddResult, ImageItem } from '../types'
import { importRichTextImages } from './clipboard-image-import'
import type { RichTextImageDescriptor } from './rich-text-import'
import { extractWordRtfRasterImages, selectWordRtfFilesForHtmlImages } from './word-rtf-image-import'

const PNG_HEX = '89504e470d0a1a0a00000000'
const JPEG_HEX = 'ffd8ffe000104a46494600'

function fileItem(file: File, id: string): Extract<ImageItem, { type: 'file' }> {
	return { id, type: 'file', file, previewUrl: `blob:${id}`, filename: file.name, hash: `hash-${id}` }
}

test('extracts PNG and JPEG pict groups in source order', async () => {
	const rtf = String.raw`{\rtf1
{\pict\pngblip\picw1{\*\blipuid deadbeef}
${PNG_HEX}}
between
{\pict\jpegblip\picw1
${JPEG_HEX}}
}`
	const result = extractWordRtfRasterImages(rtf)

	assert.equal(result.pictCount, 2)
	assert.equal(result.rasterCount, 2)
	assert.equal(result.failedCount, 0)
	assert.deepEqual(result.formats, { png: 1, jpeg: 1 })
	assert.deepEqual(
		result.files.map(file => ({ name: file.name, type: file.type })),
		[
			{ name: 'word-pasted-image-1.png', type: 'image/png' },
			{ name: 'word-pasted-image-2.jpg', type: 'image/jpeg' }
		]
	)
	assert.equal(Buffer.from(await result.files[0].arrayBuffer()).toString('hex'), PNG_HEX)
	assert.equal(Buffer.from(await result.files[1].arrayBuffer()).toString('hex'), JPEG_HEX)
})

test('keeps duplicate RTF image occurrences for the existing Store to deduplicate', () => {
	const rtf = String.raw`{\rtf1{\pict\pngblip ${PNG_HEX}}{\pict\pngblip ${PNG_HEX}}}`
	const result = extractWordRtfRasterImages(rtf)
	assert.equal(result.files.length, 2)
	assert.equal(result.failedCount, 0)
})

test('selects RTF files only for an exact all-local HTML image mapping', () => {
	const result = extractWordRtfRasterImages(String.raw`{\rtf1{\pict\pngblip ${PNG_HEX}}{\pict\jpegblip ${JPEG_HEX}}}`)
	assert.equal(selectWordRtfFilesForHtmlImages(result, [{ kind: 'local' }, { kind: 'local' }]).length, 2)
	assert.deepEqual(selectWordRtfFilesForHtmlImages(result, [{ kind: 'local' }]), [])
	assert.deepEqual(selectWordRtfFilesForHtmlImages(result, [{ kind: 'local' }, { kind: 'remote' }]), [])
})

test('feeds exact RTF files through the existing image mapping and preserves local-image positions', async () => {
	const descriptors: RichTextImageDescriptor[] = [
		{
			index: 0,
			placeholder: 'RICHTEXTIMAGEPLACEHOLDER0000TOKEN',
			src: 'file:///redacted/clip_image001.png',
			alt: '第一张图',
			kind: 'local',
			filenameHint: 'clip_image001.png'
		},
		{
			index: 1,
			placeholder: 'RICHTEXTIMAGEPLACEHOLDER0001TOKEN',
			src: 'cid:clip_image002.jpg',
			alt: '',
			kind: 'local',
			filenameHint: 'clip_image002.jpg'
		}
	]
	const parsed = extractWordRtfRasterImages(String.raw`{\rtf1{\pict\pngblip ${PNG_HEX}}{\pict\jpegblip ${JPEG_HEX}}}`)
	const files = selectWordRtfFilesForHtmlImages(parsed, descriptors)
	const imported = await importRichTextImages(
		descriptors,
		files,
		async (addedFiles: File[]): Promise<ImageFileAddResult[]> =>
			addedFiles.map((file, originalIndex) => ({
				originalIndex,
				item: fileItem(file, `rtf-${originalIndex + 1}`),
				status: 'added'
			}))
	)

	assert.equal(imported.localizedCount, 2)
	assert.equal(imported.failedCount, 0)
	assert.equal(imported.replacements.get(descriptors[0].placeholder), '![第一张图](local-image:rtf-1)')
	assert.equal(imported.replacements.get(descriptors[1].placeholder), '![](local-image:rtf-2)')
})

test('does not select RTF files when any pict group failed or is unsupported', () => {
	const failed = extractWordRtfRasterImages(String.raw`{\rtf1{\pict\pngblip ${PNG_HEX}}{\pict\jpegblip 00}}`)
	assert.deepEqual(selectWordRtfFilesForHtmlImages(failed, [{ kind: 'local' }, { kind: 'local' }]), [])

	const unsupported = extractWordRtfRasterImages(String.raw`{\rtf1{\pict\pngblip ${PNG_HEX}}{\pict\wmetafile8 01020304}}`)
	assert.deepEqual(selectWordRtfFilesForHtmlImages(unsupported, [{ kind: 'local' }]), [])
})

test('prefers shppict raster images and ignores matching nonshppict compatibility pictures', () => {
	const rtf = String.raw`{\rtf1
{\*\shppict{\pict\pngblip ${PNG_HEX}}}
{\nonshppict{\pict\wmetafile8 01020304}}
{\*\shppict{\pict\jpegblip ${JPEG_HEX}}}
{\nonshppict{\pict\wmetafile8 01020304}}
}`
	const result = extractWordRtfRasterImages(rtf)
	const selected = selectWordRtfFilesForHtmlImages(result, [{ kind: 'local' }, { kind: 'local' }])
	assert.equal(result.pictCount, 4)
	assert.equal(result.unsupportedCount, 2)
	assert.equal(selected.length, 2)
	assert.deepEqual(
		selected.map(file => file.type),
		['image/png', 'image/jpeg']
	)
})

test('uses a complete nonshppict raster representation only when the primary representation is unsupported', () => {
	const rtf = String.raw`{\rtf1
{\*\shppict{\pict\wmetafile8 01020304}}
{\nonshppict{\pict\pngblip ${PNG_HEX}}}
}`
	const result = extractWordRtfRasterImages(rtf)
	const selected = selectWordRtfFilesForHtmlImages(result, [{ kind: 'local' }])
	assert.equal(selected.length, 1)
	assert.equal(selected[0].type, 'image/png')
})

test('never selects listpicture bullets as article images', () => {
	const rtf = String.raw`{\rtf1{\*\listpicture{\pict\pngblip ${PNG_HEX}}}{\*\shppict{\pict\pngblip ${PNG_HEX}}}}`
	const result = extractWordRtfRasterImages(rtf)
	const selected = selectWordRtfFilesForHtmlImages(result, [{ kind: 'local' }])
	assert.equal(selected.length, 1)
})

test('ignores unsupported metafile pict groups without guessing a raster conversion', () => {
	const result = extractWordRtfRasterImages(String.raw`{\rtf1{\pict\wmetafile8 01020304}}`)
	assert.equal(result.pictCount, 1)
	assert.equal(result.rasterCount, 0)
	assert.equal(result.unsupportedCount, 1)
	assert.equal(result.files.length, 0)
})

test('rejects invalid magic, odd hex and bin image data independently', () => {
	const invalidMagic = extractWordRtfRasterImages(String.raw`{\rtf1{\pict\pngblip 0001020304050607}}`)
	assert.equal(invalidMagic.failedCount, 1)
	assert.match(invalidMagic.errors[0], /格式与内容不一致/)

	const oddHex = extractWordRtfRasterImages(String.raw`{\rtf1{\pict\pngblip 895}}`)
	assert.equal(oddHex.failedCount, 1)
	assert.match(oddHex.errors[0], /数据不完整/)

	const binary = extractWordRtfRasterImages(String.raw`{\rtf1{\pict\pngblip\bin4 abcd}}`)
	assert.equal(binary.failedCount, 1)
	assert.match(binary.errors[0], /bin 图片暂不支持/)
})

test('isolates a broken pict group and does not claim it was imported', () => {
	const result = extractWordRtfRasterImages(String.raw`{\rtf1{\pict\pngblip ${PNG_HEX}`)
	assert.equal(result.pictCount, 1)
	assert.equal(result.files.length, 0)
	assert.equal(result.failedCount, 1)
	assert.match(result.errors[0], /分组不完整/)
})

test('enforces the 30-image limit while continuing to count the remaining groups', () => {
	const pictures = Array.from({ length: 31 }, () => String.raw`{\pict\pngblip ${PNG_HEX}}`).join('')
	const result = extractWordRtfRasterImages(String.raw`{\rtf1${pictures}}`)
	assert.equal(result.pictCount, 31)
	assert.equal(result.files.length, 30)
	assert.equal(result.failedCount, 1)
	assert.match(result.errors[0], /最多导入 30 张/)
})
