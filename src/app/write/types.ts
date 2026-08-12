export type PublishForm = {
	slug: string
	title: string
	author?: string
	md: string
	tags: string[]
	date: string
	summary: string
	hidden?: boolean
	category?: string
}

export type ImageItem =
	| { id: string; type: 'url'; url: string }
	| {
			id: string
			type: 'file'
			file: File
			previewUrl: string
			filename: string
			hash?: string
			shareFile?: File
			sharePreviewUrl?: string
			publishedShareUrl?: string
			shareError?: string
	  }

export type ImageFileAddResult = {
	originalIndex: number
	item: Extract<ImageItem, { type: 'file' }> | null
	status: 'added' | 'existing' | 'failed'
	error?: string
}
