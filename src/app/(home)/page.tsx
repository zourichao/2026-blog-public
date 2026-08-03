import type { BlogIndexItem } from '@/app/blog/types'
import type { CSSProperties } from 'react'
import projectsData from '@/app/projects/list.json'
import recommendationsData from '@/app/share/list.json'
import siteContent from '@/config/site-content.json'
import blogIndexData from '../../../public/blogs/index.json'
import HomeConfigBridge from './components/home-config-bridge'
import HomeFooter from './components/home-footer'
import HomeHeader from './components/home-header'
import HomeHero from './components/home-hero'
import HomeProjects, { type HomeProjectItem } from './components/home-projects'
import HomeRecommendations, { type HomeRecommendationItem } from './components/home-recommendations'
import HomeSection from './components/home-section'
import HomeShell from './components/home-shell'
import LatestArticles from './components/latest-articles'

const HERO_DESCRIPTION = (
	<>
		产品设计与技术实践的探索者，构建有价值的产品，
		分享设计、技术与生活。
	</>
)

export default function HomePage() {
	const articles = [...(blogIndexData as BlogIndexItem[])]
		.filter(item => item.hidden !== true)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
		.slice(0, 3)
	const projects = (projectsData as HomeProjectItem[]).slice(0, 3)
	const recommendations = (recommendationsData as HomeRecommendationItem[]).slice(0, 3)
	const github = siteContent.socialButtons.find(item => item.type === 'github')
	const email = siteContent.socialButtons.find(item => item.type === 'email')

	return (
		<HomeShell>
			<HomeHeader brandName={siteContent.navBrand} iconSrc='/favicon.svg' />

			{/* 本次改动：≤800px 保持轻量背景；>800px 改为左上宽幅淡蓝环境光＋右上蓝色光晕＋纵向浅色底。 */}
			<main
				id='home-content'
				data-main-background-version='v4-desktop-top-glow'
				className='min-w-0 bg-no-repeat [background:var(--home-main-background-mobile)] min-[801px]:[background:var(--home-main-background-default)]'
				style={
					{
						'--home-main-background-mobile':
							'radial-gradient(circle at 82% 7%, rgba(191, 224, 252, 0.34) 0%, rgba(218, 237, 253, 0.20) 20%, transparent 40%), radial-gradient(circle at 8% 58%, rgba(220, 244, 242, 0.16) 0%, transparent 30%), linear-gradient(180deg, #f7fbfe 0%, #f4f9fc 24%, #f8fbfc 58%, #fdfefe 100%)',
						'--home-main-background-default':
							'radial-gradient(ellipse 72% 260px at 32% 0%, rgba(205, 229, 249, 0.30) 0%, rgba(225, 240, 252, 0.16) 48%, transparent 82%), radial-gradient(circle at 78% 8%, rgba(191, 224, 252, 0.50) 0%, rgba(218, 237, 253, 0.34) 24%, transparent 46%), radial-gradient(circle at 10% 62%, rgba(220, 244, 242, 0.22) 0%, transparent 34%), linear-gradient(180deg, #f7fbfe 0%, #f2f8fc 36%, #f6fafc 66%, #fbfdfe 100%)'
					} as CSSProperties
				}>
				<HomeHero
					username={siteContent.meta.username}
					description={HERO_DESCRIPTION}
					desktopArtSrc='/images/home/hero-brand-desktop.png'
					mobileArtSrc='/images/home/hero-brand-mobile.png'
					githubUrl={github?.value}
					email={email?.value}
				/>

				<div className='space-y-4 px-2 pt-4 pb-2 sm:px-3 sm:pb-3 lg:space-y-5 lg:px-6 lg:pt-5 lg:pb-6 xl:px-8 xl:pb-8'>
					<div className='grid min-w-0 items-start gap-4 sm:gap-5 lg:grid-cols-2 lg:items-stretch xl:grid-cols-[minmax(0,37fr)_minmax(0,34fr)_minmax(0,29fr)]'>
						<HomeSection
							id='latest-articles'
							title='最新文章'
							href='/blog'
							linkLabel='查看全部'
							className='lg:col-span-2 xl:col-span-1'>
							<LatestArticles articles={articles} />
						</HomeSection>

						<HomeSection id='home-projects' title='我的项目' href='/projects' linkLabel='查看全部' className='lg:col-span-1 xl:col-span-1'>
							<HomeProjects projects={projects} />
						</HomeSection>

						<HomeSection id='home-recommendations' title='推荐阅读' href='/share' linkLabel='查看全部' className='lg:col-span-1 xl:col-span-1'>
							<HomeRecommendations recommendations={recommendations} />
						</HomeSection>
					</div>

					<HomeFooter
						brandName={siteContent.navBrand}
						domain={siteContent.meta.title}
						description={siteContent.meta.description}
						copyright={siteContent.footerCopyright}
						beian={siteContent.beian}
					/>
				</div>
			</main>

			<HomeConfigBridge />
		</HomeShell>
	)
}
