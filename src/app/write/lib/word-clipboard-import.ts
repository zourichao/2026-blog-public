import { hashFileSHA256 } from '@/lib/file-utils'

const WORD_HTML_PATTERN =
	/(?:class\s*=\s*["'][^"']*\bMso|\bmso-[a-z-]+\s*:|<\/?(?:o|v|w|st1):[a-z]|urn:schemas-microsoft-com|msohtmlclip|content\s*=\s*["'][^"']*Microsoft\s+Word)/i

const IMAGE_MIME_PATTERN = /^image\//i
const MAX_DIAGNOSTIC_IMAGE_NODES = 30

export type WordImageSourceKind = 'data' | 'blob' | 'http' | 'https' | 'file' | 'cid' | 'msohtmlclip' | 'other'
export type WordImageNodeKind = 'img' | 'v:imagedata' | 'shape/VML'

export type WordClipboardDiagnostic = {
	types: string[]
	items: Array<{ kind: string; type: string; getAsFile: boolean }>
	files: {
		count: number
		entries: Array<{ type: string; size: number; extension: string }>
	}
	formats: {
		hasHtml: boolean
		hasPlainText: boolean
		hasRtf: boolean
	}
	rtf: {
		length: number
		pictCount: number
		pngCount: number
		jpegCount: number
		unsupportedPictCount: number
	}
	htmlImages: {
		rawNodeCount: number
		logicalNodeCount: number
		truncated: boolean
		nodes: Array<{ node: WordImageNodeKind; source: WordImageSourceKind }>
	}
}

export type WordClipboardImageCandidate = {
	file: File
	source: 'items' | 'files'
}

export type WordClipboardSnapshot = {
	imageFiles: File[]
	imageCandidates: WordClipboardImageCandidate[]
	rtf: string
	diagnostic: WordClipboardDiagnostic
}

export type WordImportFeedback = {
	level: 'success' | 'warning'
	message: string
}

type ClipboardItemSnapshot = {
	kind: string
	type: string
	file: File | null
	hasFile: boolean
}

function imageFileFromItem(item: DataTransferItem, file: File | null): File | null {
	if (!file || !IMAGE_MIME_PATTERN.test(item.type)) return null
	if (IMAGE_MIME_PATTERN.test(file.type)) return file
	return new File([file], file.name, { type: item.type, lastModified: file.lastModified })
}

function getClipboardItemFile(item: DataTransferItem): File | null {
	if (item.kind !== 'file') return null
	try {
		return item.getAsFile()
	} catch {
		return null
	}
}

function getClipboardText(dataTransfer: DataTransfer, type: string): string {
	try {
		return dataTransfer.getData(type)
	} catch {
		return ''
	}
}

function fileExtensionOnly(name: string): string {
	const leaf = name.split(/[\\/]/).at(-1) || ''
	return leaf.match(/\.[a-z\d]{1,10}$/i)?.[0].toLowerCase() || ''
}

function attributeValue(tag: string, attribute: string): string {
	const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, 'i'))
	return (match?.[1] || match?.[2] || '').trim()
}

export function classifyWordImageSource(value: string): WordImageSourceKind {
	const source = value.trim()
	if (/msohtmlclip/i.test(source)) return 'msohtmlclip'
	if (/^data:/i.test(source)) return 'data'
	if (/^blob:/i.test(source)) return 'blob'
	if (/^https:/i.test(source)) return 'https'
	if (/^http:/i.test(source)) return 'http'
	if (/^file:/i.test(source)) return 'file'
	if (/^(?:cid|mhtml):/i.test(source)) return 'cid'
	return 'other'
}

function inspectWordHtmlImages(html: string): WordClipboardDiagnostic['htmlImages'] {
	type LocatedNode = { index: number; node: WordImageNodeKind; source: WordImageSourceKind }
	const nodes: LocatedNode[] = []
	const rawNodeCount = html.match(/<(?:img\b|v:(?:imagedata|shape|image)\b)/gi)?.length || 0
	const addMatches = (node: WordImageNodeKind, pattern: RegExp) => {
		for (const match of html.matchAll(pattern)) {
			const source = attributeValue(match[0], 'src') || attributeValue(match[0], 'o:href') || attributeValue(match[0], 'href')
			nodes.push({ index: match.index, node, source: classifyWordImageSource(source) })
		}
	}

	addMatches('img', /<img\b[^>]*>/gi)
	addMatches('v:imagedata', /<v:imagedata\b[^>]*>/gi)

	const handledShapeIndexes = new Set<number>()
	for (const match of html.matchAll(/<v:(shape|image)\b[^>]*>([\s\S]*?)<\/v:\1\s*>/gi)) {
		handledShapeIndexes.add(match.index)
		if (/<(?:img\b|v:imagedata\b)/i.test(match[2])) continue
		const openingTag = match[0].match(/^<v:(?:shape|image)\b[^>]*>/i)?.[0] || match[0]
		const source = attributeValue(openingTag, 'src') || attributeValue(openingTag, 'o:href') || attributeValue(openingTag, 'href')
		nodes.push({ index: match.index, node: 'shape/VML', source: classifyWordImageSource(source) })
	}
	for (const match of html.matchAll(/<v:(?:shape|image)\b[^>]*\/>/gi)) {
		if (handledShapeIndexes.has(match.index)) continue
		const source = attributeValue(match[0], 'src') || attributeValue(match[0], 'o:href') || attributeValue(match[0], 'href')
		nodes.push({ index: match.index, node: 'shape/VML', source: classifyWordImageSource(source) })
	}
	nodes.sort((left, right) => left.index - right.index)

	return {
		rawNodeCount,
		logicalNodeCount: nodes.length,
		truncated: nodes.length > MAX_DIAGNOSTIC_IMAGE_NODES,
		nodes: nodes.slice(0, MAX_DIAGNOSTIC_IMAGE_NODES).map(({ node, source }) => ({ node, source }))
	}
}

