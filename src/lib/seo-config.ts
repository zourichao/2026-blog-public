import seoFile from '@/config/seo.json'

export const SEO_CONFIG_VERSION = 3

export type VerificationItem = { enabled: boolean; value: string }
export type SeoTextConfig = { title?: string; description?: string; keywords?: string[] }
export type CategorySeoConfig = SeoTextConfig
export type PageSeoConfig = SeoTextConfig & { includeInSitemap?: boolean; indexable?: boolean }

export const PUBLIC_SEO_PAGES = [
	{ path: '/about', label: '关于' },
	{ path: '/blog', label: '全部文章' },
	{ path: '/bloggers', label: '博主' },
	{ path: '/clock', label: '时钟' },
	{ path: '/image-toolbox', label: '图片工具箱' },
	{ path: '/live2d', label: 'Live2D' },
	{ path: '/pictures', label: '图片' },
	{ path: '/projects', label: '项目' },
	{ path: '/share', label: '推荐阅读' },
	{ path: '/snippets', label: '代码片段' },
	{ path: '/svgs', label: 'SVG' },
	{ path: '/wuthering-waves', label: '鸣潮' }
] as const

export type PublicSeoPagePath = (typeof PUBLIC_SEO_PAGES)[number]['path']
const PUBLIC_SEO_PAGE_PATH_SET = new Set<string>(PUBLIC_SEO_PAGES.map(item => item.path))

export type SeoConfig = {
	version?: number
	site?: {
		officialOrigin?: string
		siteName?: string
		brandAlias?: string
		language?: string
		author?: string
	}
	home?: SeoTextConfig
	verification?: {
		google?: Partial<VerificationItem>
		bing?: Partial<VerificationItem>
		baidu?: Partial<VerificationItem>
	}
	categories?: Record<string, CategorySeoConfig>
	pages?: Partial<Record<PublicSeoPagePath, PageSeoConfig>>
}

export type NormalizedSeoTextConfig = { title: string; description: string; keywords: string[] }
export type NormalizedPageSeoConfig = NormalizedSeoTextConfig & { includeInSitemap: boolean; indexable: boolean }
export type NormalizedSeoConfig = {
	version: number
	site: { officialOrigin: string; siteName: string; brandAlias: string; language: string; author: string }
	home: NormalizedSeoTextConfig
	verification: { google: VerificationItem; bing: VerificationItem; baidu: VerificationItem }
	categories: Record<string, NormalizedSeoTextConfig>
	pages: Record<PublicSeoPagePath, NormalizedPageSeoConfig>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[], path: string) {
	const unsupported = Object.keys(value).filter(key => !allowed.includes(key))
	if (unsupported.length) throw new Error(`${path} 不支持字段：${unsupported.join('、')}`)
}

const emptyVerification = (): VerificationItem => ({ enabled: false, value: '' })
const normalizeKeywords = (input: unknown): string[] => {
	if (!Array.isArray(input)) return []
	return Array.from(new Set(input.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)))
}

const normalizeTextConfig = (input?: SeoTextConfig): NormalizedSeoTextConfig => ({
	title: typeof input?.title === 'string' ? input.title : '',
	description: typeof input?.description === 'string' ? input.description : '',
	keywords: normalizeKeywords(input?.keywords)
})

const normalizePageConfig = (input?: PageSeoConfig): NormalizedPageSeoConfig => ({
	...normalizeTextConfig(input),
	includeInSitemap: input?.includeInSitemap !== false,
	indexable: input?.indexable !== false
})

export function normalizeOfficialOrigin(value: string): string {
	const trimmed = value.trim().replace(/\/+$/, '')
	let url: URL
	try {
		url = new URL(trimmed)
	} catch {
		throw new Error('正式域名格式错误，请填写完整 https:// 域名')
	}
	if (url.protocol !== 'https:') throw new Error('正式域名必须使用 https://')
	if (url.pathname !== '/' || url.search || url.hash) throw new Error('正式域名只能填写域名本身，不能包含路径、参数或锚点')
	return url.origin
}

