import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMParser } from 'linkedom'
import { Marked } from 'marked'
import {
	RICH_TEXT_IMAGE_FAILURE_PLACEHOLDER,
	RICH_TEXT_IMPORT_FAILURE_PLACEHOLDER,
	convertRichHtmlToMarkdown,
	hasMeaningfulRichHtml,
	normalizeMarkdownSpacing,
	replaceRichTextImagePlaceholders,
	sanitizeImageAlt,
	sanitizeLinkHref
} from './rich-text-import'

const parseHtml = (html: string): Document =>
	new DOMParser().parseFromString(html, 'text/html') as unknown as Document

test('detects meaningful rich HTML and ignores empty or dangerous-only fragments', () => {
	assert.equal(hasMeaningfulRichHtml('plain clipboard text'), false)
	assert.equal(hasMeaningfulRichHtml('<span>plain clipboard text</span>'), false)
	assert.equal(hasMeaningfulRichHtml('<script>alert(1)</script>'), false)
	assert.equal(hasMeaningfulRichHtml('<p>formatted paragraph</p>'), true)
	assert.equal(hasMeaningfulRichHtml('<img src="https://example.com/a.png">'), true)
	assert.equal(hasMeaningfulRichHtml('<p class="MsoListParagraph">Office list</p>'), true)
})

test('sanitizes links without rejecting relative URLs and fragments', () => {
	assert.equal(sanitizeLinkHref(' https://example.com/a?q=1 '), 'https://example.com/a?q=1')
	assert.equal(sanitizeLinkHref('https://exam\u0000ple.com/pa\nth'), 'https://example.com/path')
	assert.equal(sanitizeLinkHref('mailto:hello@example.com'), 'mailto:hello@example.com')
	assert.equal(sanitizeLinkHref('#section'), '#section')
	assert.equal(sanitizeLinkHref('../article'), '../article')
	assert.equal(sanitizeLinkHref('java\nscript:alert(1)'), null)
	assert.equal(sanitizeLinkHref('vbscript:msgbox(1)'), null)
	assert.equal(sanitizeLinkHref('data:text/html;base64,AAAA'), null)
	assert.equal(sanitizeLinkHref('custom-protocol:value'), null)
})

test('sanitizes image alt text for a Markdown image label', () => {
	assert.equal(sanitizeImageAlt('  meaningful\u0000 [one] \\ two\n'), 'meaningful [one] \\ two')
	assert.equal(sanitizeImageAlt('image001.png'), '')
	assert.equal(sanitizeImageAlt('图片1.jpg'), '')
	assert.equal(sanitizeImageAlt('C:\\Users\\Suni\\Desktop\\cover.png'), '')
	assert.equal(sanitizeImageAlt('4e07408562bedb8b60ce05c1decfe3ad.png'), '')
})

test('converts semantic text and strips dangerous HTML and event attributes', () => {
	const result = convertRichHtmlToMarkdown(
		'<p onclick="evil()"><strong>Bold</strong> <em>italic</em> <del>gone</del> ' +
			'<a href="https://example.com">safe</a> <a href="javascript:evil()">unsafe</a></p>' +
			'<script>alert(1)</script><iframe src="https://example.com"></iframe>',
		parseHtml
	)

	assert.match(result.markdownTemplate, /\*\*Bold\*\*/)
	assert.match(result.markdownTemplate, /\*italic\*/)
	assert.match(result.markdownTemplate, /~~gone~~/)
	assert.match(result.markdownTemplate, /\[safe\]\(https:\/\/example\.com\)/)
	assert.match(result.markdownTemplate, /unsafe/)
	assert.doesNotMatch(result.markdownTemplate, /javascript|alert|iframe|onclick/i)
	assert.deepEqual(result.images, [])
})

