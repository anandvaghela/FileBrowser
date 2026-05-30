'use client'
import { useEffect, useState } from 'react'
import { X, Share2, Copy, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { sharesApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

export default function ShareModal({ file, onClose }: { file: any; onClose: () => void }) {
  const [shares, setShares] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [expires, setExpires] = useState('')
  const [unit, setUnit] = useState('hours')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await sharesApi.getForPath(file.path)
      setShares(res.data)
    } catch { setShares([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [file.path])

  const create = async () => {
    setCreating(true)
    try {
      await sharesApi.create(file.path, {
        expires: expires || undefined,
        unit: expires ? unit : undefined,
        password: password || undefined,
      })
      toast.success('Share link created')
      setExpires(''); setPassword('')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create share')
    } finally { setCreating(false) }
  }

  const del = async (hash: string) => {
    try {
      await sharesApi.delete(hash)
      toast.success('Share deleted')
      load()
    } catch { toast.error('Failed to delete share') }
  }

  const copyLink = (hash: string) => {
    const url = `${window.location.origin}/share/${hash}`
    navigator.clipboard.writeText(url).then(() => toast.success('Copied!')).catch(() => toast.error('Copy failed'))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-md animate-slide-up border border-[#e8eaed]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8eaed]">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary-500" />
            <h2 className="font-bold text-gray-800 text-[15px]">Share "{file.name}"</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Create new */}
          <div className="bg-gray-50 rounded-xl p-4 border border-[#e8eaed] space-y-4">
            <p className="text-xs font-bold text-gray-700">Create new share link</p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  type="number"
                  label="Expires in"
                  placeholder="Expires in…"
                  value={expires}
                  onChange={e => setExpires(e.target.value)}
                  min="1"
                />
              </div>
              <div className="w-32">
                <Select
                  label="Unit"
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  options={[
                    { value: 'minutes', label: 'Minutes' },
                    { value: 'hours', label: 'Hours' },
                    { value: 'days', label: 'Days' }
                  ]}
                />
              </div>
            </div>
            <div className="relative">
              <Input
                type={showPass ? 'text' : 'password'}
                label="Password (optional)"
                placeholder="Password (optional)"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 bottom-3 text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              onClick={create}
              loading={creating}
              className="w-full"
            >
              Create Link
            </Button>
          </div>

          {/* Existing links */}
          <div>
            <p className="text-xs font-bold text-gray-700 mb-3">Active links</p>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-14 bg-gray-50 rounded-lg animate-pulse border border-[#e8eaed]" />)}
              </div>
            ) : shares.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6 border border-dashed border-[#e8eaed] rounded-lg bg-gray-50/50">No active share links</p>
            ) : (
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {shares.map((s: any) => (
                  <div key={s.hash} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-[#e8eaed] hover:border-gray-300 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-600 truncate font-semibold">/share/{s.hash}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {s.expire > 0
                          ? `Expires ${formatDistanceToNow(new Date(s.expire * 1000), { addSuffix: true })}`
                          : 'Never expires'
                        }
                        {s.hasPassword && ' · Password protected'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyLink(s.hash)}
                        className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                        title="Copy Link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={`/share/${s.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-primary-500 transition-colors focus:outline-none"
                        title="Open Link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => del(s.hash)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors focus:outline-none"
                        title="Delete Link"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
