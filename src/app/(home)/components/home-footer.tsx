import HomeLikeButton from './home-like-button'

interface HomeFooterProps {
	brandName: string
	domain: string
	description: string
	copyright?: string
	beian?: {
		text?: string
		link?: string
		publicSecurityText?: string
		publicSecurityLink?: string
	}
}

function SecurityRecordIcon() {
	return (
		<svg aria-hidden='true' viewBox='0 0 24 24' className='size-3.5 shrink-0 opacity-75' fill='none' stroke='currentColor' strokeWidth='1.8'>
			<path d='M12 3.5 19 6v5.2c0 4.4-2.7 7.6-7 9.3-4.3-1.7-7-4.9-7-9.3V6l7-2.5Z' />
			<path d='m9.3 11.8 1.8 1.8 3.8-4' />
		</svg>
	)
}

export default function HomeFooter({ brandName, domain, description, copyright, beian }: HomeFooterProps) {
	const hasRecordInfo = Boolean(beian?.text || beian?.publicSecurityText)
	const hasBothRecords = Boolean(beian?.text && beian?.publicSecurityText)

	return (
		<footer className='mt-4 rounded-[18px] border border-white/60 bg-white/[0.4] px-4 py-4 shadow-[0_14px_38px_-36px_rgba(15,23,42,0.34)] backdrop-blur-xl sm:px-5 lg:mt-5 lg:px-6'>
			<div className='grid min-w-0 gap-3 min-[801px]:grid-cols-[minmax(0,1fr)_auto] min-[801px]:items-center min-[801px]:gap-5'>
				<div className='flex min-w-0 items-center gap-3'>
					<img src='/favicon.svg' alt='' width={40} height={40} className='size-9 shrink-0 rounded-xl sm:size-10' />
					<div className='min-w-0'>
						<p className='truncate text-sm font-semibold text-slate-900'>
							{brandName} · {domain}
						</p>
						<p className='mt-0.5 line-clamp-2 max-w-xl text-[13px] leading-5 text-slate-600 min-[801px]:line-clamp-1'>{description}</p>
					</div>
				</div>

				{/* 本次改动：PC 备案由 3 行压成 2 行；移动端仍保持版权 / ICP / 公安备案 3 行，降低 Footer 纵向高度。 */}
				<div className='min-w-0 rounded-xl border border-white/45 bg-white/20 px-2.5 py-2 min-[801px]:min-w-[250px] min-[801px]:rounded-none min-[801px]:border-0 min-[801px]:bg-transparent min-[801px]:p-0'>
					<div className='flex min-w-0 items-center justify-between gap-3 min-[801px]:justify-end'>
						{copyright ? <span className='whitespace-nowrap text-xs leading-5 text-slate-500'>{copyright}</span> : <span />}
						<HomeLikeButton />
					</div>

					{hasRecordInfo && (
						<div className='mt-0.5 flex min-w-0 flex-col items-start gap-0.5 text-xs leading-5 text-slate-500 min-[801px]:flex-row min-[801px]:items-center min-[801px]:justify-end min-[801px]:gap-1.5'>
							{beian?.text &&
								(beian.link ? (
									<a
										href={beian.link}
										target='_blank'
										rel='noopener noreferrer'
										className='focus-visible:ring-brand max-w-full whitespace-nowrap rounded transition-colors hover:text-sky-700 focus-visible:ring-2 focus-visible:outline-none'>
										{beian.text}
									</a>
								) : (
									<span className='max-w-full whitespace-nowrap'>{beian.text}</span>
								))}

							{hasBothRecords && <span className='hidden min-[801px]:inline' aria-hidden='true'>·</span>}

							{beian?.publicSecurityText &&
								(beian.publicSecurityLink ? (
									<a
										href={beian.publicSecurityLink}
										target='_blank'
										rel='noopener noreferrer'
										className='focus-visible:ring-brand inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded transition-colors hover:text-sky-700 focus-visible:ring-2 focus-visible:outline-none'>
										<SecurityRecordIcon />
										<span>{beian.publicSecurityText}</span>
									</a>
								) : (
									<span className='inline-flex max-w-full items-center gap-1 whitespace-nowrap'>
										<SecurityRecordIcon />
										<span>{beian.publicSecurityText}</span>
									</span>
								))}
						</div>
					)}
				</div>
			</div>
		</footer>
	)
}
