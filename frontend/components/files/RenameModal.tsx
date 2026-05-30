'use client'
import { useState } from 'react'
import { X, Edit2, FolderPlus, AlertTriangle } from 'lucide-react'
import { resourcesApi } from '@/lib/api'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

// ── Rename ─────────────────────────────────────────────────────────────────────
export function RenameModal({ file, currentPath, onClose, onDone }: {
  file: any; currentPath: string; onClose: () => void; onDone: () => void
}) {
  const [name, setName] = useState(file.name)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || name === file.name) { onClose(); return }
    setLoading(true)
    try {
      const dir = file.path.substring(0, file.path.lastIndexOf('/') + 1)
      const dst = dir + name.trim() + (file.isDir ? '/' : '')
      await resourcesApi.rename(file.path, dst)
      toast.success('Renamed successfully')
      onDone()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Rename failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm animate-slide-up border border-[#e8eaed]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8eaed]">
          <div className="flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-primary-500" />
            <h2 className="font-bold text-gray-800 text-[15px]">Rename</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onFocus={e => e.target.select()}
            placeholder="Name"
          />
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" loading={loading} className="flex-1">
              Rename
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RenameModal

// ── New Folder ─────────────────────────────────────────────────────────────────
export function NewFolderModal({ currentPath, onClose, onDone }: {
  currentPath: string; onClose: () => void; onDone: () => void
}) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const dir = currentPath === '/' ? `/${name.trim()}/` : `${currentPath}/${name.trim()}/`
      await resourcesApi.createDir(dir)
      toast.success('Folder created')
      onDone()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create folder')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm animate-slide-up border border-[#e8eaed]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8eaed]">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-primary-500" />
            <h2 className="font-bold text-gray-800 text-[15px]">New Folder</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">
          <Input
            placeholder="Folder name"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" loading={loading} disabled={!name.trim()} className="flex-1">
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete Confirm ─────────────────────────────────────────────────────────────
export function DeleteConfirm({ items, onClose, onConfirm }: {
  items: any[]; onClose: () => void; onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-6 animate-slide-up border border-[#e8eaed]">
        <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="font-bold text-gray-800 text-[15px] mb-1">Delete {items.length > 1 ? `${items.length} items` : `"${items[0]?.name}"`}?</h2>
        <p className="text-xs text-gray-500 mb-6">
          This action cannot be undone. The {items.length > 1 ? 'items' : 'file'} will be permanently deleted.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 bg-red-500 hover:bg-red-600 border-red-500 hover:border-red-600 focus:ring-red-100"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
