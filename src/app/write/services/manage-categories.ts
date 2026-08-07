import { GITHUB_CONFIG } from '@/consts'
import { getAuthToken } from '@/lib/auth'
import { readPreferredTextFileFromRepo } from '@/lib/github-public'
import { createCommit, createTree, getRef, readTextFileFromRepo, updateRef, type TreeItem } from '@/lib/github-client'

export type CategoryUsage = Record<string, number>

export type CategoryManagementSnapshot = {
	categories: string[]
	usage: CategoryUsage
	orphanCategories: CategoryUsage
}

export type CategoryMutationResult = CategoryManagementSnapshot & {
	affectedArticles: number
}

type BlogIndexItem = {
	slug?: string
	category?: string
	[key: string]: unknown
}

type CategoriesFile = {
	categories: string[]
}

const RESERVED_CATEGORY_NAMES = new Set(['未分类'])

function normalizeName(name: string): string {
	return name.trim()
}

function parseCategoriesFile(content: string): string[] {
	const data = JSON.parse(content) as unknown
	if (Array.isArray(data)) return data.filter((item): item is string => typeof item === 'string')
	if (data && typeof data === 'object' && Array.isArray((data as CategoriesFile).categories)) {
		return (data as CategoriesFile).categories.filter((item): item is string => typeof item === 'string')
	}
	throw new Error('分类文件格式不正确')
}

function parseBlogIndex(content: string): BlogIndexItem[] {
	const data = JSON.parse(content) as unknown
	if (!Array.isArray(data)) throw new Error('文章索引格式不正确')
	return data as BlogIndexItem[]
}

function buildUsage(categories: string[], index: BlogIndexItem[]): CategoryUsage {
	const usage: CategoryUsage = Object.fromEntries(categories.map(category => [category, 0]))
	for (const item of index) {
		if (typeof item.category === 'string' && item.category && Object.prototype.hasOwnProperty.call(usage, item.category)) {
			usage[item.category] += 1
		}
	}
	return usage
}

function buildOrphanUsage(categories: string[], index: BlogIndexItem[]): CategoryUsage {
	const knownCategories = new Set(categories)
	const orphanCategories: CategoryUsage = {}
	for (const item of index) {
		if (typeof item.category !== 'string' || !item.category || knownCategories.has(item.category)) continue
		orphanCategories[item.category] = (orphanCategories[item.category] ?? 0) + 1
	}
	return orphanCategories
}

function buildSnapshot(categories: string[], index: BlogIndexItem[]): CategoryManagementSnapshot {
	return {
		categories,
		usage: buildUsage(categories, index),
		orphanCategories: buildOrphanUsage(categories, index)
	}
}

async function readRequiredFile(token: string, path: string, ref: string): Promise<string> {
	const content = await readTextFileFromRepo(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, path, ref)
	if (content === null) throw new Error(`缺少必要文件：${path}`)
	return content
}

async function loadRepositoryState(token: string, ref: string) {
	const [categoriesText, indexText] = await Promise.all([
		readRequiredFile(token, 'public/blogs/categories.json', ref),
		readRequiredFile(token, 'public/blogs/index.json', ref)
	])
	const categories = parseCategoriesFile(categoriesText)
	const index = parseBlogIndex(indexText)
	return { categories, index }
}

async function readPreferredRequiredFile(path: string): Promise<string> {
	const content = await readPreferredTextFileFromRepo(
		GITHUB_CONFIG.OWNER,
		GITHUB_CONFIG.REPO,
		path,
		GITHUB_CONFIG.BRANCH
	)
	if (content === null) throw new Error(`缺少必要文件：${path}`)
	return content
}

async function loadPreferredRepositoryState() {
	const [categoriesText, indexText] = await Promise.all([
		readPreferredRequiredFile('public/blogs/categories.json'),
		readPreferredRequiredFile('public/blogs/index.json')
	])
	const categories = parseCategoriesFile(categoriesText)
	const index = parseBlogIndex(indexText)
	return { categories, index }
}

function assertCategoryNameAllowed(name: string) {
	if (RESERVED_CATEGORY_NAMES.has(name)) {
		throw new Error(`“${name}”是系统保留名称，请使用其他分类名称`)
	}
}

function assertUniqueCategory(categories: string[], name: string, ignoreName?: string) {
	if (categories.some(category => category !== ignoreName && category === name)) {
		throw new Error(`分类“${name}”已存在`)
	}
}

function assertRenameTargetNotOrphan(categories: string[], index: BlogIndexItem[], name: string) {
	if (categories.includes(name)) return
	if (index.some(item => item.category === name)) {
		throw new Error(`已有文章使用异常分类“${name}”，请先将它添加为正式分类，再执行迁移或删除`)
	}
}

