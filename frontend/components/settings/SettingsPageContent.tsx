'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { getUser } from '@/lib/api'
import ProfileSettings from './ProfileSettings'
import ShareManagement from './ShareManagement'
import GlobalSettings from './GlobalSettings'
import UserManagement from './UserManagement'

export default function SettingsPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('profile')

  useEffect(() => {
    setCurrentUser(getUser())
  }, [])

  const tabs = [
    { id: 'profile', label: 'Profile Settings' },
    { id: 'shares', label: 'Share Management' },
    { id: 'global', label: 'Global Settings', adminOnly: true },
    { id: 'users', label: 'User Management', adminOnly: true }
  ]

  const visibleTabs = tabs.filter(t => !t.adminOnly || currentUser?.perm?.admin)

  useEffect(() => {
    if (tabParam && visibleTabs.some(t => t.id === tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam, visibleTabs])

  const handleTabChange = (id: string) => {
    setActiveTab(id)
    router.replace(`/dashboard/settings?tab=${id}`)
  }

  if (!currentUser) return null

  return (
    <div className="p-4 sm:p-6">
      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-[#f0f0f0] mb-6 overflow-x-auto whitespace-nowrap">
        {visibleTabs.map(t => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={clsx(
              'px-5 py-3 text-sm font-bold border-b-2 transition-colors duration-150 focus:outline-none',
              activeTab === t.id
                ? 'border-[#007aff] text-[#007aff]'
                : 'border-transparent text-[#929292] hover:text-[#333333]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <ProfileSettings currentUser={currentUser} />}
      {activeTab === 'shares' && <ShareManagement />}
      {activeTab === 'global' && currentUser.perm?.admin && <GlobalSettings currentUser={currentUser} />}
      {activeTab === 'users' && currentUser.perm?.admin && <UserManagement currentUser={currentUser} />}
    </div>
  )
}
