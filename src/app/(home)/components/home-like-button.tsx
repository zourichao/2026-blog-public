'use client'

import LikeButton from '@/components/like-button'

export default function HomeLikeButton() {
	return (
		<div className='home-like relative shrink-0' aria-label='首页点赞'>
			{/* 本次改动：首页点赞按钮由最小 44px 高 / 28px 心形 → 28px 高 / 20px 心形，避免撑高 Footer 版权行。 */}
			<LikeButton
				slug='site'
				delay={200}
				className='relative! flex h-7! min-h-0! flex-row-reverse items-center gap-1.5 rounded-xl! border-white/70! bg-white/55! px-1.5! py-0! leading-none! shadow-none! backdrop-blur-sm! [&_.heartbeat]:size-5! [&>span]:static! [&>span]:min-w-0! [&>span]:bg-transparent! [&>span]:p-0! [&>span]:text-xs! [&>span]:leading-none! [&>span]:text-slate-500!'
			/>
		</div>
	)
}
