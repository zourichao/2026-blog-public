import {
	toBase64Utf8,
	getRef,
	createTree,
	createCommit,
	updateRef,
	createBlob,
	getFileSha,
	listRepoFilesRecursive,
	readTextFileFromRepo,
	type TreeItem
} from '@/lib/github-client'
import { fileToBase64NoPrefix, hashFileSHA256 } from '@/lib/file-utils'
import { prepareBlogsIndex } from '@/lib/blog-index'
import { getAuthToken } from '@/lib/auth'
import { GITHUB_CONFIG } from '@/consts'
import type { ImageItem } from '../types'
import { getFileExt } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDateTimeLocal } from '../stores/write-store'
import { getBlogAuthor } from '@/lib/blog-author'
import { replaceLocalImageReferences, validateLocalImageReferences } from '../lib/local-image-validation'
import { getOrphanedArticleImagePaths, getReferencedArticleImagePaths } from '../lib/article-image-cleanup'
import { prepareArticleSlugMigration } from '../lib/article-slug-migration'

export type PushBlogResult = {
	slug: string
	markdown: string
	coverPath?: string
}

export type PushBlogParams = {
	form: {
		slug: string
		title: string
		author?: string
		md: string
		tags: string[]
		date?: string
		summary?: string
		hidden?: boolean
		category?: string
	}
	cover?: ImageItem | null
	images?: ImageItem[]
	mode?: 'create' | 'edit'
	originalSlug?: string | null
}

type CategoriesFile = {
	categories: string[]
}

function parseCategoriesFile(content: string): string[] {
	const data = JSON.parse(content) as unknown
	if (Array.isArray(data)) return data.filter((item): item is string => typeof item === 'string')
	if (data && typeof data === 'object' && Array.isArray((data as CategoriesFile).categories)) {
		return (data as CategoriesFile).categories.filter((item): item is string => typeof item === 'string')
	}
	throw new Error('分类文件格式不正确，已停止发布')
}

async function validateSelectedCategory(token: string, ref: string, category?: string): Promise<string> {
	const selectedCategory = category?.trim() ?? ''
	if (!selectedCategory) return ''
	if (selectedCategory === '未分类') throw new Error('“未分类”是系统保留项，请直接选择未分类状态')
	const categoriesText = await readTextFileFromRepo(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, 'public/blogs/categories.json', ref)
	if (categoriesText === null) throw new Error('缺少分类配置文件，已停止发布')
	const categories = parseCategoriesFile(categoriesText)
	if (!categories.includes(selectedCategory)) {
		throw new Error(`分类“${selectedCategory}”已不存在或刚被修改，请重新选择分类后再发布`)
	}
	return selectedCategory
}

function getShareImageRepoPath(articleImageRepoPath: string, slug: string): string | null {
	const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, '')
	if (!normalizedSlug) return null
	const basePath = `public/blogs/${normalizedSlug}/`
	if (!articleImageRepoPath.startsWith(basePath)) return null
	const relativePath = articleImageRepoPath.slice(basePath.length)
	// 分享图只和文章目录根部的正文图片一一对应；share/ 本身及其他子目录不再次派生。
	if (!relativePath || relativePath.includes('/')) return null
	const extensionIndex = relativePath.lastIndexOf('.')
	if (extensionIndex <= 0) return null
	return `${basePath}share/${relativePath.slice(0, extensionIndex)}.webp`
}

