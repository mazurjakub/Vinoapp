/**
 * File: ChartLegend.tsx
 * Created: 2026-10-25
 * Description: Legend component with line, bar, marker and square swatches for the weather chart.
 */

export type LegendSwatch =
  | { kind: 'line'; color: string; dashed?: boolean }
  | { kind: 'bar'; color: string }
  | { kind: 'marker'; color: string }
  | { kind: 'square'; color: string }

export interface LegendItem {
  label: string
  swatch: LegendSwatch
  /** Hidden on a narrow screen, where the chart labels the item directly or it is self-evident. */
  wideOnly?: boolean
}

function Swatch({ swatch }: { swatch: LegendSwatch }) {
  switch (swatch.kind) {
    case 'line':
      return (
        <line x1={1} y1={6} x2={19} y2={6} stroke={swatch.color} strokeWidth={2} strokeDasharray={swatch.dashed ? '4 3' : undefined} />
      )
    case 'bar':
      return <rect x={5} y={1} width={10} height={10} fill={swatch.color} />
    case 'marker':
      return <polygon points="10,1 4,11 16,11" fill={swatch.color} />
    case 'square':
      return <rect x={5} y={1} width={10} height={10} fill={swatch.color} />
  }
}

/** Plain HTML instead of Recharts' <Legend>, which can't show a dashed forecast line. */
function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label} className={item.wideOnly ? 'chart-legend-wide-only' : undefined}>
          <svg width={20} height={12} aria-hidden="true">
            <Swatch swatch={item.swatch} />
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export default ChartLegend
