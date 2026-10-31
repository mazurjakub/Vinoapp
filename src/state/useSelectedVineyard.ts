/**
 * File: useSelectedVineyard.ts
 * Created: 2026-10-02
 * Description: React hook that returns the selected plot context.
 */

import { useContext } from 'react'
import { SelectedVineyardContext } from './selectedVineyardContextObject'

export function useSelectedVineyard() {
  const ctx = useContext(SelectedVineyardContext)
  if (!ctx) {
    throw new Error('useSelectedVineyard must be used within SelectedVineyardProvider')
  }
  return ctx
}
