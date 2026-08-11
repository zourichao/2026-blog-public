import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMParser } from 'linkedom'
import { convertRichHtmlToMarkdown } from './rich-text-import'
import { normalizeWordClipboardSemanticHtml } from './word-semantic-normalize'

const parseHtml = (html: string): Document =>
	new DOMParser().parseFromString(html, 'text/html') as unknown as Document

test('maps Word heading styles to article-body Markdown heading levels', () => {
	const html = [
		'<p class="MsoHeading1">一级标题</p>',
		'<p style="mso-style-name:\'Heading 2\'">二级标题</p>',
		'<p style="mso-style-name:\'标题 3\'">三级标题</p>',
		'<p style="mso-outline-level:3">轮廓标题</p>'
	].join('')
	const result = convertRichHtmlToMarkdown(normalizeWordClipboardSemanticHtml(html), parseHtml)
	assert.match(result.markdownTemplate, /^## 一级标题/m)
	assert.match(result.markdownTemplate, /^### 二级标题/m)
	assert.match(result.markdownTemplate, /^#### 三级标题/m)
	assert.match(result.markdownTemplate, /^##### 轮廓标题/m)
})

test('maps Word quote style without converting visual-only styles into emphasis', () => {
	const html = '<p class="MsoQuote"><span style="color:red;font-size:18pt">引用内容</span></p>' +
		'<p><span style="color:red;font-size:18pt">普通红色正文</span></p>'
	const result = convertRichHtmlToMarkdown(normalizeWordClipboardSemanticHtml(html), parseHtml)
	assert.match(result.markdownTemplate, /^> 引用内容/m)
	assert.match(result.markdownTemplate, /普通红色正文/)
	assert.doesNotMatch(result.markdownTemplate, /\*\*普通红色正文\*\*/)
})

test('converts Word multi-level lists to nested Markdown and keeps ordered starts', () => {
	const html = [
		'<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">3.<span>&nbsp;</span></span>第三项</p>',
		'<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">a)<span>&nbsp;</span></span>子项 A</p>',
		'<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">b)<span>&nbsp;</span></span>子项 B</p>',
		'<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">4.<span>&nbsp;</span></span>第四项</p>'
	].join('')
	const normalized = normalizeWordClipboardSemanticHtml(html)
	assert.match(normalized, /<ol start="3">/)
	const result = convertRichHtmlToMarkdown(normalized, parseHtml)
	assert.match(result.markdownTemplate, /3\.\s+第三项/)
	assert.match(result.markdownTemplate, /\n\s+1\.\s+子项 A/)
	assert.match(result.markdownTemplate, /\n\s+2\.\s+子项 B/)
	assert.match(result.markdownTemplate, /4\.\s+第四项/)
})

test('keeps single and multiple image tags in source order while normalizing Word lists', () => {
	const first = '<img src="file:///C:/Temp/first.png" alt="First">'
	const second = '<img src="file:///C:/Temp/second.png" alt="Second">'
	const html = [
		'<p class="MsoListParagraph" style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">1.<span>&nbsp;</span></span>图一', first, '</p>',
		'<p class="MsoListParagraph" style="mso-list:l1 level2 lfo2"><span style="mso-list:Ignore">a)<span>&nbsp;</span></span>图二', second, '</p>'
	].join('')
	const normalized = normalizeWordClipboardSemanticHtml(html)
	assert.equal((normalized.match(/<img\b/gi) || []).length, 2)
	assert.ok(normalized.indexOf(first) < normalized.indexOf(second))
	const result = convertRichHtmlToMarkdown(normalized, parseHtml)
	assert.deepEqual(result.images.map(image => image.src), [
		'file:///C:/Temp/first.png',
		'file:///C:/Temp/second.png'
	])
	assert.ok(result.markdownTemplate.indexOf(result.images[0].placeholder) < result.markdownTemplate.indexOf(result.images[1].placeholder))
})

test('preserves Office VML conditional-comment payload for the existing image converter', () => {
	const vml = '<!--[if gte vml 1]><v:shape><v:imagedata src="file:///C:/Temp/vml.png" /></v:shape><![endif]-->'
	const html = `<p class="MsoHeading1">标题</p>${vml}<p>正文</p>`
	const normalized = normalizeWordClipboardSemanticHtml(html)
	assert.ok(normalized.includes(vml))
	const result = convertRichHtmlToMarkdown(normalized, parseHtml)
	assert.equal(result.images.length, 1)
	assert.equal(result.images[0].src, 'file:///C:/Temp/vml.png')
})

test('returns non-Word HTML byte-for-byte unchanged', () => {
	const html = '<p><strong>普通 HTML</strong><img src="https://example.com/a.png"></p>'
	assert.equal(normalizeWordClipboardSemanticHtml(html), html)
})
