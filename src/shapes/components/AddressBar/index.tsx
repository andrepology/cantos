export * from './AddressBar'
export * from './AddressBarSearch'
export * from './AddressBarDropdown'

// Re-export common types from the domain for convenience
export type {
  PortalAuthor,
  PortalChannel,
  PortalSource,
  PortalSourceOption,
  PortalSourceSelection,
} from '../../../arena/search/portalSearchTypes'

export { MOCK_PORTAL_SOURCES } from '../../../arena/search/portalSearchTypes'

