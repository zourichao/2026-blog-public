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

			const slugChanged = mode === 'edit' && !!originalSlug && originalSlug !== form.slug
			// 本次改动：发布成功后给本地正文图片记录已落库的分享图地址；不改变 ImageItem 的 file 身份和正文 local-image 编辑状态。
			useWriteStore.setState(state => ({
				...(mode === 'edit' ? { originalSlug: form.slug } : {}),
				form: slugChanged ? { ...state.form, md: result.markdown } : state.form,
				images: state.images.map(item => {
					if (item.type === 'url') {
						return slugChanged ? { ...item, url: rewriteArticleImageUrlForSlug(item.url, originalSlug!, form.slug) } : item
					}
					if (!item.shareFile || !item.hash) return item
					return { ...item, publishedShareUrl: `/blogs/${form.slug}/share/${item.hash}.webp` }
				}),
				cover:
					slugChanged && state.cover?.type === 'url'
						? { ...state.cover, url: rewriteArticleImageUrlForSlug(state.cover.url, originalSlug!, form.slug) }
						: state.cover
			}))

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
