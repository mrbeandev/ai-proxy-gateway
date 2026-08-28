import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './components/ThemeProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Services from './pages/Services'
import Playground from './pages/Playground'
import Logs from './pages/Logs'
import Settings from './pages/Settings'

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="services" element={<Services />} />
              <Route path="playground" element={<Playground />} />
              <Route path="logs" element={<Logs />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  )
}
