/**
 * File: EmptyState.tsx
 * Created: 2026-10-31
 * Description: Shared card for pages that have nothing to show yet, with an icon, a short explanation and a link to the next step.
 */

import { Link } from 'react-router-dom'

const ICON_PATHS = {
  plot: 'M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  weather: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18Z',
} as const

interface EmptyStateProps {
  icon: keyof typeof ICON_PATHS
  title: string
  description: string
  actionTo: string
  actionLabel: string
}

function EmptyState({ icon, title, description, actionTo, actionLabel }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d={ICON_PATHS[icon]} />
        </svg>
      </span>
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-description">{description}</p>
      <Link className="empty-state-action" to={actionTo}>
        {actionLabel}
      </Link>
    </div>
  )
}

export default EmptyState
