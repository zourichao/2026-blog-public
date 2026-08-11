const WORD_SEMANTIC_PATTERN = /(?:\bMso(?:Heading|Title|Subtitle|Quote|ListParagraph)|\bmso-(?:style-name|outline-level|list)\s*:)/i

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
	return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
		.replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
}

function attributeValue(attributes: string, name: string): string {
	const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`, 'i'))
	return (match?.[1] || match?.[2] || match?.[3] || '').trim()
}


function styleValue(attributes: string): string {
	return attributeValue(attributes, 'style')
}

function classValue(attributes: string): string {
	return attributeValue(attributes, 'class')
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

function isWordQuote(attributes: string): boolean {
	const className = classValue(attributes)
	const style = styleValue(attributes)
	if (/\bMso(?:Intense)?Quote\b/i.test(className)) return true
	const styleName = style.match(/mso-style-name\s*:\s*(?:["']?)([^;"']+)/i)?.[1]?.trim() || ''
	return /^(?:Quote|Intense Quote|引用|明显引用)$/i.test(styleName)
}

function normalizeHeadingAndQuoteParagraphs(html: string): string {
	return html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi, (full, attributes: string, content: string) => {
		if (/\bMsoListParagraph\b/i.test(classValue(attributes)) || /mso-list\s*:/i.test(styleValue(attributes))) return full
		const headingLevel = wordHeadingLevel(attributes)
		if (headingLevel) return `<h${headingLevel}>${content}</h${headingLevel}>`
		if (isWordQuote(attributes)) return `<blockquote><p>${content}</p></blockquote>`
		return full
	})
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
	const marker = prefixText.match(
		/^(?:[·•▪●○◦\uf0b7]|[oO](?=\s)|(?:\d+|[a-z])[.)、]|[（(](?:\d+|[a-z]|[一二三四五六七八九十百千]+)[）)]|[一二三四五六七八九十百千]+[、.．])/i
	)?.[0] || ''
	const tag: WordListTag = /^[·•▪●○◦\uf0b7o]$/i.test(marker) ? 'ul' : 'ol'
	const numericStart = marker.match(/^(\d+)[.)、]/)?.[1]
	return {
		level,
		tag,
		content: hideWordListMarker(content),
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

/**
 * 只增强 Word 剪贴板里的“文档语义”，不解析、不重编码、不上传图片。
 * 任何异常都返回原 HTML，让既有 rich-text/image 链路继续兜底。
 */
export function normalizeWordClipboardSemanticHtml(html: string): string {
	if (!html || !WORD_SEMANTIC_PATTERN.test(html)) return html
	try {
		return normalizeWordLists(normalizeHeadingAndQuoteParagraphs(html))
	} catch {
		return html
	}
}
