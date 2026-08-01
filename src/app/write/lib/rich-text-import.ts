import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export const RICH_TEXT_IMPORT_FAILURE_PLACEHOLDER = '【富文本导入失败】'
export const RICH_TEXT_IMAGE_FAILURE_PLACEHOLDER =
	'> 图片导入失败：请在此处单独粘贴图片或通过图片上传功能补充。'

const IMAGE_PLACEHOLDER_PREFIX = 'RICHTEXTIMAGEPLACEHOLDER'
const IMAGE_PLACEHOLDER_SUFFIX = 'TOKEN'
const IMAGE_PLACEHOLDER_PATTERN = /RICHTEXTIMAGEPLACEHOLDER(?:X\d+I)?(\d+)TOKEN/g

const DANGEROUS_SCHEMES = new Set(['javascript', 'vbscript', 'data', 'file'])
const SAFE_LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
const DANGEROUS_ELEMENTS = new Set([
	'applet',
	'audio',
	'base',
	'button',
	'canvas',
	'embed',
	'form',
	'frame',
	'frameset',
	'iframe',
	'link',
	'meta',
	'noscript',
	'object',
	'script',
	'select',
	'source',
	'style',
	'svg',
	'template',
	'textarea',
	'title',
	'track',
	'video',
	'xml'
])

export type RichTextImageKind = 'remote' | 'data' | 'blob' | 'relative' | 'local' | 'unsupported'

export type RichTextImageDescriptor = {
	index: number
	placeholder: string
	src: string
	alt: string
	kind: RichTextImageKind
	filenameHint: string
}

export type RichTextImportResult = {
	markdownTemplate: string
	images: RichTextImageDescriptor[]
	complexTableCount: number
}

export type RichTextHtmlParser = (html: string) => Document

export type RichTextImageReplacementCollection =
	| readonly (string | null | undefined)[]
	| Readonly<Record<string, string | null | undefined>>
	| ReadonlyMap<string, string | null | undefined>

function extractClipboardFragment(html: string): string {
	const fragmentMatch = html.match(/<!--\s*StartFragment\s*-->([\s\S]*?)<!--\s*EndFragment\s*-->/i)
	if (fragmentMatch) return fragmentMatch[1]

	const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)
	return bodyMatch ? bodyMatch[1] : html
}

function expandOfficeConditionalComments(html: string): string {
	const preferFallbackImage = html
		.replace(
			/<!--\s*\[if\s+(?:gte\s+)?(?:vml|mso)\b[^\]]*\]>[\s\S]*?<!\s*\[endif\]\s*-->\s*<!--\s*\[if\s+!vml[^\]]*\]>\s*<!-->([\s\S]*?)<!--\s*<!\s*\[endif\]\s*-->/gi,
			'$1'
		)
		.replace(
			/<!--\s*\[if\s+(?:gte\s+)?(?:vml|mso)\b[^\]]*\]>[\s\S]*?<!\s*\[endif\]\s*-->\s*<!\s*\[if\s+!vml[^\]]*\]>([\s\S]*?)<!\s*\[endif\]\s*>/gi,
			'$1'
		)

	return preferFallbackImage
		.replace(/<!--\s*\[if\s+[^\]]+\]>([\s\S]*?)<!\s*\[endif\]\s*-->/gi, '$1')
		.replace(/<!--\s*\[if\s+[^\]]+\]>\s*<!-->([\s\S]*?)<!--\s*<!\s*\[endif\]\s*-->/gi, '$1')
}

