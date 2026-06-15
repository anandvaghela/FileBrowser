'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Settings, Save, Shield, Users, Eye, EyeOff, Plus, Edit2,
  Trash2, X, Check, Lock, Clock, Link as LinkIcon, Copy,
  ExternalLink, HardDrive, LockKeyhole, Globe, Info, RefreshCw,
  ChevronDown, Pencil, FolderOpen, File
} from 'lucide-react'
import { settingsApi, usersApi, sharesApi, userSharesApi, getUser, formatBytes } from '@/lib/api'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { formatDistanceToNow, fromUnixTime } from 'date-fns'

import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'

const DEFAULT_PERM = {
  admin: false, execute: false, create: true,
  rename: true, modify: true, delete: true, share: true, download: true,
}

// ─── USER MODAL (for User Management) ─────────────────────────────────────────
function UserModal({ user, globalSettings, onClose, onDone }: { user?: any; globalSettings?: any; onClose: () => void; onDone: () => void }) {
  const isEdit = !!user
  const branding = globalSettings?.branding || {}
  const resolvedDefaultPerm = branding.defaultPerm || DEFAULT_PERM

  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    scope: user?.scope || branding.defaultScope || '/',
    locale: user?.locale || branding.defaultLanguage || 'en',
    perm: user?.perm || resolvedDefaultPerm,
    lockPassword: user?.lockPassword || false,
  })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const setPerm = (k: string, v: boolean) => setForm(f => ({ ...f, perm: { ...f.perm, [k]: v } }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isEdit) {
        const payload: any = { ...form }
        if (!payload.password) delete payload.password
        await usersApi.update(user.id, payload)
        toast.success('User updated')
      } else {
        await usersApi.create(form)
        toast.success('User created')
      }
      onDone()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Operation failed')
    } finally { setLoading(false) }
  }

  const PERMS = [
    { key: 'admin', label: 'Admin' },
    { key: 'create', label: 'Create' },
    { key: 'rename', label: 'Rename' },
    { key: 'modify', label: 'Modify' },
    { key: 'delete', label: 'Delete' },
    { key: 'share', label: 'Share' },
    { key: 'download', label: 'Download' },
    { key: 'execute', label: 'Execute' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up border border-[#ebebeb]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f0] sticky top-0 bg-white z-10">
          <h2 className="font-bold text-[#333333] text-[15px]">{isEdit ? `Edit ${user.username}` : 'New User'}</h2>
          <button onClick={onClose} className="text-[#929292] hover:text-[#333333] focus:outline-none"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Input
                label="Username *"
                value={form.username}
                onChange={e => set('username', e.target.value)}
                required
                placeholder="Username"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Input
                label={`Password ${isEdit ? '(leave blank to keep)' : '*'}`}
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                required={!isEdit}
                placeholder="Password"
                suffixIcon={
                  <button type="button" onClick={() => setShowPass(v => !v)} className="text-gray-400 hover:text-gray-600 focus:outline-none">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            </div>
            <div className="col-span-2">
              <Input
                label="Home Scope (directory)"
                value={form.scope}
                onChange={e => set('scope', e.target.value)}
                placeholder="/"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[#555555] mb-2.5">Permissions</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#f6f6f6] p-4 rounded-xl border border-[#ebebeb]">
              {PERMS.map(({ key, label }) => (
                <Checkbox
                  key={key}
                  label={label}
                  checked={!!form.perm[key as keyof typeof form.perm]}
                  onChange={checked => setPerm(key, checked)}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" loading={loading} className="flex-1">
              {isEdit ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TABS & CONTROLLER ────────────────────────────────────────────────────────
function SettingsPageContent() {
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

  // ─── STATE FOR PROFILE SETTINGS ─────────────────────────────────────────────
  const [profileUser, setProfileUser] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [hideDotfiles, setHideDotfiles] = useState(false)
  const [singleClick, setSingleClick] = useState(false)
  const [redirectAfterCopy, setRedirectAfterCopy] = useState(true)
  const [dateFormat, setDateFormat] = useState(false)
  const [locale, setLocale] = useState('en')
  const [editorTheme, setEditorTheme] = useState('chrome')
  // Password Change
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [currentPass, setCurrentPass] = useState('')

  const loadProfile = async () => {
    if (!currentUser) return
    setProfileLoading(true)
    try {
      const res = await usersApi.get(currentUser.id)
      const u = res.data
      setProfileUser(u)
      setHideDotfiles(!!u.hideDotfiles)
      setSingleClick(!!u.singleClick)
      setDateFormat(!!u.dateFormat)
      setLocale(u.locale || 'en')
      // Custom states saved on localStorage or just form state
      setEditorTheme(localStorage.getItem('fb_editor_theme') || 'chrome')
      setRedirectAfterCopy(localStorage.getItem('fb_redirect_copy') !== 'false')
    } catch {
      toast.error('Failed to load profile')
    } finally {
      setProfileLoading(false)
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const payload = {
        hideDotfiles,
        singleClick,
        dateFormat,
        locale,
      }
      const res = await usersApi.update(currentUser.id, payload)
      // Update stored user details
      localStorage.setItem('fb_user', JSON.stringify(res.data))
      localStorage.setItem('fb_editor_theme', editorTheme)
      localStorage.setItem('fb_redirect_copy', String(redirectAfterCopy))
      toast.success('Profile settings updated')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update profile settings')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPass) { toast.error('New password is required'); return }
    if (newPass !== confirmPass) { toast.error('Passwords do not match'); return }
    try {
      await usersApi.update(currentUser.id, {
        password: newPass,
        currentPassword: currentPass
      })
      toast.success('Password changed successfully')
      setNewPass('')
      setConfirmPass('')
      setCurrentPass('')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update password')
    }
  }

  // ─── STATE FOR SHARE MANAGEMENT ─────────────────────────────────────────────
  const [shares, setShares] = useState<any[]>([])
  const [sharesLoading, setSharesLoading] = useState(true)
  const [userShares, setUserShares] = useState<any[]>([])
  const [userSharesLoading, setUserSharesLoading] = useState(true)

  const loadShares = async () => {
    setSharesLoading(true)
    setUserSharesLoading(true)
    try {
      const [linksRes, userRes] = await Promise.all([
        sharesApi.list(),
        userSharesApi.myShares()
      ])
      setShares(linksRes.data)
      setUserShares(userRes.data.shares || [])
    } catch {
      toast.error('Failed to load shares')
    } finally {
      setSharesLoading(false)
      setUserSharesLoading(false)
    }
  }

  const updateUserSharePermission = async (item_path: string, shared_with: number, can_write: boolean) => {
    try {
      await userSharesApi.updatePermission(item_path, shared_with, can_write)
      setUserShares(prev => prev.map(item =>
        item.item_path === item_path
          ? { ...item, users: item.users.map((u: any) => u.shared_with === shared_with ? { ...u, can_write } : u) }
          : item
      ))
      toast.success('Permission updated')
    } catch { toast.error('Failed to update permission') }
  }

  const removeUserShare = async (item_path: string, shared_with: number) => {
    try {
      await userSharesApi.remove(item_path, shared_with)
      setUserShares(prev => prev
        .map(item => item.item_path === item_path
          ? { ...item, users: item.users.filter((u: any) => u.shared_with !== shared_with) }
          : item
        )
        .filter(item => item.users.length > 0)
      )
      toast.success('Access removed')
    } catch { toast.error('Failed to remove access') }
  }

  const deleteShare = async (hash: string) => {
    try {
      await sharesApi.delete(hash)
      toast.success('Share deleted')
      loadShares()
    } catch {
      toast.error('Failed to delete share link')
    }
  }

  const copyShareLink = (hash: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/share/${hash}`)
      .then(() => toast.success('Link copied!'))
      .catch(() => toast.error('Copy failed'))
  }

  // ─── STATE FOR GLOBAL SETTINGS ──────────────────────────────────────────────
  const [globalSettings, setGlobalSettings] = useState<any>(null)
  const [globalLoading, setGlobalLoading] = useState(true)
  const [savingGlobal, setSavingGlobal] = useState(false)

  const loadGlobalSettings = async () => {
    setGlobalLoading(true)
    try {
      const res = await settingsApi.get()
      setGlobalSettings(res.data)
    } catch {
      toast.error('Failed to load global settings')
    } finally {
      setGlobalLoading(false)
    }
  }

  const updateGlobalSetting = (key: string, val: any) => {
    setGlobalSettings((prev: any) => ({
      ...prev,
      [key]: val
    }))
  }

  const updateBrandingSetting = (key: string, val: any) => {
    setGlobalSettings((prev: any) => ({
      ...prev,
      branding: {
        ...(prev?.branding || {}),
        [key]: val
      }
    }))
  }

  const updateDefaultPermSetting = (key: string, val: boolean) => {
    setGlobalSettings((prev: any) => {
      const branding = prev?.branding || {}
      const defaultPerm = branding.defaultPerm || {
        admin: false, execute: false, create: true,
        rename: true, modify: true, delete: true, share: true, download: true,
      }
      return {
        ...prev,
        branding: {
          ...branding,
          defaultPerm: {
            ...defaultPerm,
            [key]: val
          }
        }
      }
    })
  }

  const handleUpdateGlobal = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingGlobal(true)
    try {
      await settingsApi.update(globalSettings)
      toast.success('Global settings updated')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save global settings')
    } finally {
      setSavingGlobal(false)
    }
  }

  // ─── STATE FOR USER MANAGEMENT ──────────────────────────────────────────────
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [modalUser, setModalUser] = useState<any | undefined>(undefined)
  const [showUserModal, setShowUserModal] = useState(false)
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null)

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const res = await usersApi.list()
      setUsers(res.data)
    } catch {
      toast.error('Failed to load users list')
    } finally {
      setUsersLoading(false)
    }
  }

  const handleDeleteUser = async (id: number) => {
    try {
      await usersApi.delete(id)
      toast.success('User deleted')
      setDeleteUserId(null)
      loadUsers()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Delete failed')
    }
  }

  // Tab change trigger loading
  useEffect(() => {
    if (!currentUser) return
    if (activeTab === 'profile') {
      loadProfile()
    } else if (activeTab === 'shares') {
      loadShares()
    } else if (activeTab === 'global') {
      loadGlobalSettings()
    } else if (activeTab === 'users') {
      loadUsers()
    }
  }, [activeTab, currentUser])

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

      {/* ─── TAB CONTENT: PROFILE SETTINGS ────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Profile Preferences */}
          <div className="bg-white rounded-xl border border-[#ebebeb] p-4 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-bold text-[#333333]">
                Profile Settings
              </h2>
              <Button
                type="submit"
                form="profile-form"
                loading={savingProfile}
                size="md"
              >
                Update
              </Button>
            </div>
            {profileLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-10 bg-gray-100 rounded-lg" />
                <div className="h-10 bg-gray-100 rounded-lg" />
                <div className="h-10 bg-gray-100 rounded-lg" />
              </div>
            ) : (
              <form id="profile-form" onSubmit={handleUpdateProfile} className="space-y-5">
                {/* Checkboxes */}
                <div className="space-y-3.5">
                  <Checkbox
                    label="Hide dotfiles"
                    checked={hideDotfiles}
                    onChange={setHideDotfiles}
                  />

                  <Checkbox
                    label="Use single clicks to open files and directories"
                    checked={singleClick}
                    onChange={setSingleClick}
                  />

                  <Checkbox
                    label="Redirect to destination after copy/move"
                    checked={redirectAfterCopy}
                    onChange={setRedirectAfterCopy}
                  />

                  <Checkbox
                    label="Set exact date format"
                    checked={dateFormat}
                    onChange={setDateFormat}
                  />
                </div>

                {/* Dropdowns */}
                <div className="space-y-4 pt-2">
                  <Select
                    label="Language"
                    value={locale}
                    onChange={e => setLocale(e.target.value)}
                    options={[
                      { value: 'en', label: 'English' },
                      { value: 'zh-cn', label: '简体中文' },
                      { value: 'es', label: 'Español' },
                      { value: 'fr', label: 'Français' },
                    ]}
                  />

                  <Select
                    label="Ace editor theme"
                    value={editorTheme}
                    onChange={e => setEditorTheme(e.target.value)}
                    options={[
                      { value: 'chrome', label: 'chrome' },
                      { value: 'tomorrow_night', label: 'tomorrow_night' },
                      { value: 'github', label: 'github' },
                      { value: 'monokai', label: 'monokai' },
                    ]}
                  />
                </div>
              </form>
            )}
          </div>

          {/* Change Password */}
          <div className="bg-white rounded-xl border border-[#ebebeb] p-4 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-bold text-[#333333]">
                Change Password
              </h2>
              <Button
                type="submit"
                form="password-form"
                size="md"
              >
                Update
              </Button>
            </div>
            <form id="password-form" onSubmit={handleUpdatePassword} className="space-y-4">
              <Input
                label="Your new password"
                type="password"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                required
                placeholder="••••••••••••"
              />

              <Input
                label="Confirm your new password"
                type="password"
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                required
                placeholder="••••••••••••"
              />

              <Input
                label="Your Current Password"
                type="password"
                value={currentPass}
                onChange={e => setCurrentPass(e.target.value)}
                required
                placeholder="••••••••••••"
              />
            </form>
          </div>
        </div>
      )}

      {/* ─── TAB CONTENT: SHARE MANAGEMENT ────────────────────────────────────── */}
      {activeTab === 'shares' && (
        <div className="space-y-6">

          {/* ── User Shares (shared with specific users) ── */}
          <div className="bg-white rounded-xl border border-[#ebebeb] p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-5">
              <Users className="w-4 h-4 text-primary-500" />
              <h2 className="text-[15px] font-bold text-[#333333]">Shared with Users</h2>
              <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium ml-1">
                {userShares.reduce((acc, i) => acc + i.users.length, 0)} access{userShares.reduce((acc, i) => acc + i.users.length, 0) !== 1 ? 'es' : ''}
              </span>
            </div>

            {userSharesLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />)}
              </div>
            ) : userShares.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <Users className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm font-medium text-gray-500">You haven't shared anything with specific users yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {userShares.map((item: any) => {
                  const isDir = !item.item_path.includes('.')
                  const name = item.item_path.split('/').filter(Boolean).pop() || item.item_path
                  return (
                    <div key={item.item_path} className="border border-[#f0f0f0] rounded-xl overflow-hidden">
                      {/* Item header */}
                      <div className="flex items-center gap-3 px-4 py-3 bg-[#f8f9fb] border-b border-[#f0f0f0]">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          {isDir
                            ? <FolderOpen className="w-4 h-4 text-blue-500" />
                            : <File className="w-4 h-4 text-gray-400" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{name}</p>
                          <p className="text-[11px] text-gray-400 truncate">{item.item_path}</p>
                        </div>
                        <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0">
                          {item.users.length} user{item.users.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Users rows */}
                      <div className="divide-y divide-[#f8f8f8]">
                        {item.users.map((u: any) => (
                          <div key={u.shared_with} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {/* Avatar */}
                              <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-600 flex-shrink-0">
                                {u.username[0].toUpperCase()}
                              </div>
                              <span className="text-sm font-medium text-gray-700 truncate">{u.username}</span>
                            </div>

                            <div className="flex items-center gap-3 justify-between sm:justify-end w-full sm:w-auto mt-2 sm:mt-0 pl-10 sm:pl-0">
                              {/* Permission dropdown */}
                              <div className="relative flex-1 sm:flex-initial">
                                <select
                                  value={u.can_write ? 'edit' : 'view'}
                                  onChange={e => updateUserSharePermission(item.item_path, u.shared_with, e.target.value === 'edit')}
                                  className={clsx(
                                    'w-full sm:w-auto appearance-none text-[11px] font-semibold pl-2 pr-6 py-1 rounded-lg border cursor-pointer focus:outline-none transition-colors',
                                    u.can_write
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  )}
                                >
                                  <option value="view">👁 View only</option>
                                  <option value="edit">✏️ Can edit</option>
                                </select>
                                <ChevronDown className={clsx('pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3', u.can_write ? 'text-green-500' : 'text-amber-500')} />
                              </div>

                              {/* Remove */}
                              <button
                                onClick={() => removeUserShare(item.item_path, u.shared_with)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors focus:outline-none flex-shrink-0"
                                title="Remove access"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Public Share Links ── */}
          <div className="bg-white rounded-xl border border-[#ebebeb] p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-5">
              <LinkIcon className="w-4 h-4 text-primary-500" />
              <h2 className="text-[15px] font-bold text-[#333333]">Public Share Links</h2>
              <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium ml-1">
                {shares.length} link{shares.length !== 1 ? 's' : ''}
              </span>
            </div>
            {sharesLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : shares.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <LinkIcon className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm font-medium text-gray-500">No public share links yet.</p>
              </div>
            ) : (
              <div className="w-full">
                {/* Desktop view */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#f0f0f0] text-[11px] font-bold text-[#929292] uppercase tracking-wider">
                        <th className="py-3 px-4 font-bold">Path</th>
                        <th className="py-3 px-4 font-bold">Hash</th>
                        <th className="py-3 px-4 font-bold">Expires</th>
                        <th className="py-3 px-4 text-right font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f0f0f0]">
                      {shares.map((share: any) => {
                        const expired = share.expire > 0 && share.expire < Math.floor(Date.now() / 1000)
                        return (
                          <tr key={share.hash} className={clsx('hover:bg-gray-50/50 transition-colors', expired && 'opacity-50')}>
                            <td className="py-4 px-4 font-medium text-gray-800 truncate max-w-xs">{share.path}</td>
                            <td className="py-4 px-4">
                              <code className="text-xs bg-gray-100 rounded-lg px-2 py-1 text-gray-600 font-mono">
                                {share.hash.substring(0, 12)}…
                              </code>
                            </td>
                            <td className="py-4 px-4 text-gray-500">
                              <div className="flex items-center gap-1.5 text-xs">
                                <Clock className="w-3.5 h-3.5 text-gray-300" />
                                {share.expire > 0
                                  ? formatDistanceToNow(fromUnixTime(share.expire), { addSuffix: true })
                                  : <span>Never</span>
                                }
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => copyShareLink(share.hash)}
                                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                                  title="Copy Link"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                                <a
                                  href={`/share/${share.hash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary-500 transition-colors focus:outline-none"
                                  title="Open Link"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                                <button
                                  onClick={() => deleteShare(share.hash)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors focus:outline-none"
                                  title="Delete Link"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile view */}
                <div className="sm:hidden space-y-4">
                  {shares.map((share: any) => {
                    const expired = share.expire > 0 && share.expire < Math.floor(Date.now() / 1000)
                    return (
                      <div key={share.hash} className={clsx('border border-[#f0f0f0] rounded-xl p-4 space-y-3', expired && 'opacity-50')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Path</p>
                            <p className="text-sm font-semibold text-gray-800 truncate">{share.path}</p>
                          </div>
                          <code className="text-xs bg-gray-100 rounded-lg px-2 py-1 text-gray-600 font-mono flex-shrink-0">
                            {share.hash.substring(0, 8)}…
                          </code>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-[#f8f8f8]">
                          <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Expires</p>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <Clock className="w-3.5 h-3.5 text-gray-300" />
                              {share.expire > 0
                                ? formatDistanceToNow(fromUnixTime(share.expire), { addSuffix: true })
                                : <span>Never</span>
                              }
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => copyShareLink(share.hash)}
                              className="p-2 rounded-lg bg-gray-50 text-gray-500 active:bg-gray-100"
                              title="Copy Link"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <a
                              href={`/share/${share.hash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 rounded-lg bg-gray-50 text-gray-500 active:bg-gray-100"
                              title="Open Link"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => deleteShare(share.hash)}
                              className="p-2 rounded-lg bg-red-50 text-red-500 active:bg-red-100"
                              title="Delete Link"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB CONTENT: GLOBAL SETTINGS ────────────────────────────────────── */}
      {activeTab === 'global' && currentUser?.perm?.admin && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Main Global Config Form */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-[#ebebeb] p-6">
              {globalLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-10 bg-gray-100 rounded-lg" />
                  <div className="h-10 bg-gray-100 rounded-lg" />
                  <div className="h-10 bg-gray-100 rounded-lg" />
                </div>
              ) : (
                <form onSubmit={handleUpdateGlobal} className="space-y-6">
                  {/* Global Settings */}
                  <div className="space-y-4">
                    <h2 className="text-[15px] font-bold text-[#333333]">
                      Global Settings
                    </h2>

                    <div className="space-y-3.5">
                      <Checkbox
                        label="Allow users to signup"
                        checked={globalSettings?.signup || false}
                        onChange={checked => updateGlobalSetting('signup', checked)}
                      />

                      <Checkbox
                        label="Auto create user home dir while adding new user"
                        checked={globalSettings?.createUserDir || false}
                        onChange={checked => updateGlobalSetting('createUserDir', checked)}
                      />
                    </div>

                    <div className="pt-2">
                      <Input
                        label="Base path for user home directories"
                        value={globalSettings?.userHomeBasePath || '/users'}
                        onChange={e => updateGlobalSetting('userHomeBasePath', e.target.value)}
                        placeholder="/users"
                      />
                    </div>
                  </div>

                  {/* Rules section */}
                  <div className="border-t border-[#f0f0f0] pt-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-[15px] font-bold text-[#333333]">Rules</h2>
                      <Button type="button" size="sm" className="px-4 py-1.5 text-xs">New</Button>
                    </div>
                    <p className="text-xs text-[#929292] leading-relaxed">
                      This is a global set of allow and disallow rules. They apply to every user. You can define specific rules on each user's settings to override these ones.
                    </p>
                  </div>

                  {/* Execute on shell section */}
                  <div className="border-t border-[#f0f0f0] pt-5 space-y-3">
                    <h2 className="text-[15px] font-bold text-[#333333]">Execute on shell</h2>
                    <p className="text-xs text-[#929292] leading-relaxed">
                      By default, File Browser executes the commands by calling their binaries directly. If you wish to run them on a shell instead (such as Bash or PowerShell), you can define it here with the required arguments and flags. If set, the command you execute will be appended as an argument. This applies to both user commands and event hooks.
                    </p>
                    <Input
                      value={globalSettings?.shell || ''}
                      onChange={e => updateGlobalSetting('shell', e.target.value)}
                      placeholder="/users"
                    />
                  </div>

                  {/* Branding section */}
                  <div className="border-t border-[#f0f0f0] pt-5 space-y-4">
                    <h2 className="text-[15px] font-bold text-[#333333]">Branding</h2>
                    <p className="text-xs text-[#929292] leading-relaxed">
                      You can customize how your File Browser instance looks and feels by changing its name, replacing the logo, adding custom styles and even disable external links to GitHub. For more information about custom branding, please check out the documentation.
                    </p>

                    <div className="space-y-3 pt-2">
                      <Checkbox
                        label="Disable external links (except documentation)"
                        checked={globalSettings?.branding?.disableExternalLinks || false}
                        onChange={checked => updateBrandingSetting('disableExternalLinks', checked)}
                      />

                      <Checkbox
                        label="Disable used disk percentage graph"
                        checked={globalSettings?.branding?.disableDiskGraph || false}
                        onChange={checked => updateBrandingSetting('disableDiskGraph', checked)}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <Select
                        label="Theme"
                        value={globalSettings?.branding?.theme || 'system'}
                        onChange={e => updateBrandingSetting('theme', e.target.value)}
                        options={[
                          { value: 'system', label: 'System default' },
                          { value: 'light', label: 'Light' },
                          { value: 'dark', label: 'Dark' }
                        ]}
                      />

                      <Input
                        label="Instance Name"
                        value={globalSettings?.branding?.name || ''}
                        onChange={e => updateBrandingSetting('name', e.target.value)}
                        placeholder="FileBrowser"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#f0f0f0] flex justify-end">
                    <Button
                      type="submit"
                      loading={savingGlobal}
                    >
                      UPDATE
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* User Default Settings column */}
          <div className="bg-white rounded-xl border border-[#ebebeb] p-6 h-fit space-y-6">
            <div>
              <h2 className="text-[15px] font-bold text-[#333333] mb-2">
                User default settings
              </h2>
              <p className="text-xs text-[#929292]">These are the default settings for new users.</p>
            </div>

            {globalLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-6 bg-gray-100 rounded-lg" />
                <div className="h-6 bg-gray-100 rounded-lg" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Scope"
                    variant="grey"
                    value={globalSettings?.branding?.defaultScope || '.'}
                    onChange={e => updateBrandingSetting('defaultScope', e.target.value)}
                    placeholder="Scope here"
                  />
                  <Select
                    label="Language"
                    variant="grey"
                    value={globalSettings?.branding?.defaultLanguage || 'en'}
                    onChange={e => updateBrandingSetting('defaultLanguage', e.target.value)}
                    options={[
                      { value: 'en', label: 'English' },
                      { value: 'es', label: 'Español' },
                      { value: 'zh-cn', label: '简体中文' }
                    ]}
                  />
                </div>

                {/* Permissions default */}
                <div className="space-y-3 pt-3 border-t border-[#f0f0f0]">
                  <div>
                    <h3 className="text-sm font-bold text-[#333333] mb-1">Permission</h3>
                    <p className="text-xs text-[#929292]">You can set user to be an administrator</p>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      { key: 'admin', label: 'Administrator' },
                      { key: 'create', label: 'Create files & directories' },
                      { key: 'delete', label: 'Delete files & directories' },
                      { key: 'download', label: 'Download' },
                      { key: 'modify', label: 'Edit files' },
                      { key: 'execute', label: 'Execute commands' },
                      { key: 'rename', label: 'Rename or move files and directories' },
                      { key: 'share', label: 'Share files' }
                    ].map(p => {
                      const permState = globalSettings?.branding?.defaultPerm || {
                        admin: false, execute: false, create: true,
                        rename: true, modify: true, delete: true, share: true, download: true,
                      }
                      const checked = !!permState[p.key as keyof typeof permState]
                      return (
                        <Checkbox
                          key={p.key}
                          label={p.label}
                          checked={checked}
                          onChange={val => updateDefaultPermSetting(p.key, val)}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Commands default */}
                <div className="space-y-3 pt-3 border-t border-[#f0f0f0]">
                  <div>
                    <h3 className="text-sm font-bold text-[#333333] mb-1">Commands</h3>
                    <p className="text-xs text-[#929292]">A space separated list with the available commands for this user. Example: git svn hg.</p>
                  </div>
                  <Input
                    variant="grey"
                    value={globalSettings?.branding?.defaultCommands || ''}
                    onChange={e => updateBrandingSetting('defaultCommands', e.target.value)}
                    placeholder="Text here"
                  />
                </div>

                <div className="pt-2 border-t border-[#f0f0f0] flex justify-end">
                  <Button
                    onClick={handleUpdateGlobal}
                    loading={savingGlobal}
                    size="sm"
                  >
                    UPDATE
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB CONTENT: USER MANAGEMENT ────────────────────────────────────── */}
      {activeTab === 'users' && currentUser?.perm?.admin && (
        <div className="bg-white rounded-xl border border-[#ebebeb] p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[15px] font-bold text-[#333333]">
              Users
            </h2>
            <Button
              onClick={() => { setModalUser(undefined); setShowUserModal(true) }}
              size="sm"
              icon={<Plus className="w-4 h-4" />}
            >
              New
            </Button>
          </div>

          {usersLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#f0f0f0] text-[11px] font-bold text-[#929292] uppercase tracking-wider">
                    <th className="py-3 px-4 font-bold">Username</th>
                    <th className="py-3 px-4 font-bold">Admin</th>
                    <th className="py-3 px-4 font-bold">Scope</th>
                    <th className="py-3 px-4 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f0]">
                  {users.map((u: any) => (
                    <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-4 font-semibold text-gray-800">{u.username}</td>
                      <td className="py-4 px-4">
                        {u.perm?.admin ? (
                          <span className="text-green-600 font-bold text-sm">✓</span>
                        ) : (
                          <span className="text-gray-300 font-bold text-sm">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <code className="text-xs bg-gray-100 rounded px-2 py-1 text-gray-600 font-mono">
                          {u.scope}
                        </code>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => { setModalUser(u); setShowUserModal(true) }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                            title="Edit User"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {currentUser.id !== u.id && (
                            <button
                              onClick={() => setDeleteUserId(u.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors focus:outline-none"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── MODALS ───────────────────────────────────────────────────────────── */}
      {showUserModal && (
        <UserModal
          user={modalUser}
          globalSettings={globalSettings}
          onClose={() => setShowUserModal(false)}
          onDone={() => { setShowUserModal(false); loadUsers() }}
        />
      )}

      {deleteUserId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-6 animate-slide-up border border-[#ebebeb]">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h2 className="font-bold text-gray-800 text-[15px] mb-1">Delete this user?</h2>
            <p className="text-xs text-gray-500 mb-6">This cannot be undone. All their shared links will also be deleted.</p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteUserId(null)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleDeleteUser(deleteUserId)}
                className="flex-1 bg-red-500 hover:bg-red-600 border-red-500 hover:border-red-600 focus:ring-red-100"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    }>
      <SettingsPageContent />
    </Suspense>
  )
}
