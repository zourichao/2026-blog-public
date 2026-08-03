import { ArrowRight, Github } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import EmailCopyButton from './email-copy-button'

interface HomeHeroProps {
	username: string
	description: ReactNode
	desktopArtSrc: string
	mobileArtSrc: string
	githubUrl?: string
	email?: string
}
export default function HomeHero({ username, description, desktopArtSrc, mobileArtSrc, githubUrl, email }: HomeHeroProps) {
	return (
		<section
			aria-labelledby='home-hero-title'
			className='relative w-full min-h-0 min-w-0 overflow-hidden bg-transparent px-6 pt-[30px] pb-1 min-[441px]:min-h-0 min-[441px]:px-8 min-[441px]:pt-[35px] min-[441px]:pb-1 min-[801px]:min-h-0 min-[801px]:px-[56px] min-[801px]:pt-[40px] min-[801px]:pb-1 '>
			{/* 本次改动：`pb-3 / min-[441px]:pb-3 / min-[801px]:pb-4` → 全部 `pb-1`，文字与按钮内容区距离 Hero 底边统一缩小为 4px。 */}
			{/* Hero 区域整体高度相关代码
			min-h-0                            // ≤440px：Hero 由文字与按钮的实际内容撑高
			min-[441px]:min-h-0                 // 441–800px：取消 360px 最低高度，由内容撑高
			min-[801px]:min-h-0                 // >800px：继续由内容撑高
			px-6 / min-[441px]:px-8 / min-[801px]:px-[56px] // 左右内边距：24px / 32px / 56px
			pt-8 / min-[441px]:pt-[20px] / min-[801px]:pt-[40px] // 顶部内边距：32px / 20px / 40px
			pb-1 / min-[441px]:pb-1 / min-[801px]:pb-1 // 底部内边距：4px / 4px / 4px
			*/}

			{/* 插画位置 本次改动：`bottom-3 / min-[801px]:bottom-4` → 全部 `bottom-1`，品牌插画区与文字按钮区统一距离 Hero 底边 4px；保留 `block` 消除图片基线空隙。 */}
			<div className='pointer-events-none absolute right-[-9%] bottom-13 z-[1] w-[clamp(400px,80%,725px)] max-w-none min-[441px]:right-[-18%] min-[441px]:bottom-7 min-[801px]:right-[3%] min-[801px]:bottom-1 min-[801px]:top-auto '>
				{/* 本次改动：>800px 椭圆蓝雾 `bottom-[14px] / blur-[24px]` → `bottom-[24px] / blur-[22px]`，上移并减小底部扩散，避免 Hero 底边出现淡蓝截断线。 */}
				<div
					aria-hidden='true'
					className='absolute right-[-10%] bottom-[-3%] left-[-10%] z-0 h-[32%] rounded-[50%] opacity-70 blur-[20px] min-[441px]:right-[-12%] min-[441px]:bottom-[-4%] min-[441px]:left-[-12%] min-[441px]:h-[36%] min-[441px]:opacity-80 min-[441px]:blur-[24px] min-[801px]:right-[-14%] min-[801px]:bottom-[24px] min-[801px]:left-[-14%] min-[801px]:h-[36%] min-[801px]:opacity-85 min-[801px]:blur-[20px]'
					style={{
						background:
							'radial-gradient(ellipse at center, rgba(110, 174, 250, 0.39) 0%, rgba(137, 193, 255, 0.27) 34%, rgba(157, 204, 253, 0.15) 58%, rgba(193, 224, 255, 0.06) 76%, rgba(219, 237, 255, 0) 100%)'
					}}
				/>



				{/* 本次改动：>800px 横向浅蓝光带 `bottom-[5%] / blur-[22px]` → `bottom-[8%] / blur-[20px]`，上移并减小底部扩散。 */}
				<div
					aria-hidden='true'
					className='absolute right-[6%] bottom-[5%] left-[6%] z-0 h-[15%] opacity-60 blur-[18px] min-[441px]:right-[4%] min-[441px]:bottom-[6%] min-[441px]:left-[4%] min-[441px]:h-[17%] min-[441px]:opacity-65 min-[441px]:blur-[20px] min-[801px]:right-[2%] min-[801px]:bottom-[8%] min-[801px]:left-[2%] min-[801px]:h-[18%] min-[801px]:opacity-70 min-[801px]:blur-[22px]'
					style={{
						background:
							'linear-gradient(90deg, rgba(96, 165, 250, 0) 0%, rgba(112, 176, 250, 0.12) 18%, rgba(112, 176, 250, 0.24) 50%, rgba(112, 176, 250, 0.12) 82%, rgba(96, 165, 250, 0) 100%)'
					}}
				/>



				<img
					src={desktopArtSrc}
					alt=''
					aria-hidden='true'
					loading='eager'
					fetchPriority='high'
					className='relative z-[1] block h-auto w-full max-w-none'
				/>
			</div>

			{/* 本次改动：内容宽度 `max-w-[480px] / min-[801px]:max-w-[598px]` → 小屏占满、中屏480px、PC520px三级。 */}
			<div className='static w-full min-w-0 min-[441px]:max-w-[480px] min-[801px]:relative min-[801px]:z-[2] min-[801px]:ml-2 min-[801px]:max-w-[520px] '>
				<div className='relative z-[2]'>
					{/* 本次改动：撤销 ≤440px 第一行的横向缩放与字号缩小，恢复为原始 `13px`，441px 以上保持不变。 */}
					<p className='mb-4 text-[15px] font-semibold tracking-[0.14em] min-[441px]:text-[16px] min-[801px]:text-[17px] min-[801px]:tracking-[0.16em]'>
						<span className='text-amber-500'>设计</span>
						<span className='mx-2 text-slate-500'>·</span>
						<span className='text-sky-600'>技术</span>
						<span className='mx-2 text-slate-500'>·</span>
						<span className='text-amber-500'>生活</span>
					</p>

					{/* 本次改动：>800px 第 2 行字号 `44px` → `51px`，约放大 15%；≤800px 不变。 */}
					<h1 id='home-hero-title' className='text-[28px] leading-tight font-semibold tracking-tight text-slate-950 min-[441px]:text-[36px] min-[801px]:text-[51px]'>
						<span className='tracking-[0.03em] min-[441px]:tracking-[0.05em] min-[801px]:tracking-[0.07em]'>你好，我是</span>{' '}
						<span className='bg-gradient-to-r from-sky-600 to-cyan-500 bg-clip-text font-medium text-transparent'>{username}</span>
					</h1>

					{/* 本次改动：>800px 第 3 行最大宽度 `440px` → `506px`、字号 `16px` → `18.4px`，统一放大约 15%；≤800px 不变。 */}
					<p className='mt-2.5 w-full max-w-[265px] text-[14px] leading-6 text-slate-600 min-[441px]:mt-4 min-[441px]:max-w-[360px] min-[441px]:text-[15px] min-[441px]:leading-[26px] min-[801px]:max-w-[506px] min-[801px]:text-[18.4px] min-[801px]:leading-7'>{description}</p>
				</div>

				{/* 本次改动：按钮保持正常文档流，间距为小屏24px、中屏28px、PC32px三级。 */}

                {/* 左侧内容区与第一组按钮的间距mt-17  min-[441px]:mt-7  min-[801px]:mt-8 */}
				<div className='relative z-[2] mt-17 flex flex-col items-start gap-4 min-[441px]:mt-7 min-[801px]:mt-8'>
					{/* 本次改动：“查看我的项目”按钮由 Tailwind sky-600 改为示意图近似色 `#2F87DB`，悬停色改为 `#287ACB`，并同步蓝色阴影。 */}
					<div className='flex items-center gap-2 min-[441px]:gap-3 min-[801px]:flex-wrap min-[801px]:gap-3.5'>
						<Link
							href='/projects'
							className='focus-visible:ring-brand inline-flex min-h-[38px] min-w-[124px] items-center justify-center gap-[5px] rounded-[9px] bg-[#2F87DB] px-3 py-1.5 text-[12px] font-semibold tracking-[0.04em] text-white shadow-[0_12px_28px_-16px_rgba(47,135,219,0.92)] transition-colors hover:bg-[#287ACB] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none min-[441px]:min-h-[42px] min-[441px]:min-w-[144px] min-[441px]:gap-1.5 min-[441px]:px-4 min-[441px]:py-2 min-[441px]:text-[13px] min-[441px]:tracking-[0.06em] min-[801px]:min-h-[48px] min-[801px]:min-w-[164px] min-[801px]:gap-2 min-[801px]:px-5 min-[801px]:py-2.5 min-[801px]:text-[15px] min-[801px]:tracking-[0.09em]'>
							查看我的项目
							<ArrowRight aria-hidden='true' className='size-[14px] min-[441px]:size-[16px] min-[801px]:size-[18px]' />
						</Link>

						<Link
							href='/blog'
							className='focus-visible:ring-brand inline-flex min-h-[38px] min-w-[86px] items-center justify-center rounded-[9px] border border-[#1973d4] bg-white/85 px-3 py-1.5 text-[12px] leading-none font-semibold tracking-[0.04em] text-[#4184d8] transition-colors hover:border-[#1465bd] hover:bg-white hover:text-[#1465bd] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none min-[441px]:min-h-[42px] min-[441px]:min-w-[104px] min-[441px]:px-4 min-[441px]:py-2 min-[441px]:text-[13px] min-[441px]:tracking-[0.06em] min-[801px]:min-h-[48px] min-[801px]:min-w-[120px] min-[801px]:px-5 min-[801px]:py-2.5 min-[801px]:text-[15px] min-[801px]:tracking-[0.1em]'>
							阅读文章
						</Link>
					</div>

					<div className='flex flex-wrap items-center gap-3 '>
						{/* 本次改动：GitHub按钮改为小屏34px/12px、中屏38px/13px、PC44px/15px三级。 */}
						{githubUrl && (
							<a
								href={githubUrl}
								target='_blank'
								rel='noopener noreferrer'
								className='focus-visible:ring-brand inline-flex min-h-[34px] min-w-[92px] items-center justify-center gap-1.5 rounded-[9px] border border-slate-200 bg-white/85 px-2.5 py-0.5 text-[12px] font-medium text-slate-800 shadow-sm transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none min-[441px]:min-h-[38px] min-[441px]:min-w-[104px] min-[441px]:gap-2 min-[441px]:px-3 min-[441px]:py-1.5 min-[441px]:text-[13px] min-[801px]:min-h-[44px] min-[801px]:min-w-[116px] min-[801px]:px-4 min-[801px]:py-2 min-[801px]:text-[15px]'>
								<Github aria-hidden='true' className='size-[15px] stroke-[2.2] min-[441px]:size-[16px] min-[801px]:size-[18px]' />
								GitHub
							</a>
						)}

						{email && <EmailCopyButton email={email} />}
					</div>
				</div>
			</div>
		</section>
	)
}
