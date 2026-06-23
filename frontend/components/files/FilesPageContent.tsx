'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  FolderOpen, Upload, FolderPlus, Grid3X3,
  List, Trash2, Edit2, Copy, Home, MoreVertical, ArrowUpDown,
  Check, RefreshCw, ArrowRight, Globe, Users
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { resourcesApi, rawUrl, formatBytes, getUser, api, sharedResourcesApi } from '@/lib/api'
import ShareModal from '@/components/files/ShareModal'
import RenameModal from '@/components/files/RenameModal'
import NewFolderModal from '@/components/files/NewFolderModal'
import DeleteConfirm from '@/components/files/DeleteConfirm'
import FilePreviewModal from '@/components/files/FilePreviewModal'
import MoveCopyModal from '@/components/files/MoveCopyModal'
import ShareWithUsersModal from '@/components/files/ShareWithUsersModal'
import DetailsPanel from '@/components/files/DetailsPanel'
import { FileItem, User } from '@/types'

import FileGridCard from './FileGridCard'
import FileListRow from './FileListRow'
import VisibilityContextMenuItem from './VisibilityContextMenuItem'

export default function FilesPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [currentPath, setCurrentPath] = useState(searchParams.get('path') || '/')
  const [items, setItems] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FileItem[]>([])
  const [searching, setSearching] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [uploading, setUploading] = useState<Record<string, number>>({})
  const [user, setUser] = useState<User | null>(null)
  const [isSharedContext, setIsSharedContext] = useState(false)
  const [sharedCanWrite, setSharedCanWrite] = useState(false)
  const [sharedItems, setSharedItems] = useState<FileItem[]>([])

  // Modals
  const [shareTarget, setShareTarget] = useState<FileItem | null>(null)
  const [shareWithUsersTarget, setShareWithUsersTarget] = useState<FileItem | null>(null)
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [deleteTargets, setDeleteTargets] = useState<FileItem[]>([])
  const [previewTarget, setPreviewTarget] = useState<FileItem | null>(null)

  // Move / Copy state
  const [moveCopyTargets, setMoveCopyTargets] = useState<FileItem[] | null>(null)
  const [moveCopyAction, setMoveCopyAction] = useState<'copy' | 'move' | null>(null)

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: FileItem } | null>(null)
  const [fabOpen, setFabOpen] = useState(false)

  const sharedItemsRef = useRef<FileItem[]>([])
  const searchTimeout = useRef<any>(null)

  useEffect(() => { sharedItemsRef.current = sharedItems }, [sharedItems])

  // Global click listener to close context menu
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null)
      setFabOpen(false)
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
          `${process.env.NEXT_PUBLIC_API_URL || 'https://filebrowser-server.onrender.com'}/api/search${currentPath}?query=${encodeURIComponent(searchQuery)}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('fb_token')}` } }
        )
        const text = await res.text()
        const results = text.trim().split('\n').filter(Boolean).map(l => {
          try {
            const raw = JSON.parse(l)
            if (!raw) return null
            const name = raw.path.split('/').filter(Boolean).pop() || '/'
            return {
              path: raw.path,
              name,
              isDir: !!raw.dir,
              size: raw.size || 0,
              modified: raw.modified || new Date().toISOString(),
              type: raw.dir ? 'directory' : 'blob',
            } as FileItem
          } catch { return null }
        }).filter((item): item is FileItem => item !== null)
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
    else if (sortBy === 'modified') cmp = new Date(a.modified || 0).getTime() - new Date(b.modified || 0).getTime()
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

  const handleItemClick = (item: any, e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const n = new Set(prev)
        n.has(item.path) ? n.delete(item.path) : n.add(item.path)
        return n
      })
      return
    }
    setSelected(prev => {
      if (prev.has(item.path)) {
        return new Set()
      } else {
        return new Set([item.path])
      }
    })
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

  const handleMakeGlobal = async (item: any) => {
    try {
      await api.post('/global-folders', { folder_path: item.path })
      toast.success('Folder made global')
      loadDir(currentPath)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to make folder global')
    }
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

  const activeSidebarItem = useMemo(() => {
    if (selectedItems.length === 1) return selectedItems[0]
    if (selectedItems.length === 0 && currentPath !== '/') {
      const name = currentPath.split('/').filter(Boolean).pop() || 'Home'
      return {
        name,
        path: currentPath,
        isDir: true,
        size: 0,
      }
    }
    return null
  }, [selectedItems, currentPath])

  const folders = displayItems.filter((i: any) => i.isDir)
  const files = displayItems.filter((i: any) => !i.isDir)
  const canCreate = isSharedContext ? sharedCanWrite : user?.perm?.create

  return (
    <div className="flex h-full" {...getRootProps()}>
      <input {...getInputProps()} />
      <div className="flex flex-col flex-1 min-w-0 bg-[#f8f9fb] relative">

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
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-3 sm:px-6 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0 flex-1 overflow-hidden">
          <button
            onClick={() => navigate('/')}
            className="hover:text-blue-600 transition-colors focus:outline-none flex-shrink-0"
            title="Home"
          >
            <Home className="w-3.5 h-3.5 text-gray-400 hover:text-blue-600 transition-colors" />
          </button>
          <span className="text-gray-300 flex-shrink-0">/</span>
          <div className="flex items-center gap-1 overflow-hidden">
            {breadcrumb.slice(-(3)).map((b, i, arr) => (
              <span key={b.path} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span className="text-gray-300 flex-shrink-0">/</span>}
                <button
                  onClick={() => navigate(b.path)}
                  className={clsx('hover:text-blue-600 transition-colors truncate max-w-[70px] sm:max-w-[120px] md:max-w-none', i === arr.length - 1 ? 'font-semibold text-gray-800' : 'text-gray-400')}
                >
                  {b.label}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Sort and Actions */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* View mode toggle pill (styled like Image 2) */}
          <div className="flex items-center border border-gray-200 rounded-full overflow-hidden h-7 select-none bg-white shadow-sm">
            <button
              onClick={() => setViewMode('list')}
              className={clsx(
                "h-full px-3 flex items-center justify-center gap-1 transition-colors focus:outline-none border-r border-gray-150 text-[11px]",
                viewMode === 'list'
                  ? "bg-[#deeeff] text-[#0062cc] font-semibold"
                  : "bg-white text-gray-500 hover:text-gray-700"
              )}
              title="List view"
            >
              {viewMode === 'list' && <Check className="w-2.5 h-2.5 text-[#0062cc]" />}
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={clsx(
                "h-full px-3 flex items-center justify-center gap-1 transition-colors focus:outline-none text-[11px]",
                viewMode === 'grid'
                  ? "bg-[#deeeff] text-[#0062cc] font-semibold"
                  : "bg-white text-gray-500 hover:text-gray-700"
              )}
              title="Grid view"
            >
              {viewMode === 'grid' && <Check className="w-2.5 h-2.5 text-[#0062cc]" />}
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
          </div>

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
      <div className="flex-1 overflow-auto p-3 sm:p-6" onClick={clearSelection}>
        {loading ? (
          <div className={clsx('gap-2 sm:gap-3', viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'flex flex-col')}>
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
            {/* Header hidden on mobile */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-6 py-3 border-b border-gray-100 text-xs font-semibold text-gray-400 tracking-wide select-none">
              <button className="col-span-7 text-left hover:text-gray-600 flex items-center gap-1 focus:outline-none" onClick={() => { setSortBy('name'); setSortAsc(a => sortBy === 'name' ? !a : true) }}>Name {sortBy === 'name' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}</button>
              <button className="col-span-2 text-left hover:text-gray-600 flex items-center gap-1 focus:outline-none" onClick={() => { setSortBy('size'); setSortAsc(a => sortBy === 'size' ? !a : true) }}>Size {sortBy === 'size' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}</button>
              <button className="col-span-2 text-left hover:text-gray-600 flex items-center gap-1 focus:outline-none" onClick={() => { setSortBy('modified'); setSortAsc(a => sortBy === 'modified' ? !a : true) }}>Modified {sortBy === 'modified' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}</button>
              <div className="col-span-1" />
            </div>
            {folders.length > 0 && (<><div className="px-3 sm:px-6 py-2 bg-gray-50/50 border-b border-gray-100 text-xs font-semibold text-gray-500">Folders</div>{folders.map((item: any) => (
              <FileListRow
                key={item.path}
                item={item}
                isSelected={selected.has(item.path)}
                onClick={(e) => handleItemClick(item, e)}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  navigate(item.path)
                }}
                onContextMenu={(e) => handleContextMenu(e, item)}
              />
            ))}</>)}
            {files.length > 0 && (<><div className="px-3 sm:px-6 py-2 bg-gray-50/50 border-b border-gray-100 text-xs font-semibold text-gray-500 border-t border-gray-100">Files</div>{files.map((item: any) => (
              <FileListRow
                key={item.path}
                item={item}
                isSelected={selected.has(item.path)}
                onClick={(e) => handleItemClick(item, e)}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setPreviewTarget(item)
                }}
                onContextMenu={(e) => handleContextMenu(e, item)}
              />
            ))}</>)}
          </div>
        ) : (
          <div className="space-y-6">
            {folders.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Folders</h3>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
                  {folders.map((item: any) => (
                    <FileGridCard
                      key={item.path}
                      item={item}
                      isSelected={selected.has(item.path)}
                      onClick={(e) => handleItemClick(item, e)}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        navigate(item.path)
                      }}
                      onContextMenu={(e) => handleContextMenu(e, item)}
                    />
                  ))}
                </div>
              </div>
            )}
            {files.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Files</h3>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
                  {files.map((item: any) => (
                    <FileGridCard
                      key={item.path}
                      item={item}
                      isSelected={selected.has(item.path)}
                      onClick={(e) => handleItemClick(item, e)}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setPreviewTarget(item)
                      }}
                      onContextMenu={(e) => handleContextMenu(e, item)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>



      {/* Banner when browsing shared content */}
      {isSharedContext && (
        <div className="fixed bottom-16 lg:bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-600 text-white text-xs font-medium rounded-full shadow-lg whitespace-nowrap">
          <Users className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Browsing shared folder</span>
          <span className="sm:hidden">Shared</span>
          {sharedCanWrite ? <span className="px-2 py-0.5 bg-white/20 rounded-full">R/W</span> : <span className="px-2 py-0.5 bg-white/20 rounded-full">Read only</span>}
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
          isSharedContext={isSharedContext}
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
      {/* FAB */}
      {canCreate && (
        <div className="fixed bottom-20 sm:bottom-8 z-40 flex flex-col items-end gap-2 group transition-all duration-300 right-4 lg:right-[320px] xl:right-[350px]">
          <div className={clsx(
            "flex flex-col items-end gap-2 transition-all duration-200",
            fabOpen 
              ? "opacity-100 translate-y-0 pointer-events-auto" 
              : "opacity-0 translate-y-2 pointer-events-none sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-hover:pointer-events-auto"
          )}>
            <button 
              onClick={(e) => { e.stopPropagation(); open(); setFabOpen(false) }} 
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />Upload file
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowNewFolder(true); setFabOpen(false) }} 
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />New folder
            </button>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); setFabOpen(prev => !prev) }}
            className="w-12 h-12 bg-primary-500 hover:bg-primary-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors focus:outline-none"
          >
            <FolderPlus className="w-5 h-5" />
          </button>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44 z-50 text-left animate-fade-in"
          style={{
            top: Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 220),
            left: Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 180)
          }}
          onClick={e => e.stopPropagation()}
        >
          {user?.perm?.rename && (
            <button 
              onClick={() => { setRenameTarget(contextMenu.item); setContextMenu(null) }} 
              className="w-full px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold"
            >
              <Edit2 className="w-4 h-4 text-gray-500" />
              <span>Rename</span>
            </button>
          )}
          {user?.perm?.create && (
            <button 
              onClick={() => { setMoveCopyTargets([contextMenu.item]); setMoveCopyAction('copy'); setContextMenu(null) }} 
              className="w-full px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold"
            >
              <Copy className="w-4 h-4 text-gray-500" />
              <span>Copy file</span>
            </button>
          )}
          {user?.perm?.rename && (
            <button 
              onClick={() => { setMoveCopyTargets([contextMenu.item]); setMoveCopyAction('move'); setContextMenu(null) }} 
              className="w-full px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-3 font-semibold"
            >
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <span>Move file</span>
            </button>
          )}
          {user?.perm?.delete && !contextMenu.item.isGlobal && (
            <button 
              onClick={() => { setDeleteTargets([contextMenu.item]); setContextMenu(null) }} 
              className="w-full px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 font-semibold border-t border-gray-100"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
              <span>Delete</span>
            </button>
          )}
          {user?.perm?.admin && contextMenu.item.isDir && (
            contextMenu.item.isGlobal ? (
              <button 
                onClick={() => { handleRemoveGlobal(contextMenu.item); setContextMenu(null) }} 
                className="w-full px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-3 font-semibold border-t border-gray-100"
              >
                <Globe className="w-4 h-4 text-red-500" />
                <span>Remove Global</span>
              </button>
            ) : (
              <button 
                onClick={() => { handleMakeGlobal(contextMenu.item); setContextMenu(null) }} 
                className="w-full px-4 py-2.5 text-xs text-[#007aff] hover:bg-blue-50 flex items-center gap-3 font-semibold border-t border-gray-100"
              >
                <Globe className="w-4 h-4 text-[#007aff]" />
                <span>Make Global</span>
              </button>
            )
          )}
          {user?.perm?.admin && (
            <VisibilityContextMenuItem item={contextMenu.item} onClose={() => setContextMenu(null)} />
          )}
        </div>
      )}
      </div>
      <DetailsPanel
        currentPath={currentPath}
        items={items}
        selectedItem={selectedItems.length === 1 ? selectedItems[0] : null}
        onNavigate={navigate}
        onClearSelection={clearSelection}
        onShareLink={user?.perm?.share && activeSidebarItem ? () => setShareTarget(activeSidebarItem) : undefined}
        onShareUsers={activeSidebarItem ? () => setShareWithUsersTarget(activeSidebarItem) : undefined}
        onDownload={user?.perm?.download && activeSidebarItem ? () => handleDownload(activeSidebarItem) : undefined}
        onMakeGlobal={user?.perm?.admin && activeSidebarItem ? () => handleMakeGlobal(activeSidebarItem) : undefined}
        onRemoveGlobal={user?.perm?.admin && activeSidebarItem ? () => handleRemoveGlobal(activeSidebarItem) : undefined}
      />
    </div>
  )
}
