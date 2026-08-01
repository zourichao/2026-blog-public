'use client'

import { useEffect } from 'react'
import ConfigDialog from '../config-dialog'
import { useConfigStore } from '../stores/config-store'

export default function HomeConfigBridge() {
	const configDialogOpen = useConfigStore(state => state.configDialogOpen)
	const setConfigDialogOpen = useConfigStore(state => state.setConfigDialogOpen)

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && (event.key === 'l' || event.key === ',')) {
				event.preventDefault()
				setConfigDialogOpen(true)
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [setConfigDialogOpen])

	return <ConfigDialog open={configDialogOpen} onClose={() => setConfigDialogOpen(false)} />
}
