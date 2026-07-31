import HomeLikeButton from './home-like-button'

interface HomeFooterProps {
	brandName: string
	domain: string
	description: string
	copyright?: string
	beian?: {
		text?: string
		link?: string
	}
}

export default function HomeFooter({ brandName, domain, description, copyright, beian }: HomeFooterProps) {
	return (
		<footer className='mt-4 rounded-[18px] border border-white/60 bg-white/[0.4] px-4 py-4 shadow-[0_14px_38px_-36px_rgba(15,23,42,0.34)] backdrop-blur-xl sm:px-5 lg:mt-5 lg:px-6'>
			<div className='grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5'>
				<div className='flex min-w-0 items-center gap-3'>
					<img src='/favicon.svg' alt='' width={40} height={40} className='size-9 shrink-0 rounded-xl sm:size-10' />
					<div className='min-w-0'>
						<p className='truncate text-sm font-semibold text-slate-900'>
							{brandName} · {domain}
						</p>
						<p className='mt-0.5 line-clamp-2 max-w-xl text-[13px] leading-5 text-slate-600 sm:line-clamp-1'>{description}</p>
					</div>
				</div>

				<div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/45 bg-white/20 px-2.5 py-1.5 sm:justify-end sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0'>
					<div className='min-w-0 flex-1 text-left text-xs leading-5 text-slate-500 sm:flex-none sm:text-right'>
						{copyright && <span>{copyright}</span>}
						{copyright && beian?.text && <span> · </span>}
						{beian?.text &&
							(beian.link ? (
								<a
									href={beian.link}
									target='_blank'
									rel='noopener noreferrer'
									className='focus-visible:ring-brand rounded hover:text-sky-700 focus-visible:ring-2 focus-visible:outline-none'>
									{beian.text}
								</a>
							) : (
								<span>{beian.text}</span>
							))}
					</div>
					<HomeLikeButton />
				</div>
			</div>
		</footer>
	)
}
