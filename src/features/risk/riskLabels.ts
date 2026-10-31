/**
 * File: riskLabels.ts
 * Created: 2026-10-02
 * Description: Maps risk levels to translation keys and CSS classes.
 */

import type { Risk } from '../../rules'

export const RISK_LABEL_KEYS: Record<Risk, string> = {
  low: 'risk.levels.low',
  medium: 'risk.levels.medium',
  high: 'risk.levels.high',
}

export const RISK_CLASS: Record<Risk, string> = {
  low: 'risk--low',
  medium: 'risk--medium',
  high: 'risk--high',
}
