'use client'

import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
	{ href: '/blog', label: '文章' },
	{ href: '/projects', label: '项目' },
	{ href: '/about', label: '关于' },
	{ href: '/share', label: '推荐' }
]

interface HomeHeaderProps {
	brandName: string
	iconSrc: string
}

export default function HomeHeader({ brandName, iconSrc }: HomeHeaderProps) {
	const [menuOpen, setMenuOpen] = useState(false)

	return (
<header
	data-header-version='v17-reference-header'
	className='relative z-[3]'
	style={{
		background:
			'linear-gradient(135deg, #FAFCFE 0%, #F7FAFD 52%, #F3F8FD 100%)',
		boxShadow: 'inset 0 -1px 0 rgba(203, 213, 225, 0.16)'
	}}
>

			<div className='flex min-h-[64px] items-center justify-between gap-4 px-5 py-3 sm:px-7 md:min-h-[84px] md:px-9 md:py-4 lg:min-h-[82px] lg:px-11 xl:px-13'>
					{/* 左侧 Logo 和右侧导航同时向两边靠近边缘 px-5  sm:px-7 md:px-9  lg:px-11  xl:px-13*/}
				<Link
					href='/'
					className='focus-visible:ring-brand flex min-w-0 items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none md:gap-4'>
					<img
						src={iconSrc}
						alt=''
						width={48}
						height={48}
						className='size-10 shrink-0 rounded-xl shadow-sm sm:size-11 md:size-12 md:rounded-[14px]'
					/>
					<span className='truncate text-lg font-semibold tracking-tight sm:text-xl md:text-[26px] md:leading-tight'>{brandName}</span>
				</Link>

				<nav aria-label='首页主导航' className='hidden items-center gap-1 md:flex lg:gap-2'>
					{NAV_ITEMS.map(item => (
						<Link
							key={item.href}
							href={item.href}
							className='focus-visible:ring-brand hover:text-brand rounded-xl px-4 py-2.5 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none lg:px-5 lg:text-base'>
							{item.label}
						</Link>
					))}
				</nav>

				<button
					type='button'
					aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
					aria-controls='home-mobile-menu'
					aria-expanded={menuOpen}
					onClick={() => setMenuOpen(value => !value)}
					className='focus-visible:ring-brand grid size-10 shrink-0 place-items-center rounded-xl border bg-white/70 text-slate-700 transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none md:hidden'>
					{menuOpen ? <X aria-hidden='true' className='size-5' /> : <Menu aria-hidden='true' className='size-5' />}
				</button>
			</div>

			<div
				id='home-mobile-menu'
				className={cn(
					'grid overflow-hidden px-4 transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none sm:px-6 md:hidden',
					menuOpen ? 'grid-rows-[1fr] pb-3 opacity-100' : 'grid-rows-[0fr] opacity-0'
				)}>
				<nav aria-label='移动端首页导航' className='min-h-0 overflow-hidden'>
					<div className='grid grid-cols-2 gap-2 border-t border-white/80 pt-3'>
						{NAV_ITEMS.map(item => (
							<Link
								key={item.href}
								href={item.href}
								onClick={() => setMenuOpen(false)}
								tabIndex={menuOpen ? 0 : -1}
								className='focus-visible:ring-brand rounded-xl bg-white/60 px-4 py-3 text-center text-sm font-medium transition-colors hover:bg-white focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none'>
								{item.label}
							</Link>
						))}
					</div>
				</nav>
			</div>
		</header>
	)
}
