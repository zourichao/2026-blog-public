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
		<header className='mb-4 rounded-[20px] border border-white/70 bg-white/[0.54] px-4 py-2.5 shadow-[0_12px_36px_-30px_rgba(29,78,216,0.42)] backdrop-blur-xl md:px-6 md:py-3 lg:mb-5 lg:rounded-[22px]'>
			<div className='flex min-h-10 items-center justify-between gap-4'>
				<Link
					href='/'
					className='focus-visible:ring-brand flex min-w-0 items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'>
					<img src={iconSrc} alt='' width={40} height={40} className='size-10 shrink-0 rounded-xl shadow-sm' />
					<span className='truncate text-lg font-semibold tracking-tight sm:text-xl'>{brandName}</span>
				</Link>

				<nav aria-label='首页主导航' className='hidden items-center gap-1 md:flex'>
					{NAV_ITEMS.map(item => (
						<Link
							key={item.href}
							href={item.href}
							className='focus-visible:ring-brand hover:text-brand rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none'>
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
					'grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none md:hidden',
					menuOpen ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
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
