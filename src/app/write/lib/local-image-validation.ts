import { Marked, type Token, type Tokens } from 'marked'
import type { ImageItem } from '../types'

type LocalFileImage = Extract<ImageItem, { type: 'file' }>

const markdownLexer = new Marked()
const LOCAL_IMAGE_HREF_PATTERN = /^local-image:([a-z\d_-]*)$/i

function getLocalImageId(href: string): string | null {
	return href.match(LOCAL_IMAGE_HREF_PATTERN)?.[1] ?? null
}

function visitTokens(tokens: readonly Token[], visitor: (token: Token) => void): void {
	for (const token of tokens) {
		visitor(token)

		if (token.type === 'list') {
			for (const item of token.items) visitTokens(item.tokens, visitor)
			continue
		}

		if (token.type === 'table') {
			for (const cell of [...token.header, ...token.rows.flat()]) visitTokens(cell.tokens, visitor)
			continue
		}

		if ('tokens' in token && Array.isArray(token.tokens)) visitTokens(token.tokens, visitor)
	}
}

function collectLocalImageIds(tokens: readonly Token[]): string[] {
	const ids: string[] = []
	visitTokens(tokens, token => {
		if (token.type !== 'image') return
		const id = getLocalImageId(token.href)
		if (id !== null) ids.push(id)
	})
	return ids
}

function replaceSequential(source: string, original: string, replacement: string, cursor: number): { value: string; cursor: number } {
	if (!original || original === replacement) return { value: source, cursor }
	const index = source.indexOf(original, cursor)
	if (index < 0) return { value: source, cursor }
	return {
		value: source.slice(0, index) + replacement + source.slice(index + original.length),
		cursor: index + replacement.length
	}
}

function rewriteTokenSequence(tokens: readonly Token[], replacements: ReadonlyMap<string, string>, referencedIds: ReadonlySet<string>): string {
	return tokens.map(token => rewriteToken(token, replacements, referencedIds)).join('')
}

function rewriteTableToken(token: Tokens.Table, replacements: ReadonlyMap<string, string>, referencedIds: ReadonlySet<string>): string {
	let raw = token.raw
	let cursor = 0
	for (const cell of [...token.header, ...token.rows.flat()]) {
		const original = cell.tokens.map(child => child.raw).join('')
		const replacement = rewriteTokenSequence(cell.tokens, replacements, referencedIds)
		const next = replaceSequential(raw, original, replacement, cursor)
		raw = next.value
		cursor = next.cursor
	}
	return raw
}

function rewriteNestedTokens(
	rawSource: string,
	tokens: readonly Token[],
	replacements: ReadonlyMap<string, string>,
	referencedIds: ReadonlySet<string>
): string {
	let raw = rawSource
	let cursor = 0
	for (const child of tokens) {
		const replacement = rewriteToken(child, replacements, referencedIds)
		const next = replaceSequential(raw, child.raw, replacement, cursor)
		raw = next.value
		cursor = next.cursor
	}
	return raw
}

function rewriteToken(token: Token, replacements: ReadonlyMap<string, string>, referencedIds: ReadonlySet<string>): string {
	if (token.type === 'image') {
		const id = getLocalImageId(token.href)
		const replacement = id === null ? undefined : replacements.get(id)
		return replacement ? token.raw.replace(token.href, replacement) : token.raw
	}

	if (token.type === 'def') {
		const id = getLocalImageId(token.href)
		const replacement = id === null || !referencedIds.has(id) ? undefined : replacements.get(id)
		return replacement ? token.raw.replace(token.href, replacement) : token.raw
	}

	if (token.type === 'table') return rewriteTableToken(token as Tokens.Table, replacements, referencedIds)

	if (token.type === 'list') {
		let raw = token.raw
		let cursor = 0
		for (const item of token.items) {
			const replacement = rewriteNestedTokens(item.raw, item.tokens, replacements, referencedIds)
			const next = replaceSequential(raw, item.raw, replacement, cursor)
			raw = next.value
			cursor = next.cursor
		}
		return raw
	}

	if ('tokens' in token && Array.isArray(token.tokens)) {
		return rewriteNestedTokens(token.raw, token.tokens, replacements, referencedIds)
	}

	return token.raw
}

function lexMarkdown(markdown: string): Token[] {
	return markdownLexer.lexer(markdown) as Token[]
}

export function extractLocalImageIds(markdown: string): string[] {
	return collectLocalImageIds(lexMarkdown(markdown))
}

export function replaceLocalImageReferences(markdown: string, replacements: ReadonlyMap<string, string>): string {
	const tokens = lexMarkdown(markdown)
	const referencedIds = new Set(collectLocalImageIds(tokens))
	return rewriteTokenSequence(tokens, replacements, referencedIds)
}

export function hasUsableLocalImageData(item: ImageItem): item is LocalFileImage {
	if (item.type !== 'file' || !item.id.trim()) return false

	const file = item.file as File | undefined
	return (
		!!file &&
		typeof Blob !== 'undefined' &&
		file instanceof Blob &&
		typeof file.arrayBuffer === 'function' &&
		typeof file.slice === 'function' &&
		Number.isFinite(file.size) &&
		file.size > 0 &&
		typeof file.name === 'string' &&
		file.name.trim().length > 0 &&
		typeof file.type === 'string' &&
		file.type.startsWith('image/')
	)
}

export function findMissingLocalImageIds(markdown: string, images: readonly ImageItem[] = [], cover?: ImageItem | null): string[] {
	const availableIds = new Set<string>()

	for (const item of cover ? [...images, cover] : images) {
		if (hasUsableLocalImageData(item)) availableIds.add(item.id)
	}

	const referencedIds = new Set(extractLocalImageIds(markdown))
	return [...referencedIds].filter(id => !availableIds.has(id))
}

export function validateLocalImageReferences(markdown: string, images: readonly ImageItem[] = [], cover?: ImageItem | null): void {
	const missingIds = findMissingLocalImageIds(markdown, images, cover)

	if (missingIds.length > 0) {
		throw new Error(`正文中有 ${missingIds.length} 张本地图片未找到，请重新粘贴或删除对应图片引用。`)
	}
}
