/**
 * File: selectedVineyardContextObject.ts
 * Created: 2026-10-02
 * Description: React context object and value type for the selected plot.
 */

import { createContext } from 'react'
import type { Vineyard } from '../db/schema'

export interface SelectedVineyardContextValue {
  selectedVineyardId: number | undefined
  setSelectedVineyardId: (id: number | undefined) => void
  vineyards: Vineyard[]
}

export const SelectedVineyardContext = createContext<SelectedVineyardContextValue | null>(
  null,
)
