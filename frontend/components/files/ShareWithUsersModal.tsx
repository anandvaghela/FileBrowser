'use client'
import { useEffect, useState } from 'react'
import { X, Users, Search, Check, Trash2, ChevronDown } from 'lucide-react'
import { usersApi, userSharesApi } from '@/lib/api'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'

export default function ShareWithUsersModal({ file, onClose }: { file: any; onClose: () => void }) {
  const [users, setUsers] = useState<any[]>([])
  const [existingShares, setExistingShares] = useState<any[]>([])
  const [selected, setSelected] = useState<Map<number, boolean>>(new Map())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  )

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const n = new Map(prev)
      if (n.has(id)) n.delete(id)
      else n.set(id, false)
      return n
    })
  }

  const setPermission = (id: number, canWrite: boolean, e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation()
    setSelected(prev => {
      const n = new Map(prev)
      n.set(id, canWrite)
      return n
    })
  }

  const removeShare = async (sharedWith: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await userSharesApi.remove(file.path, sharedWith)
      setExistingShares(prev => prev.filter(s => s.shared_with !== sharedWith))
      setSelected(prev => { const n = new Map(prev); n.delete(sharedWith); return n })
      toast.success('Access removed')
    } catch { toast.error('Failed to remove') }
  }

  const save = async () => {
    if (selected.size === 0) { onClose(); return }
    setSaving(true)
    try {
      const entries = Array.from(selected.entries())
      const viewOnly = entries.filter(([, cw]) => !cw).map(([id]) => id)
      const canEdit = entries.filter(([, cw]) => cw).map(([id]) => id)
      const calls = []
      if (viewOnly.length) calls.push(userSharesApi.share(file.path, viewOnly, false))
      if (canEdit.length) calls.push(userSharesApi.share(file.path, canEdit, true))
      await Promise.all(calls)
      toast.success(`Shared with ${selected.size} user${selected.size > 1 ? 's' : ''}`)
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to share')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-md animate-slide-up border border-[#e8eaed]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8eaed]">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-500" />
            <h2 className="font-bold text-gray-800 text-[15px]">Share "{file.name}"</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary-400"
            />
          </div>

          {/* User list */}
          <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-2">
            {loading ? (
              <div className="py-6 text-center text-sm text-gray-400">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">No users found</div>
            ) : filtered.map(u => {
              const isSel = selected.has(u.id)
              const canWrite = selected.get(u.id) ?? false
              const isExisting = !!existingShares.find(s => s.shared_with === u.id)

              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer select-none"
                  onClick={() => toggleSelect(u.id)}
                >
                  {/* Left: checkbox + avatar + name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSel ? 'bg-primary-500 border-primary-500' : 'border-gray-300'}`}>
                      {isSel && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-600 flex-shrink-0">
                      {u.username[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-700 truncate">{u.username}</span>
                  </div>

                  {/* Right: permission dropdown + remove */}
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {isSel && (
                      <div className="relative" onClick={e => e.stopPropagation()}>
                        <select
                          value={canWrite ? 'edit' : 'view'}
                          onChange={e => setPermission(u.id, e.target.value === 'edit', e as any)}
                          className={`appearance-none text-[11px] font-semibold pl-2 pr-6 py-1 rounded-lg border cursor-pointer focus:outline-none transition-colors ${
                            canWrite
                              ? 'bg-green-50 text-green-700 border-green-200 focus:border-green-400'
                              : 'bg-amber-50 text-amber-700 border-amber-200 focus:border-amber-400'
                          }`}
                        >
                          <option value="view">👁 View only</option>
                          <option value="edit">✏️ Can edit</option>
                        </select>
                        <ChevronDown className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 ${canWrite ? 'text-green-500' : 'text-amber-500'}`} />
                      </div>
                    )}
                    {isExisting && (
                      <button
                        onClick={(e) => removeShare(u.id, e)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors focus:outline-none ml-0.5"
                        title="Remove access"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={save} loading={saving} disabled={selected.size === 0} className="flex-1">
              Share with {selected.size > 0 ? `${selected.size} user${selected.size > 1 ? 's' : ''}` : 'users'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
