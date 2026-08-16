'use client'

import { GITHUB_CONFIG } from '@/consts'
import { getAuthToken } from '@/lib/auth'
import { createCommit, createTree, getRef, readTextFileFromRepo, updateRef, type TreeItem } from '@/lib/github-client'
import { parseCategoryConfig, type CategoryConfigFile } from '@/lib/category-config'
import type { SeoArticleSource } from '@/lib/seo-config'

export type SeoManagementSnapshot = {
	headSha: string
	seoText: string
	categories: CategoryConfigFile
	articles: SeoArticleSource[]
}

const SEO_BRANCH = 'main'
const SEO_PATH = 'src/config/seo.json'
const CATEGORY_PATH = 'public/blogs/categories.json'
const INDEX_PATH = 'public/blogs/index.json'

async function readRequiredFile(token: string, path: string, ref: string): Promise<string> {
	const content = await readTextFileFromRepo(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, path, ref)
	if (content === null) throw new Error(`缺少必要文件：${path}`)
	return content
}

export async function getSeoManagementSnapshot(): Promise<SeoManagementSnapshot> {
	const token = await getAuthToken({ silent: true })
	const ref = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${SEO_BRANCH}`)
	const [seoText, categoryText, indexText] = await Promise.all([
		readRequiredFile(token, SEO_PATH, ref.sha),
		readRequiredFile(token, CATEGORY_PATH, ref.sha),
		readRequiredFile(token, INDEX_PATH, ref.sha)
	])
	let articles: SeoArticleSource[] = []
	try {
		const parsed = JSON.parse(indexText) as unknown
		if (!Array.isArray(parsed)) throw new Error('文章索引不是数组')
		articles = parsed.filter((item): item is SeoArticleSource => Boolean(item && typeof item === 'object'))
	} catch {
		throw new Error('文章索引 JSON 格式错误')
	}
	return {
		headSha: ref.sha,
		seoText,
		categories: parseCategoryConfig(JSON.parse(categoryText) as unknown),
		articles
	}
}

async function assertLatestHead(token: string, expectedHeadSha: string): Promise<{ sha: string }> {
	const latest = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${SEO_BRANCH}`)
	if (latest.sha !== expectedHeadSha) throw new Error('GitHub main 已发生变化，请重新加载 SEO 配置后再保存，避免覆盖最新内容')
	return latest
}

async function commitTree(token: string, baseSha: string, items: TreeItem[], message: string): Promise<string> {
	const tree = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, items, baseSha)
	const commit = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, message, tree.sha, [baseSha])
	try {
		await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${SEO_BRANCH}`, commit.sha)
	} catch (error) {
		const message = error instanceof Error ? error.message : ''
		if (message.includes('409') || message.includes('422')) throw new Error('GitHub main 刚刚发生了变化，请重新加载后再保存')
		throw error
	}
	return commit.sha
}

export async function saveSeoConfig(text: string, expectedHeadSha: string): Promise<string> {
	const token = await getAuthToken()
	const latest = await assertLatestHead(token, expectedHeadSha)
	return commitTree(token, latest.sha, [{ path: SEO_PATH, mode: '100644', type: 'blob', content: text }], '更新 SEO 配置')
}
