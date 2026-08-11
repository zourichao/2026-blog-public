'use client'

import LikeButton from '@/components/like-button'

export default function HomeLikeButton() {
	return (
		<div className='home-like relative shrink-0' aria-label='首页点赞'>
			{/* 本次改动：默认旧点赞 Key → 首页固定使用 site，与 About 共用点赞总数。 */}
			<LikeButton
				slug='site'
				delay={200}
				className='relative! flex min-h-11 flex-row-reverse items-center gap-2 rounded-xl! border-white/70! bg-white/55! p-2! shadow-none! backdrop-blur-sm! [&>span]:static! [&>span]:min-w-0! [&>span]:bg-transparent! [&>span]:p-0! [&>span]:text-xs! [&>span]:text-slate-500!'
			/>
		</div>
	)
}