async function commitTreeItems(token: string, latestCommitSha: string, treeItems: TreeItem[], message: string): Promise<void> {
	const treeData = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, latestCommitSha)
	const commitData = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, message, treeData.sha, [latestCommitSha])
	try {
		await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`, commitData.sha)
	} catch (error) {
		const message = error instanceof Error ? error.message : ''
		if (message.includes('409') || message.includes('422')) {
			throw new Error('GitHub 分支刚刚发生了变化，请重新加载分类后再试')
		}
		throw error
	}
}

async function prepareArticleCategoryUpdates(
	token: string,
	ref: string,
	index: BlogIndexItem[],
	fromCategory: string,
	toCategory: string
): Promise<{ nextIndex: BlogIndexItem[]; configItems: TreeItem[]; affectedArticles: number }> {
	const affected = index.filter(item => item.category === fromCategory)
	const nextIndex = index.map(item => (item.category === fromCategory ? { ...item, category: toCategory } : item))
	const configItems: TreeItem[] = []

	for (const item of affected) {
		if (!item.slug || typeof item.slug !== 'string') throw new Error('文章索引存在无效 slug，已停止修改分类')
		const path = `public/blogs/${item.slug}/config.json`
		const configText = await readRequiredFile(token, path, ref)
		const config = JSON.parse(configText) as Record<string, unknown>
		config.category = toCategory
		configItems.push({
			path,
			mode: '100644',
			type: 'blob',
			content: JSON.stringify(config, null, 2)
		})
	}

	return { nextIndex, configItems, affectedArticles: affected.length }
}

export async function getCategoryManagementSnapshot(): Promise<CategoryManagementSnapshot> {
	// 本次改动：已认证时优先使用认证 REST API；未认证时用 GitHub Raw 读取分类列表、文章数和异常分类。
	const { categories, index } = await loadPreferredRepositoryState()
	return buildSnapshot(categories, index)
}

export async function addCategory(name: string): Promise<CategoryMutationResult> {
	const nextName = normalizeName(name)
	if (!nextName) throw new Error('分类名称不能为空')
	assertCategoryNameAllowed(nextName)

	const token = await getAuthToken()
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const { categories, index } = await loadRepositoryState(token, refData.sha)
	assertUniqueCategory(categories, nextName)

	const nextCategories = [...categories, nextName]
	await commitTreeItems(
		token,
		refData.sha,
		[
			{
				path: 'public/blogs/categories.json',
				mode: '100644',
				type: 'blob',
				content: JSON.stringify({ categories: nextCategories }, null, 2)
			}
		],
		`新增分类: ${nextName}`
	)

	return { ...buildSnapshot(nextCategories, index), affectedArticles: 0 }
}

export async function renameCategory(oldName: string, newName: string): Promise<CategoryMutationResult> {
	const fromCategory = normalizeName(oldName)
	const toCategory = normalizeName(newName)
	if (!fromCategory || !toCategory) throw new Error('分类名称不能为空')
	if (fromCategory === toCategory) throw new Error('新分类名称与原名称相同')
	assertCategoryNameAllowed(toCategory)

	const token = await getAuthToken()
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const { categories, index } = await loadRepositoryState(token, refData.sha)
	if (!categories.includes(fromCategory)) throw new Error(`分类“${fromCategory}”不存在，请刷新后重试`)
	assertUniqueCategory(categories, toCategory, fromCategory)
	assertRenameTargetNotOrphan(categories, index, toCategory)

	const nextCategories = categories.map(category => (category === fromCategory ? toCategory : category))
	const { nextIndex, configItems, affectedArticles } = await prepareArticleCategoryUpdates(token, refData.sha, index, fromCategory, toCategory)
	const treeItems: TreeItem[] = [
		{
			path: 'public/blogs/categories.json',
			mode: '100644',
			type: 'blob',
			content: JSON.stringify({ categories: nextCategories }, null, 2)
		}
	]
	if (affectedArticles > 0) {
		treeItems.push({
			path: 'public/blogs/index.json',
			mode: '100644',
			type: 'blob',
			content: JSON.stringify(nextIndex, null, 2)
		})
		treeItems.push(...configItems)
	}

	await commitTreeItems(token, refData.sha, treeItems, `修改分类: ${fromCategory} -> ${toCategory}`)
	return { ...buildSnapshot(nextCategories, nextIndex), affectedArticles }
}

export async function deleteCategory(name: string, replacementCategory = ''): Promise<CategoryMutationResult> {
	const targetCategory = normalizeName(name)
	const replacement = normalizeName(replacementCategory)
	if (!targetCategory) throw new Error('分类名称不能为空')
	if (targetCategory === replacement) throw new Error('不能迁移到正在删除的分类')

	const token = await getAuthToken()
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const { categories, index } = await loadRepositoryState(token, refData.sha)
	if (!categories.includes(targetCategory)) throw new Error(`分类“${targetCategory}”不存在，请刷新后重试`)
	if (replacement && !categories.includes(replacement)) throw new Error(`迁移目标“${replacement}”不存在，请刷新后重试`)

	const nextCategories = categories.filter(category => category !== targetCategory)
	const { nextIndex, configItems, affectedArticles } = await prepareArticleCategoryUpdates(token, refData.sha, index, targetCategory, replacement)
	const treeItems: TreeItem[] = [
		{
			path: 'public/blogs/categories.json',
			mode: '100644',
			type: 'blob',
			content: JSON.stringify({ categories: nextCategories }, null, 2)
		}
	]
	if (affectedArticles > 0) {
		treeItems.push({
			path: 'public/blogs/index.json',
			mode: '100644',
			type: 'blob',
			content: JSON.stringify(nextIndex, null, 2)
		})
		treeItems.push(...configItems)
	}

	await commitTreeItems(token, refData.sha, treeItems, `删除分类: ${targetCategory}`)
	return { ...buildSnapshot(nextCategories, nextIndex), affectedArticles }
}
