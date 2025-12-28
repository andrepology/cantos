// Re-export from central utilities and search domain
export { 
  getCaretPositionFromClick, 
  getCaretPositionWithSpacing, 
  getCaretFromDOMWidth 
} from '../../utils/textMeasurement'


export {
  MOCK_PORTAL_SOURCES,
} from '../../arena/search/portalSearchTypes'

export type {
  PortalAuthor,
  PortalChannel,
  PortalSourceOption,
  PortalSourceSelection,
} from '../../arena/search/portalSearchTypes'
