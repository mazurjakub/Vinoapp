/**
 * File: App.tsx
 * Created: 2026-10-03
 * Description: Application shell with the page routes and the bottom navigation.
 */

import { useTranslation } from 'react-i18next'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import Overview from './routes/Overview'
import Weather from './routes/Weather'
import Journal from './routes/Journal'
import Harvest from './routes/Harvest'
import CarePlan from './routes/CarePlan'
import Settings from './routes/Settings'
import './App.css'

const navItems = [
  { to: '/', key: 'nav.overview' },
  { to: '/weather', key: 'nav.weather' },
  { to: '/journal', key: 'nav.journal' },
  { to: '/harvest', key: 'nav.harvest' },
  { to: '/settings', key: 'nav.settings' },
] as const

function App() {
  const { t } = useTranslation()

  return (
    <div className="app">
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/weather" element={<Weather />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/harvest" element={<Harvest />} />
          <Route path="/care-plan" element={<CarePlan />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="app-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {t(item.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default App
