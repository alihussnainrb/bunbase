import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import Actions from './pages/Actions'
import Runs from './pages/Runs'
import Jobs from './pages/Jobs'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/actions" element={<Actions />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/jobs" element={<Jobs />} />
      </Routes>
    </Layout>
  )
}

export default App
