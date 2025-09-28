import { useAccount } from 'jazz-tools/react'
import { Account, GlobalPanelState } from './schema'

export function useGlobalPanelState() {
  const { me } = useAccount(Account, { resolve: { root: { globalPanelState: true } } })

  if (me === undefined) return { isOpen: false, togglePanel: () => {}, setOpen: () => {} }
  if (!me) return { isOpen: false, togglePanel: () => {}, setOpen: () => {} }

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
    console.log('setOpen called with:', open, 'current isOpen:', isOpen)
    if (me.root.globalPanelState) {
      console.log('Setting globalPanelState.isOpen to:', open)
      me.root.globalPanelState.$jazz.set('isOpen', open)
    } else {
      // Create globalPanelState if it doesn't exist
      console.log('Creating new globalPanelState with isOpen:', open)
      me.root.$jazz.set('globalPanelState', GlobalPanelState.create({ isOpen: open }))
    }
  }

  return { isOpen, togglePanel, setOpen }
}
