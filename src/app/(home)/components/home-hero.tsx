import { ArrowRight, Github } from 'lucide-react'
import Link from 'next/link'
import EmailCopyButton from './email-copy-button'

interface HomeHeroProps {
	username: string
	description: string
	desktopArtSrc: string
	mobileArtSrc: string
	githubUrl?: string
	email?: string
}

export default function HomeHero({ username, description, desktopArtSrc, mobileArtSrc, githubUrl, email }: HomeHeroProps) {
	return (
		<section
			aria-labelledby='home-hero-title'
			className='relative min-h-[clamp(400px,112vw,430px)] min-w-0 overflow-hidden rounded-[24px] border border-white/70 bg-[linear-gradient(100deg,#f5fafd_0%,#edf8fd_48%,#dcefff_100%)] p-5 shadow-[0_24px_64px_-52px_rgba(14,116,144,0.52)] backdrop-blur-xl sm:p-7 lg:aspect-auto lg:min-h-[372px] lg:bg-[linear-gradient(90deg,#f4fafd_0%,#eff8fd_42%,#e4f2fd_68%,#d8edff_100%)] lg:p-8 xl:aspect-[3.15/1] xl:min-h-0'>
			<picture>
				<source media='(min-width: 1024px)' srcSet={desktopArtSrc} width={1536} height={1024} />
				<img
					src={mobileArtSrc}
					alt=''
					aria-hidden='true'
					width={1024}
					height={1536}
					loading='eager'
					fetchPriority='high'
					className='pointer-events-none absolute bottom-[-27%] left-[-6%] z-[1] h-auto w-[120%] max-w-none max-[321px]:bottom-[-28%] max-[321px]:left-[-16%] max-[321px]:w-[135%] min-[700px]:left-[29%] min-[700px]:w-[65%] sm:left-[24%] sm:w-[72%] md:left-[33%] md:w-[59%] lg:top-[3%] lg:right-0 lg:bottom-auto lg:left-auto lg:w-[63.8%] min-[1152px]:top-[-4%] xl:top-[-10%]'
				/>
			</picture>

			<div className='relative z-[2] min-w-0 lg:w-[42%] lg:max-w-[520px]'>
				<p className='mb-2.5 text-[13px] font-semibold tracking-[0.14em] sm:text-sm sm:tracking-[0.16em]'>
					<span className='text-amber-500'>设计</span>
					<span className='mx-2 text-slate-300'>·</span>
					<span className='text-sky-600'>技术</span>
					<span className='mx-2 text-slate-300'>·</span>
					<span className='text-amber-500'>生活</span>
				</p>

				<h1 id='home-hero-title' className='text-[2rem] leading-tight font-bold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl'>
					你好，我是 <span className='bg-gradient-to-r from-sky-600 to-cyan-500 bg-clip-text text-transparent'>{username}</span>
				</h1>

				<p className='mt-3.5 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7'>{description}</p>

				<div className='mt-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap'>
					<Link
						href='/projects'
						className='focus-visible:ring-brand inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(2,132,199,0.95)] transition-colors hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none sm:px-5'>
						查看我的项目
						<ArrowRight aria-hidden='true' className='size-4' />
					</Link>
					<Link
						href='/blog'
						className='focus-visible:ring-brand inline-flex min-h-11 items-center justify-center rounded-xl border border-sky-200 bg-white/75 px-4 py-2.5 text-sm font-semibold text-sky-700 transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none sm:px-5'>
						阅读文章
					</Link>
				</div>

				<div className='mt-3.5 flex flex-wrap items-center gap-3'>
					{githubUrl && (
						<a
							href={githubUrl}
							target='_blank'
							rel='noopener noreferrer'
							className='focus-visible:ring-brand inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none'>
							<Github aria-hidden='true' className='size-4' />
							GitHub
						</a>
					)}
					{email && <EmailCopyButton email={email} />}
				</div>
			</div>
		</section>
	)
}
