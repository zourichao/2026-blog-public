import Card from '@/components/card'
import { useCenterStore } from '@/hooks/use-center'
import { useConfigStore } from './stores/config-store'
import { CARD_SPACING } from '@/consts'
import Link from 'next/link'
import { HomeDraggableLayer } from './home-draggable-layer'

export default function BeianCard() {
	const center = useCenterStore()
	const { cardStyles, siteContent } = useConfigStore()
	const styles = cardStyles.beianCard
	const hiCardStyles = cardStyles.hiCard

	const x = styles.offsetX !== null ? center.x + styles.offsetX : center.x + hiCardStyles.width / 2 - styles.width + 200
	const y = styles.offsetY !== null ? center.y + styles.offsetY : center.y + hiCardStyles.height / 2 + CARD_SPACING + 180

	const beian = siteContent.beian
	const footerCopyright = siteContent.footerCopyright

	if (!footerCopyright && !beian?.text) {
		return null
	}

	return (
		<HomeDraggableLayer cardKey='beianCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card order={styles.order} width={styles.width} height={styles.height} x={x} y={y} className='flex items-center justify-center max-sm:static'>
				<div className='text-secondary text-center text-xs'>
					{footerCopyright && <span>{footerCopyright}</span>}
					{footerCopyright && beian?.text && <span> · </span>}
					{beian?.text &&
						(beian.link ? (
							<Link href={beian.link} target='_blank' rel='noopener noreferrer' className='transition-opacity hover:opacity-80'>
								{beian.text}
							</Link>
						) : (
							<span>{beian.text}</span>
						))}
				</div>
			</Card>
		</HomeDraggableLayer>
	)
}