export function hasMeaningfulRichHtml(html: string): boolean {
	if (!html || !html.trim()) return false

	const fragment = expandOfficeConditionalComments(extractClipboardFragment(html))
	const withoutDangerousContent = fragment
		.replace(/<\s*(script|style|noscript|template)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '')
	const text = withoutDangerousContent
		.replace(/<[^>]+>/g, '')
		.replace(/(?:&nbsp;|&#160;|&#x0*a0;)/gi, ' ')
		.replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
		.trim()
	const hasStandaloneContent = /<(?:img|table|hr)\b|<v:(?:imagedata|shape|image)\b/i.test(withoutDangerousContent)

	if (!text && !hasStandaloneContent) return false

	return (
		/<\/?(?:a|b|blockquote|br|code|del|div|em|font|h[1-6]|hr|i|img|li|ol|p|pre|s|strike|strong|sub|sup|table|tbody|td|tfoot|th|thead|tr|u|ul)\b/i.test(
			withoutDangerousContent
		) ||
		/(?:class|style)\s*=\s*["'][^"']*(?:Mso|mso-|font-weight|font-style|text-decoration)/i.test(withoutDangerousContent) ||
		/<(?:o|v|w|st1):[a-z]/i.test(withoutDangerousContent)
	)
}

export function sanitizeLinkHref(href: string | null | undefined): string | null {
	if (href == null) return null

	const value = href.trim()
	if (!value) return null

	const cleanValue = value.replace(/[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, '')
	if (!cleanValue) return null
	const schemeMatch = cleanValue.match(/^([a-z][a-z\d+.-]*):/i)
	if (!schemeMatch) return cleanValue

	const scheme = schemeMatch[1].toLowerCase()
	if (DANGEROUS_SCHEMES.has(scheme)) return null
	return SAFE_LINK_SCHEMES.has(scheme) ? cleanValue : null
}

export function sanitizeImageAlt(alt: string | null | undefined): string {
	const normalized = (alt || '')
		.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2060\ufeff]+/g, ' ')
		.replace(/\u00a0/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 160)

	if (!normalized) return ''
	if (/^(?:file:\/{2,}|[a-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|private|storage|mnt|data)\/)/i.test(normalized)) {
		return ''
	}

	const filename = normalized.split(/[\\/]/).at(-1) || normalized
	const stem = filename.replace(/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i, '')
	if (/^(?:(?:image|img|photo|picture|图片|图像)[-_ ]*\d{1,8})$/i.test(stem)) return ''
	if (/^(?:[a-f\d]{16,}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(stem)) return ''

	return normalized
}

export function normalizeMarkdownSpacing(markdown: string): string {
	const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
	const normalized: string[] = []
	let activeFence: { character: '`' | '~'; length: number } | null = null
	let previousWasEmpty = false

	for (const originalLine of lines) {
		const line: string = activeFence ? originalLine : originalLine.replace(/\u00a0/g, ' ')

		if (activeFence) {
			normalized.push(line)
			const closingPattern = new RegExp(`^ {0,3}${activeFence.character}{${activeFence.length},}\\s*$`)
			if (closingPattern.test(line)) activeFence = null
			continue
		}

		const opening: RegExpMatchArray | null = line.match(/^ {0,3}(`{3,}|~{3,})(?:[^`~]*)$/)
		if (opening) {
			const marker: string = opening[1]
			activeFence = { character: marker[0] as '`' | '~', length: marker.length }
			normalized.push(line)
			previousWasEmpty = false
			continue
		}

		if (line.trim() === '') {
			if (normalized.at(-1)?.endsWith('  ')) {
				previousWasEmpty = false
				continue
			}
			if (!previousWasEmpty) normalized.push(line)
			previousWasEmpty = true
			continue
		}

		normalized.push(line)
		previousWasEmpty = false
	}

	while (normalized[0] === '') normalized.shift()
	while (normalized.at(-1) === '') normalized.pop()
	return normalized.join('\n')
}

function defaultParseHtml(html: string): Document {
	if (typeof DOMParser === 'undefined') {
		throw new Error('DOMParser is unavailable; provide parseHtml when converting outside the browser')
	}
	return new DOMParser().parseFromString(html, 'text/html')
}

function removeNode(node: Node): void {
	node.parentNode?.removeChild(node)
}

function unwrapElement(element: Element): void {
	const parent = element.parentNode
	if (!parent) return
	while (element.firstChild) parent.insertBefore(element.firstChild, element)
	parent.removeChild(element)
}

function removeComments(root: Element): void {
	const visit = (node: Node) => {
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === 8) removeNode(child)
			else visit(child)
		}
	}
	visit(root)
}

