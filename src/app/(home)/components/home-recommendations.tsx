import { ExternalLink } from 'lucide-react'

export interface HomeRecommendationItem {
	name: string
	url: string
	logo: string
	description: string
	tags: string[]
	stars: number
}

interface HomeRecommendationsProps {
	recommendations: HomeRecommendationItem[]
}

export default function HomeRecommendations({ recommendations }: HomeRecommendationsProps) {
	if (recommendations.length === 0) {
		return <p className='rounded-2xl bg-white/55 px-4 py-8 text-center text-sm text-slate-500'>暂无推荐内容</p>
	}

	return (
		<ul className='divide-y divide-slate-200/55 overflow-hidden rounded-xl border border-white/45 bg-white/[0.16]'>
			{recommendations.map(item => (
				<li key={item.url}>
					<a
						href={item.url}
						target='_blank'
						rel='noopener noreferrer'
						className='group focus-visible:ring-brand flex min-w-0 items-center gap-4 bg-transparent py-2.5 pr-2.5 pl-0 transition-colors hover:bg-white/50 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none sm:gap-4.5 sm:py-3 sm:pr-3 sm:pl-0 xl:min-h-28'>
						{/* 本次改动：90×68 / 105×79 / 120×90px → 86×65 / 101×76 / 115×86px，推荐阅读图片继续缩小约 4%。 */}
						<img src={item.logo} alt='' loading='lazy' className='h-[65px] w-[86px] shrink-0 rounded-xl bg-white/55 object-contain p-1.5 sm:h-[76px] sm:w-[101px] xl:h-[86px] xl:w-[115px]' />
						<div className='min-w-0 flex-1'>
							<div className='flex items-start justify-between gap-2'>
								<h3 className='line-clamp-2 text-sm leading-5 font-semibold text-slate-900 group-hover:text-sky-700'>{item.name}</h3>
								<ExternalLink aria-hidden='true' className='mt-0.5 size-3.5 shrink-0 text-slate-400' />
							</div>
							<p className='mt-1 line-clamp-1 text-[13px] leading-5 text-slate-600 sm:line-clamp-2'>{item.description}</p>
							<div className='mt-1 flex flex-wrap gap-1.5 sm:mt-1.5'>
								{item.tags.slice(0, 2).map(tag => (
									<span key={tag} className='rounded-md bg-sky-50/90 px-1.5 py-0.5 text-[11px] leading-4 text-sky-700'>
										{tag}
									</span>
								))}
							</div>
						</div>
					</a>
				</li>
			))}
		</ul>
	)
}
