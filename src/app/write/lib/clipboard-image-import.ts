import type { ImageFileAddResult, ImageItem } from '../types'
import { RICH_TEXT_IMAGE_FAILURE_PLACEHOLDER, sanitizeImageAlt, type RichTextImageDescriptor } from './rich-text-import'

export const CLIPBOARD_IMAGE_LIMITS = {
	maxImageBytes: 10 * 1024 * 1024,
	maxImageCount: 30,
	maxTotalBytes: 50 * 1024 * 1024,
	remoteTimeoutMs: 10_000
} as const

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const REMOTE_IMPORT_CONCURRENCY = 4

type FileImageItem = Extract<ImageItem, { type: 'file' }>
type AddFilesWithMapping = (files: File[]) => Promise<ImageFileAddResult[]>

type ResolvedImage =
	| { kind: 'file'; file: File }
	| { kind: 'external'; url: string }
	| { kind: 'failed'; error: string }

type ImageLimitState = {
	acceptedCount: number
	acceptedBytes: number
}

class ImageImportLimitError extends Error {}

export type ImportedImageResult = {
	originalIndex: number
	item: FileImageItem | null
	status: 'added' | 'existing' | 'external' | 'failed'
	markdown: string
	error?: string
}

export type ClipboardImageImportResult = {
	results: ImportedImageResult[]
	replacements: Map<string, string>
	localizedCount: number
	externalCount: number
	failedCount: number
	uniqueImageCount: number
}

function normalizeMimeType(type: string): string {
	return type.split(';', 1)[0].trim().toLowerCase()
}

function extensionForMime(type: string): string | null {
	switch (normalizeMimeType(type)) {
		case 'image/png':
			return '.png'
		case 'image/jpeg':
			return '.jpg'
		case 'image/webp':
			return '.webp'
		case 'image/gif':
			return '.gif'
		default:
			return null
	}
}

function isAllowedImageFile(file: Blob): boolean {
	return file.size > 0 && ALLOWED_IMAGE_MIME_TYPES.has(normalizeMimeType(file.type))
}

function markdownAlt(alt: string): string {
	return sanitizeImageAlt(alt).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/]/g, '\\]')
}

function localImageMarkdown(alt: string, id: string): string {
	return `![${markdownAlt(alt)}](local-image:${id})`
}

function externalImageMarkdown(alt: string, url: string): string {
	const safeDestination = url.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\s/g, '%20')
	return `![${markdownAlt(alt)}](<${safeDestination}>)`
}

function isPrivateNetworkHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
	if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true
	if (normalized === '::' || normalized === '::1' || /^(?:fc|fd|fe[89ab])/i.test(normalized)) return true

	const embeddedIpv4 = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1]
	const ipv4 = embeddedIpv4 || (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) ? normalized : '')
	if (!ipv4) return false
	const octets = ipv4.split('.').map(Number)
	if (octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true
	const [first, second] = octets
	return (
		first === 0 ||
		first === 10 ||
		first === 127 ||
		(first === 100 && second >= 64 && second <= 127) ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && (second === 0 || second === 168)) ||
		(first === 198 && (second === 18 || second === 19)) ||
		first >= 224
	)
}

function isSafeExternalImageUrl(value: string): boolean {
	const source = value.trim()
	if (/^https?:\/\//i.test(source)) {
		try {
			return !isPrivateNetworkHostname(new URL(source).hostname)
		} catch {
			return false
		}
	}
	if (/^(?:\/|\.\/|\.\.\/)(?!\/)/.test(source)) return true
	return false
}

function containsSensitiveQuery(value: string): boolean {
	try {
		const parsed = new URL(value, 'https://rich-text-import.invalid')
		if (parsed.username || parsed.password) return true
		const sensitiveKeyPattern = /(?:token|auth|signature|sig|credential|secret|api[-_]?key|key[-_]?pair[-_]?id|policy|x-amz|expires?)/i
		for (const key of parsed.searchParams.keys()) {
			if (sensitiveKeyPattern.test(key)) return true
		}
		if (sensitiveKeyPattern.test(parsed.hash)) return true
	} catch {
		return true
	}
	return false
}

