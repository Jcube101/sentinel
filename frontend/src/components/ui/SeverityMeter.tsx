import { severityBucket, SEVERITY_COLORS } from '@/lib/severity'

interface Props {
  score: number
}

export default function SeverityMeter({ score }: Props) {
  const bucket = severityBucket(score)
  const color = SEVERITY_COLORS[bucket]

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono flex-shrink-0" style={{ color }}>
        {score}
      </span>
    </div>
  )
}
