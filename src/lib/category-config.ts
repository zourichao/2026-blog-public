import categoriesFile from '@/../public/blogs/categories.json'

export type CategoryConfigFile = {
	categories: string[]
	categorySlugs?: Record<string, string>
}

export type CategoryEntry = {
	name: string
	slug: string
}

export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

export const RESERVED_ROOT_SLUGS = new Set([
	'_next',
	'about',
	'api',
	'blog',
	'bloggers',
	'blogs',
	'clock',
	'en',
	'favicon.ico',
	'image-toolbox',
	'images',
	'live2d',
	'manifest.json',
	'music',
	'pictures',
	'projects',
	'pwa',
	'robots.txt',
	'rss.xml',
	'seo',
	'share',
	'sitemap.xml',
	'snippets',
	'svgs',
	'write',
	'wuthering-waves',
	'zh'
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function validateCategorySlug(slugInput: string, allSlugs: string[] = [], ignoreSlug?: string): string {
	const slug = slugInput.trim()
	if (!slug) throw new Error('分类 URL Slug 不能为空')
	if (!CATEGORY_SLUG_PATTERN.test(slug)) throw new Error('分类 URL Slug 仅允许英文小写、数字和下划线 _，且不能以下划线开头或结尾')
	if (RESERVED_ROOT_SLUGS.has(slug)) throw new Error(`分类 URL /${slug} 与网站现有根目录冲突，请更换 Slug`)
	if (allSlugs.some(item => item !== ignoreSlug && item === slug)) throw new Error(`分类 URL Slug “${slug}”已存在`)
	return slug
}

export function parseCategoryConfig(input: unknown): CategoryConfigFile {
	if (!isPlainObject(input)) throw new Error('categories.json 顶层必须是对象')
	const unsupported = Object.keys(input).filter(key => key !== 'categories' && key !== 'categorySlugs')
	if (unsupported.length) throw new Error(`categories.json 不支持字段：${unsupported.join('、')}`)
	if (!Array.isArray(input.categories)) throw new Error('categories.json 必须包含 categories 数组')
	if (!isPlainObject(input.categorySlugs)) throw new Error('categories.json 必须包含 categorySlugs 对象')

	const categories = input.categories.map((value, index) => {
		if (typeof value !== 'string') throw new Error(`categories 第 ${index + 1} 项必须是字符串`)
		const name = value.trim()
		if (!name) throw new Error(`categories 第 ${index + 1} 项不能为空`)
		return name
	})
	if (new Set(categories).size !== categories.length) throw new Error('分类名称不能重复')

	const categorySlugs: Record<string, string> = {}
	for (const [name, rawSlug] of Object.entries(input.categorySlugs)) {
		if (!categories.includes(name)) throw new Error(`categorySlugs 包含不存在的分类“${name}”`)
		if (typeof rawSlug !== 'string') throw new Error(`categorySlugs.${name} 必须是字符串`)
		categorySlugs[name] = rawSlug.trim()
	}

	const seen: string[] = []
	for (const name of categories) {
		if (!Object.prototype.hasOwnProperty.call(categorySlugs, name)) throw new Error(`分类“${name}”缺少 URL Slug`)
		const slug = validateCategorySlug(categorySlugs[name], seen)
		categorySlugs[name] = slug
		seen.push(slug)
	}
	return { categories, categorySlugs }
}

export const staticCategoryConfig = parseCategoryConfig(categoriesFile)

export function getCategoryEntries(config: CategoryConfigFile = staticCategoryConfig): CategoryEntry[] {
	const slugs = config.categorySlugs ?? {}
	return config.categories.map(name => ({ name, slug: slugs[name] ?? '' }))
}

export function findCategoryBySlug(slug: string, config: CategoryConfigFile = staticCategoryConfig): CategoryEntry | undefined {
	return getCategoryEntries(config).find(entry => entry.slug === slug)
}
