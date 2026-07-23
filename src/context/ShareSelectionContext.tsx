/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Listing } from '../lib/types'

/**
 * WhatsApp-style multi-select for sharing. `active` turns cards into
 * selectable tiles; `selected` holds the chosen listings (full objects, so
 * the bottom bar can build the combined share text without a lookup).
 */
interface ShareSelectionValue {
  active: boolean
  selected: Listing[]
  isSelected: (id: string) => boolean
  enter: (listing?: Listing) => void
  toggle: (listing: Listing) => void
  exit: () => void
}

const Ctx = createContext<ShareSelectionValue | null>(null)

export function ShareSelectionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [selected, setSelected] = useState<Listing[]>([])

  const enter = useCallback((listing?: Listing) => {
    setActive(true)
    setSelected(listing ? [listing] : [])
  }, [])

  const toggle = useCallback((listing: Listing) => {
    setSelected((prev) =>
      prev.some((l) => l.id === listing.id)
        ? prev.filter((l) => l.id !== listing.id)
        : [...prev, listing],
    )
  }, [])

  const isSelected = useCallback(
    (id: string) => selected.some((l) => l.id === id),
    [selected],
  )

  const exit = useCallback(() => {
    setActive(false)
    setSelected([])
  }, [])

  const value = useMemo(
    () => ({ active, selected, isSelected, enter, toggle, exit }),
    [active, selected, isSelected, enter, toggle, exit],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useShareSelection(): ShareSelectionValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useShareSelection must be used within ShareSelectionProvider')
  return ctx
}
