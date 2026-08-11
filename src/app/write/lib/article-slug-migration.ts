import { getReferencedArticleImagePaths, toArticleImageRepoPath } from './article-image-cleanup'

export type ArticleSlugImageMove = {
	sourcePath: string
	targetPath: string
}

export type ArticleSlugMigrationPlan = {
	markdown: string
	coverPath?: string
	imageMoves: ArticleSlugImageMove[]
}

function normalizeSlug(slug: string): string {
	return slug.trim().replace(/^\/+|\/+$/g, '')
}

function getRelativePath(repoPath: string, slug: string): string | null {
	const basePath = `public/blogs/${slug}/`
	if (!repoPath.startsWith(basePath)) return null
	const relativePath = repoPath.slice(basePath.length)
	return relativePath || null
}

function toPublicPath(repoPath: string): string {
	return repoPath.startsWith('public/') ? `/${repoPath.slice('public/'.length)}` : repoPath
}

/**
 * 将确认属于旧文章目录的单个图片 URL 改写为新 slug URL。
 * 外链、data/blob、本文章目录之外的地址保持不变。
 */
export function rewriteArticleImageUrlForSlug(source: string, originalSlugValue: string, nextSlugValue: string): string {
	const originalSlug = normalizeSlug(originalSlugValue)
	const nextSlug = normalizeSlug(nextSlugValue)
	if (!originalSlug || !nextSlug || originalSlug === nextSlug) return source

	const sourcePath = toArticleImageRepoPath(source, originalSlug)
	if (!sourcePath) return source
	const relativePath = getRelativePath(sourcePath, originalSlug)
	return relativePath ? `/blogs/${nextSlug}/${relativePath}` : source
}

/**
 * Slug 修改时，只迁移正文和封面最终仍引用的旧文章图片。
 * 新上传图片已经直接写入新 slug 目录，不会进入 imageMoves。
 */
export function prepareArticleSlugMigration(params: {
	markdown: string
	coverPath?: string
	originalSlug: string
	nextSlug: string
}): ArticleSlugMigrationPlan {
	const originalSlug = normalizeSlug(params.originalSlug)
	const nextSlug = normalizeSlug(params.nextSlug)
	if (!originalSlug || !nextSlug || originalSlug === nextSlug) {
		return {
			markdown: params.markdown,
			coverPath: params.coverPath,
			imageMoves: []
		}
	}

	const referencedOldPaths = getReferencedArticleImagePaths(params.markdown, originalSlug)
	const oldCoverRepoPath = params.coverPath ? toArticleImageRepoPath(params.coverPath, originalSlug) : null
	if (oldCoverRepoPath) referencedOldPaths.add(oldCoverRepoPath)

	let markdown = params.markdown
	const imageMoves: ArticleSlugImageMove[] = []

	for (const sourcePath of referencedOldPaths) {
		const relativePath = getRelativePath(sourcePath, originalSlug)
		if (!relativePath) continue

		const targetPath = `public/blogs/${nextSlug}/${relativePath}`
		const oldPublicPath = toPublicPath(sourcePath)
		const newPublicPath = toPublicPath(targetPath)

		// 本次改动：全局替换 slug 文本 → 只替换已经识别为文章图片的实际路径，避免误改正文普通文字。
		markdown = markdown.split(oldPublicPath).join(newPublicPath)
		imageMoves.push({ sourcePath, targetPath })
	}

	const coverPath = params.coverPath ? rewriteArticleImageUrlForSlug(params.coverPath, originalSlug, nextSlug) : undefined

	// 防御性校验：仍存在旧目录图片引用时停止发布，避免删掉旧目录后正文出现断图。
	const remainingOldImagePaths = getReferencedArticleImagePaths(markdown, originalSlug)
	if (remainingOldImagePaths.size > 0) {
		throw new Error('正文仍存在无法迁移的旧 slug 图片引用，已停止发布，请检查文章图片地址')
	}

	return {
		markdown,
		coverPath,
		imageMoves
	}
}