function normalizedFilename(value: string | undefined): string {
	if (!value) return ''
	const withoutQuery = value.split(/[?#]/, 1)[0]
	const tail = withoutQuery.split(/[\\/]/).pop() || ''
	try {
		return decodeURIComponent(tail).trim().toLowerCase()
	} catch {
		return tail.trim().toLowerCase()
	}
}

function createPastedFile(blob: Blob, originalIndex: number): File {
	const mime = normalizeMimeType(blob.type)
	const extension = extensionForMime(mime)
	if (!extension || !isAllowedImageFile(blob)) throw new Error('图片格式不受支持或内容为空')
	return new File([blob], `pasted-image-${originalIndex + 1}${extension}`, { type: mime, lastModified: Date.now() })
}

function ensureNamedImageFile(file: File, originalIndex: number): File {
	return file.name.trim() ? file : createPastedFile(file, originalIndex)
}

async function fetchBlobWithTimeout(url: string, maxBytes = CLIPBOARD_IMAGE_LIMITS.maxImageBytes): Promise<Blob> {
	if (maxBytes <= 0) throw new ImageImportLimitError('单次粘贴图片总大小超过 50 MB')
	const limitMessage = maxBytes < CLIPBOARD_IMAGE_LIMITS.maxImageBytes ? '单次粘贴图片总大小超过 50 MB' : '图片超过 10 MB'
	const controller = new AbortController()
	const timer = globalThis.setTimeout(() => controller.abort(), CLIPBOARD_IMAGE_LIMITS.remoteTimeoutMs)
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			credentials: 'omit',
			referrerPolicy: 'no-referrer'
		})
		if (!response.ok) throw new Error('图片下载失败')
		const contentLength = Number(response.headers.get('content-length') || 0)
		if (contentLength > maxBytes) throw new ImageImportLimitError(limitMessage)

		if (!response.body) {
			const blob = await response.blob()
			if (blob.size > maxBytes) throw new ImageImportLimitError(limitMessage)
			return blob
		}

		const reader = response.body.getReader()
		const chunks: ArrayBuffer[] = []
		let receivedBytes = 0
		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				if (!value) continue
				receivedBytes += value.byteLength
				if (receivedBytes > maxBytes) {
					controller.abort()
					throw new ImageImportLimitError(limitMessage)
				}
				const chunk = new Uint8Array(value.byteLength)
				chunk.set(value)
				chunks.push(chunk.buffer)
			}
		} finally {
			reader.releaseLock()
		}

		return new Blob(chunks, { type: normalizeMimeType(response.headers.get('content-type') || '') })
	} finally {
		globalThis.clearTimeout(timer)
	}
}

async function sourceToFile(descriptor: RichTextImageDescriptor, maxDownloadBytes: number): Promise<ResolvedImage> {
	if (descriptor.kind === 'unsupported') return { kind: 'failed', error: '图片来源无法读取' }
	if (descriptor.kind === 'local') return { kind: 'failed', error: 'Word 图片未能与剪贴板文件匹配' }
	if (descriptor.kind === 'relative') {
		return isSafeExternalImageUrl(descriptor.src) && !containsSensitiveQuery(descriptor.src)
			? { kind: 'external', url: descriptor.src }
			: { kind: 'failed', error: '图片地址不安全' }
	}

	if (descriptor.kind === 'remote') {
		const remoteUrl = descriptor.src.startsWith('//') ? `https:${descriptor.src}` : descriptor.src
		if (!isSafeExternalImageUrl(remoteUrl)) return { kind: 'failed', error: '图片地址不安全' }
		let blob: Blob
		try {
			blob = await fetchBlobWithTimeout(remoteUrl, maxDownloadBytes)
		} catch (error) {
			if (error instanceof ImageImportLimitError) return { kind: 'failed', error: error.message }
			if (isSafeExternalImageUrl(remoteUrl) && !containsSensitiveQuery(remoteUrl)) {
				return { kind: 'external', url: remoteUrl }
			}
			return { kind: 'failed', error: '网页图片无法下载' }
		}
		try {
			return { kind: 'file', file: createPastedFile(blob, descriptor.index) }
		} catch (error) {
			return { kind: 'failed', error: error instanceof Error ? error.message : '图片格式不受支持' }
		}
	}

	try {
		if (descriptor.kind === 'data' && descriptor.src.length > Math.min(CLIPBOARD_IMAGE_LIMITS.maxImageBytes, maxDownloadBytes) * 1.5) {
			throw new ImageImportLimitError(
				maxDownloadBytes < CLIPBOARD_IMAGE_LIMITS.maxImageBytes ? '单次粘贴图片总大小超过 50 MB' : '图片超过 10 MB'
			)
		}
		const blob = await fetchBlobWithTimeout(descriptor.src, maxDownloadBytes)
		return { kind: 'file', file: createPastedFile(blob, descriptor.index) }
	} catch (error) {
		if (error instanceof ImageImportLimitError) return { kind: 'failed', error: error.message }
		return { kind: 'failed', error: descriptor.kind === 'blob' ? 'Blob 图片无法读取' : 'Base64 图片无法读取' }
	}
}

