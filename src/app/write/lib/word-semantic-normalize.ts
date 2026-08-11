const WORD_SEMANTIC_PATTERN =
	/(?:\bMso[A-Za-z0-9_-]*|\bmso-[a-z-]+\s*:|#_Toc\d+|urn:schemas-microsoft-com|msohtmlclip|<(?:o|v|w|st1):[a-z])/i

type WordListTag = 'ol' | 'ul'

type WordListItem = {
	level: number
	tag: WordListTag
	content: string
	identity: string
	start: number | null
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
		.replace(/&middot;/gi, '·')
		.replace(/&bull;/gi, '•')
		.replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
		.replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
		.replace(/&amp;/gi, '&')
}

function visibleText(value: string): string {
	return decodeHtmlEntities(value.replace(/<!--([\s\S]*?)-->/g, ' ').replace(/<[^>]+>/g, ' '))
		.replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
}

function attributeValue(attributes: string, name: string): string {
	const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
	return (match?.[1] || match?.[2] || match?.[3] || '').trim()
}

function styleValue(attributes: string): string {
	return attributeValue(attributes, 'style')
}

function classValue(attributes: string): string {
	return attributeValue(attributes, 'class')
}

function cleanStyleValue(style: string, propertyPattern: RegExp): string {
	return style
		.split(';')
		.map(part => part.trim())
		.filter(Boolean)
		.filter(part => !propertyPattern.test(part.split(':', 1)[0]?.trim() || ''))
		.join(';')
}

function rewriteStyleAttribute(attributes: string, transform: (style: string) => string): string {
	const pattern = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i
	const match = attributes.match(pattern)
	if (!match) return attributes
	const originalStyle = match[2] ?? match[3] ?? ''
	const nextStyle = transform(originalStyle).trim().replace(/^;+|;+$/g, '').trim()
	if (!nextStyle) return attributes.replace(pattern, '').replace(/\s{2,}/g, ' ').trimEnd()
	const quote = match[1][0]
	return attributes.replace(pattern, `style=${quote}${nextStyle}${quote}`)
}

function stripFontWeightAttributes(attributes: string): string {
	return rewriteStyleAttribute(attributes, style => cleanStyleValue(style, /^(?:font-weight|mso-bidi-font-weight)$/i))
}

function stripParagraphIndentAttributes(attributes: string): string {
	return rewriteStyleAttribute(attributes, style =>
		cleanStyleValue(style, /^(?:margin-left|text-indent|mso-char-indent-count|mso-para-margin-left|mso-tab-count)$/i)
	)
}

function explicitFontWeight(attributes: string): boolean | null {
	const style = styleValue(attributes)
	const direct = style.match(/(?:^|;)\s*font-weight\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase()
	if (!direct) return null
	if (/^(?:bold|bolder|[6-9]00)$/.test(direct)) return true
	if (/^(?:normal|lighter|[1-5]00)$/.test(direct)) return false
	return null
}

function parseFontSizePt(value: string): number | null {
	const match = value.match(/(-?\d+(?:\.\d+)?)\s*(pt|px)?/i)
	if (!match) return null
	const numeric = Number.parseFloat(match[1])
	if (!Number.isFinite(numeric) || numeric <= 0) return null
	return (match[2] || 'pt').toLowerCase() === 'px' ? numeric * 0.75 : numeric
}

function maxFontSizePt(attributes: string, content: string): number | null {
	const sizes: number[] = []
	const collect = (style: string) => {
		for (const match of style.matchAll(/font-size\s*:\s*([^;]+)/gi)) {
			const size = parseFontSizePt(match[1])
			if (size != null) sizes.push(size)
		}
	}
	collect(styleValue(attributes))
	for (const match of content.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) collect(match[1] || match[2] || '')
	return sizes.length ? Math.max(...sizes) : null
}

function hasDirectBoldEvidence(attributes: string, content: string): boolean {
	if (explicitFontWeight(attributes) === true) return true
	if (/<\s*(?:b|strong)\b/i.test(content)) return true
	return /font-weight\s*:\s*(?:bold|bolder|[6-9]00)\b/i.test(content)
}

function hasHeadingBackground(attributes: string, content: string): boolean {
	const style = `${styleValue(attributes)} ${content.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1] || ''}`
	return /(?:^|;)\s*(?:background(?:-color)?|mso-shading|mso-highlight)\s*:/i.test(style)
}

function isCenteredParagraph(attributes: string): boolean {
	return /text-align\s*:\s*center/i.test(styleValue(attributes)) || /^center$/i.test(attributeValue(attributes, 'align'))
}

function looksLikeSectionHeading(text: string): boolean {
	return /^(?:(?:0?\d{1,2})\s*[｜|、.．:]\s*|[一二三四五六七八九十百千]+[、.．]\s*|第[一二三四五六七八九十百千\d]+(?:步|章|节|部分)\s*[：:]?|[①-⑳]\s*)/.test(
		text
	)
}

function wordHeadingLevel(attributes: string): number | null {
	const className = classValue(attributes)
	const style = styleValue(attributes)
	const headingClass = className.match(/\bMsoHeading([1-6])\b/i)?.[1]
	if (headingClass) return Math.min(6, Number.parseInt(headingClass, 10) + 1)
	if (/\bMsoTitle\b/i.test(className)) return 2
	if (/\bMsoSubtitle\b/i.test(className)) return 3

	const styleName = style.match(/mso-style-name\s*:\s*(?:["']?)([^;"']+)/i)?.[1]?.trim() || ''
	const namedHeading = styleName.match(/^(?:Heading|标题)\s*([1-6])$/i)?.[1]
	if (namedHeading) return Math.min(6, Number.parseInt(namedHeading, 10) + 1)
	if (/^(?:Title|标题)$/i.test(styleName)) return 2
	if (/^(?:Subtitle|副标题)$/i.test(styleName)) return 3

	const outline = style.match(/mso-outline-level\s*:\s*([0-5])/i)?.[1]
	if (outline != null) return Math.min(6, Number.parseInt(outline, 10) + 2)
	return null
}

function visualHeadingLevel(attributes: string, content: string): number | null {
	if (/<(?:img|table|video|audio|iframe)\b/i.test(content)) return null
	const text = visibleText(content)
	if (!text || text.length > 72) return null
	const size = maxFontSizePt(attributes, content)
	const bold = hasDirectBoldEvidence(attributes, content)
	const centered = isCenteredParagraph(attributes)
	const background = hasHeadingBackground(attributes, content)
	if (background && bold && text.length <= 40) return 2
	if (bold && size != null && size >= 17) return 2
	if (bold && centered && size != null && size >= 13.5) return 3
	if (bold && size != null && size >= 14 && looksLikeSectionHeading(text)) return 2
	if (bold && size != null && size >= 14.5 && text.length <= 32 && !/[。；;，,]$/.test(text)) return 3
	return null
}

function isWordQuote(attributes: string): boolean {
	const className = classValue(attributes)
	const style = styleValue(attributes)
	if (/\bMso(?:Intense)?Quote\b/i.test(className)) return true
	const styleName = style.match(/mso-style-name\s*:\s*(?:["']?)([^;"']+)/i)?.[1]?.trim() || ''
	return /^(?:Quote|Intense Quote|引用|明显引用)$/i.test(styleName)
}

function cleanLeadingWordIndent(content: string): string {
	let consumedText = false
	return content.replace(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g, token => {
		if (consumedText || token.startsWith('<')) return token
		const cleaned = token.replace(/^(?:(?:&nbsp;|&#160;|&#x0*a0;)|[\t\u00a0]| {2,})+/gi, '')
		if (visibleText(cleaned)) consumedText = true
		return cleaned
	})
}

function normalizeInlineBold(content: string, baseBold: boolean, suppressStrong: boolean): string {
	type SpanState = { tag: 'span' | 'font'; effectiveBold: boolean }
	const spanStack: SpanState[] = []
	let semanticStrongDepth = 0
	let autoStrongOpen = false
	let autoStrongOpenDepth = -1
	let output = ''

	const currentBold = () => spanStack.at(-1)?.effectiveBold ?? baseBold
	const closeAutoStrong = () => {
		if (!autoStrongOpen) return
		output += '</strong>'
		autoStrongOpen = false
		autoStrongOpenDepth = -1
	}
	const openAutoStrong = () => {
		if (autoStrongOpen || suppressStrong || semanticStrongDepth > 0 || !currentBold()) return
		output += '<strong>'
		autoStrongOpen = true
		autoStrongOpenDepth = spanStack.length
	}

	for (const token of content.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
		if (!token.startsWith('<')) {
			if (visibleText(token)) openAutoStrong()
			output += token
			continue
		}
		if (/^<!--/.test(token)) {
			output += token
			continue
		}

		const closeMatch = token.match(/^<\s*\/\s*([a-z0-9:]+)\s*>/i)
		if (closeMatch) {
			const tag = closeMatch[1].toLowerCase()
			if (tag === 'strong' || tag === 'b') {
				closeAutoStrong()
				semanticStrongDepth = Math.max(0, semanticStrongDepth - 1)
				output += token
				continue
			}
			if (tag === 'span' || tag === 'font') {
				if (autoStrongOpen && autoStrongOpenDepth >= spanStack.length) closeAutoStrong()
				spanStack.pop()
				output += token
				continue
			}
			output += token
			continue
		}

		const openMatch = token.match(/^<\s*([a-z0-9:]+)\b([^>]*)>/i)
		if (!openMatch) {
			output += token
			continue
		}
		const tag = openMatch[1].toLowerCase()
		const attributes = openMatch[2] || ''
		const selfClosing = /\/\s*>$/.test(token) || ['br', 'hr', 'img', 'input', 'source'].includes(tag)

		if (tag === 'strong' || tag === 'b') {
			closeAutoStrong()
			semanticStrongDepth += 1
			output += token
			if (selfClosing) semanticStrongDepth = Math.max(0, semanticStrongDepth - 1)
			continue
		}
		if (tag === 'span' || tag === 'font') {
			const parentBold = currentBold()
			const explicit = explicitFontWeight(attributes)
			const effectiveBold = explicit ?? parentBold
			if (autoStrongOpen && effectiveBold !== parentBold) closeAutoStrong()
			const cleanedAttributes = stripFontWeightAttributes(attributes)
			output += `<${tag}${cleanedAttributes}>`
			if (!selfClosing) spanStack.push({ tag, effectiveBold })
			continue
		}
		if (['img', 'br', 'hr', 'table', 'tr', 'td', 'th', 'p', 'div', 'ol', 'ul', 'li', 'blockquote', 'pre'].includes(tag)) {
			closeAutoStrong()
		}
		output += token
	}
	closeAutoStrong()
	return output.replace(/<strong>\s*<\/strong>/gi, '').replace(/<\/strong>(\s*)<strong>/gi, '$1')
}

function normalizeHeadingQuoteAndParagraphStyles(html: string): string {
	return html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi, (full, rawAttributes: string, rawContent: string) => {
		if (/\bMsoListParagraph\b/i.test(classValue(rawAttributes)) || /mso-list\s*:/i.test(styleValue(rawAttributes))) return full
		const headingLevel = wordHeadingLevel(rawAttributes) ?? visualHeadingLevel(rawAttributes, rawContent)
		const quote = isWordQuote(rawAttributes)
		const baseBold = explicitFontWeight(rawAttributes) === true
		const attributes = stripFontWeightAttributes(stripParagraphIndentAttributes(rawAttributes))
		const content = normalizeInlineBold(cleanLeadingWordIndent(rawContent), baseBold, Boolean(headingLevel))
		if (headingLevel) return `<h${headingLevel}>${content}</h${headingLevel}>`
		if (quote) return `<blockquote><p${attributes}>${content}</p></blockquote>`
		return `<p${attributes}>${content}</p>`
	})
}

function normalizeWordPreformattedBlocks(html: string): string {
	return html.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre\s*>/gi, (full, attributes: string, content: string) => {
		const className = classValue(attributes)
		const style = styleValue(attributes)
		const looksLikeCode =
			/\b(?:language-|highlight-source-|prettyprint|code)\b/i.test(className) ||
			/<code\b/i.test(content) ||
			/(?:font-family\s*:[^;]*(?:Consolas|Courier|monospace))/i.test(style)
		if (looksLikeCode) return full
		return `<p${stripParagraphIndentAttributes(attributes)}>${cleanLeadingWordIndent(content)}</p>`
	})
}

function isTocParagraph(attributes: string, content: string): boolean {
	const className = classValue(attributes)
	const style = styleValue(attributes)
	if (/\bMsoToc\d*\b/i.test(className) || /mso-style-name\s*:\s*["']?TOC\s*\d*/i.test(style)) return true
	if (/\bTOC\s+\\o\s+["']?\d+-\d+["']?/i.test(visibleText(content))) return true
	const hasTocAnchor = /href\s*=\s*["']#_Toc\d+/i.test(content)
	const hasLeaderOrPage = /(?:\.{4,}|…{2,}|mso-tab-count\s*:|\s\d{1,3}\s*$)/i.test(visibleText(content))
	return hasTocAnchor && hasLeaderOrPage
}

function stripWordTableOfContents(html: string): string {
	let output = html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi, (full, attributes: string, content: string) =>
		isTocParagraph(attributes, content) ? '' : full
	)
	output = output.replace(/<span\b[^>]*mso-element\s*:\s*field-(?:begin|code|end)[^>]*>[\s\S]*?<\/span\s*>/gi, '')
	output = output.replace(/\bTOC\s+\\o\s+["']?1-3["']?\s+\\h\s+\\u\b/gi, '')
	return output
}

function stripWordInternalTocAnchors(html: string): string {
	return html.replace(/<a\b([^>]*)href\s*=\s*(["'])#_Toc\d+\2([^>]*)>([\s\S]*?)<\/a\s*>/gi, '$4')
}

function parseWordListItem(attributes: string, content: string): WordListItem | null {
	const className = classValue(attributes)
	const style = styleValue(attributes)
	if (!/\bMsoListParagraph\b/i.test(className) && !/mso-list\s*:/i.test(style)) return null

	const listMeta = style.match(/mso-list\s*:\s*([^;]+)/i)?.[1] || ''
	const level = Math.max(1, Number.parseInt(listMeta.match(/\blevel(\d+)\b/i)?.[1] || '1', 10) || 1)
	const listId = listMeta.match(/\b(l\d+)\b/i)?.[1]?.toLowerCase() || 'list'
	const listFormat = listMeta.match(/\b(lfo\d+)\b/i)?.[1]?.toLowerCase() || 'format'
	const identity = `${listId}:${listFormat}`
	const prefixText = visibleText(content).slice(0, 48)
	const marker =
		prefixText.match(
			/^(?:[·•▪●○◦\uf0b7]|[oO](?=\s)|(?:\d+|[a-z])[.)、]|[（(](?:\d+|[a-z]|[一二三四五六七八九十百千]+)[）)]|[一二三四五六七八九十百千]+[、.．])/i
		)?.[0] || ''
	const tag: WordListTag = /^[·•▪●○◦\uf0b7o]$/i.test(marker) ? 'ul' : 'ol'
	const numericStart = marker.match(/^(\d+)[.)、]/)?.[1]
	return {
		level,
		tag,
		content: normalizeInlineBold(hideWordListMarker(content), false, false),
		identity,
		start: numericStart ? Number.parseInt(numericStart, 10) : null
	}
}

function hideWordListMarker(content: string): string {
	return content.replace(
		/<span\b([^>]*?)\bstyle\s*=\s*(["'])([^"']*mso-list\s*:\s*ignore[^"']*)\2([^>]*)>/i,
		(_full, before: string, quote: string, style: string, after: string) => {
			const normalizedStyle = style.trim().replace(/;?\s*$/, ';')
			return `<span${before}style=${quote}${normalizedStyle}display:none;${quote}${after}>`
		}
	)
}

function openList(item: WordListItem): string {
	if (item.tag === 'ol' && item.start && item.start > 1) return `<ol start="${item.start}">`
	return `<${item.tag}>`
}

function renderWordList(items: WordListItem[]): string {
	if (items.length === 0) return ''
	let output = ''
	const stack: Array<{ tag: WordListTag; liOpen: boolean }> = []
	let previousIdentity = items[0].identity

	const closeTo = (depth: number) => {
		while (stack.length > depth) {
			const current = stack.at(-1)!
			if (current.liOpen) output += '</li>'
			output += `</${current.tag}>`
			stack.pop()
		}
	}

	for (let index = 0; index < items.length; index += 1) {
		const item = items[index]
		if (index > 0 && item.identity !== previousIdentity && item.level === 1) closeTo(0)
		previousIdentity = item.identity

		const targetLevel = Math.min(item.level, stack.length + 1)
		if (targetLevel < stack.length) closeTo(targetLevel)

		while (stack.length < targetLevel) {
			output += openList(item)
			stack.push({ tag: item.tag, liOpen: false })
		}

		let current = stack.at(-1)
		if (!current) {
			output += openList(item)
			stack.push({ tag: item.tag, liOpen: false })
			current = stack.at(-1)!
		} else if (current.tag !== item.tag) {
			if (current.liOpen) output += '</li>'
			output += `</${current.tag}>${openList(item)}`
			stack[stack.length - 1] = { tag: item.tag, liOpen: false }
			current = stack.at(-1)!
		}

		if (current.liOpen) output += '</li>'
		output += `<li>${item.content}`
		current.liOpen = true
	}

	closeTo(0)
	return output
}

function normalizeWordLists(html: string): string {
	const paragraphPattern = /<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi
	let output = ''
	let cursor = 0
	let run: WordListItem[] = []
	let runStart = -1
	let runEnd = -1

	const flushRun = () => {
		if (run.length === 0) return
		output += html.slice(cursor, runStart)
		output += renderWordList(run)
		cursor = runEnd
		run = []
		runStart = -1
		runEnd = -1
	}

	for (const match of html.matchAll(paragraphPattern)) {
		const index = match.index ?? 0
		const full = match[0]
		const item = parseWordListItem(match[1], match[2])
		if (!item) {
			flushRun()
			continue
		}

		if (run.length > 0) {
			const gap = html.slice(runEnd, index)
			if (gap.trim()) flushRun()
		}
		if (run.length === 0) runStart = index
		run.push(item)
		runEnd = index + full.length
	}
	flushRun()
	output += html.slice(cursor)
	return output
}

function getTableRows(tableInnerHtml: string): string[] {
	return Array.from(tableInnerHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi), match => match[1])
}

function getRowCells(rowInnerHtml: string): string[] {
	return Array.from(rowInnerHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi), match => match[1])
}

function shouldUnwrapLayoutTable(tableInnerHtml: string): boolean {
	const rows = getTableRows(tableInnerHtml)
	if (rows.length === 0) return false
	const cells = rows.flatMap(getRowCells)
	if (cells.length === 0) return false
	const imageCount = cells.reduce((sum, cell) => sum + (cell.match(/<(?:img\b|v:(?:imagedata|shape|image)\b)/gi)?.length || 0), 0)
	const textLengths = cells.map(cell => visibleText(cell).length)
	const emptyCount = textLengths.filter(length => length === 0).length
	const emptyRatio = emptyCount / cells.length
	const textCellCount = textLengths.filter(length => length > 0).length
	const complexBlockCount = cells.reduce(
		(sum, cell) => sum + (cell.match(/<(?:p|div|h[1-6]|blockquote|ol|ul|figure)\b/gi)?.length || 0),
		0
	)
	const hasExplicitHeader = /<th\b/i.test(tableInnerHtml)
	const widths = rows.map(row => getRowCells(row).length).filter(Boolean)
	const maxWidth = widths.length ? Math.max(...widths) : 0

	if (cells.length === 1 && (imageCount > 0 || complexBlockCount > 1)) return true
	if (hasExplicitHeader) return false
	if (rows.length === 1 && cells.length <= 3 && imageCount > 0 && complexBlockCount >= 2) return true
	if (imageCount >= 1 && emptyRatio >= 0.25) return true
	if (imageCount >= 2 && textCellCount <= Math.ceil(cells.length * 0.75)) return true
	if (cells.length >= 4 && maxWidth <= 8 && emptyRatio >= 0.6) return true
	return false
}

function unwrapLayoutTable(tableInnerHtml: string): string {
	const rows = getTableRows(tableInnerHtml)
	const cells = rows.flatMap(getRowCells)
	const meaningful = cells.filter(cell => visibleText(cell) || /<(?:img\b|v:(?:imagedata|shape|image)\b)/i.test(cell))
	return meaningful.map(cell => `<div>${cell}</div>`).join('')
}

function normalizeLayoutTables(html: string): string {
	let output = html
	const innermostTable = /<table\b[^>]*>((?:(?!<table\b)[\s\S])*?)<\/table\s*>/gi
	for (let pass = 0; pass < 8; pass += 1) {
		let changed = false
		output = output.replace(innermostTable, (full, inner: string) => {
			if (!shouldUnwrapLayoutTable(inner)) return full
			changed = true
			return unwrapLayoutTable(inner)
		})
		if (!changed) break
	}
	return output
}

/**
 * 只增强 Word 剪贴板里的“文档语义”，不解析、不重编码、不上传图片。
 * 任何异常都返回原 HTML，让既有 rich-text/image 链路继续兜底。
 */
export function normalizeWordClipboardSemanticHtml(html: string): string {
	if (!html || !WORD_SEMANTIC_PATTERN.test(html)) return html
	try {
		let output = stripWordTableOfContents(html)
		output = stripWordInternalTocAnchors(output)
		output = normalizeLayoutTables(output)
		output = normalizeWordPreformattedBlocks(output)
		output = normalizeWordLists(output)
		output = normalizeHeadingQuoteAndParagraphStyles(output)
		return output
	} catch {
		return html
	}
}
