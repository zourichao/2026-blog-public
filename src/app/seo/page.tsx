'use client'

import { useEffect, useRef, useState } from 'react'
import { Braces, FileText, Globe2, Home, Layers3, Loader2, RefreshCw, Save, Settings2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/hooks/use-auth'
import { getAuthToken, getPemFromCache } from '@/lib/auth'
import { SEARCH_ENGINE_INDEXING_ENABLED } from '@/config/site'
import {
	SEO_CONFIG_VERSION,
	PUBLIC_SEO_PAGES,
	buildCategoryTitle,
	generateCategorySeo,
	generateHomeDescription,
	validateSeoConfigShape,
	type NormalizedSeoConfig,
	type PublicSeoPagePath
} from '@/lib/seo-config'
import { getSeoManagementSnapshot, saveSeoConfig } from './services/seo-manager'

type KeywordEditorProps = { value: string[]; onChange: (keywords: string[]) => void; label?: string }
type SectionKey = 'overview' | 'site' | 'home' | 'categories' | 'articles' | 'pages' | 'verification' | 'advanced'

type SeoStatusItem = {
	title: string
	description: string
	keywords: string[]
}

const NAV_ITEMS: Array<{ key: SectionKey; label: string; icon: typeof Home }> = [
	{ key: 'overview', label: 'SEO 概览', icon: Globe2 },
	{ key: 'site', label: '站点设置', icon: Settings2 },
	{ key: 'home', label: '首页 SEO', icon: Home },
	{ key: 'categories', label: '分类 SEO', icon: Layers3 },
	{ key: 'articles', label: '文章 SEO', icon: FileText },
	{ key: 'pages', label: '公开页面 SEO', icon: Globe2 },
	{ key: 'verification', label: '站点验证', icon: ShieldCheck },
	{ key: 'advanced', label: '高级设置', icon: Braces }
]

const normalizeKeywords = (value: string): string[] => Array.from(new Set(value.split(',').map(item => item.trim()).filter(Boolean)))
const isSeoConfigured = (item: SeoStatusItem): boolean => Boolean(item.title.trim() && item.description.trim())

function KeywordEditor({ value, onChange, label = 'Keywords' }: KeywordEditorProps) {
	const [text, setText] = useState(value.join(', '))
	useEffect(() => setText(value.join(', ')), [value])
	const keywords = normalizeKeywords(text)
	return (
		<div>
			<label className='mb-1 block text-xs font-medium'>{label}</label>
			<input
				value={text}
				onChange={event => {
					setText(event.target.value)
					onChange(normalizeKeywords(event.target.value))
				}}
				onBlur={() => setText(keywords.join(', '))}
				placeholder='多个关键词用英文逗号 , 分隔'
				className='bg-card w-full rounded-lg border px-3 py-2 text-sm'
			/>
			<p className={`mt-1 text-xs ${keywords.length > 10 ? 'text-red-500' : 'text-secondary'}`}>{keywords.length}/10 个；自动去重并清理首尾空格。</p>
		</div>
	)
}

function SearchPreview({ title, description, url }: { title: string; description: string; url: string }) {
	return (
		<div className='rounded-xl border bg-white p-4 text-left dark:bg-black/10'>
			<div className='truncate text-xs text-emerald-700'>{url}</div>
			<div className='mt-1 line-clamp-1 text-lg text-blue-700'>{title || '未填写标题'}</div>
			<div className='mt-1 line-clamp-2 text-sm text-zinc-600'>{description || '未填写 Description'}</div>
			<p className='text-secondary mt-2 text-[11px]'>仅为近似搜索结果预览，实际展示由搜索引擎决定。</p>
		</div>
	)
}

function StatusBadge({ configured }: { configured: boolean }) {
	return (
		<span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${configured ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}`}>
			{configured ? '已配置' : '待补充'}
		</span>
	)
}

function OverviewCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
	return (
		<div className='rounded-2xl border bg-white/35 p-4 dark:bg-black/10'>
			<p className='text-secondary text-xs'>{title}</p>
			<p className='mt-1 text-base font-medium'>{value}</p>
			{hint && <p className='text-secondary mt-1 text-xs leading-5'>{hint}</p>}
		</div>
	)
}

export default function SeoPage() {
	const { privateKey, setPrivateKey } = useAuthStore()
	const pemInputRef = useRef<HTMLInputElement>(null)
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [headSha, setHeadSha] = useState('')
	const [baselineText, setBaselineText] = useState('')
	const [rawText, setRawText] = useState('')
	const [config, setConfig] = useState<NormalizedSeoConfig | null>(null)
	const [categories, setCategories] = useState<string[]>([])
	const [categorySlugs, setCategorySlugs] = useState<Record<string, string>>({})
	const [articles, setArticles] = useState<Array<{ title?: string; summary?: string; category?: string }>>([])
	const [categoryChanged, setCategoryChanged] = useState(false)
	const [rawError, setRawError] = useState<string | null>(null)
	const [shapeWarnings, setShapeWarnings] = useState<string[]>([])
	const [activeSection, setActiveSection] = useState<SectionKey>('overview')
	const [selectedCategory, setSelectedCategory] = useState('')
	const [selectedPage, setSelectedPage] = useState<PublicSeoPagePath>('/about')

	const syncCategories = (nextConfig: NormalizedSeoConfig, names: string[]) => {
		const previousNames = Object.keys(nextConfig.categories)
		const changed = previousNames.length !== names.length || previousNames.some(name => !names.includes(name)) || names.some(name => !previousNames.includes(name))
		const nextCategories: NormalizedSeoConfig['categories'] = {}
		for (const name of names) nextCategories[name] = nextConfig.categories[name] ?? { title: '', description: '', keywords: [] }
		return { synced: { ...nextConfig, categories: nextCategories }, changed }
	}

	const setVisualConfig = (next: NormalizedSeoConfig) => {
		setConfig(next)
		setRawText(JSON.stringify(next, null, 2))
		setRawError(null)
		setShapeWarnings([])
	}

	const load = async (forcedPem?: string) => {
		if (loading) return
		setLoading(true)
		setLoadError(null)
		try {
			const pem = forcedPem || privateKey || (await getPemFromCache())
			if (!pem) {
				pemInputRef.current?.click()
				return
			}
			if (!privateKey) setPrivateKey(pem)
			await getAuthToken({ silent: true })
			const snapshot = await getSeoManagementSnapshot()
			let parsed: unknown
			try {
				parsed = JSON.parse(snapshot.seoText)
			} catch {
				throw new Error('GitHub main 中的 SEO JSON 格式错误，已停止加载')
			}
			const validated = validateSeoConfigShape(parsed)
			const names = snapshot.categories.categories
			const { synced, changed } = syncCategories(validated.config, names)
			setHeadSha(snapshot.headSha)
			setBaselineText(snapshot.seoText)
			setCategories(names)
			setCategorySlugs(snapshot.categories.categorySlugs ?? {})
			setArticles(snapshot.articles)
			setConfig(synced)
			setRawText(JSON.stringify(synced, null, 2))
			setCategoryChanged(changed)
			setShapeWarnings(validated.warnings)
			setRawError(null)
			setSelectedCategory(current => current && names.includes(current) ? current : (names[0] ?? ''))
		} catch (error) {
			const message = error instanceof Error ? error.message : 'SEO 配置加载失败'
			setLoadError(message)
			toast.error(message)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		void load()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const handlePemImport = async (file?: File) => {
		if (!file) return
		try {
			const pem = await file.text()
			if (!pem.includes('PRIVATE KEY')) throw new Error('所选文件不是有效的 PEM 私钥')
			setPrivateKey(pem)
			await getAuthToken({ silent: true })
			toast.success('私钥导入成功')
			await load(pem)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : '私钥导入失败')
		} finally {
			if (pemInputRef.current) pemInputRef.current.value = ''
		}
	}

	const handleRawChange = (text: string) => {
		setRawText(text)
		try {
			const parsed = JSON.parse(text) as unknown
			const validated = validateSeoConfigShape(parsed)
			setConfig(validated.config)
			setShapeWarnings(validated.warnings)
			setRawError(null)
		} catch (error) {
			setRawError(error instanceof Error ? error.message : 'JSON 无效')
		}
	}

	const save = async () => {
		if (!headSha || saving) return
		setSaving(true)
		try {
			let parsed: Record<string, unknown>
			try {
				parsed = JSON.parse(rawText) as Record<string, unknown>
			} catch {
				throw new Error('JSON 格式错误，不能保存')
			}
			const validated = validateSeoConfigShape(parsed)
			if (validated.config.version > SEO_CONFIG_VERSION) throw new Error(`配置版本 v${validated.config.version} 高于当前代码支持的 v${SEO_CONFIG_VERSION}，已禁止覆盖`)
			if (parsed.site && typeof parsed.site === 'object' && !Array.isArray(parsed.site) && typeof (parsed.site as Record<string, unknown>).officialOrigin === 'string') {
				;(parsed.site as Record<string, unknown>).officialOrigin = validated.config.site.officialOrigin
			}
			if (validated.config.home.keywords.length > 10) throw new Error('首页 Keywords 不能超过 10 个')
			for (const [name, item] of Object.entries(validated.config.categories)) if (item.keywords.length > 10) throw new Error(`分类“${name}”Keywords 不能超过 10 个`)
			for (const { path } of PUBLIC_SEO_PAGES) if (validated.config.pages[path].keywords.length > 10) throw new Error(`页面“${path}”Keywords 不能超过 10 个`)
			parsed.version = SEO_CONFIG_VERSION
			const saveText = `${JSON.stringify(parsed, null, 2)}\n`
			if (saveText.trim() === baselineText.trim()) throw new Error('SEO 配置没有发生变化')
			const newHead = await saveSeoConfig(saveText, headSha)
			setHeadSha(newHead)
			setBaselineText(saveText)
			setRawText(saveText.trimEnd())
			setConfig(validateSeoConfigShape(parsed).config)
			setCategoryChanged(false)
			toast.success('SEO 配置保存成功，已提交到 GitHub main')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'SEO 配置保存失败')
		} finally {
			setSaving(false)
		}
	}

	const unsaved = Boolean(rawText && rawText.trim() !== baselineText.trim())
	const versionWarning = config && config.version < SEO_CONFIG_VERSION ? `配置版本较旧：v${config.version}，当前代码支持 v${SEO_CONFIG_VERSION}。不会在加载时自动升级。` : null
	const versionBlocked = Boolean(config && config.version > SEO_CONFIG_VERSION)
	const origin = config?.site.officialOrigin ?? ''
	const categoryTitle = (name: string) => config ? buildCategoryTitle(name, config) : name
	const inlineWarn = (value: string, limit: number, emptyText: string) => <p className={`mt-1 text-xs ${!value.trim() || value.length > limit ? 'text-amber-600' : 'text-secondary'}`}>{!value.trim() ? emptyText : value.length > limit ? `当前 ${value.length} 字，建议不超过 ${limit} 字；不强制截断。` : `${value.length}/${limit} 字`}</p>

	if (!config) {
		return (
			<main className='mx-auto w-full max-w-5xl px-4 py-10 sm:px-6'>
				<input ref={pemInputRef} type='file' accept='.pem,.key,text/plain' className='hidden' onChange={event => void handlePemImport(event.target.files?.[0])} />
				<div className='card p-6'>
					<h1 className='text-xl font-semibold'>SEO 设置</h1>
					<p className='text-secondary mt-2 text-sm'>独立管理站点、首页、分类与其他公开页面 SEO。此页面禁止搜索引擎收录。</p>
					{loading ? <div className='text-secondary mt-6 flex items-center gap-2 text-sm'><Loader2 className='h-4 w-4 animate-spin' />正在认证并读取 GitHub main...</div> : <button type='button' onClick={() => void load()} className='bg-brand mt-6 rounded-lg px-4 py-2 text-sm text-white'>导入私钥 / 重新加载</button>}
					{loadError && <p className='mt-3 text-sm text-red-500'>{loadError}</p>}
				</div>
			</main>
		)
	}

	const configuredCategoryCount = categories.filter(name => isSeoConfigured(config.categories[name] ?? { title: '', description: '', keywords: [] })).length
	const configuredPageCount = PUBLIC_SEO_PAGES.filter(({ path }) => isSeoConfigured(config.pages[path])).length
	const verificationEnabledCount = Object.values(config.verification).filter(item => item.enabled).length
	const activeCategory = selectedCategory && categories.includes(selectedCategory) ? selectedCategory : (categories[0] ?? '')
	const activePageDefinition = PUBLIC_SEO_PAGES.find(item => item.path === selectedPage) ?? PUBLIC_SEO_PAGES[0]
	const activePage = activePageDefinition.path

	return (
		<main className='mx-auto w-full max-w-7xl px-4 pt-24 pb-8 sm:px-6 lg:px-8'>
			<input ref={pemInputRef} type='file' accept='.pem,.key,text/plain' className='hidden' onChange={event => void handlePemImport(event.target.files?.[0])} />

			<div className='mb-5 flex flex-wrap items-start justify-between gap-3'>
				<div>
					<h1 className='text-2xl font-semibold'>SEO 设置</h1>
					<p className='text-secondary mt-1 text-sm'>站点、首页、分类、文章规则与公开页面 SEO 集中管理。</p>
				</div>
				<div className='flex items-center gap-2'>
					{unsaved && <span className='rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700'>有未保存修改</span>}
					<button type='button' disabled={loading || saving} onClick={() => void load()} className='bg-card inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs disabled:opacity-50'><RefreshCw className='h-3.5 w-3.5' />重新读取</button>
					<button type='button' disabled={saving || Boolean(rawError) || versionBlocked} onClick={() => void save()} className='bg-brand inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white disabled:opacity-50'>{saving ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Save className='h-3.5 w-3.5' />}{saving ? '保存中…' : '保存'}</button>
				</div>
			</div>

			{categoryChanged && <div className='mb-4 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-700'>分类配置有变动。当前页面已按最新分类同步到未保存状态，点击“保存”后才写入 GitHub。</div>}
			{versionWarning && <div className='mb-4 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-700'>{versionWarning}</div>}
			{versionBlocked && <div className='mb-4 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-600'>当前 JSON 版本高于代码支持版本，禁止保存，避免旧代码覆盖新结构。</div>}
			{shapeWarnings.length > 0 && <div className='mb-4 rounded-xl border px-4 py-3 text-xs text-amber-700'>{shapeWarnings.join('；')}</div>}

			<div className='grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]'>
				<aside className='card self-start p-2 lg:sticky lg:top-28'>
					<nav className='flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible'>
						{NAV_ITEMS.map(item => {
							const Icon = item.icon
							const active = activeSection === item.key
							return (
								<button
									key={item.key}
									type='button'
									onClick={() => setActiveSection(item.key)}
									className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition lg:w-full ${active ? 'bg-brand text-white' : 'hover:bg-foreground/[0.05]'}`}
								>
									<Icon className='h-4 w-4' />
									{item.label}
								</button>
							)
						})}
					</nav>
				</aside>

				<div className='min-w-0'>
					{activeSection === 'overview' && (
						<section className='card p-5 sm:p-6'>
							<div>
								<h2 className='text-lg font-medium'>SEO 概览</h2>
								<p className='text-secondary mt-1 text-sm'>先看整体状态，再进入对应模块修改。文章 SEO 继续自动读取文章已有字段。</p>
							</div>
							<div className='mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
								<OverviewCard title='正式域名' value={config.site.officialOrigin} hint='Canonical、Sitemap 和预览 URL 统一使用此域名。' />
								<OverviewCard title='搜索收录' value={SEARCH_ENGINE_INDEXING_ENABLED ? '已开启' : '已关闭'} hint='公开页面按代码规则输出 robots；/write、/seo、/api/* 单独禁止。' />
								<OverviewCard title='SEO JSON' value={`v${config.version}`} hint={unsaved ? '当前有未保存修改。' : '当前页面与已读取配置一致。'} />
								<OverviewCard title='分类 SEO' value={`${configuredCategoryCount}/${categories.length} 已配置`} hint={categoryChanged ? '检测到分类变化，保存后写入 GitHub。' : '分类配置与当前分类列表一致。'} />
								<OverviewCard title='公开页面 SEO' value={`${configuredPageCount}/${PUBLIC_SEO_PAGES.length} 已配置`} hint='每个公开根页面都有独立 Title / Description / Canonical。' />
								<OverviewCard title='搜索引擎验证' value={`${verificationEnabledCount}/3 已开启`} hint='Google、Bing、百度分别独立控制。' />
							</div>
							<div className='mt-5 grid gap-3 sm:grid-cols-2'>
								<a href={`${origin}/sitemap.xml`} target='_blank' rel='noreferrer' className='rounded-xl border px-4 py-3 text-sm transition hover:bg-foreground/[0.03]'><span className='font-medium'>Sitemap</span><span className='text-secondary ml-2 text-xs'>打开 sitemap.xml</span></a>
								<a href={`${origin}/robots.txt`} target='_blank' rel='noreferrer' className='rounded-xl border px-4 py-3 text-sm transition hover:bg-foreground/[0.03]'><span className='font-medium'>Robots</span><span className='text-secondary ml-2 text-xs'>打开 robots.txt</span></a>
							</div>
						</section>
					)}

					{activeSection === 'site' && (
						<section className='card p-5 sm:p-6'>
							<h2 className='text-lg font-medium'>站点设置</h2>
							<p className='text-secondary mt-1 text-sm'>正式域名会统一影响 Canonical、Sitemap 和预览 URL；版本号由系统维护。</p>
							<div className='mt-5 grid gap-4 sm:grid-cols-2'>
								{([
									['正式域名', 'officialOrigin'], ['站点名称', 'siteName'], ['辅助品牌词', 'brandAlias'], ['默认语言', 'language'], ['站点作者', 'author']
								] as const).map(([label, key]) => (
									<label key={key} className={key === 'officialOrigin' ? 'sm:col-span-2' : ''}>
										<span className='mb-1 block text-xs font-medium'>{label}</span>
										<input value={config.site[key]} onChange={event => setVisualConfig({ ...config, site: { ...config.site, [key]: event.target.value } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />
									</label>
								))}
								<div><span className='mb-1 block text-xs font-medium'>SEO JSON Version</span><div className='bg-foreground/[0.03] rounded-lg border px-3 py-2 text-sm'>v{config.version}（只读）</div></div>
							</div>
						</section>
					)}

					{activeSection === 'home' && (
						<section className='card p-5 sm:p-6'>
							<div className='flex flex-wrap items-start justify-between gap-3'>
								<div><h2 className='text-lg font-medium'>首页 SEO</h2><p className='text-secondary mt-1 text-sm'>Title 手动填写；Description 可按当前分类 + 品牌本地生成，不调用外部 AI。</p></div>
								<button type='button' onClick={() => setVisualConfig({ ...config, home: { ...config.home, description: generateHomeDescription(categories, config.site.siteName) } })} className='bg-card rounded-lg border px-3 py-2 text-xs'>一键生成 Description</button>
							</div>
							<div className='mt-5 space-y-4'>
								<div><label className='mb-1 block text-xs font-medium'>SEO Title</label><input value={config.home.title} onChange={event => setVisualConfig({ ...config, home: { ...config.home, title: event.target.value } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{inlineWarn(config.home.title, 30, 'Title 未填写；允许保存，但不建议为空。')}</div>
								<div><label className='mb-1 block text-xs font-medium'>Description</label><textarea rows={3} value={config.home.description} onChange={event => setVisualConfig({ ...config, home: { ...config.home, description: event.target.value } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{inlineWarn(config.home.description, 80, 'Description 未填写；允许保存，但不建议为空。')}</div>
								<KeywordEditor value={config.home.keywords} onChange={keywords => setVisualConfig({ ...config, home: { ...config.home, keywords } })} />
								<SearchPreview title={config.home.title} description={config.home.description} url={origin || '/'} />
								<div className='text-secondary break-all text-xs'>Canonical：{origin ? `${origin}/` : '/'}</div>
							</div>
						</section>
					)}

					{activeSection === 'categories' && (
						<section className='card p-5 sm:p-6'>
							<h2 className='text-lg font-medium'>分类 SEO</h2>
							<p className='text-secondary mt-1 text-sm'>分类 Slug 来自 `/write → 管理分类`；这里仅维护 SEO 文案。Title 最终自动追加“｜{config.site.siteName || '站点名称'}”。</p>
							<div className='mt-5 grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]'>
								<div className='space-y-2'>
									{categories.map(name => {
										const item = config.categories[name] ?? { title: '', description: '', keywords: [] }
										const slug = categorySlugs[name] ?? ''
										const active = activeCategory === name
										return (
											<button key={name} type='button' onClick={() => setSelectedCategory(name)} className={`w-full rounded-xl border p-3 text-left transition ${active ? 'border-brand bg-brand/5' : 'hover:bg-foreground/[0.03]'}`}>
												<div className='flex items-center justify-between gap-2'><span className='text-sm font-medium'>{name}</span><StatusBadge configured={isSeoConfigured(item)} /></div>
												<p className='text-secondary mt-1 truncate font-mono text-xs'>/{slug || '未配置 slug'}</p>
											</button>
										)
									})}
								</div>
								{activeCategory ? (() => {
									const item = config.categories[activeCategory] ?? { title: '', description: '', keywords: [] }
									const slug = categorySlugs[activeCategory] ?? ''
									const finalTitle = categoryTitle(activeCategory)
									return (
										<div className='rounded-2xl border p-4 sm:p-5'>
											<div className='flex flex-wrap items-start justify-between gap-3'><div><h3 className='font-medium'>{activeCategory}</h3><p className='text-secondary mt-1 font-mono text-xs'>/{slug || '未配置 slug'}</p></div><button type='button' onClick={() => { const generated = generateCategorySeo(activeCategory, articles); setVisualConfig({ ...config, categories: { ...config.categories, [activeCategory]: { ...item, title: generated.title, description: generated.description } } }) }} className='bg-card rounded-lg border px-3 py-2 text-xs'>一键生成 Title + Description</button></div>
											<div className='mt-4 space-y-4'>
												<div><label className='mb-1 block text-xs font-medium'>自定义 SEO Title（系统自动追加品牌）</label><input value={item.title} onChange={event => setVisualConfig({ ...config, categories: { ...config.categories, [activeCategory]: { ...item, title: event.target.value } } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{!item.title.trim() ? <p className='mt-1 text-xs text-amber-600'>Title 未填写；允许保存，将回退分类名称。</p> : inlineWarn(finalTitle, 30, 'Title 未填写。')}<p className='text-secondary mt-1 text-xs'>最终：{finalTitle}</p></div>
												<div><label className='mb-1 block text-xs font-medium'>Description</label><textarea rows={3} value={item.description} onChange={event => setVisualConfig({ ...config, categories: { ...config.categories, [activeCategory]: { ...item, description: event.target.value } } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{inlineWarn(item.description, 80, 'Description 未填写；允许保存，但不建议为空。')}</div>
												<KeywordEditor value={item.keywords} onChange={keywords => setVisualConfig({ ...config, categories: { ...config.categories, [activeCategory]: { ...item, keywords } } })} />
												<SearchPreview title={finalTitle} description={item.description} url={origin && slug ? `${origin}/${slug}` : `/${slug}`} />
												<div className='text-secondary break-all text-xs'>Canonical：{origin && slug ? `${origin}/${slug}` : `/${slug}`}</div>
											</div>
										</div>
									)
								})() : <div className='text-secondary rounded-2xl border border-dashed p-8 text-center text-sm'>暂无分类。</div>}
							</div>
						</section>
					)}

					{activeSection === 'articles' && (
						<section className='card p-5 sm:p-6'>
							<h2 className='text-lg font-medium'>文章 SEO</h2>
							<p className='text-secondary mt-1 text-sm'>文章 SEO 不新增第二套配置，继续读取写作页已经存在的文章字段。这里仅展示当前规则。</p>
							<div className='mt-5 divide-y rounded-2xl border'>
								{[
									['Title', `文章标题${config.site.siteName.trim() ? `｜${config.site.siteName.trim()}` : ''}`, '自动生成'],
									['Description', '文章摘要 summary', '直接读取'],
									['Keywords', '文章标签 tags', '直接读取'],
									['Author', '文章自身 author', '支持不同作者'],
									['Canonical', '正式域名 + /blog/{当前 slug}', '修改 Slug 后自动同步'],
									['分享预览图', '文章现有封面 cover', '不使用 SEO 备用图'],
									['隐藏文章', 'noindex / nofollow，并排除 Sitemap', '自动处理']
								].map(([label, value, note]) => (
									<div key={label} className='grid gap-1 px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)_140px] sm:items-center'>
										<span className='text-xs font-medium'>{label}</span>
										<span className='text-sm'>{value}</span>
										<span className='text-secondary text-xs sm:text-right'>{note}</span>
									</div>
								))}
							</div>
							<p className='text-secondary mt-4 text-xs'>文章标题与摘要长度不在 `/write` 增加提醒；文章缺少摘要时 Description 允许为空。</p>
						</section>
					)}

					{activeSection === 'pages' && (
						<section className='card p-5 sm:p-6'>
							<h2 className='text-lg font-medium'>其他公开页面 SEO</h2>
							<p className='text-secondary mt-1 text-sm'>每个公开根页面独立配置 Title / Description / Keywords；Canonical 根据正式域名和页面路径自动生成。</p>
							<div className='mt-5 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]'>
								<div className='space-y-2'>
									{PUBLIC_SEO_PAGES.map(({ path, label }) => {
										const item = config.pages[path]
										const active = activePage === path
										return (
											<button key={path} type='button' onClick={() => setSelectedPage(path)} className={`w-full rounded-xl border p-3 text-left transition ${active ? 'border-brand bg-brand/5' : 'hover:bg-foreground/[0.03]'}`}>
												<div className='flex items-center justify-between gap-2'><span className='text-sm font-medium'>{label}</span><StatusBadge configured={isSeoConfigured(item)} /></div>
												<p className='text-secondary mt-1 truncate font-mono text-xs'>{path}</p>
											</button>
										)
									})}
								</div>
								{(() => {
									const item = config.pages[activePage]
									const canonical = origin ? `${origin}${activePage}` : activePage
									return (
										<div className='rounded-2xl border p-4 sm:p-5'>
											<div><h3 className='font-medium'>{activePageDefinition.label}</h3><p className='text-secondary mt-1 font-mono text-xs'>{activePage}</p></div>
											<div className='mt-4 space-y-4'>
												<div><label className='mb-1 block text-xs font-medium'>SEO Title</label><input value={item.title} onChange={event => setVisualConfig({ ...config, pages: { ...config.pages, [activePage]: { ...item, title: event.target.value } } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{inlineWarn(item.title, 30, 'Title 未填写；允许保存，但不建议为空。')}</div>
												<div><label className='mb-1 block text-xs font-medium'>Description</label><textarea rows={3} value={item.description} onChange={event => setVisualConfig({ ...config, pages: { ...config.pages, [activePage]: { ...item, description: event.target.value } } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{inlineWarn(item.description, 80, 'Description 未填写；允许保存，但不建议为空。')}</div>
												<KeywordEditor value={item.keywords} onChange={keywords => setVisualConfig({ ...config, pages: { ...config.pages, [activePage]: { ...item, keywords } } })} />
												<SearchPreview title={item.title} description={item.description} url={canonical} />
												<div className='text-secondary break-all text-xs'>Canonical：{canonical}</div>
											</div>
										</div>
									)
								})()}
							</div>
						</section>
					)}

					{activeSection === 'verification' && (
						<section className='card p-5 sm:p-6'>
							<h2 className='text-lg font-medium'>搜索引擎站点验证</h2>
							<p className='text-secondary mt-1 text-sm'>Google、Bing、百度分别独立开关；默认关闭。关闭时保留验证码，但不向页面输出验证 meta。</p>
							<div className='mt-5 space-y-3'>
								{(['google', 'bing', 'baidu'] as const).map(key => {
									const labels = { google: 'Google', bing: 'Bing', baidu: '百度' }
									const item = config.verification[key]
									return (
										<div key={key} className='grid gap-3 rounded-xl border p-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center'>
											<label className='flex items-center gap-2 text-sm font-medium'><input type='checkbox' checked={item.enabled} onChange={event => setVisualConfig({ ...config, verification: { ...config.verification, [key]: { ...item, enabled: event.target.checked } } })} />{labels[key]}<span className={`rounded-full px-2 py-0.5 text-[11px] ${item.enabled ? 'bg-emerald-500/10 text-emerald-700' : 'bg-foreground/[0.05] text-secondary'}`}>{item.enabled ? '已开启' : '已关闭'}</span></label>
											<input value={item.value} onChange={event => setVisualConfig({ ...config, verification: { ...config.verification, [key]: { ...item, value: event.target.value } } })} placeholder='只填写验证代码，不填写整段 HTML' className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />
										</div>
									)
								})}
							</div>
						</section>
					)}

					{activeSection === 'advanced' && (
						<section className='card p-5 sm:p-6'>
							<h2 className='text-lg font-medium'>高级设置</h2>
							<p className='text-secondary mt-1 text-sm'>仅在需要直接检查或修改底层配置时使用。可视化表单与 JSON 保持双向同步。</p>
							<details className='mt-5 rounded-2xl border'>
								<summary className='cursor-pointer px-4 py-3 text-sm font-medium'>SEO JSON 原始编辑</summary>
								<div className='border-t p-4'>
									<p className='text-secondary text-xs'>允许直接编辑；合法 JSON 会同步回可视化表单。格式或类型错误时阻止保存。编辑框默认收敛，可拖动右下角上下放大或缩小。</p>
									<textarea spellCheck={false} value={rawText} onChange={event => handleRawChange(event.target.value)} className='bg-card mt-3 h-56 min-h-[160px] max-h-[70vh] w-full resize-y rounded-xl border px-3 py-3 font-mono text-xs leading-5 outline-none' />
									{rawError ? <p className='mt-2 text-xs text-red-500'>{rawError}</p> : <p className='text-secondary mt-2 text-xs'>JSON 格式与字段类型校验通过。</p>}
								</div>
							</details>
						</section>
					)}
				</div>
			</div>
		</main>
	)
}
