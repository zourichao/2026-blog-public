import { Marked, type Token } from 'marked'

const markdownLexer = new Marked()
const IMAGE_FILE_PATTERN = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i
const HTML_IMAGE_SOURCE_PATTERN = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi

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

function safeDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}

function stripQueryAndHash(value: string): string {
	return value.split(/[?#]/, 1)[0]
}

function hasUnsafePathSegment(path: string): boolean {
	return path.split('/').some(segment => segment === '..' || segment.includes('\0'))
}

function normalizeRepositoryPath(path: string): string {
	return path.replaceAll('\\', '/').replace(/^\/+/, '')
}

/**
 * 将正文或封面中的图片地址转换为当前文章目录下的 GitHub 仓库路径。
 * 无法确认属于当前文章目录时返回 null，避免误删外部资源。
 */
export function toArticleImageRepoPath(source: string, slug: string): string | null {
	const value = source.trim().replace(/^<|>$/g, '')
	if (!value || /^(?:data|blob|local-image):/i.test(value)) return null

	const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, '')
	if (!normalizedSlug || hasUnsafePathSegment(normalizedSlug)) return null

	const publicPrefix = `public/blogs/${normalizedSlug}/`
	const urlPrefix = `/blogs/${normalizedSlug}/`
	let candidate = stripQueryAndHash(value)

	if (/^[a-z][a-z\d+.-]*:/i.test(candidate) || candidate.startsWith('//')) {
		try {
			candidate = new URL(candidate, 'https://local.invalid').pathname
		} catch {
			return null
		}
	}

	candidate = safeDecodeURIComponent(candidate).replaceAll('\\', '/')
	if (hasUnsafePathSegment(candidate)) return null

	let repositoryPath: string
	if (candidate.startsWith(publicPrefix)) {
		repositoryPath = normalizeRepositoryPath(candidate)
	} else if (candidate.startsWith(urlPrefix)) {
		repositoryPath = normalizeRepositoryPath(`public${candidate}`)
	} else if (/^(?:\.\/)?[^/]+$/.test(candidate)) {
		repositoryPath = `${publicPrefix}${candidate.replace(/^\.\//, '')}`
	} else {
		return null
	}

	if (!repositoryPath.startsWith(publicPrefix) || !IMAGE_FILE_PATTERN.test(repositoryPath)) return null
	return repositoryPath
}

function collectHtmlImageSources(rawHtml: string): string[] {
	const sources: string[] = []
	HTML_IMAGE_SOURCE_PATTERN.lastIndex = 0
	let match: RegExpExecArray | null
	while ((match = HTML_IMAGE_SOURCE_PATTERN.exec(rawHtml)) !== null) {
		const source = match[1] ?? match[2] ?? match[3]
		if (source) sources.push(source)
	}
	return sources
}

/**
 * 提取最终 Markdown 中仍被引用的当前文章图片，兼容 Markdown 图片和 HTML img 标签。
 */
export function getReferencedArticleImagePaths(markdown: string, slug: string): Set<string> {
	const paths = new Set<string>()
	const tokens = markdownLexer.lexer(markdown) as Token[]

	visitTokens(tokens, token => {
		const sources: string[] = []
		if (token.type === 'image') sources.push(token.href)
		if (token.type === 'html') sources.push(...collectHtmlImageSources(token.raw))

		for (const source of sources) {
			const path = toArticleImageRepoPath(source, slug)
			if (path) paths.add(path)
		}
	})

	return paths
}

/**
 * 对比文章目录现有图片与最终引用，返回可安全删除的孤儿图片路径。
 */
export function getOrphanedArticleImagePaths(params: {
	existingFiles: readonly string[]
	markdown: string
	coverPath?: string
	slug: string
	additionalKeepPaths?: readonly string[]
}): string[] {
	const { existingFiles, markdown, coverPath, slug, additionalKeepPaths = [] } = params
	const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, '')
	const basePath = `public/blogs/${normalizedSlug}/`
	const referencedPaths = getReferencedArticleImagePaths(markdown, normalizedSlug)

	if (coverPath) {
		const path = toArticleImageRepoPath(coverPath, normalizedSlug)
		if (path) referencedPaths.add(path)
	}

	for (const path of additionalKeepPaths) {
		const normalizedPath = normalizeRepositoryPath(path)
		if (normalizedPath.startsWith(basePath) && IMAGE_FILE_PATTERN.test(normalizedPath)) {
			referencedPaths.add(normalizedPath)
		}
	}

	return existingFiles
		.map(normalizeRepositoryPath)
		.filter(path => path.startsWith(basePath) && IMAGE_FILE_PATTERN.test(path) && !referencedPaths.has(path))
}
