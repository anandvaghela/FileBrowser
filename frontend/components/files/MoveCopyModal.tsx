'use client'
import { useEffect, useState } from 'react'
import { X, Folder, ChevronRight, ArrowLeft, ArrowRight, Copy } from 'lucide-react'
import { resourcesApi } from '@/lib/api'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'

interface MoveCopyModalProps {
  files: any[]
  action: 'copy' | 'move'
  currentPath: string
  onClose: () => void
  onDone: () => void
}

export function MoveCopyModal({
  files,
  action,
  currentPath,
  onClose,
  onDone
}: MoveCopyModalProps) {
  const [navigatedPath, setNavigatedPath] = useState(currentPath)
  const [folders, setFolders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Fetch folders in navigatedPath
  useEffect(() => {
    let active = true
    const fetchFolders = async () => {
      setLoading(true)
      try {
        const res = await resourcesApi.get(navigatedPath)
        if (!active) return
        const allItems = res.data.items || []
        // Only keep directories
        const dirs = allItems.filter((item: any) => item.isDir)
        setFolders(dirs)
      } catch (err: any) {
        if (active) {
          toast.error(err.response?.data?.error || 'Failed to load directories')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchFolders()
    return () => {
      active = false
    }
  }, [navigatedPath])

  // Get parent path helper
  const handleGoUp = () => {
    if (navigatedPath === '/' || navigatedPath === '') return
    const parts = navigatedPath.split('/').filter(Boolean)
    parts.pop()
    setNavigatedPath('/' + parts.join('/'))
  }

  // Check if target is invalid (e.g. moving a folder into itself)
  const isInvalidTarget = () => {
    return files.some(file => {
      if (!file.isDir) return false
      // Cannot move a folder into itself
      if (navigatedPath === file.path) return true
      // Cannot move a folder into its own subfolder
      if (navigatedPath.startsWith(file.path + '/')) return true
      return false
    })
  }

  const handleSubmit = async () => {
    if (isInvalidTarget()) {
      toast.error('Cannot move a directory into itself or its subdirectories')
      return
    }

    setActionLoading(true)
    try {
      for (const file of files) {
        // Construct target path
        const baseDir = navigatedPath === '/' ? '' : navigatedPath
        const dst = baseDir + '/' + file.name + (file.isDir ? '/' : '')
        
        if (action === 'move') {
          await resourcesApi.rename(file.path, dst)
        } else {
          await resourcesApi.copy(file.path, dst)
        }
      }
      toast.success(`${action === 'move' ? 'Moved' : 'Copied'} ${files.length} item${files.length > 1 ? 's' : ''} successfully`)
      onDone()
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Failed to ${action} items`)
    } finally {
      setActionLoading(false)
    }
  }

  // Split path for breadcrumb display
  const pathParts = navigatedPath.split('/').filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-md animate-slide-up border border-[#e8eaed] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8eaed]">
          <div className="flex items-center gap-2">
            {action === 'move' ? (
              <ArrowRight className="w-4 h-4 text-primary-500" />
            ) : (
              <Copy className="w-4 h-4 text-primary-500" />
            )}
            <h2 className="font-bold text-gray-800 text-[15px] capitalize">
              {action} {files.length > 1 ? `${files.length} Items` : `"${files[0]?.name}"`}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Path Breadcrumb */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5 text-xs text-gray-600 overflow-x-auto whitespace-nowrap">
          <button 
            onClick={() => setNavigatedPath('/')}
            className="hover:text-primary-600 font-semibold"
          >
            Home
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3 text-gray-400" />
              <button 
                onClick={() => setNavigatedPath('/' + pathParts.slice(0, i + 1).join('/'))}
                className="hover:text-primary-600 font-semibold"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {/* Directory browser list */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[250px] max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-1">
              {navigatedPath !== '/' && navigatedPath !== '' && (
                <button
                  onClick={handleGoUp}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors text-left font-semibold"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-400" />
                  <span>.. (Go back up)</span>
                </button>
              )}

              {folders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Folder className="w-12 h-12 opacity-20 mb-2" />
                  <p className="text-xs">No folders here</p>
                </div>
              ) : (
                folders.map((folder) => {
                  const isSelf = files.some(f => f.path === folder.path)
                  return (
                    <button
                      key={folder.path}
                      disabled={isSelf}
                      onClick={() => setNavigatedPath(folder.path)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                        isSelf 
                          ? 'opacity-40 cursor-not-allowed bg-gray-50' 
                          : 'text-gray-700 hover:bg-gray-50 hover:text-primary-600'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Folder className={`w-4 h-4 flex-shrink-0 ${isSelf ? 'text-gray-400' : 'text-blue-500'}`} />
                        <span className="truncate font-semibold">{folder.name}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-[#e8eaed] bg-gray-50/50 flex gap-3 rounded-b-xl">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={actionLoading}
            disabled={isInvalidTarget() || loading}
            className="flex-1 font-semibold"
          >
            {action === 'move' ? 'Move Here' : 'Copy Here'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default MoveCopyModal