test('converts headings, quotes, code, rules and nested lists to Markdown', () => {
	const result = convertRichHtmlToMarkdown(
		'<h2>Heading</h2><blockquote><p>Quoted <code>value</code></p></blockquote>' +
			'<pre><code class="language-ts">const answer = 42\nconsole.log(answer)</code></pre>' +
			'<ul><li>Outer<ul><li>Inner</li></ul></li></ul><hr><div>Last<br>line</div>',
		parseHtml
	)

	assert.match(result.markdownTemplate, /^## Heading/m)
	assert.match(result.markdownTemplate, /^> Quoted `value`/m)
	assert.match(result.markdownTemplate, /```[\s\S]*const answer = 42[\s\S]*```/)
	assert.match(result.markdownTemplate, /-\s+Outer[\s\S]*\n\s+-\s+Inner/)
	assert.match(result.markdownTemplate, /^---$/m)
	assert.match(result.markdownTemplate, /Last\s{2}\nline/)
})

test('converts VML and HTML images into stable source-order placeholders', () => {
	const result = convertRichHtmlToMarkdown(
		'<p><v:shape><v:imagedata src="file:///C:/Temp/first.png" o:title="First [image]" /></v:shape></p>' +
			'<p><img src="https://cdn.example.com/path/second.webp?width=400" alt="Second"></p>',
		parseHtml
	)

	assert.equal(result.images.length, 2)
	assert.deepEqual(
		result.images.map(({ index, kind, filenameHint }) => ({ index, kind, filenameHint })),
		[
			{ index: 0, kind: 'local', filenameHint: 'rich-text-image-1' },
			{ index: 1, kind: 'remote', filenameHint: 'second.webp' }
		]
	)
	assert.equal(result.images[0].alt, 'First [image]')
	assert.ok(result.markdownTemplate.indexOf(result.images[0].placeholder) < result.markdownTemplate.indexOf(result.images[1].placeholder))

	const replacedFromArray = replaceRichTextImagePlaceholders(result.markdownTemplate, [
		'![first](local-image:first-id)',
		null
	])
	assert.match(replacedFromArray, /!\[first\]\(local-image:first-id\)/)
	assert.match(replacedFromArray, new RegExp(RICH_TEXT_IMAGE_FAILURE_PLACEHOLDER))

	const replacedFromMap = replaceRichTextImagePlaceholders(
		result.markdownTemplate,
		new Map([[result.images[0].placeholder, '![map](local-image:map-id)']])
	)
	assert.match(replacedFromMap, /!\[map\]\(local-image:map-id\)/)
})

test('converts Word pseudo-list paragraphs into a natural Markdown list', () => {
	const result = convertRichHtmlToMarkdown(
		'<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' +
			'<span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>First item</p>' +
			'<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' +
			'<span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>Second item</p>',
		parseHtml
	)

	assert.match(result.markdownTemplate, /-\s+First item/)
	assert.match(result.markdownTemplate, /-\s+Second item/)
	assert.doesNotMatch(result.markdownTemplate, /·/)
})

test('keeps unreliable Word list paragraphs intact and recognizes Chinese ordered markers', () => {
	const unreliable = convertRichHtmlToMarkdown(
		'<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">Original paragraph without a marker</p>',
		parseHtml
	)
	assert.equal(unreliable.markdownTemplate, 'Original paragraph without a marker')

	const ordered = convertRichHtmlToMarkdown(
		'<p class="MsoListParagraph"><span style="mso-list:Ignore">1、&nbsp;</span>First</p>' +
			'<p class="MsoListParagraph"><span style="mso-list:Ignore">（一）&nbsp;</span>Second</p>',
		parseHtml
	)
	assert.match(ordered.markdownTemplate, /^1\.\s+First/m)
	assert.match(ordered.markdownTemplate, /^2\.\s+Second/m)
	assert.doesNotMatch(ordered.markdownTemplate, /1、|（一）/)

	const prose = convertRichHtmlToMarkdown(
		'<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">Note. This must stay intact</p>',
		parseHtml
	)
	assert.equal(prose.markdownTemplate, 'Note. This must stay intact')
})

test('converts simple tables to GFM and complex tables to grouped text without losing cells', () => {
	const simple = convertRichHtmlToMarkdown(
		'<table><tbody><tr><td>Name</td><td>Role</td></tr><tr><td>Suni</td><td>Author</td></tr></tbody></table>',
		parseHtml
	)
	assert.equal(simple.complexTableCount, 0)
	assert.match(simple.markdownTemplate, /\|\s*Name\s*\|\s*Role\s*\|/)
	assert.match(simple.markdownTemplate, /\|\s*-+\s*\|\s*-+\s*\|/)
	assert.match(simple.markdownTemplate, /\|\s*Suni\s*\|\s*Author\s*\|/)

	const commonWordTable = convertRichHtmlToMarkdown(
		'<table><tbody><tr><td><p>Field</p></td><td><p>Value</p></td></tr>' +
			'<tr><td><p>A | B</p></td><td><p><strong>Kept</strong></p></td></tr></tbody></table>',
		parseHtml
	)
	assert.equal(commonWordTable.complexTableCount, 0)
	assert.match(commonWordTable.markdownTemplate, /\|\s*Field\s*\|\s*Value\s*\|/)
	assert.match(commonWordTable.markdownTemplate, /\|\s*A \\\| B\s*\|\s*\*\*Kept\*\*\s*\|/)
	assert.doesNotMatch(commonWordTable.markdownTemplate, /\|\s*\n\s*(?:Field|Value|A \\\| B|\*\*Kept\*\*)\s*\n/)

	const escapedPipe = convertRichHtmlToMarkdown(
		'<table><tr><td>Field</td><td>Value</td></tr><tr><td>A \\| B</td><td>Kept</td></tr></table>',
		parseHtml
	)
	assert.equal(new Marked().lexer(escapedPipe.markdownTemplate)[0]?.type, 'table')

	const complex = convertRichHtmlToMarkdown(
		'<table><tr><td colspan="2">Merged title</td></tr><tr><td>Left</td><td>Right</td></tr></table>',
		parseHtml
	)
	assert.equal(complex.complexTableCount, 1)
	assert.match(complex.markdownTemplate, /\*\*表格 1\*\*/)
	assert.match(complex.markdownTemplate, /第 1 行：Merged title/)
	assert.match(complex.markdownTemplate, /第 2 行：Left ｜ Right/)

	const multipleBlocks = convertRichHtmlToMarkdown(
		'<table><tr><td><p>Block one</p><p>Block two</p></td><td>Side</td></tr></table>',
		parseHtml
	)
	assert.equal(multipleBlocks.complexTableCount, 1)
	assert.match(multipleBlocks.markdownTemplate, /Block one Block two/)
	assert.match(multipleBlocks.markdownTemplate, /Side/)

	const nestedBlocks = convertRichHtmlToMarkdown(
		'<table><tr><td colspan="2"><div><p>Block A</p><p>Block B</p></div></td></tr></table>',
		parseHtml
	)
	assert.match(nestedBlocks.markdownTemplate, /Block A Block B/)
})

test('turns residual VML image shapes into descriptors instead of dropping them', () => {
	const result = convertRichHtmlToMarkdown('<v:shape title="unavailable local image"></v:shape>', parseHtml)
	assert.equal(result.images.length, 1)
	assert.equal(result.images[0].kind, 'unsupported')
	assert.equal(result.images[0].alt, 'unavailable local image')
	assert.match(result.markdownTemplate, new RegExp(result.images[0].placeholder))
	assert.match(replaceRichTextImagePlaceholders(result.markdownTemplate, []), /图片导入失败/)
})

test('expands common Office conditional comments before importing VML images', () => {
	const result = convertRichHtmlToMarkdown(
		'<!--[if gte vml 1]><v:shape><v:imagedata src="file:///C:/Temp/conditional.png" o:title="Conditional image" /></v:shape><![endif]-->',
		parseHtml
	)
	assert.equal(result.images.length, 1)
	assert.equal(result.images[0].src, 'file:///C:/Temp/conditional.png')
	assert.equal(result.images[0].kind, 'local')
	assert.equal(result.images[0].alt, 'Conditional image')
})

test('does not duplicate an Office VML image when the clipboard also includes its fallback img', () => {
	const result = convertRichHtmlToMarkdown(
		'<!--[if gte vml 1]><v:shape><v:imagedata src="file:///C:/Temp/image001.png" /></v:shape><![endif]-->' +
			'<![if !vml]><img src="file:///C:/Temp/image001.png"><![endif]>',
		parseHtml
	)
	assert.equal(result.images.length, 1)
	assert.equal(result.images[0].src, 'file:///C:/Temp/image001.png')
})

test('does not duplicate the common gte-mso VML and fallback image pair', () => {
	const result = convertRichHtmlToMarkdown(
		'<!--[if gte mso 9]><v:shape><v:imagedata src="file:///C:/Temp/image002.png" /></v:shape><![endif]-->' +
			'<![if !vml]><img src="file:///C:/Temp/image002.png"><![endif]>',
		parseHtml
	)
	assert.equal(result.images.length, 1)
	assert.equal(result.images[0].src, 'file:///C:/Temp/image002.png')
})

test('prefers a lazy image URL over a transparent placeholder and avoids placeholder collisions', () => {
	const literal = 'RICHTEXTIMAGEPLACEHOLDERX0I0000TOKEN'
	const result = convertRichHtmlToMarkdown(
		`<p>${literal}</p><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-src="https://cdn.example.com/real.png">`,
		parseHtml
	)
	assert.equal(result.images[0].src, 'https://cdn.example.com/real.png')
	assert.notEqual(result.images[0].placeholder, literal)
	assert.match(result.markdownTemplate, new RegExp(literal))
	assert.match(result.markdownTemplate, new RegExp(result.images[0].placeholder))
	const replaced = replaceRichTextImagePlaceholders(
		result.markdownTemplate,
		new Map([[result.images[0].placeholder, '![](local-image:lazy-image)']])
	)
	assert.match(replaced, new RegExp(literal))
	assert.match(replaced, /!\[\]\(local-image:lazy-image\)/)
})

test('preserves fenced-code blank lines while collapsing excess prose spacing', () => {
	const markdown = 'One\n\n\n\nTwo\n\n```ts\nconst first = 1\n\n\nconst second = 2\n```\n\n\n\nThree'
	assert.equal(
		normalizeMarkdownSpacing(markdown),
		'One\n\nTwo\n\n```ts\nconst first = 1\n\n\nconst second = 2\n```\n\nThree'
	)
})

test('uses the import failure placeholder if parsing fails', () => {
	const result = convertRichHtmlToMarkdown('<p>content</p>', () => {
		throw new Error('parser failed')
	})
	assert.deepEqual(result, {
		markdownTemplate: RICH_TEXT_IMPORT_FAILURE_PLACEHOLDER,
		images: [],
		complexTableCount: 0
	})
})
