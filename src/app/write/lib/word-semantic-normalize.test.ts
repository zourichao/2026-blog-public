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

test('recognizes visual Word headings but does not promote ordinary bold body text', () => {
	const html = [
		'<p class="MsoNormal" style="text-align:center;font-size:15pt;font-weight:bold">深圳火月信息技术有限公司</p>',
		'<p class="MsoNormal" style="background:#dbeafe;font-size:12pt;font-weight:bold">工作经验</p>',
		'<p class="MsoNormal" style="font-size:10.5pt;font-weight:bold">1、负责后台系统设计与需求推进。</p>'
	].join('')
	const result = convertRichHtmlToMarkdown(normalizeWordClipboardSemanticHtml(html), parseHtml)
	assert.match(result.markdownTemplate, /^### 深圳火月信息技术有限公司/m)
	assert.match(result.markdownTemplate, /^## 工作经验/m)
	assert.doesNotMatch(result.markdownTemplate, /^#{2,6} 1、负责后台系统设计与需求推进。/m)
	assert.match(result.markdownTemplate, /\*\*1、负责后台系统设计与需求推进。\*\*/)
})

test('respects child font-weight normal inside a bold Word parent to avoid false full-paragraph emphasis', () => {
	const html =
		'<p style="font-weight:bold;mso-bidi-font-weight:bold">' +
		'<span>真正强调</span><span style="font-weight:normal">普通正文</span><span>再次强调</span>' +
		'</p>'
	const normalized = normalizeWordClipboardSemanticHtml(html)
	assert.doesNotMatch(normalized, /font-weight\s*:/i)
	const result = convertRichHtmlToMarkdown(normalized, parseHtml)
	assert.match(result.markdownTemplate, /\*\*真正强调\*\*/)
	assert.match(result.markdownTemplate, /普通正文/)
	assert.match(result.markdownTemplate, /\*\*再次强调\*\*/)
	assert.doesNotMatch(result.markdownTemplate, /\*\*真正强调普通正文再次强调\*\*/)
})

test('ignores mso-bidi-font-weight bold when normal font-weight is not explicitly bold', () => {
	const html = '<p><span style="mso-bidi-font-weight:bold;color:#00aee8">普通正文</span></p>'
	const result = convertRichHtmlToMarkdown(normalizeWordClipboardSemanticHtml(html), parseHtml)
	assert.equal(result.markdownTemplate, '普通正文')
})

test('removes Word TOC entries and internal _Toc links without removing real heading text', () => {
	const html = [
		'<p class="MsoToc1"><a href="#_Toc28799">一、目标群体分析……………………2</a></p>',
		'<p><span>TOC \\o "1-3" \\h \\u</span></p>',
		'<p style="font-size:16pt;font-weight:bold"><a href="#_Toc5334">三、微信改进计划</a></p>',
		'<p>正文</p>'
	].join('')
	const normalized = normalizeWordClipboardSemanticHtml(html)
	assert.doesNotMatch(normalized, /MsoToc|TOC \\o|#_Toc28799/)
	assert.doesNotMatch(normalized, /href=["']#_Toc5334/i)
	assert.match(normalized, /三、微信改进计划/)
	const result = convertRichHtmlToMarkdown(normalized, parseHtml)
	assert.doesNotMatch(result.markdownTemplate, /_Toc|……………………2/)
	assert.match(result.markdownTemplate, /三、微信改进计划/)
})

test('converts Word visual pre blocks back to paragraphs while preserving explicit code blocks', () => {
	const html = [
		'<pre class="MsoNormal" style="margin-left:24pt">普通 Word 缩进正文</pre>',
		'<pre class="language-js"><code>const x = 1</code></pre>'
	].join('')
	const normalized = normalizeWordClipboardSemanticHtml(html)
	assert.match(normalized, /<p[^>]*>普通 Word 缩进正文<\/p>/)
	assert.match(normalized, /<pre class="language-js">/)
	const result = convertRichHtmlToMarkdown(normalized, parseHtml)
	assert.match(result.markdownTemplate, /普通 Word 缩进正文/)
	assert.match(result.markdownTemplate, /```/)
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
	assert.match(result.markdownTemplate, /子项 A/)
	assert.match(result.markdownTemplate, /子项 B/)
	assert.match(result.markdownTemplate, /4\.\s+第四项/)
})

test('unwraps 1x1 and image-heavy Word layout tables but keeps normal data tables', () => {
	const layout =
		'<table class="MsoTableGrid"><tr><td><p>博客 / 作品集</p><img src="file:///C:/Temp/qr.png"><p>www.example.com</p></td></tr></table>'
	const imageGrid =
		'<table><tr><td><img src="file:///C:/Temp/a.png"></td><td></td><td><img src="file:///C:/Temp/b.png"></td></tr></table>'
	const data =
		'<table><tr><td>环节</td><td>风险</td><td>优先级</td></tr><tr><td>验证码</td><td>无反馈</td><td>P0</td></tr></table>'
	const normalized = normalizeWordClipboardSemanticHtml(`${layout}${imageGrid}${data}`)
	assert.equal((normalized.match(/<table\b/gi) || []).length, 1)
	assert.match(normalized, /博客 \/ 作品集/)
	assert.match(normalized, /file:\/\/\/C:\/Temp\/qr\.png/)
	assert.match(normalized, /<table><tr><td>环节<\/td>/)
})

test('keeps single and multiple image tags in source order while normalizing Word structure', () => {
	const first = '<img src="file:///C:/Temp/first.png" alt="First">'
	const second = '<img src="file:///C:/Temp/second.png" alt="Second">'
	const html = [
		'<p class="MsoListParagraph" style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">1.<span>&nbsp;</span></span>图一',
		first,
		'</p>',
		'<p class="MsoListParagraph" style="mso-list:l1 level2 lfo2"><span style="mso-list:Ignore">a)<span>&nbsp;</span></span>图二',
		second,
		'</p>'
	].join('')
	const normalized = normalizeWordClipboardSemanticHtml(html)
	assert.equal((normalized.match(/<img\b/gi) || []).length, 2)
	assert.ok(normalized.indexOf(first) < normalized.indexOf(second))
	const result = convertRichHtmlToMarkdown(normalized, parseHtml)
	assert.deepEqual(
		result.images.map(image => image.src),
		['file:///C:/Temp/first.png', 'file:///C:/Temp/second.png']
	)
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

test('does not reinterpret literal Markdown asterisks already present in Word source text', () => {
	const html = '<p class="MsoNormal">点击 **登录** 后继续。</p>'
	const normalized = normalizeWordClipboardSemanticHtml(html)
	assert.match(normalized, /\*\*登录\*\*/)
})

test('returns non-Word HTML byte-for-byte unchanged', () => {
	const html = '<p><strong>普通 HTML</strong><img src="https://example.com/a.png"></p>'
	assert.equal(normalizeWordClipboardSemanticHtml(html), html)
})
