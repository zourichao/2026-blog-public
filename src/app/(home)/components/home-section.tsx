import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface HomeSectionProps {
	id: string
	title: string
	href: string
	linkLabel: string
	className?: string
	children: React.ReactNode
}

export default function HomeSection({ id, title, href, linkLabel, className, children }: HomeSectionProps) {
	return (
		<section
			aria-labelledby={`${id}-title`}
			className={cn(
				'flex min-w-0  flex-col self-start rounded-[18px] border border-white/65 bg-white/[0.46] px-4 pt-2 pb-2 shadow-[0_16px_42px_-38px_rgba(15,23,42,0.38)] backdrop-blur-xl sm:px-5 sm:pt-2.5 sm:pb-1.2 lg:h-full lg:self-stretch',
				className
			)}>
			<div className='mb-0 flex min-h-8 shrink-0 items-center justify-between gap-4'>
				<h2 id={`${id}-title`} className='text-base font-bold tracking-tight text-slate-900 sm:text-lg'>
					{title}
				</h2>
				<Link
					href={href}
					className='focus-visible:ring-brand hover:text-brand inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] font-medium text-slate-500 transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none'>
					{linkLabel}
					<ArrowRight aria-hidden='true' className='size-3.5' />
				</Link>
			</div>
			<div className='min-w-0'>{children}</div>
		</section>
	)
}