function convertVmlImages(root: Element, document: Document): void {
	const createImageFromVml = (element: Element): HTMLImageElement => {
		const image = document.createElement('img')
		const src =
			element.getAttribute('src') ||
			element.getAttribute('o:href') ||
			element.getAttribute('href') ||
			element.getAttribute('data') ||
			''
		const alt =
			element.getAttribute('o:title') ||
			element.getAttribute('title') ||
			element.getAttribute('alt') ||
			''
		if (src) image.setAttribute('src', src)
		if (alt) image.setAttribute('alt', alt)
		return image
	}

	const imageDataCandidates = Array.from(root.querySelectorAll('*')).filter(element => {
		const tagName = element.tagName.toLowerCase()
		return (
			tagName === 'imagedata' ||
			tagName.endsWith(':imagedata') ||
			((tagName === 'fill' || tagName.endsWith(':fill')) && Boolean(element.getAttribute('src')))
		)
	})

	for (const element of imageDataCandidates) {
		if (!element.parentNode) continue
		element.parentNode.replaceChild(createImageFromVml(element), element)
	}

	const shapeCandidates = Array.from(root.querySelectorAll('*')).filter(element => {
		const tagName = element.tagName.toLowerCase()
		return tagName === 'shape' || tagName.endsWith(':shape') || tagName.endsWith(':image')
	})

	for (const shape of shapeCandidates) {
		if (!shape.parentNode) continue
		const nestedImages = Array.from(shape.querySelectorAll('img'))
		if (nestedImages.length === 0) {
			shape.parentNode.replaceChild(createImageFromVml(shape), shape)
			continue
		}

		for (const image of nestedImages) shape.parentNode.insertBefore(image, shape)
		removeNode(shape)
	}
}

function getWordListMarker(element: Element): { marker: string; markerElement: Element | null } {
	const markerElement = Array.from(element.querySelectorAll('span')).find(span => /mso-list\s*:\s*ignore/i.test(span.getAttribute('style') || '')) || null
	const source = markerElement?.textContent || element.textContent || ''
	const marker = source
		.replace(/\u00a0/g, ' ')
		.trim()
		.match(
			/^(?:[\u00b7\u2022\u25aa\u25cf\u25cb\u25e6\uf0b7]|[oO](?=\s)|(?:\d+|[a-z])[.)、]|[（(](?:\d+|[a-z]|[一二三四五六七八九十百千]+)[）)]|[一二三四五六七八九十百千]+[、.．])/i
		)?.[0]
	return { marker: marker || '', markerElement }
}

function isOrderedWordListMarker(marker: string): boolean {
	return !/^[\u00b7\u2022\u25aa\u25cf\u25cb\u25e6\uf0b7o]$/i.test(marker)
}

function isWordListParagraph(element: Element): boolean {
	const className = element.getAttribute('class') || ''
	const style = element.getAttribute('style') || ''
	return /MsoListParagraph/i.test(className) || /mso-list\s*:/i.test(style)
}

function stripLeadingListMarker(element: Element, marker: string): void {
	const findFirstTextNode = (node: Node): Text | null => {
		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === 3 && child.nodeValue && child.nodeValue.trim()) return child as Text
			const nested = findFirstTextNode(child)
			if (nested) return nested
		}
		return null
	}
	const textNode = findFirstTextNode(element)
	if (textNode?.nodeValue) {
		const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		textNode.nodeValue = textNode.nodeValue.replace(new RegExp(`^(?:\\s|\\u00a0)*${escapedMarker}(?:\\s|\\u00a0)*`, 'i'), '')
	}
}

function convertWordPseudoLists(root: Element, document: Document): void {
	const candidates = Array.from(root.querySelectorAll('p, div')).filter(isWordListParagraph)
	const processed = new Set<Element>()

	for (const first of candidates) {
		if (processed.has(first) || !first.parentNode) continue
		const firstMarker = getWordListMarker(first)
		if (!firstMarker.marker) continue
		const listTag = isOrderedWordListMarker(firstMarker.marker) ? 'ol' : 'ul'
		const list = document.createElement(listTag)
		first.parentNode.insertBefore(list, first)

		let current: Element | null = first
		while (current && isWordListParagraph(current) && current.parentNode === list.parentNode) {
			const currentMarker = getWordListMarker(current)
			if (!currentMarker.marker) break
			const currentListTag = isOrderedWordListMarker(currentMarker.marker) ? 'ol' : 'ul'
			if (currentListTag !== listTag) break

			const next: Element | null = current.nextElementSibling
			if (currentMarker.markerElement) removeNode(currentMarker.markerElement)
			else stripLeadingListMarker(current, currentMarker.marker)

			const item = document.createElement('li')
			while (current.firstChild) item.appendChild(current.firstChild)
			list.appendChild(item)
			processed.add(current)
			removeNode(current)
			current = next
		}
	}
}

