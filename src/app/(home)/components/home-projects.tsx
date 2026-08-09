import { ExternalLink } from 'lucide-react'

export interface HomeProjectItem {
	name: string
	year: number
	description: string
	image: string
	url: string
	tags: string[]
}

interface HomeProjectsProps {
	projects: HomeProjectItem[]
}

export default function HomeProjects({ projects }: HomeProjectsProps) {
	if (projects.length === 0) {
		return (
			<div className='rounded-2xl border border-dashed border-sky-200/90 bg-gradient-to-br from-sky-50/85 to-amber-50/55 px-5 py-7'>
				<div className='mb-4 grid size-10 place-items-center rounded-xl bg-white text-lg shadow-sm' aria-hidden='true'>
					↗
				</div>
				<h3 className='text-sm font-semibold text-slate-900'>项目内容整理中</h3>
				<p className='mt-2 text-xs leading-5 text-slate-500'>正在整理产品实践与个人项目，后续持续更新。</p>
			</div>
		)
	}

	return (
		<ul className='divide-y divide-slate-200/55 overflow-hidden rounded-xl border border-white/45 bg-white/[0.16]'>
			{projects.map(project => (
				<li key={project.url}>
					<a
						href={project.url}
						target='_blank'
						rel='noopener noreferrer'
						className='group focus-visible:ring-brand flex min-w-0 items-center gap-4 bg-transparent py-2.5 pr-2.5 pl-0 transition-colors hover:bg-white/50 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none sm:gap-4.5 sm:py-3 sm:pr-3 sm:pl-0 xl:min-h-28'>
						{/* 本次改动：90×68 / 105×79 / 120×90px → 86×65 / 101×76 / 115×86px，项目图片继续缩小约 4%。 */}
						{/* 本次改动：object-cover → bg-white/55 object-contain，保持项目图片原比例完整显示，不再裁切。 */}
						<img
							src={project.image}
							alt=''
							loading='lazy'
							className='h-[65px] w-[86px] shrink-0 rounded-xl bg-white/55 object-contain sm:h-[76px] sm:w-[101px] xl:h-[86px] xl:w-[115px]'
						/>
						<div className='min-w-0 flex-1'>
							<div className='flex items-start justify-between gap-2'>
								<h3 className='line-clamp-2 text-sm leading-5 font-semibold text-slate-900 group-hover:text-sky-700'>{project.name}</h3>
								<ExternalLink aria-hidden='true' className='mt-0.5 size-3.5 shrink-0 text-slate-400' />
							</div>
							<p className='mt-1 line-clamp-1 text-[13px] leading-5 text-slate-600 sm:line-clamp-2'>{project.description}</p>
							<div className='mt-1 flex flex-wrap gap-1.5 sm:mt-1.5'>
								{project.tags.slice(0, 3).map(tag => (
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
