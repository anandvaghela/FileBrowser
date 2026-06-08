'use client'
import { useState } from 'react'
import { Globe } from 'lucide-react'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

export default function GlobalFolderButton({ item, onSuccess }: { item: any; onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false)

  const makeGlobal = async () => {
    setLoading(true)
    try {
      await api.post('/global-folders', { folder_path: item.path })
      toast.success('Folder is now global')
      onSuccess?.()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to make folder global')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={makeGlobal}
      disabled={loading}
      className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors focus:outline-none disabled:opacity-50"
      title="Make global"
    >
      <Globe className="w-3.5 h-3.5" />
    </button>
  )
}
