'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Select } from '@/components/select'
import {
	addCategory,
	deleteCategory,
	getCategoryManagementSnapshot,
	renameCategory,
	updateCategoriesJson,
	type CategoryManagementSnapshot
} from '../../services/manage-categories'
type CategoryManagerProps = {
	open: boolean
	onClose: () => void
	onCategoriesChanged: (categories: string[]) => void
	onCategoryRemap: (fromCategory: string, toCategory: string) => void
}

const EMPTY_SNAPSHOT: CategoryManagementSnapshot = { categories: [], usage: {}, orphanCategories: {} }
export function CategoryManager({ open, onClose, onCategoriesChanged, onCategoryRemap }: CategoryManagerProps) {
	const [mounted, setMounted] = useState(false)
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [snapshot, setSnapshot] = useState<CategoryManagementSnapshot>(EMPTY_SNAPSHOT)
	const [newCategory, setNewCategory] = useState('')
	const [editingCategory, setEditingCategory] = useState<string | null>(null)
	const [editingValue, setEditingValue] = useState('')
	const [deletingCategory, setDeletingCategory] = useState<string | null>(null)
	const [replacementCategory, setReplacementCategory] = useState('')
	// 本次改动：分类只能逐项维护 → 增加 categories.json 高级编辑状态，用于批量新增和调整显示顺序。
	const [jsonEditorOpen, setJsonEditorOpen] = useState(false)
	const [jsonText, setJsonText] = useState('')
	useEffect(() => setMounted(true), [])

	useEffect(() => {
		if (!open) return
		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.body.style.overflow = previousOverflow
		}
	}, [open])
	useEffect(() => {
		if (!open) return
		let active = true
		// 本次改动：加载失败仍保留上次 snapshot → 每次打开先清空旧数据，并设置独立错误状态，失败时禁止继续操作旧分类。
		setSnapshot(EMPTY_SNAPSHOT)
		setLoadError(null)
		setLoading(true)
		setNewCategory('')
		setEditingCategory(null)
		setDeletingCategory(null)
		setReplacementCategory('')
		setJsonEditorOpen(false)
		setJsonText('')
		getCategoryManagementSnapshot()
			.then(data => {
				if (!active) return
				setSnapshot(data)
				onCategoriesChanged(data.categories)
			})
			.catch(error => {
				if (!active) return
				const message = error instanceof Error ? error.message : '加载分类失败'
				setLoadError(message)
				toast.error(message)
			})
			.finally(() => {
				if (active) setLoading(false)
			})
		return () => {
			active = false
		}
		// 打开弹窗时强制从 GitHub 目标分支读取一次最新分类和文章使用量。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open])
	useEffect(() => {
		if (!open) return
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !saving) onClose()
		}
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [open, onClose, saving])
	const deletingUsage = deletingCategory ? snapshot.usage[deletingCategory] ?? 0 : 0
	const replacementOptions = useMemo(
		() => [
			{ value: '', label: '未分类' },
			...snapshot.categories.filter(category => category !== deletingCategory).map(category => ({ value: category, label: category }))
		],
		[snapshot.categories, deletingCategory]
	)
	const orphanEntries = useMemo(() => Object.entries(snapshot.orphanCategories), [snapshot.orphanCategories])
	const applySnapshot = (next: CategoryManagementSnapshot) => {
		setSnapshot(next)
		setLoadError(null)
		onCategoriesChanged(next.categories)
	}
	const handleReload = async () => {
		if (loading || saving) return
		setSnapshot(EMPTY_SNAPSHOT)
		setLoadError(null)
		setLoading(true)
		setEditingCategory(null)
		setDeletingCategory(null)
		setReplacementCategory('')
		setJsonEditorOpen(false)
		setJsonText('')
		try {
			const data = await getCategoryManagementSnapshot()
			setSnapshot(data)
			onCategoriesChanged(data.categories)
		} catch (error) {
			const message = error instanceof Error ? error.message : '加载分类失败'
			setLoadError(message)
			toast.error(message)
		} finally {
			setLoading(false)
		}
	}
	const handleAdd = async () => {
		if (!newCategory.trim() || saving || loading || loadError) return
		setSaving(true)
		try {
			const result = await addCategory(newCategory)
			applySnapshot(result)
			setNewCategory('')
			toast.success(`已添加分类“${newCategory.trim()}”`)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : '添加分类失败')
		} finally {
			setSaving(false)
		}
	}
	const handleRename = async () => {
		if (!editingCategory || !editingValue.trim() || saving || loadError) return
		setSaving(true)
		try {
			const oldName = editingCategory
			const newName = editingValue.trim()
			const result = await renameCategory(oldName, newName)
			applySnapshot(result)
			onCategoryRemap(oldName, newName)
			setEditingCategory(null)
			setEditingValue('')
			toast.success(result.affectedArticles > 0 ? `分类已修改，并同步更新 ${result.affectedArticles} 篇文章` : '分类名称已修改')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : '修改分类失败')
		} finally {
			setSaving(false)
		}
	}
	const handleDelete = async () => {
		if (!deletingCategory || saving || loadError) return
		setSaving(true)
		try {
			const oldName = deletingCategory
			const result = await deleteCategory(oldName, replacementCategory)
			applySnapshot(result)
			onCategoryRemap(oldName, replacementCategory)
			setDeletingCategory(null)
			setReplacementCategory('')
			toast.success(result.affectedArticles > 0 ? `分类已删除，并迁移 ${result.affectedArticles} 篇文章` : '分类已删除')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : '删除分类失败')
		} finally {
			setSaving(false)
		}
	}
	// 本次改动：调整顺序需要去 GitHub 手改文件 → 在管理弹窗中直接生成当前 categories.json，并保留原列表作为并发校验基线。
	const handleOpenJsonEditor = () => {
		if (loading || saving || loadError) return
		setEditingCategory(null)
		setDeletingCategory(null)
		setReplacementCategory('')
		setJsonText(JSON.stringify({ categories: snapshot.categories }, null, 2))
		setJsonEditorOpen(true)
	}
	const handleSaveJson = async () => {
		if (!jsonEditorOpen || !jsonText.trim() || loading || saving || loadError) return
		setSaving(true)
		try {
			const result = await updateCategoriesJson(jsonText, snapshot.categories)
			applySnapshot(result)
			setJsonText(JSON.stringify({ categories: result.categories }, null, 2))
			setJsonEditorOpen(false)
			toast.success('categories.json 已保存')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : '保存 categories.json 失败')
		} finally {
			setSaving(false)
		}
	}
	if (!mounted || !open) return null
	return createPortal(
		<div className='fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]' onMouseDown={() => !saving && onClose()}>
			<div
				role='dialog'
				aria-modal='true'
				aria-label='管理分类'
				className='bg-card w-full max-w-lg rounded-2xl border p-5 shadow-2xl'
				onMouseDown={event => event.stopPropagation()}>
				<div className='flex items-center justify-between gap-3'>
					<div>
						<h3 className='text-base font-medium'>管理分类</h3>
						<p className='text-secondary mt-1 text-xs'>修改或删除已使用分类时，会同步更新对应文章。</p>
					</div>
					<button
						type='button'
						aria-label='关闭分类管理'
						disabled={saving}
						onClick={onClose}
						className='hover:bg-foreground/5 rounded-lg p-2 transition disabled:cursor-not-allowed disabled:opacity-40'>
						<X className='h-4 w-4' />
					</button>
				</div>
				{/* 本次改动：只有逐项管理 → 增加 JSON 高级编辑区；进入后替换列表视图，避免与编辑/删除操作同时进行。 */}
				<div className='mt-4 max-h-[50vh] space-y-2 overflow-y-auto pr-1'>
					{jsonEditorOpen ? (
						<div className='space-y-3'>
							<div className='rounded-xl border border-blue-500/20 bg-blue-500/5 p-3'>
								<div className='text-sm font-medium'>编辑 categories.json</div>
								<p className='text-secondary mt-1 text-xs'>可直接新增分类或调整数组顺序。删除、改名已有分类请返回列表使用对应功能，避免产生文章分类脏数据。</p>
							</div>
							<textarea
								autoFocus
								spellCheck={false}
								value={jsonText}
								disabled={saving}
								onChange={event => setJsonText(event.target.value)}
								className='bg-card min-h-[260px] w-full resize-y rounded-xl border px-3 py-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50'
							/>
							<div className='flex items-center justify-between gap-3'>
								<p className='text-secondary text-[11px]'>保存前会校验 JSON、重复项、保留名称及 GitHub 最新分类状态。</p>
								<div className='flex shrink-0 gap-2'>
									<button
										type='button'
										disabled={saving}
										onClick={() => setJsonEditorOpen(false)}
										className='text-secondary rounded-lg px-3 py-2 text-xs hover:bg-black/5 disabled:opacity-40'>
										取消
									</button>
									<button
										type='button'
										disabled={saving || !jsonText.trim()}
										onClick={() => void handleSaveJson()}
										className='bg-brand flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'>
										{saving && <Loader2 className='h-3.5 w-3.5 animate-spin' />}
										保存 JSON
									</button>
								</div>
							</div>
						</div>
					) : loading ? (
						<div className='text-secondary flex items-center justify-center gap-2 py-10 text-sm'>
							<Loader2 className='h-4 w-4 animate-spin' />
							正在读取 GitHub 分类...
						</div>
					) : loadError ? (
						<div className='rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-4 text-center'>
							<div className='text-sm text-red-600'>分类加载失败</div>
							<div className='text-secondary mt-1 break-words text-xs'>{loadError}</div>
							<button
								type='button'
								onClick={() => void handleReload()}
								className='text-brand mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-blue-500/5'>
								<RefreshCw className='h-3.5 w-3.5' />
								重新加载
							</button>
						</div>
					) : snapshot.categories.length === 0 ? (
						<div className='text-secondary rounded-xl border border-dashed px-3 py-8 text-center text-sm'>暂无分类，可在下方添加。</div>
					) : (
						snapshot.categories.map(category => {
							const usage = snapshot.usage[category] ?? 0
							const isEditing = editingCategory === category
							return (
								<div key={category} className='bg-foreground/[0.025] rounded-xl border px-3 py-2.5'>
									{isEditing ? (
										<div className='flex items-center gap-2'>
											<input
												autoFocus
												value={editingValue}
												disabled={saving}
												onChange={event => setEditingValue(event.target.value)}
												onKeyDown={event => {
													if (event.key === 'Enter') void handleRename()
												}}
												className='bg-card min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20'
											/>
											<button type='button' disabled={saving} onClick={() => void handleRename()} className='text-brand rounded-lg px-2.5 py-2 text-xs hover:bg-blue-500/10 disabled:opacity-40'>
												保存
											</button>
											<button
												type='button'
												disabled={saving}
												onClick={() => setEditingCategory(null)}
												className='text-secondary rounded-lg px-2.5 py-2 text-xs hover:bg-black/5 disabled:opacity-40'>
												取消
											</button>
										</div>
									) : (
										<div className='flex items-center gap-2'>
											<div className='min-w-0 flex-1'>
												<div className='truncate text-sm'>{category}</div>
												<div className='text-secondary mt-0.5 text-[11px]'>{usage} 篇文章</div>
											</div>
											<button
												type='button'
												disabled={saving}
												onClick={() => {
													setEditingCategory(category)
													setEditingValue(category)
													setDeletingCategory(null)
												}}
												className='text-secondary hover:text-foreground rounded-lg p-2 hover:bg-black/5 disabled:opacity-40'
												aria-label={`编辑分类 ${category}`}>
												<Pencil className='h-3.5 w-3.5' />
											</button>
											<button
												type='button'
												disabled={saving}
												onClick={() => {
													setDeletingCategory(category)
													setReplacementCategory('')
													setEditingCategory(null)
												}}
												className='rounded-lg p-2 text-red-500 hover:bg-red-500/10 disabled:opacity-40'
												aria-label={`删除分类 ${category}`}>
												<Trash2 className='h-3.5 w-3.5' />
											</button>
										</div>
									)}
								</div>
							)
						})
					)}
				</div>
				{/* 本次改动：文章里的孤儿分类完全不可见 → 显示异常分类及使用文章数，但不自动修改历史文章。 */}
				{!jsonEditorOpen && !loading && !loadError && orphanEntries.length > 0 && (
					<div className='mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3'>
						<div className='flex items-start gap-2'>
							<AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-600' />
							<div className='min-w-0'>
								<div className='text-sm font-medium'>发现异常分类</div>
								<p className='text-secondary mt-1 text-xs'>以下分类仍存在于文章索引，但不在分类列表中。可先添加同名分类恢复为正式分类，再进行迁移。</p>
								<div className='mt-2 flex flex-wrap gap-1.5'>
									{orphanEntries.map(([category, count]) => (
										<span key={category} className='rounded-md border bg-white/40 px-2 py-1 text-[11px] dark:bg-black/10'>
											{category} · {count} 篇
										</span>
									))}
								</div>
							</div>
						</div>
					</div>
				)}
				{!jsonEditorOpen && deletingCategory && !loading && !loadError && (
					<div className='mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3'>
						<div className='text-sm font-medium'>删除“{deletingCategory}”？</div>
						{deletingUsage > 0 ? (
							<>
								<p className='text-secondary mt-1 text-xs'>当前有 {deletingUsage} 篇文章使用此分类，请选择迁移目标。</p>
								{/* 本次改动：迁移下拉层 z-50 被 z-[80] 弹窗遮挡 → 单独提升到 z-[90]。 */}
								<Select
									className='mt-2 w-full text-sm'
									dropdownClassName='z-[90]'
									value={replacementCategory}
									onChange={setReplacementCategory}
									options={replacementOptions}
									disabled={saving}
								/>
							</>
						) : (
							<p className='text-secondary mt-1 text-xs'>当前没有文章使用此分类，删除后不会影响文章。</p>
						)}
						<div className='mt-3 flex justify-end gap-2'>
							<button
								type='button'
								disabled={saving}
								onClick={() => setDeletingCategory(null)}
								className='text-secondary rounded-lg px-3 py-2 text-xs hover:bg-black/5 disabled:opacity-40'>
								取消
							</button>
							<button
								type='button'
								disabled={saving}
								onClick={() => void handleDelete()}
								className='flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50'>
								{saving && <Loader2 className='h-3.5 w-3.5 animate-spin' />}
								{deletingUsage > 0 ? '删除并迁移' : '确认删除'}
							</button>
						</div>
					</div>
				)}
				{/* 本次改动：只能逐项新增 → 保留原添加入口，并增加“编辑 JSON”高级入口用于批量新增和排序。 */}
				{!jsonEditorOpen && (
					<div className='mt-4 border-t pt-4'>
						<div className='mb-2 flex items-center justify-between gap-3'>
							<div className='text-secondary text-xs'>添加分类</div>
							<button
								type='button'
								disabled={loading || saving || Boolean(loadError)}
								onClick={handleOpenJsonEditor}
								className='text-brand rounded-lg px-2.5 py-1.5 text-xs hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-40'>
								编辑 JSON
							</button>
						</div>
						<div className='flex gap-2'>
							<input
								value={newCategory}
								disabled={loading || saving || Boolean(loadError)}
								onChange={event => setNewCategory(event.target.value)}
								onKeyDown={event => {
									if (event.key === 'Enter') void handleAdd()
								}}
								placeholder='输入新分类名称'
								className='bg-card min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50'
							/>
							<button
								type='button'
								disabled={loading || saving || Boolean(loadError) || !newCategory.trim()}
								onClick={() => void handleAdd()}
								className='bg-brand flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'>
								{saving ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Plus className='h-3.5 w-3.5' />}
								添加
							</button>
						</div>
						{loadError && <p className='mt-2 text-xs text-red-500'>请先重新加载分类，成功后才能继续修改。</p>}
					</div>
				)}
			</div>
		</div>,
		document.body
	)
}
