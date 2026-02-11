import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Actions from './pages/Actions'
import Jobs from './pages/Jobs'
import Overview from './pages/Overview'
import Runs from './pages/Runs'

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
