'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/hooks/use-auth'
import { getAuthToken, getPemFromCache } from '@/lib/auth'
import {
	SEO_CONFIG_VERSION,
	PUBLIC_SEO_PAGES,
	buildCategoryTitle,
	generateCategorySeo,
	generateHomeDescription,
	normalizeSeoConfig,
	validateSeoConfigShape,
	type NormalizedSeoConfig,
	type SeoConfig
} from '@/lib/seo-config'
import { getSeoManagementSnapshot, saveSeoConfig } from './services/seo-manager'

type KeywordEditorProps = { value: string[]; onChange: (keywords: string[]) => void; label?: string }
const normalizeKeywords = (value: string): string[] => Array.from(new Set(value.split(',').map(item => item.trim()).filter(Boolean)))

function KeywordEditor({ value, onChange, label = 'Keywords' }: KeywordEditorProps) {
	const [text, setText] = useState(value.join(', '))
	useEffect(() => setText(value.join(', ')), [value])
	const keywords = normalizeKeywords(text)
	return (
		<div>
			<label className='mb-1 block text-xs font-medium'>{label}</label>
			<input
				value={text}
				onChange={event => { setText(event.target.value); onChange(normalizeKeywords(event.target.value)) }}
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
			try { parsed = JSON.parse(snapshot.seoText) } catch { throw new Error('GitHub main 中的 SEO JSON 格式错误，已停止加载') }
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
		} catch (error) {
			const message = error instanceof Error ? error.message : 'SEO 配置加载失败'
			setLoadError(message)
			toast.error(message)
		} finally {
			setLoading(false)
		}
	}
	useEffect(() => { void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

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
			try { parsed = JSON.parse(rawText) as Record<string, unknown> } catch { throw new Error('JSON 格式错误，不能保存') }
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

	return (
		<main className='mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8'>
			<input ref={pemInputRef} type='file' accept='.pem,.key,text/plain' className='hidden' onChange={event => void handlePemImport(event.target.files?.[0])} />
			<div className='mb-6 flex flex-wrap items-start justify-between gap-3'>
				<div><h1 className='text-2xl font-semibold'>SEO 设置</h1><p className='text-secondary mt-1 text-sm'>站点 / 首页 / 分类 / 其他公开页面 SEO 集中配置；文章 SEO 继续读取文章现有字段。</p></div>
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

			<div className='space-y-5'>
				<section className='card p-5'>
					<h2 className='text-base font-medium'>站点设置</h2>
					<p className='text-secondary mt-1 text-xs'>正式域名会统一影响 Canonical、Sitemap 和预览 URL；版本号由系统维护。</p>
					<div className='mt-4 grid gap-3 sm:grid-cols-2'>
						{([
							['正式域名', 'officialOrigin'], ['站点名称', 'siteName'], ['辅助品牌词', 'brandAlias'], ['默认语言', 'language'], ['站点作者', 'author']
						] as const).map(([label, key]) => <label key={key} className={key === 'officialOrigin' ? 'sm:col-span-2' : ''}><span className='mb-1 block text-xs font-medium'>{label}</span><input value={config.site[key]} onChange={event => setVisualConfig({ ...config, site: { ...config.site, [key]: event.target.value } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' /></label>)}
						<div><span className='mb-1 block text-xs font-medium'>SEO JSON Version</span><div className='bg-foreground/[0.03] rounded-lg border px-3 py-2 text-sm'>v{config.version}（只读）</div></div>
					</div>
				</section>

				<section className='card p-5'>
					<div className='flex flex-wrap items-center justify-between gap-2'><div><h2 className='text-base font-medium'>首页 SEO</h2><p className='text-secondary mt-1 text-xs'>Title 手动填写；Description 可按当前分类 + 品牌本地生成，不调用外部 AI。</p></div><button type='button' onClick={() => setVisualConfig({ ...config, home: { ...config.home, description: generateHomeDescription(categories, config.site.siteName) } })} className='bg-card rounded-lg border px-3 py-2 text-xs'>一键生成 Description</button></div>
					<div className='mt-4 space-y-3'>
						<div><label className='mb-1 block text-xs font-medium'>SEO Title</label><input value={config.home.title} onChange={event => setVisualConfig({ ...config, home: { ...config.home, title: event.target.value } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{inlineWarn(config.home.title, 30, 'Title 未填写；允许保存，但不建议为空。')}</div>
						<div><div className='mb-1 flex items-center justify-between'><label className='text-xs font-medium'>Description</label></div><textarea rows={3} value={config.home.description} onChange={event => setVisualConfig({ ...config, home: { ...config.home, description: event.target.value } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{inlineWarn(config.home.description, 80, 'Description 未填写；允许保存，但不建议为空。')}</div>
						<KeywordEditor value={config.home.keywords} onChange={keywords => setVisualConfig({ ...config, home: { ...config.home, keywords } })} />
						<SearchPreview title={config.home.title} description={config.home.description} url={origin || '/'} />
						<div className='text-secondary break-all text-xs'>Canonical：{origin ? `${origin}/` : '/'}</div>
					</div>
				</section>

				<section className='card p-5'>
					<h2 className='text-base font-medium'>分类 SEO</h2>
					<p className='text-secondary mt-1 text-xs'>分类 Title / Description 可本地生成；Title 最终自动追加“｜{config.site.siteName || '站点名称'}”。</p>
					<div className='mt-4 space-y-2'>
						{categories.map(name => {
							const item = config.categories[name] ?? { title: '', description: '', keywords: [] }
							const slug = categorySlugs[name] ?? ''
							const finalTitle = categoryTitle(name)
							return (
								<details key={name} className='rounded-xl border p-3'>
									<summary className='cursor-pointer text-sm font-medium'>{name} <span className='text-secondary ml-2 font-mono text-xs'>/{slug || '未配置 slug'}</span></summary>
									<div className='mt-3 space-y-3'>
										<div className='flex justify-end'><button type='button' onClick={() => { const generated = generateCategorySeo(name, articles); setVisualConfig({ ...config, categories: { ...config.categories, [name]: { ...item, title: generated.title, description: generated.description } } }) }} className='bg-card rounded-lg border px-3 py-2 text-xs'>一键生成 Title + Description</button></div>
										<div><label className='mb-1 block text-xs font-medium'>自定义 SEO Title（系统自动追加品牌）</label><input value={item.title} onChange={event => setVisualConfig({ ...config, categories: { ...config.categories, [name]: { ...item, title: event.target.value } } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{!item.title.trim() ? <p className='mt-1 text-xs text-amber-600'>Title 未填写；允许保存，将回退分类名称。</p> : inlineWarn(finalTitle, 30, 'Title 未填写。')}<p className='text-secondary mt-1 text-xs'>最终：{finalTitle}</p></div>
										<div><label className='mb-1 block text-xs font-medium'>Description</label><textarea rows={3} value={item.description} onChange={event => setVisualConfig({ ...config, categories: { ...config.categories, [name]: { ...item, description: event.target.value } } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{inlineWarn(item.description, 80, 'Description 未填写；允许保存，但不建议为空。')}</div>
										<KeywordEditor value={item.keywords} onChange={keywords => setVisualConfig({ ...config, categories: { ...config.categories, [name]: { ...item, keywords } } })} />
										<SearchPreview title={finalTitle} description={item.description} url={origin && slug ? `${origin}/${slug}` : `/${slug}`} />
										<div className='text-secondary break-all text-xs'>Canonical：{origin && slug ? `${origin}/${slug}` : `/${slug}`}</div>
									</div>
								</details>
							)
						})}
					</div>
				</section>

				<section className='card p-5'>
					<h2 className='text-base font-medium'>其他公开页面 SEO</h2>
					<p className='text-secondary mt-1 text-xs'>当前公开根页面独立配置 Title / Description / Keywords；Canonical 根据正式域名和页面路径自动生成。</p>
					<div className='mt-4 space-y-2'>
						{PUBLIC_SEO_PAGES.map(({ path, label }) => {
							const item = config.pages[path]
							const canonical = origin ? `${origin}${path}` : path
							return (
								<details key={path} className='rounded-xl border p-3'>
									<summary className='cursor-pointer text-sm font-medium'>{label} <span className='text-secondary ml-2 font-mono text-xs'>{path}</span></summary>
									<div className='mt-3 space-y-3'>
										<div><label className='mb-1 block text-xs font-medium'>SEO Title</label><input value={item.title} onChange={event => setVisualConfig({ ...config, pages: { ...config.pages, [path]: { ...item, title: event.target.value } } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{inlineWarn(item.title, 30, 'Title 未填写；允许保存，但不建议为空。')}</div>
										<div><label className='mb-1 block text-xs font-medium'>Description</label><textarea rows={3} value={item.description} onChange={event => setVisualConfig({ ...config, pages: { ...config.pages, [path]: { ...item, description: event.target.value } } })} className='bg-card w-full rounded-lg border px-3 py-2 text-sm' />{inlineWarn(item.description, 80, 'Description 未填写；允许保存，但不建议为空。')}</div>
										<KeywordEditor value={item.keywords} onChange={keywords => setVisualConfig({ ...config, pages: { ...config.pages, [path]: { ...item, keywords } } })} />
										<SearchPreview title={item.title} description={item.description} url={canonical} />
										<div className='text-secondary break-all text-xs'>Canonical：{canonical}</div>
									</div>
								</details>
							)
						})}
					</div>
				</section>

				<section className='card p-5'>
					<h2 className='text-base font-medium'>搜索引擎站点验证</h2><p className='text-secondary mt-1 text-xs'>默认关闭；关闭时保留验证码但不向页面输出 meta 标签。</p>
					<div className='mt-4 space-y-3'>{(['google', 'bing', 'baidu'] as const).map(key => { const labels = { google: 'Google', bing: 'Bing', baidu: '百度' }; const item = config.verification[key]; return <div key={key} className='grid gap-2 rounded-xl border p-3 sm:grid-cols-[auto_1fr] sm:items-center'><label className='flex items-center gap-2 text-sm'><input type='checkbox' checked={item.enabled} onChange={event => setVisualConfig({ ...config, verification: { ...config.verification, [key]: { ...item, enabled: event.target.checked } } })} />{labels[key]}</label><input value={item.value} onChange={event => setVisualConfig({ ...config, verification: { ...config.verification, [key]: { ...item, value: event.target.value } } })} placeholder='只填写验证代码，不填写整段 HTML' className='bg-card w-full rounded-lg border px-3 py-2 text-sm' /></div> })}</div>
				</section>

				<section className='card p-5'>
					<h2 className='text-base font-medium'>检查入口</h2>
					<div className='mt-3 flex flex-wrap gap-2'><a href={`${origin}/sitemap.xml`} target='_blank' rel='noreferrer' className='bg-card rounded-lg border px-3 py-2 text-xs'>打开 sitemap.xml</a><a href={`${origin}/robots.txt`} target='_blank' rel='noreferrer' className='bg-card rounded-lg border px-3 py-2 text-xs'>打开 robots.txt</a></div>
				</section>

				<section className='card p-5'>
					<h2 className='text-base font-medium'>SEO JSON 原始编辑</h2><p className='text-secondary mt-1 text-xs'>允许直接编辑；合法 JSON 会同步回上方表单。格式或类型错误时阻止保存。</p>
					<textarea spellCheck={false} value={rawText} onChange={event => handleRawChange(event.target.value)} className='bg-card mt-4 min-h-[420px] w-full resize-y rounded-xl border px-3 py-3 font-mono text-xs leading-5 outline-none' />
					{rawError ? <p className='mt-2 text-xs text-red-500'>{rawError}</p> : <p className='text-secondary mt-2 text-xs'>JSON 格式与字段类型校验通过。</p>}
				</section>
			</div>
		</main>
	)
}
