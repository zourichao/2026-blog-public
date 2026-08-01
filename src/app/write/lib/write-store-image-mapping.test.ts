import assert from 'node:assert/strict'
import test from 'node:test'
import { useWriteStore } from '../stores/write-store'

function clearImages(): void {
	for (const image of useWriteStore.getState().images) {
		if (image.type === 'file') URL.revokeObjectURL(image.previewUrl)
	}
	useWriteStore.setState({ images: [] })
}

test('maps batch duplicates to one SHA-256-backed image without changing input order', async () => {
	clearImages()
	const first = new File(['same bytes'], 'first.png', { type: 'image/png' })
	const duplicate = new File(['same bytes'], 'duplicate.png', { type: 'image/png' })
	const results = await useWriteStore.getState().addFilesWithMapping([first, duplicate])

	assert.deepEqual(
		results.map(result => ({ originalIndex: result.originalIndex, status: result.status })),
		[
			{ originalIndex: 0, status: 'added' },
			{ originalIndex: 1, status: 'existing' }
		]
	)
	assert.equal(results[0].item?.id, results[1].item?.id)
	assert.equal(useWriteStore.getState().images.length, 1)
	clearImages()
})

test('deduplicates concurrent additions against the latest store state', async () => {
	clearImages()
	const first = new File(['concurrent bytes'], 'one.png', { type: 'image/png' })
	const second = new File(['concurrent bytes'], 'two.png', { type: 'image/png' })
	const [left, right] = await Promise.all([
		useWriteStore.getState().addFilesWithMapping([first]),
		useWriteStore.getState().addFilesWithMapping([second])
	])

	assert.equal(useWriteStore.getState().images.length, 1)
	assert.equal(left[0].item?.id, right[0].item?.id)
	assert.deepEqual(new Set([left[0].status, right[0].status]), new Set(['added', 'existing']))
	clearImages()
})

test('does not write stale images after the editor session resets', async () => {
	clearImages()
	const pending = useWriteStore
		.getState()
		.addFilesWithMapping([new File(['stale bytes'], 'stale.png', { type: 'image/png' })])
	useWriteStore.getState().reset()
	const results = await pending

	assert.equal(useWriteStore.getState().images.length, 0)
	assert.equal(results[0].status, 'failed')
	assert.equal(results[0].error, '图片导入已取消')
})

test('honors an import-token guard before mutating the image list', async () => {
	clearImages()
	const results = await useWriteStore
		.getState()
		.addFilesWithMapping([new File(['guarded bytes'], 'guarded.png', { type: 'image/png' })], () => false)

	assert.equal(useWriteStore.getState().images.length, 0)
	assert.equal(results[0].status, 'failed')
	assert.equal(results[0].error, '图片导入已取消')
})
