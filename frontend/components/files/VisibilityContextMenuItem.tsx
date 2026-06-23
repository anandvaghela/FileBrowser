'use client'
import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { FileItem } from '@/types'

export default function VisibilityContextMenuItem({ item, onClose }: { item: FileItem; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [showToAdmin, setShowToAdmin] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkVisibility = async () => {
      try {
        const res = await api.get('/user-items', { params: { item_path: item.path } })
        setShowToAdmin(res.data.showToAdmin)
      } catch {
        setShowToAdmin(false)
      } finally {
        setChecking(false)
      }
    }
    checkVisibility()
  }, [item.path])

  const toggleVisibility = async () => {
    setLoading(true)
    try {
      const newValue = !showToAdmin
      await api.post('/user-items', { item_path: item.path, show_to_admin: newValue })
      setShowToAdmin(newValue)
      toast.success(newValue ? 'Now visible to admin' : 'Hidden from admin')
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update visibility')
    } finally {
      setLoading(false)
    }
  }

  if (checking) return null

  return (
    <button 
      onClick={toggleVisibility} 
      disabled={loading}
      className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold disabled:opacity-50 text-left focus:outline-none"
    >
      {showToAdmin ? (
        <>
          <EyeOff className="w-4 h-4 text-gray-500" />
          <span>Hide from admin</span>
        </>
      ) : (
        <>
          <Eye className="w-4 h-4 text-gray-500" />
          <span>Show to admin</span>
        </>
      )}
    </button>
  )
}
