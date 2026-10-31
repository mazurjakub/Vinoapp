/**
 * File: SelectedVineyardContext.tsx
 * Created: 2026-10-02
 * Description: React provider that loads the plots and remembers the selected one.
 */

import { useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { SETTINGS_KEYS } from '../db/settingsKeys'
import { setSetting } from '../db/settingsRepo'
import { SelectedVineyardContext } from './selectedVineyardContextObject'

export function SelectedVineyardProvider({ children }: { children: ReactNode }) {
  const vineyardsResult = useLiveQuery(() => db.vineyards.orderBy('name').toArray(), [])
  const vineyards = useMemo(() => vineyardsResult ?? [], [vineyardsResult])

  const settingRow = useLiveQuery(
    () => db.settings.where('key').equals(SETTINGS_KEYS.selectedVineyardId).first(),
    [],
  )

  const selectedVineyardId = useMemo(() => {
    const storedId = settingRow?.value as number | undefined
    if (storedId !== undefined && vineyards.some((v) => v.id === storedId)) {
      return storedId
    }
    return vineyards[0]?.id
  }, [settingRow, vineyards])

  const setSelectedVineyardId = (id: number | undefined) => {
    void setSetting(SETTINGS_KEYS.selectedVineyardId, id)
  }

  return (
    <SelectedVineyardContext.Provider
      value={{ selectedVineyardId, setSelectedVineyardId, vineyards }}
    >
      {children}
    </SelectedVineyardContext.Provider>
  )
}
