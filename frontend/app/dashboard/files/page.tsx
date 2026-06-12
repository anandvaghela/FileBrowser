'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FolderOpen, File, Upload, FolderPlus, Search, Grid3X3,
  List, Download, Trash2, Edit2, Copy, Share2, ChevronRight,
  Home, MoreVertical, ArrowUpDown, Image, Film, Music,
  FileText, Archive, X, Check, RefreshCw, Info, Save, Menu,
  ArrowRight, Folder, Globe, Users
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { resourcesApi, sharesApi, rawUrl, previewUrl, formatBytes, getUser, api, sharedResourcesApi } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import ShareModal from '@/components/files/ShareModal'
import RenameModal from '@/components/files/RenameModal'
import NewFolderModal from '@/components/files/NewFolderModal'
import DeleteConfirm from '@/components/files/DeleteConfirm'
import FilePreviewModal from '@/components/files/FilePreviewModal'
import GlobalFolderButton from '@/components/files/GlobalFolderButton'
import VisibilityToggle from '@/components/files/VisibilityToggle'
import MoveCopyModal from '@/components/files/MoveCopyModal'
import ShareWithUsersModal from '@/components/files/ShareWithUsersModal'

function FileIcon({ file, size = 'md', selected = false }: { file: any; size?: 'sm' | 'md' | 'lg'; selected?: boolean }) {
  const s = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  if (file.isDir) return <FolderOpen className={clsx(s, selected ? 'text-white fill-white/20' : 'text-blue-500 fill-blue-100')} />
  const t = file.type || ''
  const colorClass = selected 
    ? 'text-white' 
    : t === 'image' 
    ? 'text-pink-500' 
    : t === 'video' 
    ? 'text-purple-500' 
    : t === 'audio' 
    ? 'text-green-500' 
    : t === 'text' || t === 'pdf' 
    ? 'text-orange-500' 
    : 'text-gray-400'
  
  if (t === 'image') return <Image className={clsx(s, colorClass)} />
  if (t === 'video') return <Film className={clsx(s, colorClass)} />
  if (t === 'audio') return <Music className={clsx(s, colorClass)} />
  if (t === 'text' || t === 'pdf') return <FileText className={clsx(s, colorClass)} />
  return <File className={clsx(s, colorClass)} />
}

function BgIcon({ file }: { file: any }) {
  if (file.isDir) return 'bg-blue-50'
  const t = file.type || ''
  if (t === 'image') return 'bg-pink-50'
  if (t === 'video') return 'bg-purple-50'
  if (t === 'audio') return 'bg-green-50'
  if (t === 'text' || t === 'pdf') return 'bg-orange-50'
  return 'bg-gray-50'
}

