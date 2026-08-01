export const WORD_RTF_IMAGE_LIMITS = {
	maxImageBytes: 10 * 1024 * 1024,
	maxImageCount: 30,
	maxTotalBytes: 50 * 1024 * 1024,
	maxRtfCharacters: 110 * 1024 * 1024
} as const

type RtfRasterFormat = 'png' | 'jpeg'
type WordRtfPictContext = 'primary' | 'fallback' | 'listpicture'

type ControlWord = {
	word: string
	parameter: number | null
	nextIndex: number
}

type ParsedPict =
	| { status: 'success'; format: RtfRasterFormat; bytes: Uint8Array }
	| { status: 'unsupported' }
	| { status: 'failed'; format: RtfRasterFormat | null; error: string }

export type WordRtfImageImportResult = {
	files: File[]
	entries: WordRtfPictEntry[]
	pictCount: number
	rasterCount: number
	unsupportedCount: number
	failedCount: number
	formats: { png: number; jpeg: number }
	errors: string[]
}

export type WordRtfPictEntry =
	| { index: number; context: WordRtfPictContext; status: 'success'; format: RtfRasterFormat; file: File }
	| { index: number; context: WordRtfPictContext; status: 'unsupported'; format: null }
	| { index: number; context: WordRtfPictContext; status: 'failed'; format: RtfRasterFormat | null; error: string }

type WordHtmlImageDescriptor = {
	kind: string
}

function readControlWord(rtf: string, slashIndex: number): ControlWord {
	let index = slashIndex + 1
	if (index >= rtf.length) return { word: '', parameter: null, nextIndex: index }
	if (!/[a-z]/i.test(rtf[index])) return { word: '', parameter: null, nextIndex: Math.min(rtf.length, index + 1) }

	const wordStart = index
	while (index < rtf.length && /[a-z]/i.test(rtf[index])) index += 1
	const word = rtf.slice(wordStart, index).toLowerCase()
	let sign = 1
	if (rtf[index] === '-') {
		sign = -1
		index += 1
	}
	const numberStart = index
	while (index < rtf.length && /\d/.test(rtf[index])) index += 1
	const parameter = index > numberStart ? sign * Number(rtf.slice(numberStart, index)) : null
	if (rtf[index] === ' ') index += 1
	return { word, parameter, nextIndex: index }
}

function findGroupEnd(rtf: string, start: number): number {
	let depth = 0
	for (let index = start; index < rtf.length; ) {
		const character = rtf[index]
		if (character === '{') {
			depth += 1
			index += 1
			continue
		}
		if (character === '}') {
			depth -= 1
			if (depth === 0) return index
			index += 1
			continue
		}
		if (character === '\\') {
			const control = readControlWord(rtf, index)
			index = control.nextIndex
			if (control.word === 'bin' && control.parameter != null && control.parameter >= 0) index += control.parameter
			continue
		}
		index += 1
	}
	return -1
}

function isPictGroupStart(rtf: string, index: number): boolean {
	if (rtf[index] !== '{') return false
	let cursor = index + 1
	while (/\s/.test(rtf[cursor] || '')) cursor += 1
	if (rtf[cursor] !== '\\') return false
	return readControlWord(rtf, cursor).word === 'pict'
}

function groupDestination(rtf: string, groupStart: number): string | null {
	let cursor = groupStart + 1
	while (/\s/.test(rtf[cursor] || '')) cursor += 1
	if (rtf[cursor] !== '\\') return null
	if (rtf[cursor + 1] === '*') {
		cursor += 2
		while (/\s/.test(rtf[cursor] || '')) cursor += 1
		if (rtf[cursor] !== '\\') return null
	}
	return readControlWord(rtf, cursor).word || null
}

