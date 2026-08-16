import { GITHUB_CONFIG } from '@/consts'
import { getAuthToken } from '@/lib/auth'
import { createCommit, createTree, getRef, readTextFileFromRepo, updateRef, type TreeItem } from '@/lib/github-client'
import { parseCategoryConfig, validateCategorySlug, type CategoryConfigFile } from '@/lib/category-config'

export type CategoryUsage = Record<string, number>
export type CategoryManagementSnapshot = {
	categories: string[]
	categorySlugs: Record<string, string>
	usage: CategoryUsage
	orphanCategories: CategoryUsage
}
export type CategoryMutationResult = CategoryManagementSnapshot & { affectedArticles: number }

type BlogIndexItem = { slug?: string; category?: string; [key: string]: unknown }
const CATEGORY_BRANCH = 'main'
const RESERVED_CATEGORY_NAMES = new Set(['未分类'])

function normalizeName(name: string): string {
	return name.trim()
}
function parseCategoriesFile(content: string): CategoryConfigFile {
	return parseCategoryConfig(JSON.parse(content) as unknown)
}
function parseBlogIndex(content: string): BlogIndexItem[] {
	const data = JSON.parse(content) as unknown
	if (!Array.isArray(data)) throw new Error('文章索引格式不正确')
	return data as BlogIndexItem[]
}
function serializeCategories(categories: string[], categorySlugs: Record<string, string>): string {
	const orderedSlugs: Record<string, string> = {}
	for (const category of categories) orderedSlugs[category] = categorySlugs[category] ?? ''
	return JSON.stringify({ categories, categorySlugs: orderedSlugs }, null, 2)
}
function buildUsage(categories: string[], index: BlogIndexItem[]): CategoryUsage {
	const usage: CategoryUsage = Object.fromEntries(categories.map(category => [category, 0]))
	for (const item of index) {
		if (typeof item.category === 'string' && item.category && Object.prototype.hasOwnProperty.call(usage, item.category)) usage[item.category] += 1
	}
	return usage
}
function buildOrphanUsage(categories: string[], index: BlogIndexItem[]): CategoryUsage {
	const known = new Set(categories)
	const result: CategoryUsage = {}
	for (const item of index) {
		if (typeof item.category !== 'string' || !item.category || known.has(item.category)) continue
		result[item.category] = (result[item.category] ?? 0) + 1
	}
	return result
}
function buildSnapshot(config: CategoryConfigFile, index: BlogIndexItem[]): CategoryManagementSnapshot {
	return {
		categories: config.categories,
		categorySlugs: config.categorySlugs ?? {},
		usage: buildUsage(config.categories, index),
		orphanCategories: buildOrphanUsage(config.categories, index)
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
	return { config: parseCategoriesFile(categoriesText), index: parseBlogIndex(indexText) }
}
function assertCategoryNameAllowed(name: string) {
	if (RESERVED_CATEGORY_NAMES.has(name)) throw new Error(`“${name}”是系统保留名称，请使用其他分类名称`)
}
function assertUniqueCategory(categories: string[], name: string, ignoreName?: string) {
	if (categories.some(category => category !== ignoreName && category === name)) throw new Error(`分类“${name}”已存在`)
}
function assertRenameTargetNotOrphan(categories: string[], index: BlogIndexItem[], name: string) {
	if (categories.includes(name)) return
	if (index.some(item => item.category === name)) throw new Error(`已有文章使用异常分类“${name}”，请先将它添加为正式分类，再执行迁移或删除`)
}
function validateAllSlugs(categories: string[], categorySlugs: Record<string, string>) {
	const seen: string[] = []
	for (const name of categories) {
		const slug = validateCategorySlug(categorySlugs[name] ?? '', seen)
		seen.push(slug)
	}
}
function parseEditableCategoriesJson(jsonText: string): CategoryConfigFile {
	let data: unknown
	try {
		data = JSON.parse(jsonText) as unknown
	} catch {
		throw new Error('JSON 格式错误，请检查括号、引号和逗号')
	}
	const config = parseCategoryConfig(data)
	for (const name of config.categories) assertCategoryNameAllowed(name)
	return config
}

function sameArray(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((item, index) => item === right[index])
}
function sameSlugs(categories: string[], left: Record<string, string>, right: Record<string, string>): boolean {
	return categories.every(name => (left[name] ?? '') === (right[name] ?? ''))
}
async function commitTreeItems(token: string, latestCommitSha: string, treeItems: TreeItem[], message: string): Promise<void> {
	const tree = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, latestCommitSha)
	const commit = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, message, tree.sha, [latestCommitSha])
	try {
		await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${CATEGORY_BRANCH}`, commit.sha)
	} catch (error) {
		const message = error instanceof Error ? error.message : ''
		if (message.includes('409') || message.includes('422')) throw new Error('GitHub main 刚刚发生了变化，请重新加载分类后再试')
		throw error
	}
}
async function prepareArticleCategoryUpdates(token: string, ref: string, index: BlogIndexItem[], fromCategory: string, toCategory: string) {
	const affected = index.filter(item => item.category === fromCategory)
	const nextIndex = index.map(item => (item.category === fromCategory ? { ...item, category: toCategory } : item))
	const configItems: TreeItem[] = []
	for (const item of affected) {
		if (!item.slug || typeof item.slug !== 'string') throw new Error('文章索引存在无效 slug，已停止修改分类')
		const path = `public/blogs/${item.slug}/config.json`
		const configText = await readRequiredFile(token, path, ref)
		const config = JSON.parse(configText) as Record<string, unknown>
		config.category = toCategory
		configItems.push({ path, mode: '100644', type: 'blob', content: JSON.stringify(config, null, 2) })
	}
	return { nextIndex, configItems, affectedArticles: affected.length }
}

export async function getCategoryManagementSnapshot(): Promise<CategoryManagementSnapshot> {
	// 分类管理必须认证：不再允许 GitHub Raw 未认证兜底。
	const token = await getAuthToken({ silent: true })
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${CATEGORY_BRANCH}`)
	const { config, index } = await loadRepositoryState(token, refData.sha)
	return buildSnapshot(config, index)
}