export function normalizeSeoConfig(input: SeoConfig): NormalizedSeoConfig {
	const verification = input.verification ?? {}
	const normalizeVerification = (item?: Partial<VerificationItem>): VerificationItem => ({ enabled: item?.enabled === true, value: typeof item?.value === 'string' ? item.value.trim() : '' })
	const categories: NormalizedSeoConfig['categories'] = {}
	for (const [name, value] of Object.entries(input.categories ?? {})) categories[name] = normalizeTextConfig(value)
	const pages = {} as NormalizedSeoConfig['pages']
	for (const { path } of PUBLIC_SEO_PAGES) pages[path] = normalizePageConfig(input.pages?.[path])
	return {
		version: typeof input.version === 'number' ? input.version : SEO_CONFIG_VERSION,
		site: {
			officialOrigin: normalizeOfficialOrigin(typeof input.site?.officialOrigin === 'string' ? input.site.officialOrigin : 'https://www.999562.xyz'),
			siteName: typeof input.site?.siteName === 'string' ? input.site.siteName : '',
			brandAlias: typeof input.site?.brandAlias === 'string' ? input.site.brandAlias : '',
			language: typeof input.site?.language === 'string' ? input.site.language : 'zh-CN',
			author: typeof input.site?.author === 'string' ? input.site.author : ''
		},
		home: normalizeTextConfig(input.home),
		verification: {
			google: normalizeVerification(verification.google ?? emptyVerification()),
			bing: normalizeVerification(verification.bing ?? emptyVerification()),
			baidu: normalizeVerification(verification.baidu ?? emptyVerification())
		},
		categories,
		pages
	}
}

function validateTextConfig(value: unknown, path: string) {
	if (!isPlainObject(value)) throw new Error(`${path} 必须是对象`)
	assertAllowedKeys(value, ['title', 'description', 'keywords'], path)
	if (value.title !== undefined && typeof value.title !== 'string') throw new Error(`${path}.title 必须是字符串`)
	if (value.description !== undefined && typeof value.description !== 'string') throw new Error(`${path}.description 必须是字符串`)
	if (value.keywords !== undefined && (!Array.isArray(value.keywords) || value.keywords.some(item => typeof item !== 'string'))) throw new Error(`${path}.keywords 必须是字符串数组`)
}

function validatePageConfig(value: unknown, path: string) {
	if (!isPlainObject(value)) throw new Error(`${path} 必须是对象`)
	assertAllowedKeys(value, ['title', 'description', 'keywords', 'includeInSitemap', 'indexable'], path)
	if (value.title !== undefined && typeof value.title !== 'string') throw new Error(`${path}.title 必须是字符串`)
	if (value.description !== undefined && typeof value.description !== 'string') throw new Error(`${path}.description 必须是字符串`)
	if (value.keywords !== undefined && (!Array.isArray(value.keywords) || value.keywords.some(item => typeof item !== 'string'))) throw new Error(`${path}.keywords 必须是字符串数组`)
	if (value.includeInSitemap !== undefined && typeof value.includeInSitemap !== 'boolean') throw new Error(`${path}.includeInSitemap 必须是布尔值`)
	if (value.indexable !== undefined && typeof value.indexable !== 'boolean') throw new Error(`${path}.indexable 必须是布尔值`)
}

