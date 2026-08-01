import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImageItem } from '../types'
import { extractLocalImageIds, findMissingLocalImageIds, replaceLocalImageReferences, validateLocalImageReferences } from './local-image-validation'

function createFileImage(id: string, contents = 'image'): Extract<ImageItem, { type: 'file' }> {
	const file = new File([contents], `${id}.png`, { type: 'image/png' })
	return { id, type: 'file', file, previewUrl: `blob:${id}`, filename: file.name }
}

test('extracts local image references in source order', () => {
	assert.deepEqual(extractLocalImageIds('![](local-image:first)\n\n![](local-image:second)'), ['first', 'second'])
})

test('ignores local-image examples in prose, inline code and fenced code', () => {
	const markdown = '说明 local-image:prose 和 `![](local-image:inline)`\n\n```md\n![](local-image:fenced)\n```\n\n![](local-image:real)'
	assert.deepEqual(extractLocalImageIds(markdown), ['real'])
})

test('replaces only Markdown image destinations and preserves code examples', () => {
	const markdown =
		'说明 local-image:keep\n`![](local-image:keep-inline)`\n```md\n![](local-image:keep-fenced)\n```\n![](local-image:replace)\n![x](<local-image:replace> "title")'
	const result = replaceLocalImageReferences(markdown, new Map([['replace', '/blogs/post/image.png']]))

	assert.match(result, /说明 local-image:keep/)
	assert.match(result, /`!\[\]\(local-image:keep-inline\)`/)
	assert.match(result, /!\[\]\(local-image:keep-fenced\)/)
	assert.match(result, /!\[\]\(\/blogs\/post\/image\.png\)/)
	assert.match(result, /!\[x\]\(<\/blogs\/post\/image\.png> "title"\)/)
})

test('supports nested alt text and reference-style image destinations', () => {
	const markdown =
		'![a [nested] label](local-image:nested)\n\n![reference][asset]\n\n[asset]: local-image:reference "title"'
	assert.deepEqual(extractLocalImageIds(markdown), ['nested', 'reference'])

	const result = replaceLocalImageReferences(
		markdown,
		new Map([
			['nested', '/blogs/post/nested.png'],
			['reference', '/blogs/post/reference.png']
		])
	)
	assert.match(result, /!\[a \[nested\] label\]\(\/blogs\/post\/nested\.png\)/)
	assert.match(result, /\[asset\]: \/blogs\/post\/reference\.png "title"/)
})

test('ignores local image syntax in indented code and rewrites images nested in links and tables', () => {
	const markdown =
		'    ![](local-image:indented)\n\n[![](local-image:linked)](https://example.com)\n\n| Image |\n| --- |\n| ![](local-image:table) |'
	assert.deepEqual(extractLocalImageIds(markdown), ['linked', 'table'])

	const result = replaceLocalImageReferences(
		markdown,
		new Map([
			['linked', '/blogs/post/linked.png'],
			['table', '/blogs/post/table.png']
		])
	)
	assert.match(result, /^ {4}!\[\]\(local-image:indented\)/)
	assert.match(result, /\[!\[\]\(\/blogs\/post\/linked\.png\)\]\(https:\/\/example\.com\)/)
	assert.match(result, /\| !\[\]\(\/blogs\/post\/table\.png\) \|/)
})

test('deduplicates missing references and accepts usable local image data', () => {
	const images: ImageItem[] = [createFileImage('available')]
	const markdown = '![](local-image:available)\n![](local-image:missing)\n![](local-image:missing)'
	assert.deepEqual(findMissingLocalImageIds(markdown, images), ['missing'])
})

test('allows a local cover item to satisfy a body reference', () => {
	assert.deepEqual(findMissingLocalImageIds('![](local-image:cover)', [], createFileImage('cover')), [])
})

test('rejects empty or unusable local image references before publishing', () => {
	assert.throws(
		() => validateLocalImageReferences('![](local-image:missing)\n![](local-image:missing)', []),
		/正文中有 1 张本地图片未找到，请重新粘贴或删除对应图片引用。/
	)
})