function inspectPictContexts(rtf: string): Map<number, WordRtfPictContext> {
	const contexts = new Map<number, WordRtfPictContext>()
	const destinations: Array<string | null> = []
	for (let index = 0; index < rtf.length; ) {
		const character = rtf[index]
		if (character === '{') {
			const destination = groupDestination(rtf, index)
			if (destination === 'pict') {
				const context = destinations.includes('listpicture') ? 'listpicture' : destinations.includes('nonshppict') ? 'fallback' : 'primary'
				contexts.set(index, context)
			}
			destinations.push(destination)
			index += 1
			continue
		}
		if (character === '}') {
			destinations.pop()
			index += 1
			continue
		}
		if (character === '\\') {
			const control = readControlWord(rtf, index)
			index = control.nextIndex
			if (control.word === 'bin' && control.parameter != null && control.parameter >= 0) index += control.parameter
			continue
		}
		index += 1
	}
	return contexts
}

function matchesMagic(bytes: Uint8Array, format: RtfRasterFormat): boolean {
	if (format === 'png') {
		const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
		return signature.every((value, index) => bytes[index] === value)
	}
	return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function parsePictGroup(rtf: string, start: number, end: number): ParsedPict {
	let depth = 1
	let format: RtfRasterFormat | null = null
	let hasBinaryData = false
	let hexLength = 0
	const hexParts: string[] = []

	for (let index = start + 1; index < end; ) {
		const character = rtf[index]
		if (character === '{') {
			depth += 1
			index += 1
			continue
		}
		if (character === '}') {
			depth -= 1
			index += 1
			continue
		}
		if (character === '\\') {
			const control = readControlWord(rtf, index)
			if (depth === 1 && control.word === 'pngblip') format = 'png'
			if (depth === 1 && control.word === 'jpegblip') format = 'jpeg'
			if (control.word === 'bin' && control.parameter != null && control.parameter >= 0) {
				hasBinaryData = true
				index = control.nextIndex + control.parameter
			} else {
				index = control.nextIndex
			}
			continue
		}
		if (depth !== 1 || /\s/.test(character)) {
			index += 1
			continue
		}
		if (/[a-f\d]/i.test(character)) {
			const hexStart = index
			while (index < end && /[a-f\d]/i.test(rtf[index])) index += 1
			const part = rtf.slice(hexStart, index)
			hexLength += part.length
			if (hexLength > WORD_RTF_IMAGE_LIMITS.maxImageBytes * 2) {
				return { status: 'failed', format, error: 'RTF 图片超过 10 MB' }
			}
			hexParts.push(part)
			continue
		}
		index += 1
	}

	if (!format) return { status: 'unsupported' }
	if (hasBinaryData) return { status: 'failed', format, error: 'RTF bin 图片暂不支持' }
	if (hexLength === 0 || hexLength % 2 !== 0) return { status: 'failed', format, error: 'RTF 图片数据不完整' }

	const hex = hexParts.join('')
	const bytes = new Uint8Array(hex.length / 2)
	for (let index = 0; index < hex.length; index += 2) {
		const value = Number.parseInt(hex.slice(index, index + 2), 16)
		if (!Number.isFinite(value)) return { status: 'failed', format, error: 'RTF 图片包含无效数据' }
		bytes[index / 2] = value
	}
	if (!matchesMagic(bytes, format)) return { status: 'failed', format, error: 'RTF 图片格式与内容不一致' }
	return { status: 'success', format, bytes }
}

function emptyResult(error?: string): WordRtfImageImportResult {
	return {
		files: [],
		entries: [],
		pictCount: 0,
		rasterCount: 0,
		unsupportedCount: 0,
		failedCount: error ? 1 : 0,
		formats: { png: 0, jpeg: 0 },
		errors: error ? [error] : []
	}
}

export function extractWordRtfRasterImages(rtf: string): WordRtfImageImportResult {
	if (!rtf.trim()) return emptyResult()
	if (rtf.length > WORD_RTF_IMAGE_LIMITS.maxRtfCharacters) return emptyResult('RTF 内容超过安全处理上限')

	const result = emptyResult()
	const pictContexts = inspectPictContexts(rtf)
	let totalBytes = 0
	for (let index = 0; index < rtf.length; index += 1) {
		if (!isPictGroupStart(rtf, index)) continue
		const end = findGroupEnd(rtf, index)
		const pictIndex = result.pictCount
		const context = pictContexts.get(index) || 'primary'
		result.pictCount += 1
		if (end < 0) {
			result.failedCount += 1
			const error = 'RTF 图片分组不完整'
			result.errors.push(error)
			result.entries.push({ index: pictIndex, context, status: 'failed', format: null, error })
			break
		}

		const parsed = parsePictGroup(rtf, index, end)
		index = end
		if (parsed.status === 'unsupported') {
			result.unsupportedCount += 1
			result.entries.push({ index: pictIndex, context, status: 'unsupported', format: null })
			continue
		}
		if (parsed.format) result.formats[parsed.format] += 1
		result.rasterCount += 1
		if (parsed.status === 'failed') {
			result.failedCount += 1
			result.errors.push(parsed.error)
			result.entries.push({ index: pictIndex, context, status: 'failed', format: parsed.format, error: parsed.error })
			continue
		}
		if (result.files.length >= WORD_RTF_IMAGE_LIMITS.maxImageCount) {
			result.failedCount += 1
			const error = '单次粘贴最多导入 30 张图片'
			result.errors.push(error)
			result.entries.push({ index: pictIndex, context, status: 'failed', format: parsed.format, error })
			continue
		}
		if (totalBytes + parsed.bytes.byteLength > WORD_RTF_IMAGE_LIMITS.maxTotalBytes) {
			result.failedCount += 1
			const error = '单次粘贴图片总大小超过 50 MB'
			result.errors.push(error)
			result.entries.push({ index: pictIndex, context, status: 'failed', format: parsed.format, error })
			continue
		}

		totalBytes += parsed.bytes.byteLength
		const extension = parsed.format === 'jpeg' ? 'jpg' : 'png'
		const mime = parsed.format === 'jpeg' ? 'image/jpeg' : 'image/png'
		const buffer = new ArrayBuffer(parsed.bytes.byteLength)
		new Uint8Array(buffer).set(parsed.bytes)
		const file = new File([buffer], `word-pasted-image-${result.files.length + 1}.${extension}`, { type: mime, lastModified: Date.now() })
		result.files.push(file)
		result.entries.push({ index: pictIndex, context, status: 'success', format: parsed.format, file })
	}

	return result
}

export function selectWordRtfFilesForHtmlImages(result: WordRtfImageImportResult, descriptors: readonly WordHtmlImageDescriptor[]): File[] {
	if (descriptors.length === 0 || descriptors.some(descriptor => descriptor.kind !== 'local')) return []
	const selectCompleteRepresentation = (entries: WordRtfPictEntry[]): File[] => {
		if (entries.length !== descriptors.length || entries.some(entry => entry.status !== 'success')) return []
		return entries.flatMap(entry => (entry.status === 'success' ? [entry.file] : []))
	}

	const primaryEntries = result.entries.filter(entry => entry.context === 'primary')
	const primaryFiles = selectCompleteRepresentation(primaryEntries)
	if (primaryFiles.length > 0) return primaryFiles

	const primaryHasUsableOrFailedImage = primaryEntries.some(entry => entry.status === 'success' || entry.status === 'failed')
	if (primaryHasUsableOrFailedImage) return []
	return selectCompleteRepresentation(result.entries.filter(entry => entry.context === 'fallback'))
}

export function logWordRtfImageDiagnostic(result: WordRtfImageImportResult, selectedCount: number): void {
	if (process.env.NODE_ENV !== 'development') return
	console.info(
		'[Word RTF image diagnostic]',
		JSON.stringify({
			pictCount: result.pictCount,
			rasterCount: result.rasterCount,
			acceptedCount: result.files.length,
			selectedCount,
			unsupportedCount: result.unsupportedCount,
			failedCount: result.failedCount,
			formats: result.formats,
			contexts: {
				primary: result.entries.filter(entry => entry.context === 'primary').length,
				fallback: result.entries.filter(entry => entry.context === 'fallback').length,
				listpicture: result.entries.filter(entry => entry.context === 'listpicture').length
			},
			errors: result.errors
		})
	)
}