export default function FilesPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [currentPath, setCurrentPath] = useState(searchParams.get('path') || '/')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [uploading, setUploading] = useState<Record<string, number>>({})
  const [user, setUser] = useState<any>(null)
  const [isSharedContext, setIsSharedContext] = useState(false)
  const [sharedCanWrite, setSharedCanWrite] = useState(false)
  const [sharedItems, setSharedItems] = useState<any[]>([])

  // Modals
  const [shareTarget, setShareTarget] = useState<any>(null)
  const [shareWithUsersTarget, setShareWithUsersTarget] = useState<any>(null)
  const [renameTarget, setRenameTarget] = useState<any>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [deleteTargets, setDeleteTargets] = useState<any[]>([])
  const [previewTarget, setPreviewTarget] = useState<any>(null)

  // Move / Copy state
  const [moveCopyTargets, setMoveCopyTargets] = useState<any[] | null>(null)
  const [moveCopyAction, setMoveCopyAction] = useState<'copy' | 'move' | null>(null)

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: any } | null>(null)

  const sharedItemsRef = useRef<any[]>([])
  const searchTimeout = useRef<any>(null)

  useEffect(() => { sharedItemsRef.current = sharedItems }, [sharedItems])

  // Global click listener to close context menu
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null)
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, item: any) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!selected.has(item.path)) {
      setSelected(new Set([item.path]))
    }
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    })
  }

  useEffect(() => { setUser(getUser()) }, [])

  const loadDir = useCallback(async (path: string) => {
    setLoading(true)
    setSelected(new Set())
    try {
      // Fetch shared-with-me if not loaded yet or at root path
      let currentShared = sharedItemsRef.current
      if (currentShared.length === 0 || path === '/') {
        try {
          const sharedRes = !user?.perm?.admin
            ? await api.get('/user-shares/shared-with-me')
            : { data: { items: [] } }
          
          const newShared = (sharedRes.data.items || []).map((s: any) => ({
            ...s,
            isSharedWithMe: true
          }))
          currentShared = newShared
          sharedItemsRef.current = newShared
          setSharedItems(newShared)
        } catch (e) {
          console.error("Failed to load shares", e)
        }
      }

      // Check if we're inside a shared path
      const sharedRoot = currentShared.find((s: any) =>
        path === s.path || path.startsWith(s.path.replace(/\/$/, '') + '/')
      )
      const inShared = !!sharedRoot
      setIsSharedContext(inShared)
      setSharedCanWrite(inShared ? !!sharedRoot.canWrite : false)

      const res = inShared
        ? await sharedResourcesApi.get(path)
        : await resourcesApi.get(path)
      let allItems = res.data.items || []

      if (path === '/' && user) {
        try {
          const globalRes = await api.get('/global-folders')
          const globalFolders = globalRes.data.folders || []
          const globalPaths = new Set(globalFolders.map((f: any) => f.folder_path.replace(/\/$/, '')))

          allItems = allItems.map((item: any) => ({
            ...item,
            isGlobal: globalPaths.has(item.path.replace(/\/$/, ''))
          }))

          const existingPaths = new Set(allItems.map((i: any) => i.path.replace(/\/$/, '')))

          const extraGlobal = globalFolders
            .filter((f: any) => !existingPaths.has(f.folder_path.replace(/\/$/, '')))
            .map((f: any) => ({
              path: f.folder_path,
              name: f.folder_path.split('/').filter(Boolean).pop() || 'Global',
              isDir: true, size: 0,
              modified: new Date(f.created_at * 1000).toISOString(),
              type: 'directory', isGlobal: true
            }))

          allItems = [...allItems, ...extraGlobal]
        } catch { }
      }

      setItems(allItems)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load directory')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    const p = searchParams.get('path') || '/'
    setCurrentPath(p)
    loadDir(p)
  }, [searchParams, loadDir])

  const navigate = (path: string) => {
    router.push(`/dashboard/files?path=${encodeURIComponent(path)}`)
  }

  // Handle sidebar events
  useEffect(() => {
    const handleNewFolder = () => setShowNewFolder(true)
    const handleUpload = () => open()

    window.addEventListener('sidebar-new-folder', handleNewFolder)
    window.addEventListener('sidebar-upload', handleUpload)

    return () => {
      window.removeEventListener('sidebar-new-folder', handleNewFolder)
      window.removeEventListener('sidebar-upload', handleUpload)
    }
  }, [])

  // Listen to global search changes and synchronize on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = (window as any).__searchQuery
      if (q !== undefined && q !== null) {
        setSearchQuery(q)
      }

      const handleGlobalSearch = (e: Event) => {
        const detail = (e as CustomEvent).detail
        setSearchQuery(detail ?? '')
      }
      window.addEventListener('global-search', handleGlobalSearch)
      return () => {
        window.removeEventListener('global-search', handleGlobalSearch)
      }
    }
  }, [])

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/search${currentPath}?query=${encodeURIComponent(searchQuery)}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('fb_token')}` } }
        )
        const text = await res.text()
        const results = text.trim().split('\n').filter(Boolean).map(l => {
          try {
            const raw = JSON.parse(l)
            if (!raw) return null
            const name = raw.path.split('/').pop() || '/'
            return {
              path: raw.path,
              name,
              isDir: !!raw.dir,
              size: raw.size || 0,
              modified: raw.modified || new Date().toISOString(),
              type: raw.dir ? 'directory' : 'blob',
            }
          } catch { return null }
        }).filter(Boolean)
        setSearchResults(results)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }, [searchQuery, currentPath])

  // Sort
  const sortedItems = [...items].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    let cmp = 0
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortBy === 'size') cmp = a.size - b.size
    else if (sortBy === 'modified') cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime()
    return sortAsc ? cmp : -cmp
  })

  const displayItems = searchQuery ? searchResults : sortedItems

  // Dropzone upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!user?.perm?.create && !sharedCanWrite) { toast.error('No upload permission'); return }
    for (const file of acceptedFiles) {
      const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
      setUploading(u => ({ ...u, [file.name]: 0 }))
      try {
        if (isSharedContext) {
          await sharedResourcesApi.uploadFile(filePath, file, (p) => {
            setUploading(u => ({ ...u, [file.name]: p }))
          })
        } else {
          await resourcesApi.uploadFile(filePath, file, (p) => {
            setUploading(u => ({ ...u, [file.name]: p }))
          })
        }
        toast.success(`Uploaded ${file.name}`)
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err.response?.data?.error || err.message}`)
      } finally {
        setUploading(u => { const n = { ...u }; delete n[file.name]; return n })
      }
    }
    loadDir(currentPath)
  }, [currentPath, user, loadDir, isSharedContext, sharedCanWrite])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop, noClick: true, noKeyboard: true,
  })

  // Handle URL actions from sidebar redirect
  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'new-folder') {
      setShowNewFolder(true)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('action')
      router.replace(`/dashboard/files?${params.toString()}`)
    } else if (action === 'upload') {
      open()
      const params = new URLSearchParams(searchParams.toString())
      params.delete('action')
      router.replace(`/dashboard/files?${params.toString()}`)
    }
  }, [searchParams, open, router])

  // Breadcrumb
  const breadcrumb = currentPath === '/'
    ? [{ label: 'Home', path: '/' }]
    : [
      { label: 'Home', path: '/' },
      ...currentPath.split('/').filter(Boolean).map((seg, i, arr) => ({
        label: seg,
        path: '/' + arr.slice(0, i + 1).join('/'),
      }))
    ]

  // Selection
  const toggleSelect = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(prev => {
      const n = new Set(prev)
      n.has(path) ? n.delete(path) : n.add(path)
      return n
    })
  }
  const selectAll = () => setSelected(new Set(displayItems.map((i: any) => i.path)))
  const clearSelection = () => setSelected(new Set())

  const handleItemClick = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const n = new Set(prev)
        n.has(path) ? n.delete(path) : n.add(path)
        return n
      })
    } else {
      setSelected(new Set([path]))
    }
  }

  const handleDelete = async (targets: any[]) => {
    for (const t of targets) {
      try {
        if (isSharedContext) {
          await sharedResourcesApi.delete(t.path)
        } else {
          await resourcesApi.delete(t.path)
        }
      } catch (err: any) {
        toast.error(`Failed to delete ${t.name}: ${err.response?.data?.error}`)
      }
    }
    toast.success(`Deleted ${targets.length} item${targets.length > 1 ? 's' : ''}`)
    setDeleteTargets([])
    clearSelection()
    loadDir(currentPath)
  }

  const handleDownload = (item: any) => {
    const url = rawUrl(item.path, true)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    a.click()
  }

  const handleRemoveGlobal = async (item: any) => {
    try {
      await api.delete('/global-folders', { data: { folder_path: item.path } })
      toast.success('Removed from global folders')
      loadDir(currentPath)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove global folder')
    }
  }

  const selectedItems = displayItems.filter((i: any) => selected.has(i.path))
  const folders = displayItems.filter((i: any) => i.isDir)
  const files = displayItems.filter((i: any) => !i.isDir)

  const renderGridCard = (item: any) => {
    const isSel = selected.has(item.path)
    return (
      <div
        key={item.path}
        className={clsx(
          'rounded-xl border p-4 transition-all cursor-pointer group relative flex items-center gap-4 select-none',
          isSel 
            ? 'bg-primary-500 border-primary-500 text-white shadow-soft ring-2 ring-primary-500/20' 
            : 'bg-white border-[#e8eaed] text-gray-800 hover:shadow-soft hover:border-gray-300'
        )}
        onClick={(e) => {
          if (user?.singleClick) {
            e.stopPropagation()
            item.isDir ? navigate(item.path) : setPreviewTarget(item)
          } else {
            handleItemClick(item.path, e)
          }
        }}
        onDoubleClick={(e) => {
          if (!user?.singleClick) {
            e.stopPropagation()
            item.isDir ? navigate(item.path) : setPreviewTarget(item)
          }
        }}
        onContextMenu={e => handleContextMenu(e, item)}
      >
        {/* Checkbox selector */}
        <div 
          onClick={e => toggleSelect(item.path, e)}
          className={clsx(
            'absolute top-2.5 right-2.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all bg-white z-10',
            isSel
              ? 'bg-white border-white text-primary-500 opacity-100'
              : 'border-gray-300 opacity-0 group-hover:opacity-100 hover:border-gray-400'
          )}
        >
          {isSel && <Check className="w-3 h-3 text-primary-500 stroke-[3]" />}
        </div>

        {/* Global folder action button for admin */}
        {user?.perm?.admin && item.isDir && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try {
                if (item.isGlobal) {
                  await handleRemoveGlobal(item);
                } else {
                  await api.post('/global-folders', { folder_path: item.path });
                  toast.success('Folder is now global');
                  loadDir(currentPath);
                }
              } catch (err: any) {
                toast.error(err.response?.data?.error || 'Failed');
              }
            }}
            className={clsx(
              'absolute top-2.5 right-9 w-5 h-5 rounded-md flex items-center justify-center transition-all bg-white border border-gray-200 z-10 hover:bg-gray-50',
              item.isGlobal 
                ? 'opacity-100 text-orange-500' 
                : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600'
            )}
            title={item.isGlobal ? "Remove global" : "Make global"}
          >
            <Globe className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Left Icon */}
        <div className={clsx(
          'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
          isSel 
            ? 'bg-white/10' 
            : item.isDir ? 'bg-blue-50' : BgIcon({ file: item })
        )}>
          {item.isDir ? (
            <FolderOpen className={clsx('w-6 h-6', isSel ? 'text-white fill-white/20' : 'text-blue-500 fill-blue-100')} />
          ) : (
            <FileIcon file={item} size="lg" selected={isSel} />
          )}
        </div>

        {/* Right Content */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={clsx(
              'text-xs font-semibold truncate mb-0.5',
              isSel ? 'text-white' : 'text-gray-800'
            )}>
              {item.name}
            </p>
            {item.isGlobal && (
              <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 mb-0.5', isSel ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700')}>Global</span>
            )}
            {item.isSharedWithMe && (
              <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 mb-0.5', isSel ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700')}>Shared</span>
            )}
          </div>
          
          {item.isDir ? (
            <>
              <span className={clsx('text-[10px] font-semibold my-0.5', isSel ? 'text-white/60' : 'text-gray-300')}>—</span>
              <p className={clsx('text-[10px]', isSel ? 'text-white/80' : 'text-gray-400')}>
                {item.modified && !isNaN(new Date(item.modified).getTime())
                  ? formatDistanceToNow(new Date(item.modified), { addSuffix: true })
                  : '—'
                }
              </p>
            </>
          ) : (
            <>
              <p className={clsx('text-[10px] font-medium', isSel ? 'text-white/80' : 'text-gray-400')}>
                {formatBytes(item.size)}
              </p>
              <p className={clsx('text-[10px]', isSel ? 'text-white/80' : 'text-gray-400')}>
                {item.modified && !isNaN(new Date(item.modified).getTime())
                  ? formatDistanceToNow(new Date(item.modified), { addSuffix: true })
                  : '—'
                }
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  const renderListRow = (item: any) => {
    const isSel = selected.has(item.path)
    return (
      <div
        key={item.path}
        className={clsx(
          'grid grid-cols-12 gap-3 px-6 py-3.5 items-center border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer group select-none',
          isSel && 'bg-primary-50/20'
        )}
        onClick={(e) => {
          if (user?.singleClick) {
            e.stopPropagation()
            item.isDir ? navigate(item.path) : setPreviewTarget(item)
          } else {
            handleItemClick(item.path, e)
          }
        }}
        onDoubleClick={(e) => {
          if (!user?.singleClick) {
            e.stopPropagation()
            item.isDir ? navigate(item.path) : setPreviewTarget(item)
          }
        }}
        onContextMenu={e => handleContextMenu(e, item)}
      >
        <div className="col-span-2 md:col-span-1" onClick={e => toggleSelect(item.path, e)}>
          <div className={clsx(
            'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all bg-white',
            isSel
              ? 'bg-primary-500 border-primary-500'
              : 'border-gray-300 group-hover:border-gray-400'
          )}>
            {isSel && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
        <div className="col-span-6 md:col-span-5 flex items-center gap-3 min-w-0">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', isSel ? 'bg-primary-100' : BgIcon({ file: item }))}>
            <FileIcon file={item} selected={isSel} />
          </div>
          <span className={clsx("text-sm font-semibold truncate", isSel ? "text-primary-700" : "text-gray-800")}>{item.name}</span>
          {item.isGlobal && (
            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium flex-shrink-0">Global</span>
          )}
          {item.isSharedWithMe && (
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium flex-shrink-0">Shared by {item.sharedBy}</span>
          )}
        </div>
        <div className="col-span-3 md:col-span-2 text-sm text-gray-400">
          {item.isDir ? '—' : formatBytes(item.size)}
        </div>
        <div className="col-span-3 text-sm text-gray-400 hidden md:block">
          {item.modified && !isNaN(new Date(item.modified).getTime())
            ? formatDistanceToNow(new Date(item.modified), { addSuffix: true })
            : '—'
          }
        </div>
        <div className="col-span-1 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {user?.perm?.admin && item.isDir && !item.isGlobal && (
              <GlobalFolderButton item={item} onSuccess={() => loadDir(currentPath)} />
            )}
            {!user?.perm?.admin && (
              <VisibilityToggle item={item} user={user} />
            )}
            {user?.perm?.download && (
              <button onClick={() => handleDownload(item)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
            {user?.perm?.share && (
              <button onClick={() => setShareTarget(item)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
                <Share2 className="w-3.5 h-3.5" />
              </button>
            )}
            {user?.perm?.rename && (
              <button onClick={() => setRenameTarget(item)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            {user?.perm?.delete && !item.isGlobal && (
              <button onClick={() => setDeleteTargets([item])} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors focus:outline-none">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#f8f9fb]" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-primary-500/10 border-2 border-dashed border-primary-500 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-soft px-8 py-6 flex flex-col items-center gap-3">
            <Upload className="w-8 h-8 text-primary-500" />
            <p className="font-semibold text-gray-900">Drop to upload</p>
          </div>
        </div>
      )}


      {/* Path Breadcrumbs Sub-Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Home className="w-4 h-4 text-gray-400" />
          <span className="text-gray-300">/</span>
          {breadcrumb.map((b, i) => (
            <span key={b.path} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300">/</span>}
              <button
                onClick={() => navigate(b.path)}
                className={clsx(
                  'hover:text-blue-600 transition-colors',
                  i === breadcrumb.length - 1 ? 'font-semibold text-gray-800' : ''
                )}
              >
                {b.label}
              </button>
            </span>
          ))}
        </div>

        {/* Sort and Actions */}
        <div className="flex items-center gap-3">
          {/* Selected items actions (moved from top header) */}
          {selected.size > 0 && (
            <div className="flex items-center gap-1 bg-blue-50/50 px-2 py-0.5 rounded-lg border border-blue-100/50 animate-fade-in">
              {selected.size === 1 && user?.perm?.share && (
                <button
                  onClick={() => setShareTarget(selectedItems[0])}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-primary-600 transition-all hover:shadow-sm"
                  title="Share"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              )}
              {selected.size === 1 && selectedItems[0].isDir && user?.perm?.admin && (
                <button
                  onClick={async () => {
                    const item = selectedItems[0];
                    try {
                      if (item.isGlobal) {
                        await handleRemoveGlobal(item);
                      } else {
                        await api.post('/global-folders', { folder_path: item.path });
                        toast.success('Folder is now global');
                        loadDir(currentPath);
                      }
                      clearSelection();
                    } catch (err: any) {
                      toast.error(err.response?.data?.error || 'Failed');
                    }
                  }}
                  className={clsx(
                    "p-1.5 rounded-lg transition-all hover:bg-white hover:shadow-sm",
                    selectedItems[0].isGlobal ? "text-orange-500 hover:text-orange-600" : "text-gray-500 hover:text-blue-600"
                  )}
                  title={selectedItems[0].isGlobal ? "Remove global" : "Make global"}
                >
                  <Globe className="w-4 h-4" />
                </button>
              )}
              {selected.size === 1 && user?.perm?.rename && (
                <button
                  onClick={() => setRenameTarget(selectedItems[0])}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-primary-600 transition-all hover:shadow-sm"
                  title="Rename"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              {user?.perm?.create && (
                <button
                  onClick={() => {
                    setMoveCopyTargets(selectedItems)
                    setMoveCopyAction('copy')
                  }}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-primary-600 transition-all hover:shadow-sm"
                  title="Copy selected"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
              {user?.perm?.rename && (
                <button
                  onClick={() => {
                    setMoveCopyTargets(selectedItems)
                    setMoveCopyAction('move')
                  }}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-primary-600 transition-all hover:shadow-sm"
                  title="Move selected"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              {user?.perm?.delete && (
                <button
                  onClick={() => setDeleteTargets(selectedItems)}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-white hover:text-red-600 transition-all hover:shadow-sm"
                  title="Delete selected"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Default actions (moved from top header) */}
          <div className="flex items-center gap-0.5 bg-gray-50 px-1.5 py-0.5 rounded-lg border border-gray-100/50">
            {/* Grid/List Toggle */}
            <button
              onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              className="p-1 rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 hover:shadow-sm transition-all focus:outline-none"
              title="Toggle view"
            >
              {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
            </button>

            {/* Download Selected */}
            <button
              onClick={() => {
                if (selected.size > 0) {
                  selectedItems.forEach(item => handleDownload(item))
                } else {
                  toast.error('Select files to download')
                }
              }}
              disabled={selected.size === 0}
              className={clsx(
                'p-1 rounded-lg transition-all focus:outline-none',
                selected.size > 0 
                  ? 'text-gray-600 hover:bg-white hover:shadow-sm' 
                  : 'text-gray-300 cursor-not-allowed'
              )}
              title="Download selected"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Upload File */}
            {user?.perm?.create && (
              <button
                onClick={open}
                className="p-1 rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 hover:shadow-sm transition-all focus:outline-none"
                title="Upload file"
              >
                <Upload className="w-4 h-4" />
              </button>
            )}

            {/* Info Button */}
            <button
              onClick={() => {
                const foldersCount = items.filter(i => i.isDir).length
                const filesCount = items.filter(i => !i.isDir).length
                toast.success(`Path: ${currentPath}\nFolders: ${foldersCount}\nFiles: ${filesCount}`, { duration: 4000 })
              }}
              className="p-1 rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 hover:shadow-sm transition-all focus:outline-none"
              title="Folder Info"
            >
              <Info className="w-4 h-4" />
            </button>

            {/* Toggle Select All */}
            <button
              onClick={() => {
                if (selected.size > 0) clearSelection()
                else selectAll()
              }}
              className={clsx(
                'p-1 rounded-lg transition-all focus:outline-none',
                selected.size > 0 
                  ? 'text-blue-600 hover:bg-white hover:shadow-sm' 
                  : 'text-gray-400 hover:bg-white hover:text-gray-600 hover:shadow-sm'
              )}
              title="Toggle select all"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>

          {/* Sort Button */}
          <button
            onClick={() => setSortAsc(a => !a)}
            className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1.5 text-xs font-semibold focus:outline-none"
            title="Toggle sort direction"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Sort</span>
          </button>
        </div>
      </div>

      {/* Upload progress */}
      {Object.keys(uploading).length > 0 && (
        <div className="bg-white border-b border-[#e8eaed] px-6 py-2 space-y-1">
          {Object.entries(uploading).map(([name, pct]) => (
            <div key={name} className="flex items-center gap-2 text-xs text-gray-500">
              <span className="truncate flex-1">{name}</span>
              <div className="w-24 bg-gray-100 rounded-full h-1.5">
                <div className="bg-primary-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-8 text-right">{pct}%</span>
            </div>
          ))}
        </div>
      )}

      {/* File list / grid */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className={clsx('gap-3', viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'flex flex-col')}>
            {[...Array(12)].map((_, i) => (
              <div key={i} className={clsx('bg-white rounded-xl border border-[#e8eaed] animate-pulse', viewMode === 'grid' ? 'h-20' : 'h-12')} />
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <FolderOpen className="w-16 h-16 mb-4 opacity-30 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">
              {searchQuery ? 'No results found' : 'This folder is empty'}
            </p>
            {!searchQuery && user?.perm?.create && (
              <p className="text-sm mt-1">Drop files here or click Upload</p>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-[#e8eaed] overflow-hidden shadow-soft">
            <div className="grid grid-cols-12 gap-3 px-6 py-3 border-b border-gray-100 text-xs font-semibold text-gray-400 tracking-wide select-none">
              <div className="col-span-2 md:col-span-1">
                <div
                  onClick={() => {
                    if (selected.size === displayItems.length && displayItems.length > 0) {
                      clearSelection()
                    } else {
                      selectAll()
                    }
                  }}
                  className={clsx(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer',
                    selected.size === displayItems.length && displayItems.length > 0
                      ? 'bg-primary-500 border-primary-500'
                      : 'border-gray-300 bg-white hover:border-gray-400'
                  )}
                >
                  {selected.size === displayItems.length && displayItems.length > 0 && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
              </div>
              <button className="col-span-6 md:col-span-5 text-left hover:text-gray-600 flex items-center gap-1 focus:outline-none"
                onClick={() => { setSortBy('name'); setSortAsc(a => sortBy === 'name' ? !a : true) }}>
                Name {sortBy === 'name' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}
              </button>
              <button className="col-span-3 md:col-span-2 text-left hover:text-gray-600 flex items-center gap-1 focus:outline-none"
                onClick={() => { setSortBy('size'); setSortAsc(a => sortBy === 'size' ? !a : true) }}>
                Size {sortBy === 'size' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}
              </button>
              <button className="col-span-3 text-left hover:text-gray-600 flex items-center gap-1 hidden md:flex focus:outline-none"
                onClick={() => { setSortBy('modified'); setSortAsc(a => sortBy === 'modified' ? !a : true) }}>
                Modified {sortBy === 'modified' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}
              </button>
              <div className="col-span-1" />
            </div>

            {/* Folders sub-list */}
            {folders.length > 0 && (
              <>
                <div className="px-6 py-2 bg-gray-50/50 border-b border-gray-100 text-xs font-semibold text-gray-500 text-left">
                  Folders
                </div>
                {folders.map((item: any) => renderListRow(item))}
              </>
            )}

            {/* Files sub-list */}
            {files.length > 0 && (
              <>
                <div className="px-6 py-2 bg-gray-50/50 border-b border-gray-100 text-xs font-semibold text-gray-500 text-left border-t border-gray-100">
                  Files
                </div>
                {files.map((item: any) => renderListRow(item))}
              </>
            )}
          </div>
        ) : (
          /* Grid view (separate layout) */
          <div className="space-y-8">
            {folders.length > 0 && (
              <div className="text-left">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Folders</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {folders.map((item: any) => renderGridCard(item))}
                </div>
              </div>
            )}

            {files.length > 0 && (
              <div className="text-left">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Files</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {files.map((item: any) => renderGridCard(item))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>



      {/* Banner when browsing shared content */}
      {isSharedContext && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-xs font-medium rounded-full shadow-lg">
          <Users className="w-3.5 h-3.5" />
          <span>Browsing shared folder</span>
          {sharedCanWrite
            ? <span className="px-2 py-0.5 bg-white/20 rounded-full">Read & Write</span>
            : <span className="px-2 py-0.5 bg-white/20 rounded-full">Read only</span>
          }
        </div>
      )}

      {/* Modals */}
      {shareTarget && (
        <ShareModal file={shareTarget} onClose={() => setShareTarget(null)} />
      )}
      {renameTarget && (
        <RenameModal
          file={renameTarget}
          currentPath={currentPath}
          onClose={() => setRenameTarget(null)}
          onDone={() => { setRenameTarget(null); loadDir(currentPath) }}
        />
      )}
      {showNewFolder && (
        <NewFolderModal
          currentPath={currentPath}
          onClose={() => setShowNewFolder(false)}
          onDone={() => { setShowNewFolder(false); loadDir(currentPath) }}
          user={user}
          isSharedContext={isSharedContext}
          sharedCanWrite={sharedCanWrite}
        />
      )}
      {deleteTargets.length > 0 && (
        <DeleteConfirm
          items={deleteTargets}
          onClose={() => setDeleteTargets([])}
          onConfirm={() => handleDelete(deleteTargets)}
        />
      )}
      {previewTarget && (
        <FilePreviewModal
          file={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onDownload={() => handleDownload(previewTarget)}
          onDelete={user?.perm?.delete ? () => { setPreviewTarget(null); setDeleteTargets([previewTarget]) } : undefined}
          onShare={user?.perm?.share ? () => { setPreviewTarget(null); setShareTarget(previewTarget) } : undefined}
          onRename={user?.perm?.rename ? () => { setPreviewTarget(null); setRenameTarget(previewTarget) } : undefined}
        />
      )}
      {moveCopyTargets && moveCopyAction && (
        <MoveCopyModal
          files={moveCopyTargets}
          action={moveCopyAction}
          currentPath={currentPath}
          onClose={() => { setMoveCopyTargets(null); setMoveCopyAction(null) }}
          onDone={() => { setMoveCopyTargets(null); setMoveCopyAction(null); clearSelection(); loadDir(currentPath) }}
        />
      )}
      {shareWithUsersTarget && (
        <ShareWithUsersModal file={shareWithUsersTarget} onClose={() => setShareWithUsersTarget(null)} />
      )}
      {/* FAB — New File/Folder */}
      {user?.perm?.create && (
        <div className="fixed bottom-8 right-8 z-40 flex flex-col items-end gap-2 group">
          <div className="flex flex-col items-end gap-2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto">
            <button
              onClick={() => { open() }}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload file
            </button>
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              New folder
            </button>
          </div>
          <button className="w-12 h-12 bg-primary-500 hover:bg-primary-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors">
            <FolderPlus className="w-5 h-5" />
          </button>
        </div>
      )}

      {contextMenu && (
        <div 
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-52 z-50 text-left animate-fade-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {user?.perm?.share && (
            <button 
              onClick={() => { setShareTarget(contextMenu.item); setContextMenu(null) }} 
              className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold"
            >
              <Share2 className="w-4 h-4 text-gray-500" />
              <span>Share link</span>
            </button>
          )}
          <button 
            onClick={() => { setShareWithUsersTarget(contextMenu.item); setContextMenu(null) }} 
            className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold"
          >
            <Users className="w-4 h-4 text-gray-500" />
            <span>Share with users</span>
          </button>
          {user?.perm?.rename && (
            <button 
              onClick={() => { setRenameTarget(contextMenu.item); setContextMenu(null) }} 
              className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold"
            >
              <Edit2 className="w-4 h-4 text-gray-500" />
              <span>Rename</span>
            </button>
          )}
          {user?.perm?.create && (
            <button 
              onClick={() => { setMoveCopyTargets([contextMenu.item]); setMoveCopyAction('copy'); setContextMenu(null) }} 
              className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold"
            >
              <Copy className="w-4 h-4 text-gray-500" />
              <span>Copy file</span>
            </button>
          )}
          {user?.perm?.rename && (
            <button 
              onClick={() => { setMoveCopyTargets([contextMenu.item]); setMoveCopyAction('move'); setContextMenu(null) }} 
              className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold"
            >
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <span>Move file</span>
            </button>
          )}
          {user?.perm?.admin && contextMenu.item.isDir && !contextMenu.item.isGlobal && (
            <button 
              onClick={() => {
                api.post('/global-folders', { folder_path: contextMenu.item.path })
                  .then(() => { toast.success('Folder is now global'); loadDir(currentPath) })
                  .catch((err: any) => toast.error(err.response?.data?.error || 'Failed'))
                setContextMenu(null)
              }} 
              className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold"
            >
              <Globe className="w-4 h-4 text-blue-500" />
              <span>Make Global</span>
            </button>
          )}
          {user?.perm?.admin && contextMenu.item.isGlobal && (
            <button 
              onClick={() => { handleRemoveGlobal(contextMenu.item); setContextMenu(null) }} 
              className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold"
            >
              <Globe className="w-4 h-4 text-orange-500" />
              <span>Remove Global</span>
            </button>
          )}
          {user?.perm?.delete && !contextMenu.item.isGlobal && (
            <button 
              onClick={() => { setDeleteTargets([contextMenu.item]); setContextMenu(null) }} 
              className="w-full px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 font-semibold"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
              <span>Delete</span>
            </button>
          )}
          {user?.perm?.download && (
            <button 
              onClick={() => { handleDownload(contextMenu.item); setContextMenu(null) }} 
              className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between font-semibold"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Download className="w-4 h-4 text-gray-500" />
                  <span className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full text-[7px] w-2.5 h-2.5 flex items-center justify-center font-bold">1</span>
                </div>
                <span>Download</span>
              </div>
            </button>
          )}
          <button 
            onClick={() => {
              const item = contextMenu.item
              toast.success(`Path: ${item.path}\nSize: ${item.isDir ? 'Directory' : formatBytes(item.size)}\nModified: ${new Date(item.modified).toLocaleString()}`, { duration: 4000 })
              setContextMenu(null)
            }} 
            className="w-full px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 border-t border-gray-100 font-semibold"
          >
            <Info className="w-4 h-4 text-gray-500" />
            <span>Info</span>
          </button>
        </div>
      )}
    </div>
  )
}
