'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FolderOpen, Settings, LogOut, Menu, X,
  FolderPlus, FilePlus, Search, Users
} from 'lucide-react'
import { clearAuth, getUser, usageApi, formatBytes } from '@/lib/api'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [sideOpen, setSideOpen] = useState(false)
  const [usage, setUsage] = useState<{ total: number; used: number } | null>(null)
  const [searchVal, setSearchVal] = useState('')

  useEffect(() => {
    const u = getUser()
    if (!u) { router.replace('/login'); return }
    setUser(u)
    usageApi.get('/').then(r => setUsage(r.data)).catch(() => { })
  }, [router])

  useEffect(() => {
    const handleToggle = () => setSideOpen(prev => !prev)
    window.addEventListener('toggle-sidebar', handleToggle)
    return () => window.removeEventListener('toggle-sidebar', handleToggle)
  }, [])

  useEffect(() => {
    if (pathname !== '/dashboard/files') {
      setSearchVal('')
      if (typeof window !== 'undefined') {
        ;(window as any).__searchQuery = ''
      }
    }
  }, [pathname])

  const handleSearchChange = (val: string) => {
    setSearchVal(val)
    if (typeof window !== 'undefined') {
      ;(window as any).__searchQuery = val
      window.dispatchEvent(new CustomEvent('global-search', { detail: val }))
    }
    if (pathname !== '/dashboard/files') {
      router.push('/dashboard/files')
    }
  }

  const logout = () => {
    clearAuth()
    toast.success('Logged out')
    router.replace('/login')
  }

  const handleSidebarAction = (action: string) => {
    setSideOpen(false)
    if (pathname === '/dashboard/files') {
      window.dispatchEvent(new CustomEvent(`sidebar-${action}`))
    } else {
      router.push(`/dashboard/files?action=${action}`)
    }
  }

  const isFilesPage = pathname === '/dashboard/files'
  const isSharedPage = pathname === '/dashboard/shared'
  const isSettingsPage = pathname.startsWith('/dashboard/settings')

  const navItems = [
    { label: 'My Files', icon: FolderOpen, href: '/dashboard/files', active: isFilesPage },
    { label: 'New Folder', icon: FolderPlus, action: 'new-folder' },
    { label: 'New File', icon: FilePlus, action: 'upload' },
    { label: 'Shared', icon: Users, href: '/dashboard/shared', active: isSharedPage },
    { label: 'Settings', icon: Settings, href: '/dashboard/settings', active: isSettingsPage },
  ]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">

      {/* ── TOP NAVBAR ── */}
      {/* Mobile: row 1 = hamburger + logo | row 2 = search bar */}
      {/* Desktop: single row with logo + search + spacer + user */}
      <header className="bg-white border-b border-[#f0f0f0] flex-shrink-0 z-30">

        {/* Row 1 — always visible */}
        <div className="h-[56px] sm:h-[64px] flex items-center px-3 sm:px-6 gap-2 sm:gap-4">
          {/* Hamburger — mobile only */}
          <button onClick={() => setSideOpen(true)} className="lg:hidden text-[#555555] hover:text-[#333333] focus:outline-none flex-shrink-0 p-1">
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="flex items-center flex-shrink-0">
            <img src="/images/logo.svg" alt="Logo" className="h-7 sm:h-8 w-auto object-contain" />
          </div>

          {/* Search bar — hidden on mobile (shown in row 2), visible sm+ */}
          <div className="relative hidden sm:block sm:w-[240px] md:w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search..."
              value={searchVal}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-7 py-2 text-[14px] bg-transparent border border-[#d9d9d9] rounded-lg focus:outline-none focus:border-[#007aff] transition-all text-[#333333] placeholder-[#b0b0b0]"
            />
            {searchVal && (
              <button onClick={() => handleSearchChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User avatar+name — sm+ only (in hamburger menu on mobile) */}
          <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#f1f3f4] hover:bg-[#e8eaed] transition-colors cursor-pointer flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#007aff] via-indigo-500 to-purple-600 flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <span className="text-[14px] font-semibold text-[#333333] pr-1">
              {user?.username || 'User'}
            </span>
          </div>
        </div>

        {/* Row 2 — search bar, mobile only */}
        <div className="sm:hidden px-3 pb-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search..."
              value={searchVal}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-7 py-2 text-[13px] bg-[#f6f6f6] border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#007aff] focus:bg-white transition-all text-[#333333] placeholder-[#b0b0b0]"
            />
            {searchVal && (
              <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

      </header>

      {/* ── BODY: sidebar + content ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className={clsx(
          'fixed inset-y-0 left-0 z-50 w-[280px] bg-white border-r border-[#f0f0f0] flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-auto lg:w-[240px] xl:w-[280px]',
          sideOpen ? 'translate-x-0' : '-translate-x-full'
        )}>
          {/* Mobile sidebar header — user info + close */}
          <div className="flex lg:hidden items-center justify-between px-4 py-4 border-b border-[#f0f0f0] bg-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#007aff] via-indigo-500 to-purple-600 flex items-center justify-center text-white text-[14px] font-bold flex-shrink-0">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <p className="text-[14px] font-bold text-[#333333] leading-tight">{user?.username || 'User'}</p>
                <p className="text-[11px] text-[#929292] leading-tight">{user?.perm?.admin ? 'Administrator' : 'Member'}</p>
              </div>
            </div>
            <button onClick={() => setSideOpen(false)} className="text-[#929292] hover:text-[#333333] focus:outline-none p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop sidebar close — hidden, sidebar is always visible */}
          <div className="hidden" />

          {/* Navigation */}
          <nav className="flex-1 px-4 py-5 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              if (item.href) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setSideOpen(false)}
                    className={clsx(
                      'flex items-center gap-3.5 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors duration-150',
                      item.active
                        ? 'bg-[#deeeff] text-[#007aff] font-bold'
                        : 'text-[#555555] hover:bg-[#f6f6f6] hover:text-[#333333]'
                    )}
                  >
                    {item.active ? (
                      <div className="w-7 h-7 rounded-lg bg-[#007aff] flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                    ) : (
                      <Icon className="w-[20px] h-[20px] text-[#929292] flex-shrink-0" />
                    )}
                    {item.label}
                  </Link>
                )
              }
              return (
                <button
                  key={item.label}
                  onClick={() => handleSidebarAction(item.action!)}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-[15px] font-medium text-[#555555] hover:bg-[#f6f6f6] hover:text-[#333333] transition-colors duration-150 text-left focus:outline-none"
                >
                  <Icon className="w-[20px] h-[20px] text-[#929292] flex-shrink-0" />
                  {item.label}
                </button>
              )
            })}

            {/* Logout */}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-[15px] font-medium text-[#555555] hover:bg-red-50 hover:text-red-600 transition-colors duration-150 text-left focus:outline-none"
            >
              <LogOut className="w-[20px] h-[20px] text-[#929292] flex-shrink-0" />
              Logout
            </button>
          </nav>

          {/* Storage */}
          {usage && usage.total > 0 && (
            <div className="mx-4 mb-4 p-3 bg-[#f6f6f6] rounded-xl flex-shrink-0">
              <div className="w-full bg-[#ebebeb] rounded-full h-1.5 mb-1.5">
                <div
                  className="h-1.5 rounded-full bg-[#007aff] transition-all"
                  style={{ width: `${Math.min(Math.round((usage.used / usage.total) * 100), 100)}%` }}
                />
              </div>
              <p className="text-[12px] text-[#929292]">
                {formatBytes(usage.used)} of {formatBytes(usage.total)} used
              </p>
            </div>
          )}
        </aside>

        {/* Overlay mobile */}
          {sideOpen && (
          <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setSideOpen(false)} />
        )}

        {/* ── Bottom nav bar (mobile only) ── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#f0f0f0] flex items-center justify-around px-2 h-14">
          {[
            { label: 'Files', icon: FolderOpen, href: '/dashboard/files', active: isFilesPage },
            { label: 'Shared', icon: Users, href: '/dashboard/shared', active: isSharedPage },
            { label: 'Upload', icon: FilePlus, action: 'upload' },
            { label: 'Settings', icon: Settings, href: '/dashboard/settings', active: isSettingsPage },
          ].map(item => {
            const Icon = item.icon
            if (item.href) {
              return (
                <Link key={item.label} href={item.href} className={clsx('flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors', item.active ? 'text-[#007aff]' : 'text-[#929292]')}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </Link>
              )
            }
            return (
              <button key={item.label} onClick={() => handleSidebarAction(item.action!)} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[#929292] transition-colors">
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto bg-white pb-16 lg:pb-0">
          {children}
        </main>
      </div>
    </div>
  )
}