export async function addCategory(name: string, slugInput: string): Promise<CategoryMutationResult> {
	const nextName = normalizeName(name)
	if (!nextName) throw new Error('分类名称不能为空')
	assertCategoryNameAllowed(nextName)
	const token = await getAuthToken()
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${CATEGORY_BRANCH}`)
	const { config, index } = await loadRepositoryState(token, refData.sha)
	assertUniqueCategory(config.categories, nextName)
	const currentSlugs = config.categories.map(item => config.categorySlugs?.[item] ?? '')
	const slug = validateCategorySlug(slugInput, currentSlugs)
	const nextCategories = [...config.categories, nextName]
	const nextSlugs = { ...(config.categorySlugs ?? {}), [nextName]: slug }
	await commitTreeItems(token, refData.sha, [{ path: 'public/blogs/categories.json', mode: '100644', type: 'blob', content: serializeCategories(nextCategories, nextSlugs) }], `新增分类: ${nextName}`)
	return { ...buildSnapshot({ categories: nextCategories, categorySlugs: nextSlugs }, index), affectedArticles: 0 }
}

export async function updateCategoriesJson(jsonText: string, expectedCategories: string[], expectedCategorySlugs: Record<string, string>): Promise<CategoryMutationResult> {
	const nextConfig = parseEditableCategoriesJson(jsonText)
	const token = await getAuthToken()
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${CATEGORY_BRANCH}`)
	const { config: latest, index } = await loadRepositoryState(token, refData.sha)
	if (!sameArray(latest.categories, expectedCategories) || !sameSlugs(latest.categories, latest.categorySlugs ?? {}, expectedCategorySlugs)) throw new Error('分类配置刚刚发生了变化，请重新加载后再编辑 JSON')
	const missing = latest.categories.filter(category => !nextConfig.categories.includes(category))
	if (missing.length) throw new Error(`JSON 编辑不允许直接删除或改名已有分类：${missing.join('、')}。请使用列表中的编辑或删除功能`)
	for (const category of latest.categories) {
		if ((nextConfig.categorySlugs?.[category] ?? '') !== (latest.categorySlugs?.[category] ?? '')) throw new Error(`JSON 编辑不允许直接修改已有分类“${category}”的 Slug，请使用列表中的编辑功能`)
	}
	const unchanged = sameArray(latest.categories, nextConfig.categories) && sameSlugs(nextConfig.categories, latest.categorySlugs ?? {}, nextConfig.categorySlugs ?? {})
	if (unchanged) throw new Error('categories.json 内容未发生变化')
	await commitTreeItems(token, refData.sha, [{ path: 'public/blogs/categories.json', mode: '100644', type: 'blob', content: serializeCategories(nextConfig.categories, nextConfig.categorySlugs ?? {}) }], '更新博客分类配置')
	return { ...buildSnapshot(nextConfig, index), affectedArticles: 0 }
}

