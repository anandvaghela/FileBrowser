'use client'
import { useEffect, useState } from 'react'
import { X, Users, Search, Check, Trash2, ChevronDown, Eye, Pencil } from 'lucide-react'
import { usersApi, userSharesApi } from '@/lib/api'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { clsx } from 'clsx'

const getAvatarStyles = (username: string) => {
  const hash = Array.from(username).reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const hues = [200, 220, 260, 280, 320, 340, 360, 40, 80, 120, 160]
  const hue = hues[hash % hues.length]
  return {
    backgroundColor: `hsl(${hue}, 85%, 95%)`,
    textColor: `hsl(${hue}, 85%, 35%)`,
  }
}

interface RoleDropdownProps {
  userId: number
  canWrite: boolean
  onChange: (canWrite: boolean) => void
  isOpen: boolean
  onToggle: () => void
}

function RoleDropdown({ userId, canWrite, onChange, isOpen, onToggle }: RoleDropdownProps) {
  return (
    <div className="relative inline-block text-left" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold shadow-sm focus:outline-none transition-all duration-200 select-none",
          canWrite
            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100/70"
            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100/70"
        )}
      >
        {canWrite ? (
          <Pencil className="w-3.5 h-3.5 text-green-600" />
        ) : (
          <Eye className="w-3.5 h-3.5 text-amber-600" />
        )}
        <span>{canWrite ? 'Can edit' : 'View only'}</span>
        <ChevronDown className={clsx("w-3 h-3 transition-transform duration-200", isOpen ? "transform rotate-180" : "", canWrite ? "text-green-500" : "text-amber-500")} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-36 origin-top-right bg-white border border-gray-150 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 overflow-hidden divide-y divide-gray-50 animate-fade-in">
          <div className="py-1">
            <button
              onClick={() => {
                onChange(false)
              }}
              className={clsx(
                "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-colors text-left",
                !canWrite
                  ? "bg-blue-600 text-white"
                  : "text-amber-700 hover:bg-amber-50"
              )}
            >
              <Eye className={clsx("w-3.5 h-3.5", !canWrite ? "text-white" : "text-amber-600")} />
              <span>View only</span>
            </button>
            <button
              onClick={() => {
                onChange(true)
              }}
              className={clsx(
                "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-colors text-left",
                canWrite
                  ? "bg-blue-600 text-white"
                  : "text-green-700 hover:bg-green-50"
              )}
            >
              <Pencil className={clsx("w-3.5 h-3.5", canWrite ? "text-white" : "text-green-600")} />
              <span>Can edit</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ShareWithUsersModal({ file, onClose }: { file: any; onClose: () => void }) {
  const [users, setUsers] = useState<any[]>([])
  const [existingShares, setExistingShares] = useState<any[]>([])
  const [selected, setSelected] = useState<Map<number, boolean>>(new Map())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openDropdownUserId, setOpenDropdownUserId] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [usersRes, sharesRes] = await Promise.all([
          usersApi.list(),
          userSharesApi.getForItem(file.path)
        ])
        setUsers(usersRes.data)
        const shares = sharesRes.data.shares || []
        setExistingShares(shares)
        const map = new Map<number, boolean>()
        shares.forEach((s: any) => map.set(s.shared_with, !!s.can_write))
        setSelected(map)
      } catch { toast.error('Failed to load users') }
      finally { setLoading(false) }
    }
    load()
  }, [file.path])

  useEffect(() => {
    const closeDropdown = () => setOpenDropdownUserId(null)
    window.addEventListener('click', closeDropdown)
    return () => window.removeEventListener('click', closeDropdown)
  }, [])

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  )

  const alreadyShared = filtered.filter(u => existingShares.some(s => s.shared_with === u.id))
  const notShared = filtered.filter(u => !existingShares.some(s => s.shared_with === u.id))

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const n = new Map(prev)
      if (n.has(id)) {
        n.delete(id)
      } else {
        n.set(id, false)
      }
      return n
    })
  }

  const setPermission = (id: number, canWrite: boolean) => {
    setSelected(prev => {
      const n = new Map(prev)
      n.set(id, canWrite)
      return n
    })
    setOpenDropdownUserId(null)
  }

  const removeShare = (sharedWith: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(prev => {
      const n = new Map(prev)
      n.delete(sharedWith)
      return n
    })
  }

  const handleRemoveUser = (userId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(prev => {
      const n = new Map(prev)
      n.delete(userId)
      return n
    })
  }


  const hasChanges = () => {
    if (selected.size !== existingShares.length) return true
    for (const s of existingShares) {
      if (!selected.has(s.shared_with)) return true
      if (selected.get(s.shared_with) !== !!s.can_write) return true
    }
    return false
  }

  const save = async () => {
    if (!hasChanges()) { onClose(); return }
    setSaving(true)
    try {
      const entries = Array.from(selected.entries())
      const viewOnly = entries.filter(([, cw]) => !cw).map(([id]) => id)
      const canEdit = entries.filter(([, cw]) => cw).map(([id]) => id)

      // Find removed shares (previously existing but not currently selected)
      const removedUserIds = existingShares
        .filter(s => !selected.has(s.shared_with))
        .map(s => s.shared_with)

      const calls = []
      if (viewOnly.length) calls.push(userSharesApi.share(file.path, viewOnly, false))
      if (canEdit.length) calls.push(userSharesApi.share(file.path, canEdit, true))
      removedUserIds.forEach(id => {
        calls.push(userSharesApi.remove(file.path, id))
      })

      await Promise.all(calls)
      toast.success('Access settings updated successfully')
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update share settings')
    } finally { setSaving(false) }
  }


  const renderUserRow = (u: any) => {
    const isSel = selected.has(u.id)
    const canWrite = selected.get(u.id) ?? false
    const isExisting = !!existingShares.find(s => s.shared_with === u.id)
    const avatarStyle = getAvatarStyles(u.username)

    return (
      <div
        key={u.id}
        className={clsx(
          "flex items-center justify-between px-4 py-3.5 cursor-pointer select-none transition-all duration-150",
          isSel ? "bg-[#deeeff]/20 hover:bg-[#deeeff]/35" : "hover:bg-gray-50/70"
        )}
        onClick={() => toggleSelect(u.id)}
      >
        {/* Left side */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={clsx(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200",
            isSel ? "bg-blue-600 border-blue-600 shadow-sm" : "border-gray-300"
          )}>
            {isSel && <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />}
          </div>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm"
            style={{ backgroundColor: avatarStyle.backgroundColor, color: avatarStyle.textColor }}
          >
            {u.username[0].toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-gray-800 truncate">{u.username}</span>
            {isExisting && (
              <span className="text-[10px] text-green-600 font-semibold flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" /> Active Access
              </span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2.5 flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
          {isSel && (
            <RoleDropdown
              userId={u.id}
              canWrite={canWrite}
              onChange={(cw) => setPermission(u.id, cw)}
              isOpen={openDropdownUserId === u.id}
              onToggle={() => setOpenDropdownUserId(openDropdownUserId === u.id ? null : u.id)}
            />
          )}
          {isExisting && (
            <button
              onClick={(e) => removeShare(u.id, e)}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all focus:outline-none ml-1"
              title="Remove access"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-2xl animate-slide-up border border-gray-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800 text-[16px] leading-tight">Manage Access</h2>
              <p className="text-xs text-gray-400 mt-0.5 max-w-[380px] truncate">"{file.name}"</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users to share with..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-gray-400"
            />
          </div>


          {/* User List divided by share status */}
          <div className="flex flex-col border border-gray-100 rounded-xl overflow-hidden min-h-[220px]">
            <div className="px-4 py-2.5 bg-gray-50/70 border-b border-gray-100 text-xs font-semibold text-gray-500">
              Users list ({filtered.length})
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {loading ? (
                <div className="py-12 text-center text-sm text-gray-400 flex flex-col items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading users...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">No users found</div>
              ) : (
                <div className="flex flex-col">
                  {/* Already Shared Section */}
                  {alreadyShared.length > 0 && (
                    <div className="flex flex-col">
                      <div className="px-4 py-2 bg-gray-50/40 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100/50">
                        Already Shared ({alreadyShared.length})
                      </div>
                      <div className="divide-y divide-gray-50">
                        {alreadyShared.map(u => renderUserRow(u))}
                      </div>
                    </div>
                  )}

                  {/* Not Shared Section */}
                  {notShared.length > 0 && (
                    <div className="flex flex-col">
                      <div className={clsx(
                        "px-4 py-2 bg-gray-50/40 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100/50",
                        alreadyShared.length > 0 && "border-t border-gray-100"
                      )}>
                        Not Shared ({notShared.length})
                      </div>
                      <div className="divide-y divide-gray-50">
                        {notShared.map(u => renderUserRow(u))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-5 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex-shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!hasChanges()} className="flex-1">
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}