function semanticizeStyledText(root: Element, document: Document): void {
	for (const element of Array.from(root.querySelectorAll('span, font'))) {
		if (!element.parentNode) continue
		const style = element.getAttribute('style') || ''
		const tags: Array<'strong' | 'em' | 'del'> = []
		if (/(?:font-weight|mso-bidi-font-weight)\s*:\s*(?:bold|[6-9]00)/i.test(style)) tags.push('strong')
		if (/(?:font-style|mso-bidi-font-style)\s*:\s*italic/i.test(style)) tags.push('em')
		if (/text-decoration(?:-line)?\s*:[^;]*line-through/i.test(style)) tags.push('del')
		if (tags.length === 0) continue

		let outer: Element | null = null
		let inner: Element | null = null
		for (const tag of tags) {
			const wrapper = document.createElement(tag)
			if (!outer) outer = wrapper
			if (inner) inner.appendChild(wrapper)
			inner = wrapper
		}
		if (!outer || !inner) continue
		while (element.firstChild) inner.appendChild(element.firstChild)
		element.parentNode.replaceChild(outer, element)
	}
}

function removeDangerousAndHiddenElements(root: Element): void {
	for (const element of Array.from(root.querySelectorAll('*'))) {
		if (!element.parentNode) continue
		const tagName = element.tagName.toLowerCase()
		const localName = tagName.split(':').at(-1) || tagName
		const style = element.getAttribute('style') || ''
		const hidden =
			element.hasAttribute('hidden') ||
			element.getAttribute('aria-hidden')?.toLowerCase() === 'true' ||
			/(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all)/i.test(style)

		if (hidden || DANGEROUS_ELEMENTS.has(tagName) || DANGEROUS_ELEMENTS.has(localName)) {
			removeNode(element)
			continue
		}
		if (tagName.startsWith('v:')) {
			unwrapElement(element)
			continue
		}

		if (tagName === 'input') {
			const input = element as HTMLInputElement
			if ((input.getAttribute('type') || '').toLowerCase() !== 'checkbox') removeNode(input)
			else input.checked = input.hasAttribute('checked')
		}
	}
}

