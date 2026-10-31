/**
 * File: App.tsx
 * Created: 2026-10-03
 * Description: Application shell with the page routes and the bottom navigation.
 */

import { useTranslation } from 'react-i18next'
import { NavLink, Route, Routes } from 'react-router-dom'
import Overview from './routes/Overview'
import Weather from './routes/Weather'
import Journal from './routes/Journal'
import Harvest from './routes/Harvest'
import CarePlan from './routes/CarePlan'
import Settings from './routes/Settings'
import './App.css'

const navItems = [
  { to: '/', key: 'nav.overview' },
  { to: '/pocasi', key: 'nav.weather' },
  { to: '/denik', key: 'nav.journal' },
  { to: '/uroda', key: 'nav.harvest' },
  { to: '/nastaveni', key: 'nav.settings' },
] as const

function App() {
  const { t } = useTranslation()

  return (
    <div className="app">
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/pocasi" element={<Weather />} />
          <Route path="/denik" element={<Journal />} />
          <Route path="/uroda" element={<Harvest />} />
          <Route path="/plan-pece" element={<CarePlan />} />
          <Route path="/nastaveni" element={<Settings />} />
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
