'use client'
import { useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { ProjectCard, type Project } from './components/project-card'
import CreateDialog from './components/create-dialog'
import JsonEditDialog from './components/json-edit-dialog'
import { pushProjects } from './services/push-projects'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import initialList from './list.json'
import type { ImageItem } from './components/image-upload-dialog'
export default function Page() {
	const [projects, setProjects] = useState<Project[]>(initialList as Project[])
	const [originalProjects, setOriginalProjects] = useState<Project[]>(initialList as Project[])
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [editingProject, setEditingProject] = useState<Project | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	// 本次改动：仅支持逐卡片编辑 → 新增 list.json 直接编辑弹框状态。
	const [isJsonEditDialogOpen, setIsJsonEditDialogOpen] = useState(false)
	// 本次改动：ProjectCard 只在首次挂载同步 project → JSON 应用、取消或保存后主动重挂载卡片，确保页面与 projects 状态一致。
	const [projectRenderVersion, setProjectRenderVersion] = useState(0)
	const [imageItems, setImageItems] = useState<Map<string, ImageItem>>(new Map())
	const keyInputRef = useRef<HTMLInputElement>(null)
	const { isAuth, setPrivateKey } = useAuthStore()
	const { siteContent } = useConfigStore()
	const hideEditButton = siteContent.hideEditButton ?? false
	const handleUpdate = (updatedProject: Project, oldProject: Project, imageItem?: ImageItem) => {
		setProjects(prev => prev.map(p => (p.url === oldProject.url ? updatedProject : p)))
		if (imageItem) {
			setImageItems(prev => {
				const newMap = new Map(prev)
				// 本次改动：只新增当前 URL 映射 → 清理同一图片的旧 URL 映射，避免项目 URL 修改后出现残留键。
				for (const [url, item] of newMap.entries()) {
					if (item === imageItem && url !== updatedProject.url) {
						newMap.delete(url)
					}
				}
				newMap.set(updatedProject.url, imageItem)
				return newMap
			})
		}
	}
	const handleAdd = () => {
		setEditingProject(null)
		setIsCreateDialogOpen(true)
	}

	// 本次改动：编辑模式没有原始数据入口 → 打开 list.json 编辑弹框；有待上传图片时阻止打开，避免 JSON 改 URL 后图片映射失效。
	const handleOpenJsonEditor = () => {
		if (imageItems.size > 0) {
			toast.error('存在尚未保存的项目图片，请先保存或取消后再编辑 JSON')
			return
		}
		setIsJsonEditDialogOpen(true)
	}

	// 本次改动：JSON 只能查看 → 校验成功后直接应用到 projects，并重挂载卡片展示最新内容。
	const handleApplyJson = (updatedProjects: Project[]) => {
		setProjects(updatedProjects)
		setProjectRenderVersion(prev => prev + 1)
		setIsJsonEditDialogOpen(false)
		toast.success('JSON 已应用到页面，请点击“保存”提交到 GitHub')
	}

	// 本次改动：仅接收项目数据 → 同时接收首次新增时选择的图片对象。
	const handleSaveProject = (updatedProject: Project, imageItem?: ImageItem) => {
		if (editingProject) {
			const updated = projects.map(p => (p.url === editingProject.url ? updatedProject : p))
			setProjects(updated)
		} else {
			setProjects(prev => [...prev, updatedProject])
		}
		if (imageItem) {
			setImageItems(prev => {
				const newMap = new Map(prev)
				if (editingProject && editingProject.url !== updatedProject.url) {
					newMap.delete(editingProject.url)
				}
				newMap.set(updatedProject.url, imageItem)
				return newMap
			})
		}
	}
	const handleDelete = (project: Project) => {
		if (confirm(`确定要删除 ${project.name} 吗？`)) {
			setProjects(projects.filter(p => p.url !== project.url))
			setImageItems(prev => {
				const newMap = new Map(prev)
				newMap.delete(project.url)
				return newMap
			})
		}
	}
	// 本次改动：导入密钥后立即执行保存 → 导入密钥仅完成授权，用户明确点击“保存”后才提交 GitHub。
	const handleChoosePrivateKey = async (file: File) => {
		try {
			const text = await file.text()
			setPrivateKey(text)
			toast.success('密钥导入成功，请点击“保存”提交修改')
		} catch (error) {
			console.error('Failed to read private key:', error)
			toast.error('读取密钥文件失败')
		}
	}

	const handleSaveClick = () => {
		if (!isAuth) {
			keyInputRef.current?.click()
		} else {
			handleSave()
		}
	}

	const handleSave = async () => {
		setIsSaving(true)
		try {
			// 本次改动：忽略上传后的正式项目数据 → 使用 pushProjects 返回的 /images/project/... 正式地址同步页面状态。
			const savedProjects = await pushProjects({
				projects,
				imageItems
			})
			setProjects(savedProjects)
			setOriginalProjects(savedProjects)
			// 本次改动：保存后只更新父级数据 → 重挂载卡片，确保 JSON 修改和正式图片地址立即显示。
			setProjectRenderVersion(prev => prev + 1)
			imageItems.forEach(imageItem => {
				if (imageItem.type === 'file') {
					URL.revokeObjectURL(imageItem.previewUrl)
				}
			})
			setImageItems(new Map())
			setIsEditMode(false)
			toast.success('保存成功！')
		} catch (error: unknown) {
			console.error('Failed to save:', error)
			const message = error instanceof Error ? error.message : '未知错误'
			toast.error(`保存失败: ${message}`)
		} finally {
			setIsSaving(false)
		}
	}
	const handleCancel = () => {
		imageItems.forEach(imageItem => {
			if (imageItem.type === 'file') {
				URL.revokeObjectURL(imageItem.previewUrl)
			}
		})
		setProjects(originalProjects)
		// 本次改动：取消只恢复父级 projects → 同步重挂载卡片，避免仍显示已应用但未保存的 JSON 内容。
		setProjectRenderVersion(prev => prev + 1)
		setImageItems(new Map())
		setIsJsonEditDialogOpen(false)
		setIsEditMode(false)
	}

	const buttonText = isAuth ? '保存' : '导入密钥'

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isEditMode && (e.ctrlKey || e.metaKey) && e.key === ',') {
				e.preventDefault()
				setIsEditMode(true)
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [isEditMode])

	return (
		<>
			<input
				ref={keyInputRef}
				type='file'
				accept='.pem'
				className='hidden'
				onChange={async e => {
					const f = e.target.files?.[0]
					if (f) await handleChoosePrivateKey(f)
					if (e.currentTarget) e.currentTarget.value = ''
				}}
			/>
			<div className='flex flex-col items-center justify-center px-6 pt-32 pb-12'>
				{projects.length === 0 && <p className='text-secondary py-12 text-center text-sm'>项目内容整理中，敬请期待。</p>}
				<div className='grid w-full max-w-[1200px] grid-cols-2 gap-6 max-md:grid-cols-1'>
					{projects.map(project => (
						// 本次改动：仅以 URL 作为 key → JSON 应用、取消和保存后附加版本号，强制 ProjectCard 用最新 project 初始化。
						<ProjectCard
							key={`${projectRenderVersion}-${project.url}`}
							project={project}
							isEditMode={isEditMode}
							onUpdate={handleUpdate}
							onDelete={() => handleDelete(project)}
						/>
					))}
				</div>
			</div>
			<motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} className='absolute top-4 right-6 flex gap-3 max-sm:hidden'>
				{isEditMode ? (
					<>
						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							onClick={handleCancel}
							disabled={isSaving}
							className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
							取消
						</motion.button>
						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							onClick={handleAdd}
							className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
							添加
						</motion.button>
						{/* 本次改动：编辑模式只有添加/保存 → 新增“编辑 JSON”，用于直接维护 list.json 数组内容和顺序。 */}
						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							onClick={handleOpenJsonEditor}
							disabled={isSaving}
							className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
							编辑 JSON
						</motion.button>
						<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSaveClick} disabled={isSaving} className='brand-btn px-6'>
							{isSaving ? '保存中...' : buttonText}
						</motion.button>
					</>
				) : (
					!hideEditButton && (
						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							onClick={() => setIsEditMode(true)}
							className='bg-card rounded-xl border px-6 py-2 text-sm backdrop-blur-sm transition-colors hover:bg-white/80'>
							编辑
						</motion.button>
					)
				)}
			</motion.div>
			{isCreateDialogOpen && <CreateDialog project={editingProject} onClose={() => setIsCreateDialogOpen(false)} onSave={handleSaveProject} />}
			{/* 本次改动：无 list.json 原始编辑入口 → 新增 JSON 编辑弹框；应用只更新页面状态，最终仍走现有保存链路。 */}
			{isJsonEditDialogOpen && <JsonEditDialog projects={projects} onClose={() => setIsJsonEditDialogOpen(false)} onApply={handleApplyJson} />}
		</>
	)
}
