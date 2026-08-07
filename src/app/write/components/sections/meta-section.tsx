import { useState } from 'react'
import { motion } from 'motion/react'
import { useWriteStore } from '../../stores/write-store'
import { TagInput } from '../ui/tag-input'
import { CategoryManager } from '../ui/category-manager'
import { useCategories } from '@/hooks/use-categories'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { Select } from '@/components/select'

type MetaSectionProps = {
	delay?: number
}

export function MetaSection({ delay = 0 }: MetaSectionProps) {
	const { form, updateForm } = useWriteStore()
	console.log(form.date)
	const { categories, setCategories, loading: categoriesLoading, error: categoriesError } = useCategories({ preferRepository: true })
	const { siteContent } = useConfigStore()
	const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
	const enableCategories = siteContent.enableCategories ?? false

	const currentCategory = form.category || ''
	const currentCategoryInvalid = !categoriesLoading && !categoriesError && Boolean(currentCategory) && !categories.includes(currentCategory)
	const categoryOptions = categoriesLoading
		? [{ value: currentCategory, label: '分类加载中…' }]
		: categoriesError
			? [{ value: currentCategory, label: '分类加载失败' }]
			: [
					{ value: '', label: '未分类' },
					...(currentCategoryInvalid ? [{ value: currentCategory, label: `${currentCategory}（已失效）` }] : []),
					...categories.map(cat => ({ value: cat, label: cat }))
				]

	return (
		<motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay }} className='card relative'>
			<h2 className='text-sm'>元信息</h2>
			<div className='mt-3 space-y-2'>
				<div>
					<label htmlFor='blog-author' className='text-secondary mb-1 block text-xs'>
						作者
					</label>
					<input
						id='blog-author'
						type='text'
						placeholder='作者'
						className='bg-card w-full rounded-lg border px-3 py-2 text-sm'
						value={form.author ?? ''}
						onChange={e => updateForm({ author: e.target.value })}
					/>
				</div>
				<textarea
					placeholder='为这篇文章写一段简短摘要'
					rows={2}
					className='bg-card block w-full resize-none rounded-xl border p-3 text-sm'
					value={form.summary}
					onChange={e => updateForm({ summary: e.target.value })}
				/>
				<TagInput tags={form.tags} onChange={tags => updateForm({ tags })} />
				{enableCategories && (
					<>
						{/* 本次改动：分类加载时仍可选择且失败会混入旧数据 → 加载/失败时禁用选择，并明确显示当前文章的失效分类。 */}
						<div className='flex items-center gap-2'>
							<Select
								className='min-w-0 flex-1 text-sm'
								value={currentCategory}
								onChange={value => updateForm({ category: value })}
								options={categoryOptions}
								disabled={categoriesLoading || Boolean(categoriesError)}
							/>
							<button
								type='button'
								onClick={() => setCategoryManagerOpen(true)}
								className='text-secondary hover:text-foreground bg-card shrink-0 rounded-lg border px-3 py-2 text-xs transition hover:bg-black/5'>
								管理
							</button>
						</div>
						{categoriesError && <p className='text-xs text-red-500'>GitHub 分类读取失败，请点击“管理”重新读取后再选择分类。</p>}
						{currentCategoryInvalid && <p className='text-xs text-amber-600'>当前文章分类“{currentCategory}”已不存在，请重新选择后再发布。</p>}
						<CategoryManager
							open={categoryManagerOpen}
							onClose={() => setCategoryManagerOpen(false)}
							onCategoriesChanged={nextCategories => {
								void setCategories(nextCategories)
							}}
							onCategoryRemap={(fromCategory, toCategory) => {
								if (form.category === fromCategory) updateForm({ category: toCategory })
							}}
						/>
					</>
				)}
				<input
					type='datetime-local'
					placeholder='日期'
					className='bg-card w-full rounded-lg border px-3 py-2 text-sm'
					value={form.date}
					onChange={e => {
						updateForm({ date: e.target.value })
					}}
				/>
				<div className='flex items-center gap-2'>
					<input
						type='checkbox'
						id='hidden-check'
						checked={form.hidden || false}
						onChange={e => updateForm({ hidden: e.target.checked })}
						className='h-4 w-4 rounded border-gray-300'
					/>
					<label htmlFor='hidden-check' className='cursor-pointer text-sm text-gray-600 select-none'>
						隐藏此文章（仅管理员可见）
					</label>
				</div>
			</div>
		</motion.div>
	)
}
