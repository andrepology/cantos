import './App.css'
import 'tldraw/tldraw.css'
import SlideShowExample from './examples/SlideShowTrackExample'
import { Cursor } from './MotionCursor'

function App() {
  return (
    <>
      {/* <Cursor
        // follow
        style={{ background: 'rgba(0,0,0,0.06)', backdropFilter: 'blur(4px)' }}
      /> */}
      <SlideShowExample />
    </>
  )
}

export default App
