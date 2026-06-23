'use client'
import { useEffect, useState } from 'react'
import {
  Plus, Edit2, Trash2, X, Eye, EyeOff, FolderOpen, File
} from 'lucide-react'
import { usersApi, settingsApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
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

interface UserManagementProps {
  currentUser: any
}

export default function UserManagement({ currentUser }: UserManagementProps) {
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [modalUser, setModalUser] = useState<any | undefined>(undefined)
  const [showUserModal, setShowUserModal] = useState(false)
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null)
  const [globalSettings, setGlobalSettings] = useState<any>(null)

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

  const loadGlobalSettings = async () => {
    try {
      const res = await settingsApi.get()
      setGlobalSettings(res.data)
    } catch {}
  }

  useEffect(() => {
    loadUsers()
    loadGlobalSettings()
  }, [])

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

  return (
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
            <div key={i} className="h-16 bg-gray-55 rounded-lg animate-pulse" />
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