function matchClipboardFiles(descriptors: RichTextImageDescriptor[], files: File[]): Map<number, File> {
	const matches = new Map<number, File>()
	const availableFiles = new Set(files.map((_, index) => index))

	for (const descriptor of descriptors) {
		const hints = new Set([normalizedFilename(descriptor.filenameHint), normalizedFilename(descriptor.src)].filter(Boolean))
		if (hints.size === 0) continue
		const candidates = [...availableFiles].filter(fileIndex => hints.has(normalizedFilename(files[fileIndex].name)))
		if (candidates.length !== 1) continue
		const fileIndex = candidates[0]
		matches.set(descriptor.index, files[fileIndex])
		availableFiles.delete(fileIndex)
	}

	const unmatchedDescriptors = descriptors.filter(descriptor => !matches.has(descriptor.index))
	const remainingFiles = [...availableFiles]
	if (descriptors.length === files.length && unmatchedDescriptors.length > 0 && unmatchedDescriptors.length === remainingFiles.length) {
		unmatchedDescriptors.forEach((descriptor, index) => matches.set(descriptor.index, files[remainingFiles[index]]))
	}

	return matches
}

function enforceLimits(
	resolved: ResolvedImage[],
	state: ImageLimitState = { acceptedCount: 0, acceptedBytes: 0 }
): ResolvedImage[] {

	return resolved.map(result => {
		if (result.kind !== 'file') return result
		if (!isAllowedImageFile(result.file)) return { kind: 'failed', error: '图片格式不受支持或内容为空' }
		if (result.file.size > CLIPBOARD_IMAGE_LIMITS.maxImageBytes) return { kind: 'failed', error: '图片超过 10 MB' }
		if (state.acceptedCount >= CLIPBOARD_IMAGE_LIMITS.maxImageCount) return { kind: 'failed', error: '单次粘贴最多导入 30 张图片' }
		if (state.acceptedBytes + result.file.size > CLIPBOARD_IMAGE_LIMITS.maxTotalBytes) return { kind: 'failed', error: '单次粘贴图片总大小超过 50 MB' }

		state.acceptedCount += 1
		state.acceptedBytes += result.file.size
		return result
	})
}

async function addResolvedFiles(
	resolved: ResolvedImage[],
	alts: string[],
	addFilesWithMapping: AddFilesWithMapping
): Promise<ImportedImageResult[]> {
	const output: ImportedImageResult[] = resolved.map((result, originalIndex) => {
		if (result.kind === 'external') {
			return {
				originalIndex,
				item: null,
				status: 'external',
				markdown: externalImageMarkdown(alts[originalIndex] || '', result.url)
			}
		}
		if (result.kind === 'failed') {
			return { originalIndex, item: null, status: 'failed', markdown: RICH_TEXT_IMAGE_FAILURE_PLACEHOLDER, error: result.error }
		}
		return { originalIndex, item: null, status: 'failed', markdown: RICH_TEXT_IMAGE_FAILURE_PLACEHOLDER, error: '图片尚未加入列表' }
	})

	const pending = resolved.flatMap((result, originalIndex) =>
		result.kind === 'file' ? [{ originalIndex, file: ensureNamedImageFile(result.file, originalIndex) }] : []
	)
	if (pending.length === 0) return output

	let added: ImageFileAddResult[]
	try {
		added = await addFilesWithMapping(pending.map(entry => entry.file))
	} catch {
		for (const entry of pending) {
			output[entry.originalIndex] = {
				originalIndex: entry.originalIndex,
				item: null,
				status: 'failed',
				markdown: RICH_TEXT_IMAGE_FAILURE_PLACEHOLDER,
				error: '图片加入列表失败'
			}
		}
		return output
	}

	for (const addResult of added) {
		const pendingEntry = pending[addResult.originalIndex]
		if (!pendingEntry) continue
		const originalIndex = pendingEntry.originalIndex
		if (!addResult.item || addResult.status === 'failed') {
			output[originalIndex] = {
				originalIndex,
				item: null,
				status: 'failed',
				markdown: RICH_TEXT_IMAGE_FAILURE_PLACEHOLDER,
				error: addResult.error || '图片加入列表失败'
			}
			continue
		}

		output[originalIndex] = {
			originalIndex,
			item: addResult.item,
			status: addResult.status,
			markdown: localImageMarkdown(alts[originalIndex] || '', addResult.item.id)
		}
	}

	return output
}