export async function pushBlog(params: PushBlogParams): Promise<PushBlogResult> {
	const { form, cover, images, mode = 'create', originalSlug } = params
	if (!form?.slug) throw new Error('需要 slug')
	validateLocalImageReferences(form.md, images, cover)

	// 获取认证 token（自动从全局认证状态获取）
	const token = await getAuthToken()
	toast.info('正在获取分支信息...')
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const latestCommitSha = refData.sha
	// 本次改动：发布时直接信任表单 category → 基于本次发布使用的最新 Commit 再校验一次分类，避免失效分类写回文章。
	const validatedCategory = await validateSelectedCategory(token, latestCommitSha, form.category)
	const basePath = `public/blogs/${form.slug}`
	const slugChanged = mode === 'edit' && !!originalSlug && originalSlug !== form.slug
	const originalBasePath = originalSlug ? `public/blogs/${originalSlug}` : basePath
	const commitMessage = slugChanged ? `更新文章 Slug: ${originalSlug} → ${form.slug}` : mode === 'edit' ? `更新文章: ${form.slug}` : `新增文章: ${form.slug}`
	let originalFiles: string[] = []

	if (slugChanged) {
		toast.info('正在检查新 slug...')
		const targetFiles = await listRepoFilesRecursive(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, basePath, latestCommitSha)
		if (targetFiles.length > 0) throw new Error(`slug“${form.slug}”已存在，请更换后再发布`)
		originalFiles = await listRepoFilesRecursive(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, originalBasePath, latestCommitSha)
		if (originalFiles.length === 0) throw new Error(`原文章目录“${originalSlug}”不存在，已停止修改 slug`)
	}

	// collect all local images (content + cover)
	const allLocalImages: Array<{ img: Extract<ImageItem, { type: 'file' }>; id: string }> = []
	const contentLocalImageIds = new Set<string>()
	// add content images
	for (const img of images || []) {
		if (img.type === 'file') {
			allLocalImages.push({ img, id: img.id })
			contentLocalImageIds.add(img.id)
		}
	}
	// add cover if local
	if (cover?.type === 'file') {
		allLocalImages.push({ img: cover, id: cover.id })
	}

	toast.info('正在准备文件...')
	const uploadedHashes = new Set<string>()
	const uploadedSharePaths = new Set<string>()
	let mdToUpload = form.md
	const localImagePaths = new Map<string, string>()
	let coverPath: string | undefined
	// prepare tree items for all files
	const treeItems: TreeItem[] = []

	// process all images
	if (allLocalImages.length > 0) {
		toast.info('正在上传图片...')
		for (const { img, id } of allLocalImages) {
			const hash = img.hash || (await hashFileSHA256(img.file))
			const ext = getFileExt(img.file.name)
			const filename = `${hash}${ext}`
			const publicPath = `/blogs/${form.slug}/${filename}`
			if (!uploadedHashes.has(hash)) {
				const path = `${basePath}/${filename}`
				const contentBase64 = await fileToBase64NoPrefix(img.file)
				// create blob for image
				const blobData = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, contentBase64, 'base64')
				treeItems.push({
					path,
					mode: '100644',
					type: 'blob',
					sha: blobData.sha
				})
				uploadedHashes.add(hash)
			}

			// 本次改动：正文图片额外上传 share/{同 hash}.webp；正文原文件名、路径和 Markdown 映射完全不变。
			if (contentLocalImageIds.has(id) && img.shareFile) {
				const sharePath = `${basePath}/share/${hash}.webp`
				if (!uploadedSharePaths.has(sharePath)) {
					const shareBase64 = await fileToBase64NoPrefix(img.shareFile)
					const shareBlobData = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, shareBase64, 'base64')
					treeItems.push({
						path: sharePath,
						mode: '100644',
						type: 'blob',
						sha: shareBlobData.sha
					})
					uploadedSharePaths.add(sharePath)
				}
			}

			localImagePaths.set(id, publicPath)
			// set cover path if this is the cover
			if (cover?.type === 'file' && cover.id === id) {
				coverPath = publicPath
			}
		}
	}

	mdToUpload = replaceLocalImageReferences(mdToUpload, localImagePaths)

	// handle external cover URL
	if (cover?.type === 'url') {
		coverPath = cover.url
	}

	if (slugChanged && originalSlug) {
		// 本次改动：编辑模式禁止修改 slug → 将修改 slug 作为文章目录迁移，在同一 Commit 完成旧图复用、路径改写和旧目录删除。
		toast.info('正在迁移文章目录...')
		const referencedOldContentPaths = getReferencedArticleImagePaths(mdToUpload, originalSlug)
		const migration = prepareArticleSlugMigration({
			markdown: mdToUpload,
			coverPath,
			originalSlug,
			nextSlug: form.slug
		})
		mdToUpload = migration.markdown
		coverPath = migration.coverPath
		const originalFileSet = new Set(originalFiles)
		const plannedTargetPaths = new Set(treeItems.filter(item => item.sha).map(item => item.path))

		for (const move of migration.imageMoves) {
			if (!originalFileSet.has(move.sourcePath)) {
				throw new Error(`旧文章图片不存在：${move.sourcePath}，已停止修改 slug`)
			}
			if (!plannedTargetPaths.has(move.targetPath)) {
				const sha = await getFileSha(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, move.sourcePath, latestCommitSha)
				if (!sha) throw new Error(`无法读取旧文章图片：${move.sourcePath}，已停止修改 slug`)

				treeItems.push({
					path: move.targetPath,
					mode: '100644',
					type: 'blob',
					sha
				})
				plannedTargetPaths.add(move.targetPath)
			}

			// 只有正文仍引用的旧图片才迁移其分享副本；封面独有图片不额外维护分享图。
			if (referencedOldContentPaths.has(move.sourcePath)) {
				const sourceSharePath = getShareImageRepoPath(move.sourcePath, originalSlug)
				const targetSharePath = getShareImageRepoPath(move.targetPath, form.slug)
				if (sourceSharePath && targetSharePath && originalFileSet.has(sourceSharePath) && !plannedTargetPaths.has(targetSharePath)) {
					const shareSha = await getFileSha(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, sourceSharePath, latestCommitSha)
					if (shareSha) {
						treeItems.push({
							path: targetSharePath,
							mode: '100644',
							type: 'blob',
							sha: shareSha
						})
						plannedTargetPaths.add(targetSharePath)
					}
				}
			}
		}

		for (const path of originalFiles) {
			treeItems.push({
				path,
				mode: '100644',
				type: 'blob',
				sha: null
			})
		}
	} else if (mode === 'edit') {
		// 本次改动：修改文章仅更新引用 → 同一 Commit 自动删除不再引用的旧封面和正文图片；分享图跟随正文引用一并保留/清理。
		toast.info('正在检查旧图片...')
		const existingFiles = await listRepoFilesRecursive(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, basePath, latestCommitSha)
		const uploadedImagePaths = treeItems.flatMap(item => (item.sha && item.path.startsWith(`${basePath}/`) ? [item.path] : []))
		const referencedContentPaths = getReferencedArticleImagePaths(mdToUpload, form.slug)
		const pairedSharePaths = Array.from(referencedContentPaths).flatMap(path => {
			const sharePath = getShareImageRepoPath(path, form.slug)
			return sharePath ? [sharePath] : []
		})
		const orphanedImagePaths = getOrphanedArticleImagePaths({
			existingFiles,
			markdown: mdToUpload,
			coverPath,
			slug: form.slug,
			additionalKeepPaths: [...uploadedImagePaths, ...pairedSharePaths]
		})
		for (const path of orphanedImagePaths) {
			treeItems.push({
				path,
				mode: '100644',
				type: 'blob',
				sha: null
			})
		}
	}

	toast.info('正在创建文件...')
	// create blob for index.md
	const mdBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(mdToUpload), 'base64')
	treeItems.push({
		path: `${basePath}/index.md`,
		mode: '100644',
		type: 'blob',
		sha: mdBlob.sha
	})

	// create blob for config.json
	const dateStr = form.date || formatDateTimeLocal()
	const author = getBlogAuthor(form.author)
	const config = {
		title: form.title,
		author,
		tags: form.tags,
		date: dateStr,
		summary: form.summary,
		cover: coverPath,
		hidden: form.hidden,
		category: validatedCategory
	}
	const configBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(JSON.stringify(config, null, 2)), 'base64')
	treeItems.push({
		path: `${basePath}/config.json`,
		mode: '100644',
		type: 'blob',
		sha: configBlob.sha
	})

	// prepare and create blob for blogs index
	const indexJson = await prepareBlogsIndex(
		token,
		GITHUB_CONFIG.OWNER,
		GITHUB_CONFIG.REPO,
		{
			slug: form.slug,
			title: form.title,
			author,
			tags: form.tags,
			date: dateStr,
			summary: form.summary,
			cover: coverPath,
			hidden: form.hidden,
			category: validatedCategory
		},
		GITHUB_CONFIG.BRANCH,
		slugChanged ? originalSlug || undefined : undefined
	)
	const indexBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(indexJson), 'base64')
	treeItems.push({
		path: 'public/blogs/index.json',
		mode: '100644',
		type: 'blob',
		sha: indexBlob.sha
	})

	// create tree
	toast.info('正在创建文件树...')
	const treeData = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, latestCommitSha)
	// create commit
	toast.info('正在创建提交...')
	const commitData = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, commitMessage, treeData.sha, [latestCommitSha])
	// update branch reference
	toast.info('正在更新分支...')
	try {
		await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`, commitData.sha)
	} catch (error) {
		const message = error instanceof Error ? error.message : ''
		if (message.includes('409') || message.includes('422')) {
			throw new Error('GitHub 分支刚刚发生了变化，为避免覆盖新内容，本次发布已停止，请重新发布')
		}
		throw error
	}
	toast.success('发布成功！')
	return { slug: form.slug, markdown: mdToUpload, coverPath }
}