function inspectRtf(rtf: string): WordClipboardDiagnostic['rtf'] {
	const pictCount = rtf.match(/\\pict\b/gi)?.length || 0
	const pngCount = rtf.match(/\\pngblip\b/gi)?.length || 0
	const jpegCount = rtf.match(/\\jpegblip\b/gi)?.length || 0
	return {
		length: rtf.length,
		pictCount,
		pngCount,
		jpegCount,
		unsupportedPictCount: Math.max(0, pictCount - pngCount - jpegCount)
	}
}

export function isWordClipboardHtml(html: string): boolean {
	return WORD_HTML_PATTERN.test(html)
}

export function captureWordClipboard(dataTransfer: DataTransfer, html: string): WordClipboardSnapshot {
	const types = Array.from(dataTransfer.types || [])
	const itemSnapshots: ClipboardItemSnapshot[] = Array.from(dataTransfer.items || []).map(item => {
		const rawFile = getClipboardItemFile(item)
		const file = imageFileFromItem(item, rawFile)
		return { kind: item.kind, type: item.type, file, hasFile: rawFile !== null }
	})
	const dataTransferFiles = Array.from(dataTransfer.files || [])
	const rtf = getClipboardText(dataTransfer, 'text/rtf')
	const imageCandidates: WordClipboardImageCandidate[] = [
		...itemSnapshots.flatMap(item => (item.file ? [{ file: item.file, source: 'items' as const }] : [])),
		...dataTransferFiles.filter(file => IMAGE_MIME_PATTERN.test(file.type)).map(file => ({ file, source: 'files' as const }))
	]
	const imageFiles = imageCandidates.map(candidate => candidate.file)

	return {
		imageFiles,
		imageCandidates,
		rtf,
		diagnostic: {
			types,
			items: itemSnapshots.map(item => ({ kind: item.kind, type: item.type, getAsFile: item.hasFile })),
			files: {
				count: dataTransferFiles.length,
				entries: dataTransferFiles.map(file => ({
					type: file.type,
					size: file.size,
					extension: fileExtensionOnly(file.name)
				}))
			},
			formats: {
				hasHtml: types.includes('text/html') || Boolean(html),
				hasPlainText: types.includes('text/plain'),
				hasRtf: types.includes('text/rtf') || Boolean(rtf)
			},
			rtf: inspectRtf(rtf),
			htmlImages: inspectWordHtmlImages(html)
		}
	}
}

export async function dedupeWordClipboardImageFiles(candidates: readonly WordClipboardImageCandidate[]): Promise<File[]> {
	const hashedCandidates: Array<WordClipboardImageCandidate & { hash: string }> = []
	for (const candidate of candidates) {
		try {
			hashedCandidates.push({ ...candidate, hash: await hashFileSHA256(candidate.file) })
		} catch {
			// A hashing failure must not discard a browser-provided image candidate.
			hashedCandidates.push({ ...candidate, hash: `unhashed:${candidate.source}:${hashedCandidates.length}` })
		}
	}

	const items = hashedCandidates.filter(candidate => candidate.source === 'items')
	const files = hashedCandidates.filter(candidate => candidate.source === 'files')
	const primary = files.length >= items.length ? files : items
	const secondary = primary === files ? items : files
	const primaryCounts = new Map<string, number>()
	for (const candidate of primary) primaryCounts.set(candidate.hash, (primaryCounts.get(candidate.hash) || 0) + 1)
	const secondaryCounts = new Map<string, number>()
	const merged = [...primary]
	for (const candidate of secondary) {
		const occurrence = (secondaryCounts.get(candidate.hash) || 0) + 1
		secondaryCounts.set(candidate.hash, occurrence)
		if (occurrence > (primaryCounts.get(candidate.hash) || 0)) merged.push(candidate)
	}

	return merged.map(candidate => candidate.file)
}

export function logWordClipboardDiagnostic(diagnostic: WordClipboardDiagnostic): void {
	if (process.env.NODE_ENV !== 'development') return
	console.info('[Word clipboard diagnostic]', JSON.stringify(diagnostic))
}

export function hasDirectWordImageBinary(snapshot: WordClipboardSnapshot): boolean {
	return snapshot.imageFiles.length > 0
}

export function getWordImportFeedback(options: {
	localizedCount: number
	failedCount: number
	noUsableBinary: boolean
	hasRtfRaster: boolean
	fallbackMessage: string
}): WordImportFeedback {
	if (options.failedCount === 0) return { level: 'success', message: options.fallbackMessage }
	if (options.localizedCount === 0 && options.noUsableBinary && options.hasRtfRaster) {
		return {
			level: 'warning',
			message: `Word 仅向浏览器提供了 RTF 图片数据，这 ${options.failedCount} 张图片暂时无法安全读取，请单独粘贴图片。`
		}
	}
	if (options.localizedCount === 0 && options.noUsableBinary) {
		return {
			level: 'warning',
			message: `Word 未向浏览器提供这 ${options.failedCount} 张图片，请单独粘贴图片，或使用后续的 Word 文件导入功能。`
		}
	}
	return { level: 'warning', message: options.fallbackMessage }
}
