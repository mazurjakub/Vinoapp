/**
 * File: ChartLegend.tsx
 * Created: 2026-10-25
 * Description: Legend component with line, bar, zone and marker swatches for the weather chart.
 */

export type LegendSwatch =
  | { kind: 'line'; color: string; dashed?: boolean }
  | { kind: 'bar'; color: string }
  | { kind: 'zone'; fill: string; border: string; dashedBorder?: boolean }
  | { kind: 'marker'; color: string }

export interface LegendItem {
  label: string
  swatch: LegendSwatch
}

function Swatch({ swatch }: { swatch: LegendSwatch }) {
  switch (swatch.kind) {
    case 'line':
      return (
        <line x1={1} y1={6} x2={19} y2={6} stroke={swatch.color} strokeWidth={2} strokeDasharray={swatch.dashed ? '4 3' : undefined} />
      )
    case 'bar':
      return <rect x={5} y={1} width={10} height={10} fill={swatch.color} />
    case 'zone':
      return (
        <rect
          x={1.5}
          y={1.5}
          width={17}
          height={9}
          fill={swatch.fill}
          stroke={swatch.border}
          strokeDasharray={swatch.dashedBorder ? '3 2' : undefined}
        />
      )
    case 'marker':
      return <polygon points="10,11 4,1 16,1" fill={swatch.color} />
  }
}

/**
 * Legend above a chart panel. Rendered as plain HTML rather than Recharts'
 * `<Legend>`, which draws every line series with a solid icon and so can't
 * tell the measured line apart from its dashed forecast continuation.
 */
function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
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
