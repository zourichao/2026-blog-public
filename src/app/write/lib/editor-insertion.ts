export type ImportTokenInsertion = {
	value: string
	tokenStart: number
	tokenEnd: number
}

export type ImportTokenReplacement = {
	value: string
	cursor: number
}

export function createRichTextImportToken(): string {
	const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
	return `<!-- rich-text-import:${id} -->`
}

export function insertRichTextImportToken(value: string, selectionStart: number, selectionEnd: number, token: string): ImportTokenInsertion {
	const safeStart = Math.max(0, Math.min(selectionStart, value.length))
	const safeEnd = Math.max(safeStart, Math.min(selectionEnd, value.length))
	const nextValue = `${value.slice(0, safeStart)}${token}${value.slice(safeEnd)}`

	return {
		value: nextValue,
		tokenStart: safeStart,
		tokenEnd: safeStart + token.length
	}
}

function needsBlockSpacing(markdown: string): boolean {
	return /\n/.test(markdown) || /^(?:#{1,6}\s|>|[-+*]\s|\d+[.)]\s|```|~~~|!\[|\|)/.test(markdown)
}

function leftBlockGap(before: string): string {
	if (!before) return ''
	if (before.endsWith('\n\n')) return ''
	if (before.endsWith('\n')) return '\n'
	return '\n\n'
}

function rightBlockGap(after: string): string {
	if (!after) return ''
	if (after.startsWith('\n\n')) return ''
	if (after.startsWith('\n')) return '\n'
	return '\n\n'
}

export function replaceRichTextImportToken(value: string, token: string, markdown: string): ImportTokenReplacement | null {
	const tokenStart = value.indexOf(token)
	if (tokenStart < 0) return null

	const before = value.slice(0, tokenStart)
	const after = value.slice(tokenStart + token.length)
	const normalized = markdown.replace(/\r\n?/g, '\n').trim()
	const block = normalized ? needsBlockSpacing(normalized) : false
	const insertion = normalized ? `${block ? leftBlockGap(before) : ''}${normalized}${block ? rightBlockGap(after) : ''}` : ''

	return {
		value: `${before}${insertion}${after}`,
		cursor: before.length + insertion.length
	}
}