function summarize(results: ImportedImageResult[], placeholders: string[] = []): ClipboardImageImportResult {
	const replacements = new Map<string, string>()
	results.forEach((result, index) => {
		if (placeholders[index]) replacements.set(placeholders[index], result.markdown)
	})
	return {
		results,
		replacements,
		localizedCount: results.filter(result => result.status === 'added' || result.status === 'existing').length,
		externalCount: results.filter(result => result.status === 'external').length,
		failedCount: results.filter(result => result.status === 'failed').length,
		uniqueImageCount: new Set(results.flatMap(result => (result.item ? [result.item.id] : []))).size
	}
}

export function collectClipboardImageFiles(dataTransfer: DataTransfer): File[] {
	const files = Array.from(dataTransfer.files || []).filter(file => file.type.startsWith('image/'))
	const itemFiles = Array.from(dataTransfer.items || []).flatMap(item => {
		if (!item.type.startsWith('image/')) return []
		const file = item.getAsFile()
		return file ? [file] : []
	})

	return files.length > 0 ? files : itemFiles
}

export async function importRichTextImages(
	descriptors: RichTextImageDescriptor[],
	clipboardFiles: File[],
	addFilesWithMapping: AddFilesWithMapping
): Promise<ClipboardImageImportResult> {
	const clipboardMatches = matchClipboardFiles(descriptors, clipboardFiles)
	const sourceCache = new Map<string, Promise<ResolvedImage>>()
	const limitedDescriptors = descriptors.slice(0, CLIPBOARD_IMAGE_LIMITS.maxImageCount)
	const limitState: ImageLimitState = { acceptedCount: 0, acceptedBytes: 0 }
	const resolved: ResolvedImage[] = []

	for (let start = 0; start < limitedDescriptors.length; start += REMOTE_IMPORT_CONCURRENCY) {
		const batch = limitedDescriptors.slice(start, start + REMOTE_IMPORT_CONCURRENCY)
		const remainingDownloadBytes = Math.max(0, CLIPBOARD_IMAGE_LIMITS.maxTotalBytes - limitState.acceptedBytes)
		const batchResults = await Promise.all(
			batch.map(descriptor => {
			const matchedFile = clipboardMatches.get(descriptor.index)
			if (matchedFile) return Promise.resolve<ResolvedImage>({ kind: 'file', file: matchedFile })
			const cacheKey = `${descriptor.kind}:${descriptor.src}`
			if (!sourceCache.has(cacheKey)) sourceCache.set(cacheKey, sourceToFile(descriptor, Math.min(CLIPBOARD_IMAGE_LIMITS.maxImageBytes, remainingDownloadBytes)))
			return sourceCache.get(cacheKey)!
			})
		)
		resolved.push(...enforceLimits(batchResults, limitState))
		sourceCache.clear()
	}

	for (let index = limitedDescriptors.length; index < descriptors.length; index += 1) {
		resolved.push({ kind: 'failed', error: '单次粘贴最多导入 30 张图片' })
	}

	const results = await addResolvedFiles(
		resolved,
		descriptors.map(descriptor => descriptor.alt),
		addFilesWithMapping
	)
	return summarize(
		results,
		descriptors.map(descriptor => descriptor.placeholder)
	)
}

export async function importStandaloneClipboardImages(files: File[], addFilesWithMapping: AddFilesWithMapping): Promise<ClipboardImageImportResult> {
	const resolved: ResolvedImage[] = files.map(file => ({ kind: 'file', file }))
	const results = await addResolvedFiles(enforceLimits(resolved), files.map(() => ''), addFilesWithMapping)
	return summarize(results)
}
