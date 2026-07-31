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
				const label = article.category?.trim() || article.tags[0]

				return (
					<li key={article.slug}>
						<Link
							href={`/blog/${article.slug}`}
							className='group focus-visible:ring-brand grid min-w-0 grid-cols-[48px_minmax(0,1fr)] items-center gap-2.5 bg-transparent p-2.5 transition-colors hover:bg-white/50 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-3 sm:p-3 xl:grid-cols-[64px_minmax(0,1fr)] xl:min-h-28'>
							{article.cover ? (
								<img src={article.cover} alt='' loading='lazy' className='size-12 rounded-xl object-cover sm:size-14 xl:size-16' />
							) : (
								<div className='grid size-12 place-items-center rounded-xl bg-gradient-to-br from-sky-100 to-amber-50 text-[13px] text-slate-500 sm:size-14 xl:size-16'>
									文章
								</div>
							)}

							<div className='min-w-0'>
								{label && <span className='inline-flex rounded-md bg-sky-50/90 px-2 py-0.5 text-[11px] font-medium text-sky-700'>{label}</span>}
								<h3 className='mt-1.5 line-clamp-2 text-sm leading-5 font-semibold text-slate-900 transition-colors group-hover:text-sky-700 motion-reduce:transition-none'>
									{article.title || article.slug}
								</h3>
								{article.summary && <p className='mt-1 line-clamp-2 hidden text-[13px] leading-5 text-slate-600 sm:block'>{article.summary}</p>}
								<p className='mt-1 truncate text-xs text-slate-500'>
									{getBlogAuthor(article.author)} · {formatDate(article.date)}
								</p>
							</div>
						</Link>
					</li>
				)
			})}
		</ul>
	)
}