function sanitizeAnchors(root: Element): void {
	for (const anchor of Array.from(root.querySelectorAll('a'))) {
		const href = sanitizeLinkHref(anchor.getAttribute('href'))
		if (href) anchor.setAttribute('href', href)
		else anchor.removeAttribute('href')

		const title = (anchor.getAttribute('title') || '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim().slice(0, 256)
		if (title) anchor.setAttribute('title', title)
		else anchor.removeAttribute('title')
	}
}

function classifyImageSource(src: string): RichTextImageKind {
	if (!src) return 'unsupported'
	if (/^https?:\/\//i.test(src) || /^\/\//.test(src)) return 'remote'
	if (/^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);base64,/i.test(src)) return 'data'
	if (/^blob:/i.test(src)) return 'blob'
	if (/^(?:file|cid|mhtml):/i.test(src)) return 'local'
	if (/^[a-z][a-z\d+.-]*:/i.test(src)) return 'unsupported'
	return 'relative'
}

function dataImageExtension(src: string): string | null {
	const mime = src.match(/^data:image\/(png|jpeg|jpg|gif|webp|bmp|avif);base64,/i)?.[1]?.toLowerCase()
	if (!mime) return null
	return mime === 'jpeg' ? 'jpg' : mime
}

function buildFilenameHint(src: string, rawAlt: string, index: number): string {
	let candidate = ''
	try {
		if (/^https?:\/\//i.test(src) || /^\/\//.test(src) || !/^[a-z][a-z\d+.-]*:/i.test(src)) {
			const url = new URL(src.startsWith('//') ? `https:${src}` : src, 'https://rich-text-import.invalid')
			candidate = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '')
		}
	} catch {
		candidate = ''
	}

	if (!candidate && /[.][a-z\d]{2,8}$/i.test(rawAlt.trim())) candidate = rawAlt.trim()
	const inferredExtension = dataImageExtension(src)
	if (!candidate) candidate = `rich-text-image-${index + 1}${inferredExtension ? `.${inferredExtension}` : ''}`

	candidate = candidate
		.replace(/[\u0000-\u001f\u007f-\u009f<>:"/\\|?*]+/g, '-')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[-.]+|[-.]+$/g, '')
		.slice(0, 96)

	return candidate || `rich-text-image-${index + 1}`
}

function createImagePlaceholderNamespace(source: string): string {
	let serial = 0
	while (source.includes(`${IMAGE_PLACEHOLDER_PREFIX}X${serial}I`)) serial += 1
	return `X${serial}I`
}

function makeImagePlaceholder(index: number, namespace: string): string {
	return `${IMAGE_PLACEHOLDER_PREFIX}${namespace}${String(index).padStart(4, '0')}${IMAGE_PLACEHOLDER_SUFFIX}`
}

function isPlaceholderImageSource(src: string): boolean {
	return !src || /^(?:about:blank|#|data:image\/gif;base64,R0lGODlhAQABA)/i.test(src)
}

function extractImages(root: Element, document: Document, namespace: string): RichTextImageDescriptor[] {
	return Array.from(root.querySelectorAll('img')).map((image, index) => {
		const primarySrc = (image.getAttribute('src') || '').trim()
		const lazySrc = (image.getAttribute('data-src') || image.getAttribute('data-original-src') || '').trim()
		const src = (isPlaceholderImageSource(primarySrc) && lazySrc ? lazySrc : primarySrc || lazySrc || image.getAttribute('o:href') || '').trim()
		const rawAlt = image.getAttribute('alt') || image.getAttribute('title') || ''
		const descriptor: RichTextImageDescriptor = {
			index,
			placeholder: makeImagePlaceholder(index, namespace),
			src,
			alt: sanitizeImageAlt(rawAlt),
			kind: classifyImageSource(src),
			filenameHint: buildFilenameHint(src, rawAlt, index)
		}
		image.parentNode?.replaceChild(document.createTextNode(descriptor.placeholder), image)
		return descriptor
	})
}

function getDirectTableRows(table: Element): Element[] {
	const rows: Element[] = []
	for (const child of Array.from(table.children)) {
		const tagName = child.tagName.toLowerCase()
		if (tagName === 'tr') rows.push(child)
		else if (tagName === 'thead' || tagName === 'tbody' || tagName === 'tfoot') {
			rows.push(...Array.from(child.children).filter(row => row.tagName.toLowerCase() === 'tr'))
		}
	}
	return rows
}

function getDirectTableCells(row: Element): Element[] {
	return Array.from(row.children).filter(cell => {
		const tagName = cell.tagName.toLowerCase()
		return tagName === 'td' || tagName === 'th'
	})
}

const COMPLEX_CELL_BLOCK_TAGS = new Set([
	'address',
	'article',
	'blockquote',
	'div',
	'dl',
	'figure',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'ol',
	'p',
	'pre',
	'section',
	'ul'
])

function cellHasMultipleComplexBlocks(container: Element): boolean {
	const directBlocks = Array.from(container.children).filter(child =>
		COMPLEX_CELL_BLOCK_TAGS.has(child.tagName.toLowerCase())
	)
	if (directBlocks.length > 1) return true
	return directBlocks.some(cellHasMultipleComplexBlocks)
}

function isComplexTable(table: Element): boolean {
	if (table.querySelector('table')) return true
	const rows = getDirectTableRows(table)
	if (rows.length === 0) return false
	const widths = rows.map(row => getDirectTableCells(row).length)
	if (widths.some(width => width === 0 || width !== widths[0])) return true

	return rows.some(row =>
		getDirectTableCells(row).some(cell => {
			const colspan = Number.parseInt(cell.getAttribute('colspan') || '1', 10)
			const rowspan = Number.parseInt(cell.getAttribute('rowspan') || '1', 10)
			return (
				!Number.isFinite(colspan) ||
				!Number.isFinite(rowspan) ||
				colspan < 1 ||
				rowspan < 1 ||
				colspan > 1 ||
				rowspan > 1 ||
				Boolean(cell.querySelector('br')) ||
				cellHasMultipleComplexBlocks(cell)
			)
		})
	)
}

function elementDepth(element: Element): number {
	let depth = 0
	let current = element.parentElement
	while (current) {
		depth += 1
		current = current.parentElement
	}
	return depth
}

function normalizeCellText(cell: Element): string {
	const collectText = (node: Node): string => {
		if (node.nodeType === 3) return node.nodeValue || ''
		if (node.nodeType !== 1) return ''
		const element = node as Element
		const tagName = element.tagName.toLowerCase()
		if (tagName === 'br') return ' '
		const content = Array.from(element.childNodes).map(collectText).join('')
		return COMPLEX_CELL_BLOCK_TAGS.has(tagName) || tagName === 'li' ? ` ${content} ` : content
	}

	return Array.from(cell.childNodes)
		.map(collectText)
		.join(' ')
		.replace(/\u00a0/g, ' ')
		.replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
}

function replaceComplexTable(table: Element, document: Document, ordinal: number): void {
	const group = document.createElement('div')
	const title = document.createElement('p')
	const strong = document.createElement('strong')
	strong.textContent = `表格 ${ordinal}`
	title.appendChild(strong)
	group.appendChild(title)

	const list = document.createElement('ul')
	const rows = getDirectTableRows(table)
	rows.forEach((row, rowIndex) => {
		const cells = getDirectTableCells(row)
		const values = (cells.length ? cells.map(normalizeCellText) : [normalizeCellText(row)]).map(value => value || '（空）')
		const item = document.createElement('li')
		item.textContent = `第 ${rowIndex + 1} 行：${values.join(' ｜ ')}`
		list.appendChild(item)
	})
	if (rows.length === 0) {
		const item = document.createElement('li')
		item.textContent = normalizeCellText(table) || '（空表格）'
		list.appendChild(item)
	}
	group.appendChild(list)
	table.parentNode?.replaceChild(group, table)
}

function ensureSimpleTableHeading(table: Element, document: Document): void {
	const rows = getDirectTableRows(table)
	if (rows.length === 0) {
		removeNode(table)
		return
	}

	const firstRow = rows[0]
	let head = Array.from(table.children).find(child => child.tagName.toLowerCase() === 'thead') || null
	if (!head) {
		head = document.createElement('thead')
		table.insertBefore(head, table.firstChild)
	}
	if (firstRow.parentElement !== head) head.appendChild(firstRow)

	for (const cell of getDirectTableCells(firstRow)) {
		if (cell.tagName.toLowerCase() === 'th') continue
		const headingCell = document.createElement('th')
		for (const attribute of Array.from(cell.attributes)) headingCell.setAttribute(attribute.name, attribute.value)
		while (cell.firstChild) headingCell.appendChild(cell.firstChild)
		cell.parentNode?.replaceChild(headingCell, cell)
	}
}

function normalizeTables(root: Element, document: Document): number {
	const tables = Array.from(root.querySelectorAll('table'))
	const complexTables = tables.filter(isComplexTable)
	const ordinal = new Map(complexTables.map((table, index) => [table, index + 1]))

	for (const table of [...complexTables].sort((left, right) => elementDepth(right) - elementDepth(left))) {
		if (table.parentNode) replaceComplexTable(table, document, ordinal.get(table) || 1)
	}
	for (const table of tables) {
		if (table.parentNode && !complexTables.includes(table)) ensureSimpleTableHeading(table, document)
	}
	return complexTables.length
}

function cleanOfficeMarkupAndAttributes(root: Element): void {
	for (const element of Array.from(root.querySelectorAll('*'))) {
		if (!element.parentNode) continue
		const tagName = element.tagName.toLowerCase()
		if (tagName.startsWith('o:') || tagName.startsWith('w:') || tagName.startsWith('st1:')) {
			unwrapElement(element)
			continue
		}

		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase()
			const keep =
				(tagName === 'a' && (name === 'href' || name === 'title')) ||
				(tagName === 'ol' && name === 'start') ||
				(tagName === 'input' && (name === 'type' || name === 'checked')) ||
				((tagName === 'td' || tagName === 'th') && name === 'align') ||
				((tagName === 'code' || tagName === 'div') && name === 'class' && /(?:language-|highlight-source-)/i.test(attribute.value))
			if (!keep || name.startsWith('on')) element.removeAttribute(attribute.name)
		}
	}
}

function createTurndownService(): TurndownService {
	const escapeTablePipes = (content: string): string => {
		let output = ''
		for (const character of content) {
			if (character === '|') {
				let backslashCount = 0
				for (let index = output.length - 1; index >= 0 && output[index] === '\\'; index -= 1) backslashCount += 1
				if (backslashCount % 2 === 0) output += '\\'
			}
			output += character
		}
		return output
	}

	const service = new TurndownService({
		headingStyle: 'atx',
		hr: '---',
		br: '  \n',
		bulletListMarker: '-',
		codeBlockStyle: 'fenced',
		fence: '```',
		emDelimiter: '*',
		strongDelimiter: '**',
		linkStyle: 'inlined',
		preformattedCode: true
	})
	service.use(gfm)
	service.addRule('safeGfmTableCell', {
		filter: ['th', 'td'],
		replacement: (content, node) => {
			const normalized = escapeTablePipes(content.trim().replace(/\s*\n+\s*/g, ' '))
			const siblings = Array.from((node.parentNode as Element | null)?.children || [])
			return `${siblings.indexOf(node as Element) === 0 ? '| ' : ' '}${normalized} |`
		}
	})
	service.addRule('gfmDoubleTildeStrikethrough', {
		filter: node => ['DEL', 'S', 'STRIKE'].includes(node.nodeName),
		replacement: content => `~~${content}~~`
	})
	return service
}

export function convertRichHtmlToMarkdown(html: string, parseHtml: RichTextHtmlParser = defaultParseHtml): RichTextImportResult {
	if (!html || !html.trim()) return { markdownTemplate: '', images: [], complexTableCount: 0 }

	try {
		const fragment = expandOfficeConditionalComments(extractClipboardFragment(html))
		const placeholderNamespace = createImagePlaceholderNamespace(fragment)
		const document = parseHtml(`<!doctype html><html><head></head><body>${fragment}</body></html>`)
		const root = document.body
		if (!root) throw new Error('Parsed HTML has no body')

		convertVmlImages(root, document)
		convertWordPseudoLists(root, document)
		semanticizeStyledText(root, document)
		removeDangerousAndHiddenElements(root)
		removeComments(root)
		sanitizeAnchors(root)
		const images = extractImages(root, document, placeholderNamespace)
		const complexTableCount = normalizeTables(root, document)
		cleanOfficeMarkupAndAttributes(root)

		const markdownTemplate = normalizeMarkdownSpacing(createTurndownService().turndown(root.innerHTML))
		return { markdownTemplate, images, complexTableCount }
	} catch {
		return {
			markdownTemplate: RICH_TEXT_IMPORT_FAILURE_PLACEHOLDER,
			images: [],
			complexTableCount: 0
		}
	}
}

function formatImageReplacement(replacement: string | null | undefined): string {
	if (typeof replacement === 'string' && replacement.trim()) {
		return replacement === RICH_TEXT_IMAGE_FAILURE_PLACEHOLDER ? `\n\n${replacement}\n\n` : replacement
	}
	return `\n\n${RICH_TEXT_IMAGE_FAILURE_PLACEHOLDER}\n\n`
}

export function replaceRichTextImagePlaceholders(template: string, replacements: RichTextImageReplacementCollection): string {
	if (!Array.isArray(replacements)) {
		const entries =
			typeof (replacements as ReadonlyMap<string, string | null | undefined>).entries === 'function'
				? [...(replacements as ReadonlyMap<string, string | null | undefined>).entries()]
				: Object.entries(replacements as Readonly<Record<string, string | null | undefined>>)
		return entries.reduce(
			(output, [placeholder, replacement]) => output.split(placeholder).join(formatImageReplacement(replacement)),
			template
		)
	}

	IMAGE_PLACEHOLDER_PATTERN.lastIndex = 0
	return template.replace(IMAGE_PLACEHOLDER_PATTERN, (_placeholder, rawIndex: string) => {
		const index = Number.parseInt(rawIndex, 10)
		return formatImageReplacement(replacements[index])
	})
}
