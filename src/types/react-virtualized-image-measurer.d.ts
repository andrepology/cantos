declare module 'react-virtualized-image-measurer' {
  import * as React from 'react'

  type ItemsWithSizes<T> = Array<{ item: T; size: { width: number; height: number } }>

  interface ImageMeasurerProps<T> {
    items: T[]
    image: (item: T) => string | undefined | null
    defaultHeight: number
    defaultWidth: number
    children: (args: { itemsWithSizes: ItemsWithSizes<T> }) => React.ReactNode
  }

  const ImageMeasurer: <T>(props: ImageMeasurerProps<T>) => JSX.Element
  export default ImageMeasurer
}

