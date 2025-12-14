import { useAccount } from 'jazz-tools/react'
import { Account, GlobalPanelState } from './schema'

export function useGlobalPanelState() {
  const me = useAccount(Account, { resolve: { root: { globalPanelState: true } } })

  if (!me.$isLoaded) return { isOpen: false, togglePanel: () => {}, setOpen: () => {} }

  const isOpen = me.root.globalPanelState?.isOpen ?? false

  const togglePanel = () => {
    const newState = !isOpen
    if (me.root.globalPanelState) {
      me.root.globalPanelState.$jazz.set('isOpen', newState)
    } else {
      // Create globalPanelState if it doesn't exist (shouldn't happen due to migration)
      me.root.$jazz.set('globalPanelState', GlobalPanelState.create({ isOpen: newState }))
    }
  }

  const setOpen = (open: boolean) => {
    if (me.root.globalPanelState) {
      me.root.globalPanelState.$jazz.set('isOpen', open)
    } else {
      // Create globalPanelState if it doesn't exist
      me.root.$jazz.set('globalPanelState', GlobalPanelState.create({ isOpen: open }))
    }
  }

  return { isOpen, togglePanel, setOpen }
}
