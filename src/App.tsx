import './App.css'
import 'tldraw/tldraw.css'
import SlideEditor from './editor/SlideEditor'
import { useMyChannelsSync } from './arena/hooks/useMyChannelsSync'

function App() {
  useMyChannelsSync()
  
  return (
    <>
      <SlideEditor />
    </>
  )
}

export default App
