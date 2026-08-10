import { useCallback } from 'react'
import { readFileAsText } from '@/lib/file-utils'
import { toast } from 'sonner'
import { pushBlog } from '../services/push-blog'
import { deleteBlog } from '../services/delete-blog'
import { useWriteStore } from '../stores/write-store'
import { useAuthStore } from '@/hooks/use-auth'
import { rewriteArticleImageUrlForSlug } from '../lib/article-slug-migration'

export function usePublish() {
	const { loading, setLoading, form, cover, images, mode, originalSlug } = useWriteStore()
	const { isAuth, setPrivateKey } = useAuthStore()
	const onChoosePrivateKey = useCallback(
		async (file: File) => {
			const pem = await readFileAsText(file)
			setPrivateKey(pem)
		},
		[setPrivateKey]
	)

	const onPublish = useCallback(async () => {
		try {
			setLoading(true)
			const result = await pushBlog({
				form,
				cover,
				images,
				mode,
				originalSlug
			})

			if (mode === 'edit') {
				const slugChanged = !!originalSlug && originalSlug !== form.slug

				// 本次改动：Slug 修改后仅更新 GitHub → 同步更新编辑器内的 originalSlug、正文图片、图片列表和封面 URL，避免二次发布重新写回旧路径。
				useWriteStore.setState(state => ({
					originalSlug: form.slug,
					form: slugChanged ? { ...state.form, md: result.markdown } : state.form,
					images: slugChanged
						? state.images.map(item =>
								item.type === 'url' ? { ...item, url: rewriteArticleImageUrlForSlug(item.url, originalSlug!, form.slug) } : item
							)
						: state.images,
					cover:
						slugChanged && state.cover?.type === 'url'
							? { ...state.cover, url: rewriteArticleImageUrlForSlug(state.cover.url, originalSlug!, form.slug) }
							: state.cover
				}))
			}

			const successMsg = mode === 'edit' ? '更新成功' : '发布成功'
			toast.success(successMsg)
		} catch (err: any) {
			console.error(err)
			toast.error(err?.message || '操作失败')
		} finally {
			setLoading(false)
		}
	}, [form, cover, images, mode, originalSlug, setLoading])
	const onDelete = useCallback(async () => {
		const targetSlug = originalSlug || form.slug
		if (!targetSlug) {
			toast.error('缺少 slug，无法删除')
			return
		}
		try {
			setLoading(true)
			await deleteBlog(targetSlug)
		} catch (err: any) {
			console.error(err)
			toast.error(err?.message || '删除失败')
		} finally {
			setLoading(false)
		}
	}, [form.slug, originalSlug, setLoading])

	return {
		isAuth,
		loading,
		onChoosePrivateKey,
		onPublish,
		onDelete
	}
}
