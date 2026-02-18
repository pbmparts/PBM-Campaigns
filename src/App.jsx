import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Admin from './pages/Admin/Admin'
import AdminLogin from './pages/Admin/AdminLogin'
import Welcome from './pages/Welcome/Welcome'
import CampaignPage from './pages/CampaignPage/CampaignPage'
import Board from './pages/CampaignPage/Board/Board'
import Thanks from './pages/Thanks/Thanks'
import AdminRoute from './Components/Auth/AdminRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={(
            <AdminRoute>
              <Admin />
            </AdminRoute>
          )}
        />

        <Route path="/c/:slug" element={<Welcome />} />
        <Route path="/c/:slug/board" element={<Board />} />
        <Route path="/c/:slug/products" element={<CampaignPage />} />
        <Route path="/c/:slug/thanks" element={<Thanks />} />

      </Routes>
    </BrowserRouter>
  )
}
