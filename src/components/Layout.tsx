import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { FolderOpen, LayoutList, Map, MapPin, Send, Settings } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'

/**
 * App shell. Desktop: fixed left sidebar — app name on top, nav below,
 * Settings pinned to the bottom. Mobile: slim top bar (logo + notification
 * bell) plus a fixed bottom tab bar. Settings is a route (/settings), so the
 * bottom tab bar stays visible while in it.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth()

  const sideLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
      isActive
        ? 'bg-emerald-50 text-emerald-700 font-medium'
        : 'text-gray-600 hover:bg-gray-100'
    }`

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-0.5 text-xs px-3 py-1.5 rounded-lg ${
      isActive ? 'text-emerald-600 font-medium' : 'text-gray-500'
    }`

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Desktop left sidebar */}
      <aside className="hidden sm:flex fixed inset-y-0 left-0 z-20 w-56 flex-col bg-white border-r border-gray-200 p-4">
        <div className="flex items-center gap-2 px-1 mb-6">
          <span className="bg-emerald-600 text-white rounded-lg p-1.5">
            <MapPin size={18} />
          </span>
          <span className="font-bold text-gray-900">PlotBoard</span>
        </div>

        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={sideLinkClass}>
            <LayoutList size={18} /> Home
          </NavLink>
          <NavLink to="/map" className={sideLinkClass}>
            <Map size={18} /> Map View
          </NavLink>
          <NavLink to="/my-listings" className={sideLinkClass}>
            <FolderOpen size={18} /> My Listings
          </NavLink>
          {profile?.is_admin && (
            <NavLink to="/invites" className={sideLinkClass}>
              <Send size={18} /> Invites
            </NavLink>
          )}
        </nav>

        <div className="mt-auto border-t border-gray-200 pt-3 flex flex-col gap-1">
          <NavLink to="/settings" className={sideLinkClass}>
            <Settings size={18} /> Settings
          </NavLink>
        </div>
      </aside>

      {/* Mobile top bar — branding + notification bell (top-right). */}
      <header className="sm:hidden sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-emerald-600 text-white rounded-lg p-1.5">
              <MapPin size={18} />
            </span>
            <span className="font-bold text-gray-900">PlotBoard</span>
          </div>
          <NotificationBell />
        </div>
      </header>

      {/* Content, shifted right of the sidebar on desktop */}
      <main className="sm:pl-56 pb-20 sm:pb-0">
        <div className="max-w-5xl mx-auto">{children}</div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16">
          <NavLink to="/" end className={tabClass}>
            <LayoutList size={22} />
            Home
          </NavLink>
          <NavLink to="/map" className={tabClass}>
            <Map size={22} />
            Map
          </NavLink>
          <NavLink to="/my-listings" className={tabClass}>
            <FolderOpen size={22} />
            Listings
          </NavLink>
          {profile?.is_admin && (
            <NavLink to="/invites" className={tabClass}>
              <Send size={22} />
              Invites
            </NavLink>
          )}
          <NavLink to="/settings" className={tabClass}>
            <Settings size={22} />
            Settings
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
