'use client'
import { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

export default function VisibilityToggle({ item, user, onSuccess }: { item: any; user?: any; onSuccess?: () => void }) {
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
      onSuccess?.()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update visibility')
    } finally {
      setLoading(false)
    }
  }

  if (checking || user?.perm?.admin) return null

  return (
    <button
      onClick={toggleVisibility}
      disabled={loading}
      className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none disabled:opacity-50"
      title={showToAdmin ? 'Hide from admin' : 'Show to admin'}
    >
      {showToAdmin ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
    </button>
  )
}
