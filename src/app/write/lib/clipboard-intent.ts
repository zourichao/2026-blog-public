const MARKDOWN_SIGNAL_PATTERN =
	/(?:^|\n)\s*(?:#{1,6}\s+|>\s+|[-+*]\s+|\d+[.)]\s+|```|~~~)|!\[[^\]]*\]\([^\n)]+\)|\[[^\]]+\]\([^\n)]+\)|\*\*[^\n*]+\*\*|~~[^\n~]+~~|(?:^|\n)\s*\|?\s*:?-{3,}:?\s*\|/m
const CODE_EDITOR_HTML_PATTERN =
	/<(?:pre|code)\b|(?:font-family\s*:[^;"']*(?:monospace|Consolas|Menlo|Monaco|Courier))|class\s*=\s*["'][^"']*(?:view-lines|monaco|CodeMirror|cm-content|ace_)/i
const RICH_DOCUMENT_STRUCTURE_PATTERN = /<(?:img|table|h[1-6]|ul|ol|li|blockquote)\b/i

export function shouldPreferPlainMarkdown(html: string, plainText: string): boolean {
	if (!plainText.trim() || !MARKDOWN_SIGNAL_PATTERN.test(plainText)) return false
	if (!CODE_EDITOR_HTML_PATTERN.test(html)) return false
	return !RICH_DOCUMENT_STRUCTURE_PATTERN.test(html)
}