export function validateSeoConfigShape(input: unknown): { config: NormalizedSeoConfig; warnings: string[] } {
	if (!isPlainObject(input)) throw new Error('SEO JSON 顶层必须是对象')
	assertAllowedKeys(input, ['version', 'site', 'home', 'verification', 'categories', 'pages'], 'SEO JSON')
	const data = input as SeoConfig
	if (data.version !== undefined && (typeof data.version !== 'number' || !Number.isFinite(data.version))) throw new Error('version 必须是数字')

	if (data.site !== undefined) {
		if (!isPlainObject(data.site)) throw new Error('site 必须是对象')
		assertAllowedKeys(data.site as Record<string, unknown>, ['officialOrigin', 'siteName', 'brandAlias', 'language', 'author'], 'site')
		const fields: Array<[unknown, string]> = [
			[data.site.officialOrigin, 'site.officialOrigin'], [data.site.siteName, 'site.siteName'], [data.site.brandAlias, 'site.brandAlias'],
			[data.site.language, 'site.language'], [data.site.author, 'site.author']
		]
		for (const [value, path] of fields) if (value !== undefined && typeof value !== 'string') throw new Error(`${path} 必须是字符串`)
	}

	if (data.home !== undefined) validateTextConfig(data.home, 'home')

	if (data.verification !== undefined) {
		if (!isPlainObject(data.verification)) throw new Error('verification 必须是对象')
		assertAllowedKeys(data.verification as Record<string, unknown>, ['google', 'bing', 'baidu'], 'verification')
		for (const key of ['google', 'bing', 'baidu'] as const) {
			const item = data.verification[key]
			if (item === undefined) continue
			if (!isPlainObject(item)) throw new Error(`verification.${key} 必须是对象`)
			assertAllowedKeys(item as Record<string, unknown>, ['enabled', 'value'], `verification.${key}`)
			if (item.enabled !== undefined && typeof item.enabled !== 'boolean') throw new Error(`verification.${key}.enabled 必须是布尔值`)
			if (item.value !== undefined && typeof item.value !== 'string') throw new Error(`verification.${key}.value 必须是字符串`)
		}
	}

	if (data.categories !== undefined) {
		if (!isPlainObject(data.categories)) throw new Error('categories 必须是对象')
		for (const [name, category] of Object.entries(data.categories)) validateTextConfig(category, `categories.${name}`)
	}

	if (data.pages !== undefined) {
		if (!isPlainObject(data.pages)) throw new Error('pages 必须是对象')
		for (const [path, page] of Object.entries(data.pages)) {
			if (!PUBLIC_SEO_PAGE_PATH_SET.has(path)) throw new Error(`pages 不支持当前不存在或未声明的公开页面：${path}`)
			validatePageConfig(page, `pages.${path}`)
		}
	}

	const warnings: string[] = []
	if (!data.site) warnings.push('缺少 site，可保存但建议补齐')
	if (!data.home) warnings.push('缺少 home，可保存但建议补齐')
	if (!data.verification) warnings.push('缺少 verification，可保存但建议补齐')
	if (!data.categories) warnings.push('缺少 categories，可保存但建议补齐')
	if (!data.pages) warnings.push('缺少 pages，可保存但建议补齐')
	else {
		const missingPages = PUBLIC_SEO_PAGES.filter(item => !Object.prototype.hasOwnProperty.call(data.pages, item.path)).map(item => item.path)
		if (missingPages.length) warnings.push(`其他公开页面缺少配置：${missingPages.join('、')}`)
	}
	return { config: normalizeSeoConfig(data), warnings }
}

export const staticSeoConfig = validateSeoConfigShape(seoFile as unknown).config

export function buildCategoryTitle(categoryName: string, config: NormalizedSeoConfig = staticSeoConfig): string {
	const custom = config.categories[categoryName]?.title?.trim() || categoryName
	return config.site.siteName.trim() ? `${custom}｜${config.site.siteName.trim()}` : custom
}

export function generateHomeDescription(categoryNames: string[], siteName: string): string {
	const names = categoryNames.filter(Boolean).join('、')
	return `${siteName || '本站'}围绕${names || '当前文章分类'}持续记录产品实践、经验与思考。`.slice(0, 80)
}

export type SeoArticleSource = { title?: string; summary?: string; category?: string }
export function generateCategorySeo(categoryName: string, articles: SeoArticleSource[]): { title: string; description: string } {
	const related = articles.filter(item => item.category === categoryName)
	const title = `${categoryName}${related.length ? '与实践' : ''}`.slice(0, 30)
	const detail = related
		.flatMap(item => [item.title?.trim(), item.summary?.trim()])
		.filter((item): item is string => Boolean(item))
		.join('、')
	const description = `${categoryName}分类${detail ? `，聚焦${detail}` : ''}，整理相关产品实践、分析与经验。`.slice(0, 80)
	return { title, description }
}