export async function renameCategory(oldName: string, newName: string, newSlugInput: string): Promise<CategoryMutationResult> {
	const fromCategory = normalizeName(oldName)
	const toCategory = normalizeName(newName)
	if (!fromCategory || !toCategory) throw new Error('分类名称不能为空')
	assertCategoryNameAllowed(toCategory)
	const token = await getAuthToken()
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${CATEGORY_BRANCH}`)
	const { config, index } = await loadRepositoryState(token, refData.sha)
	if (!config.categories.includes(fromCategory)) throw new Error(`分类“${fromCategory}”不存在，请刷新后重试`)
	assertUniqueCategory(config.categories, toCategory, fromCategory)
	if (fromCategory !== toCategory) assertRenameTargetNotOrphan(config.categories, index, toCategory)
	const oldSlug = config.categorySlugs?.[fromCategory] ?? ''
	const otherSlugs = config.categories.filter(name => name !== fromCategory).map(name => config.categorySlugs?.[name] ?? '').filter(Boolean)
	const nextSlug = validateCategorySlug(newSlugInput, otherSlugs)
	if (fromCategory === toCategory && oldSlug === nextSlug) throw new Error('分类名称和 URL Slug 均未发生变化')
	const nextCategories = config.categories.map(category => (category === fromCategory ? toCategory : category))
	const nextSlugs = { ...(config.categorySlugs ?? {}) }
	delete nextSlugs[fromCategory]
	nextSlugs[toCategory] = nextSlug
	let nextIndex = index
	let configItems: TreeItem[] = []
	let affectedArticles = 0
	if (fromCategory !== toCategory) {
		const prepared = await prepareArticleCategoryUpdates(token, refData.sha, index, fromCategory, toCategory)
		nextIndex = prepared.nextIndex
		configItems = prepared.configItems
		affectedArticles = prepared.affectedArticles
	}
	const treeItems: TreeItem[] = [{ path: 'public/blogs/categories.json', mode: '100644', type: 'blob', content: serializeCategories(nextCategories, nextSlugs) }]
	if (affectedArticles > 0) {
		treeItems.push({ path: 'public/blogs/index.json', mode: '100644', type: 'blob', content: JSON.stringify(nextIndex, null, 2) }, ...configItems)
	}
	await commitTreeItems(token, refData.sha, treeItems, `修改分类: ${fromCategory}${fromCategory !== toCategory ? ` -> ${toCategory}` : ''}`)
	return { ...buildSnapshot({ categories: nextCategories, categorySlugs: nextSlugs }, nextIndex), affectedArticles }
}

export async function deleteCategory(name: string, replacementCategory = ''): Promise<CategoryMutationResult> {
	const target = normalizeName(name)
	const replacement = normalizeName(replacementCategory)
	if (!target) throw new Error('分类名称不能为空')
	if (target === replacement) throw new Error('不能迁移到正在删除的分类')
	const token = await getAuthToken()
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${CATEGORY_BRANCH}`)
	const { config, index } = await loadRepositoryState(token, refData.sha)
	if (!config.categories.includes(target)) throw new Error(`分类“${target}”不存在，请刷新后重试`)
	if (replacement && !config.categories.includes(replacement)) throw new Error(`迁移目标“${replacement}”不存在，请刷新后重试`)
	const nextCategories = config.categories.filter(category => category !== target)
	const nextSlugs = { ...(config.categorySlugs ?? {}) }
	delete nextSlugs[target]
	const prepared = await prepareArticleCategoryUpdates(token, refData.sha, index, target, replacement)
	const treeItems: TreeItem[] = [{ path: 'public/blogs/categories.json', mode: '100644', type: 'blob', content: serializeCategories(nextCategories, nextSlugs) }]
	if (prepared.affectedArticles > 0) treeItems.push({ path: 'public/blogs/index.json', mode: '100644', type: 'blob', content: JSON.stringify(prepared.nextIndex, null, 2) }, ...prepared.configItems)
	await commitTreeItems(token, refData.sha, treeItems, `删除分类: ${target}`)
	return { ...buildSnapshot({ categories: nextCategories, categorySlugs: nextSlugs }, prepared.nextIndex), affectedArticles: prepared.affectedArticles }
}
