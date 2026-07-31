import type { BlogIndexItem } from '@/app/blog/types'
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

const HERO_DESCRIPTION = '产品设计与技术实践的探索者，热爱构建有价值的产品，记录成长与思考，分享设计、技术与生活。'

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

			<div id='home-content' className='space-y-4 lg:space-y-5'>
				<HomeHero
					username={siteContent.meta.username}
					description={HERO_DESCRIPTION}
					artSrc='/images/home/hero-brand-illustration.png'
					githubUrl={github?.value}
					email={email?.value}
				/>

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
			</div>

			<HomeFooter
				brandName={siteContent.navBrand}
				domain={siteContent.meta.title}
				description={siteContent.meta.description}
				copyright={siteContent.footerCopyright}
				beian={siteContent.beian}
			/>

			<HomeConfigBridge />
		</HomeShell>
	)
}
