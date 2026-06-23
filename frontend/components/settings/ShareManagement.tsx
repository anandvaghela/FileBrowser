'use client'
import { useEffect, useState } from 'react'
import {
  Users, FolderOpen, File, ChevronDown, Trash2, Link as LinkIcon,
  Clock, Copy, ExternalLink
} from 'lucide-react'
import { sharesApi, userSharesApi, formatBytes } from '@/lib/api'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { formatDistanceToNow, fromUnixTime } from 'date-fns'

export default function ShareManagement() {
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

  useEffect(() => {
    loadShares()
  }, [])

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

  return (
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
                          className="p-2 rounded-lg bg-gray-55 text-gray-500 active:bg-gray-100"
                          title="Copy Link"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <a
                          href={`/share/${share.hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg bg-gray-55 text-gray-500 active:bg-gray-100"
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
  )
}
