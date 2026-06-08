'use client'
import { useEffect, useState } from 'react'
import { X, Users, Search, Check, Trash2 } from 'lucide-react'
import { usersApi, userSharesApi } from '@/lib/api'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'

export default function ShareWithUsersModal({ file, onClose }: { file: any; onClose: () => void }) {
  const [users, setUsers] = useState<any[]>([])
  const [existingShares, setExistingShares] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [canWrite, setCanWrite] = useState(false)
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
        setSelected(new Set(shares.map((s: any) => s.shared_with)))
      } catch { toast.error('Failed to load users') }
      finally { setLoading(false) }
    }
    load()
  }, [file.path])

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  )

  const toggleUser = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const removeShare = async (sharedWith: number) => {
    try {
      await userSharesApi.remove(file.path, sharedWith)
      setExistingShares(prev => prev.filter(s => s.shared_with !== sharedWith))
      setSelected(prev => { const n = new Set(prev); n.delete(sharedWith); return n })
      toast.success('Access removed')
    } catch { toast.error('Failed to remove') }
  }

  const save = async () => {
    const newIds = [...selected].filter(id => !existingShares.find(s => s.shared_with === id))
    if (newIds.length === 0) { onClose(); return }
    setSaving(true)
    try {
      await userSharesApi.share(file.path, newIds, canWrite)
      toast.success(`Shared with ${newIds.length} user${newIds.length > 1 ? 's' : ''}`)
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
            <h2 className="font-bold text-gray-800 text-[15px]">Share "{file.name}" with users</h2>
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
          <div className="max-h-52 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-2">
            {loading ? (
              <div className="py-6 text-center text-sm text-gray-400">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">No users found</div>
            ) : filtered.map(u => {
              const isShared = existingShares.find(s => s.shared_with === u.id)
              const isSel = selected.has(u.id)
              return (
                <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => !isShared && toggleUser(u.id)}>
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSel ? 'bg-primary-500 border-primary-500' : 'border-gray-300'}`}>
                      {isSel && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-600">
                      {u.username[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{u.username}</span>
                    {isShared && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">shared</span>}
                  </div>
                  {isShared && (
                    <button onClick={e => { e.stopPropagation(); removeShare(u.id) }} className="p-1 text-gray-400 hover:text-red-500 transition-colors focus:outline-none">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Can write toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={canWrite}
              onChange={e => setCanWrite(e.target.checked)}
              className="w-4 h-4 text-primary-500 rounded"
            />
            <span>Allow selected users to upload/edit files</span>
          </label>

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
