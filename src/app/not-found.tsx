import Link from 'next/link'

export default function NotFound() {
	return (
		<div className='flex h-full min-h-[100svh] items-center justify-center px-6 pb-24'>
			<section className='card-rounded bg-card w-full max-w-lg border p-8 text-center shadow backdrop-blur-sm max-sm:p-6'>
				<div className='text-linear text-6xl font-semibold'>404</div>
				<h1 className='mt-5 text-2xl font-semibold'>页面不存在</h1>
				<p className='text-secondary mt-3 text-sm leading-6'>你访问的内容可能已被删除，或链接地址有误。</p>

				<div className='mt-8 flex items-center justify-center gap-3 max-sm:flex-col'>
					<Link href='/' className='brand-btn justify-center max-sm:w-full'>
						返回首页
					</Link>
					<Link href='/blog' className='bg-card rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-white/80 max-sm:w-full'>
						查看文章
					</Link>
				</div>
			</section>
		</div>
	)
}
