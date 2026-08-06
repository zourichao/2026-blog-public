import { toBase64Utf8, getRef, createTree, createCommit, updateRef, createBlob, type TreeItem } from '@/lib/github-client'
import { fileToBase64NoPrefix, hashFileSHA256 } from '@/lib/file-utils'
import { getAuthToken } from '@/lib/auth'
import { GITHUB_CONFIG } from '@/consts'
import type { Project } from '../components/project-card'
import type { ImageItem } from '../components/image-upload-dialog'
import { getFileExt } from '@/lib/utils'
import { toast } from 'sonner'

export type PushProjectsParams = {
	projects: Project[]
	imageItems?: Map<string, ImageItem>
}

// 本次改动：Promise<void> → Promise<Project[]>，向页面返回已替换正式图片路径的项目数据。
export async function pushProjects(params: PushProjectsParams): Promise<Project[]> {
	const { projects, imageItems } = params

	// 本次改动：允许 blob 地址直接写入 list.json → 保存前校验必须存在对应的原始 File。
	const invalidProject = projects.find(project => {
		if (!project.image.trim().startsWith('blob:')) return false
		const imageItem = imageItems?.get(project.url)
		return !imageItem || imageItem.type !== 'file'
	})

	if (invalidProject) {
		throw new Error(`项目“${invalidProject.name}”的图片尚未完成上传，请重新选择图片后再保存`)
	}

	const token = await getAuthToken()

	toast.info('正在获取分支信息...')
	const refData = await getRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`)
	const latestCommitSha = refData.sha

	const commitMessage = `更新项目列表`

	toast.info('正在准备文件...')
	const treeItems: TreeItem[] = []
	const uploadedHashes = new Set<string>()
	let updatedProjects = [...projects]

	if (imageItems && imageItems.size > 0) {
		toast.info('正在上传图片...')
		for (const [url, imageItem] of imageItems.entries()) {
			if (imageItem.type === 'file') {
				const hash = imageItem.hash || (await hashFileSHA256(imageItem.file))
				const ext = getFileExt(imageItem.file.name)
				const filename = `${hash}${ext}`
				const publicPath = `/images/project/${filename}`
				if (!uploadedHashes.has(hash)) {
					const path = `public/images/project/${filename}`
					const contentBase64 = await fileToBase64NoPrefix(imageItem.file)
					const blobData = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, contentBase64, 'base64')
					treeItems.push({
						path,
						mode: '100644',
						type: 'blob',
						sha: blobData.sha
					})
					uploadedHashes.add(hash)
				}
				updatedProjects = updatedProjects.map(project => (project.url === url ? { ...project, image: publicPath } : project))
			}
		}
	}

	// 本次改动：转换后不复核 → 二次拦截任何未成功替换的 blob 地址，禁止生成无效 list.json。
	const unresolvedProject = updatedProjects.find(project => project.image.trim().startsWith('blob:'))
	if (unresolvedProject) {
		throw new Error(`项目“${unresolvedProject.name}”的图片上传结果无效，请重新选择图片后再保存`)
	}

	const projectsJson = JSON.stringify(updatedProjects, null, '\t')
	const projectsBlob = await createBlob(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, toBase64Utf8(projectsJson), 'base64')
	treeItems.push({
		path: 'src/app/projects/list.json',
		mode: '100644',
		type: 'blob',
		sha: projectsBlob.sha
	})
	toast.info('正在创建文件树...')
	const treeData = await createTree(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, treeItems, latestCommitSha)

	toast.info('正在创建提交...')
	const commitData = await createCommit(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, commitMessage, treeData.sha, [latestCommitSha])

	toast.info('正在更新分支...')
	await updateRef(token, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO, `heads/${GITHUB_CONFIG.BRANCH}`, commitData.sha)

	toast.success('发布成功！')
	return updatedProjects
}
