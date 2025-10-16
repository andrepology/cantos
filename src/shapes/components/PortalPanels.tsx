import { ConnectionsPanel } from '../../arena/ConnectionsPanel'
import { transact } from 'tldraw'
import type { Card } from '../../arena/types'

export interface ThreeDBoxPanelsProps {
  // Common
  z: number
  w: number
  h: number
  sideGapPx: number
  gapW: number
  editor: any
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  
  // Conditions
  isSelected: boolean
  isTransforming: boolean
  isPointerPressed: boolean
  isSingleShapeSelected: boolean
  
  // Shape panel data
  channel?: string
  title?: string
  author?: any
  createdAt?: string
  updatedAt?: string
  cards: any[] | null
  loading: boolean
  error: string | null
  chLoading: boolean
  chError: string | null
  panelConnections: any[]
  
  // Card panel data
  selectedCardId: number | null
  selectedCard?: Card
  selectedCardRect: { left: number; top: number; right: number; bottom: number } | null
  selectedBlockNumericId?: number
  selDetails?: any
  selDetailsLoading: boolean
  selDetailsError: string | null
  cardConnections: any[]
  
  // Handlers
  onSelectChannel: (slug: string) => void
  
  // Shape reference
  shapeId: string
  shapeProps: any
}

export function PortalPanels({
  z,
  w,
  h,
  sideGapPx,
  gapW,
  editor,
  panelOpen,
  setPanelOpen,
  isSelected,
  isTransforming,
  isPointerPressed,
  isSingleShapeSelected,
  channel,
  title,
  author,
  createdAt,
  updatedAt,
  cards,
  loading,
  error,
  chLoading,
  chError,
  panelConnections,
  selectedCardId,
  selectedCard,
  selectedCardRect,
  selectedBlockNumericId,
  selDetails,
  selDetailsLoading,
  selDetailsError,
  cardConnections,
  onSelectChannel,
  shapeId,
  shapeProps,
}: ThreeDBoxPanelsProps) {
  // Shape-level panel (for channel)
  const showShapePanel = 
    isSelected && 
    !isTransforming && 
    !isPointerPressed && 
    !!channel && 
    selectedCardId == null && 
    isSingleShapeSelected

  // Card-level panel (for selected card)
  const showCardPanel = 
    selectedCardId != null && 
    selectedCard && 
    selectedCardRect && 
    !isTransforming && 
    !isPointerPressed

  return (
    <>
      {/* Panel for shape/channel selection */}
      {showShapePanel ? (
        <ConnectionsPanel
          z={z}
          x={w + gapW + (1 / z)}
          y={8 / z}
          widthPx={260}
          maxHeightPx={400}
          title={title || channel || ''}
          author={author ? {
            id: (author as any).id,
            username: (author as any).username,
            full_name: (author as any).full_name,
            avatar: (author as any).avatar,
          } : undefined}
          createdAt={createdAt}
          updatedAt={updatedAt}
          blockCount={cards?.length}
          loading={loading || chLoading}
          error={error || chError}
          connections={panelConnections}
          hasMore={false}
          onSelectChannel={(slug) => {
            if (!slug) return
            transact(() => {
              editor.updateShape({
                id: shapeId,
                type: 'portal',
                props: { ...shapeProps, channel: slug, userId: undefined, userName: undefined },
              })
            })
          }}
          editor={editor}
          defaultDimensions={{ w, h }}
          isOpen={panelOpen}
          setOpen={setPanelOpen}
        />
      ) : null}

      {/* Panel for card selection */}
      {showCardPanel ? (
        <ConnectionsPanel
          z={z}
          x={(selectedCardRect!.right + sideGapPx + 16) / z}
          y={(selectedCardRect!.top + 12) / z}
          widthPx={260}
          maxHeightPx={400}
          title={(selectedCard as any).title || (selectedCard as any).slug || ''}
          author={selDetails?.user ? {
            id: (selDetails.user as any).id,
            username: (selDetails.user as any).username,
            full_name: (selDetails.user as any).full_name,
            avatar: (selDetails.user as any).avatar,
          } : undefined}
          createdAt={selDetails?.createdAt}
          updatedAt={selDetails?.updatedAt}
          blockCount={undefined}
          loading={!!selectedBlockNumericId && selDetailsLoading}
          error={selDetailsError}
          connections={cardConnections}
          hasMore={selDetails?.hasMoreConnections}
          onSelectChannel={onSelectChannel}
          editor={editor}
          defaultDimensions={{ w, h }}
          isOpen={panelOpen}
          setOpen={setPanelOpen}
        />
      ) : null}
    </>
  )
}

