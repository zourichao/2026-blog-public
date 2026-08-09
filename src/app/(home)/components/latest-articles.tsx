import type { BlogIndexItem } from '@/app/blog/types'
import { getBlogAuthor } from '@/lib/blog-author'
import Link from 'next/link'

interface LatestArticlesProps {
	articles: BlogIndexItem[]
}

const formatDate = (date: string) =>
	new Intl.DateTimeFormat('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(date))

export default function LatestArticles({ articles }: LatestArticlesProps) {
	if (articles.length === 0) {
		return <p className='rounded-2xl bg-white/55 px-4 py-8 text-center text-sm text-slate-500'>暂无公开文章</p>
	}

	return (
		<ul className='divide-y divide-slate-200/55 overflow-hidden rounded-xl border border-white/45 bg-white/[0.16]'>
			{articles.map(article => {
				const labels = article.tags.length > 0 ? article.tags : article.category?.trim() ? [article.category.trim()] : []
				return (
					<li key={article.slug}>
						{/* 本次改动：图片列宽 90 / 105 / 120px → 86 / 101 / 115px，在上一版基础上继续缩小约 4%。 */}
						<Link
							href={`/blog/${article.slug}`}
							className='group focus-visible:ring-brand grid min-w-0 grid-cols-[86px_minmax(0,1fr)] items-center gap-4 bg-transparent py-2.5 pr-2.5 pl-0 transition-colors hover:bg-white/50 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none sm:grid-cols-[101px_minmax(0,1fr)] sm:gap-4.5 sm:py-3 sm:pr-3 sm:pl-0 xl:grid-cols-[115px_minmax(0,1fr)] xl:min-h-28'>
							{/* 本次改动：object-cover → bg-white/55 object-contain，保持图片原比例完整显示，不再裁切。 */}
							{article.cover ? (
								<img
									src={article.cover}
									alt=''
									loading='lazy'
									className='h-[65px] w-[86px] rounded-xl bg-white/55 object-contain sm:h-[76px] sm:w-[101px] xl:h-[86px] xl:w-[115px]'
								/>
							) : (
								<div className='grid h-[65px] w-[86px] place-items-center rounded-xl bg-gradient-to-br from-sky-100 to-amber-50 text-[13px] text-slate-500 sm:h-[76px] sm:w-[101px] xl:h-[86px] xl:w-[115px]'>
									文章
								</div>
							)}
							<div className='min-w-0'>
								{/* 本次改动：标题全端最多 2 行 → 移动端保持最多 2 行，PC（lg 及以上）最多 1 行。 */}
								<h3 className='line-clamp-2 text-sm leading-5 font-semibold text-slate-900 transition-colors group-hover:text-sky-700 motion-reduce:transition-none lg:line-clamp-1'>
									{article.title || article.slug}
								</h3>

								{/* 本次改动：PC 摘要位于标题后且最多 2 行；移动端继续隐藏摘要，保持原布局。 */}
								{article.summary && <p className='mt-1 hidden text-[13px] leading-5 text-slate-600 lg:line-clamp-2'>{article.summary}</p>}

								{/* 本次改动：PC 由“分类 → 作者时间 → 摘要”调整为“摘要 → 分类 + 作者时间同一行”；移动端仍保持原来的分类、作者时间两行。 */}
								<div className='lg:hidden'>
									{labels.length > 0 && (
										<div className='mt-1 flex flex-wrap gap-1' aria-label='文章标签'>
											{labels.map(label => (
												<span key={label} className='inline-flex rounded-md bg-sky-50/90 px-2 py-0.5 text-[11px] leading-4 font-medium text-sky-700'>
													{label}
												</span>
											))}
										</div>
									)}
									<p className='mt-1 truncate text-xs text-slate-500'>
										{getBlogAuthor(article.author)} · {formatDate(article.date)}
									</p>
								</div>

								{/* 本次改动：PC 元信息通过 ml-auto 自然推开 → 使用 w-full + justify-between 明确固定“分类左 / 作者日期右”的两端对齐。 */}
								<div className='mt-1 hidden w-full min-w-0 items-center justify-between gap-2 lg:flex'>
									<div className='flex min-w-0 items-center gap-1 overflow-hidden' aria-label='文章标签'>
										{labels.map(label => (
											<span key={label} className='inline-flex shrink-0 rounded-md bg-sky-50/90 px-2 py-0.5 text-[11px] leading-4 font-medium text-sky-700'>
												{label}
											</span>
										))}
									</div>
									<p className='shrink-0 whitespace-nowrap text-right text-xs text-slate-500'>
										{getBlogAuthor(article.author)} · {formatDate(article.date)}
									</p>
								</div>
							</div>
						</Link>
					</li>
				)
			})}
		</ul>
	)
}
