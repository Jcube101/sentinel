import type { Level } from '@/lib/desk/types'

interface Props {
  level: Level
  /** A capped fire item's FIRMS level: dashed squares up to it. */
  wouldBe?: Level | null
  /** Inverted colours, for a dark (selected) background. */
  inverted?: boolean
}

/** Four squares: filled up to the level, dashed up to the level a cap holds back, hollow after. */
export default function LevelSquares({ level, wouldBe = null, inverted = false }: Props) {
  const fill = level === 4 ? 'bg-accent' : inverted ? 'bg-paper' : 'bg-ink'
  const line = inverted ? 'border-paper' : 'border-ink'
  const label = `Level ${level} of 4` + (wouldBe ? `, would be ${wouldBe} without the calibration cap` : '')
  return (
    <span className="flex gap-0.5 sm:gap-[3px]" role="img" aria-label={label}>
      {[1, 2, 3, 4].map((i) => {
        const shape =
          i <= level ? fill : wouldBe && i <= wouldBe ? `border border-dashed ${line}` : `border ${line}`
        return <span key={i} className={`w-2 h-2 sm:w-2.5 sm:h-2.5 box-border ${shape}`} />
      })}
    </span>
  )
}
