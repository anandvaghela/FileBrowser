'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FolderOpen, File, Upload, FolderPlus, Search, Grid3X3,
  List, Download, Trash2, Edit2, Copy, Share2, ChevronRight,
  Home, MoreVertical, ArrowUpDown, Image, Film, Music,
  FileText, Archive, X, Check, RefreshCw, Info, Save, Menu
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { resourcesApi, sharesApi, rawUrl, previewUrl, formatBytes, getUser } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import ShareModal from '@/components/files/ShareModal'
import RenameModal from '@/components/files/RenameModal'
import NewFolderModal from '@/components/files/NewFolderModal'
import DeleteConfirm from '@/components/files/DeleteConfirm'
import FilePreviewModal from '@/components/files/FilePreviewModal'

function FileIcon({ file, size = 'md' }: { file: any; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'lg' ? 'w-8 h-8' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  if (file.isDir) return <FolderOpen className={clsx(s, 'text-blue-500')} />
  const t = file.type || ''
  if (t === 'image') return <Image className={clsx(s, 'text-pink-500')} />
  if (t === 'video') return <Film className={clsx(s, 'text-purple-500')} />
  if (t === 'audio') return <Music className={clsx(s, 'text-green-500')} />
  if (t === 'text' || t === 'pdf') return <FileText className={clsx(s, 'text-orange-500')} />
  return <File className={clsx(s, 'text-gray-400')} />
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [uploading, setUploading] = useState<Record<string, number>>({})
  const [user, setUser] = useState<any>(null)

  // Modals
  const [shareTarget, setShareTarget] = useState<any>(null)
  const [renameTarget, setRenameTarget] = useState<any>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [deleteTargets, setDeleteTargets] = useState<any[]>([])
  const [previewTarget, setPreviewTarget] = useState<any>(null)
  const searchTimeout = useRef<any>(null)

  useEffect(() => { setUser(getUser()) }, [])

  const loadDir = useCallback(async (path: string) => {
    setLoading(true)
    setSelected(new Set())
    try {
      const res = await resourcesApi.get(path)
      setItems(res.data.items || [])
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load directory')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

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
    if (!user?.perm?.create) { toast.error('No upload permission'); return }
    for (const file of acceptedFiles) {
      const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
      setUploading(u => ({ ...u, [file.name]: 0 }))
      try {
        await resourcesApi.uploadFile(filePath, file, (p) => {
          setUploading(u => ({ ...u, [file.name]: p }))
        })
        toast.success(`Uploaded ${file.name}`)
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err.response?.data?.error || err.message}`)
      } finally {
        setUploading(u => { const n = { ...u }; delete n[file.name]; return n })
      }
    }
    loadDir(currentPath)
  }, [currentPath, user, loadDir])

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

  const handleDelete = async (targets: any[]) => {
    for (const t of targets) {
      try {
        await resourcesApi.delete(t.path)
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
    const url = rawUrl(item.path)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    a.click()
  }

  const selectedItems = displayItems.filter((i: any) => selected.has(i.path))

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

      {/* Top Header / Bar (Custom rendered to match original Filebrowser) */}
      <header className="h-14 bg-white border-b border-[#e8eaed] flex items-center px-6 gap-4 flex-shrink-0">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
          className="lg:hidden text-gray-500 hover:text-gray-700 mr-1 focus:outline-none"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center text-white shadow-sm">
          <FolderOpen className="w-4 h-4" />
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 min-w-32 max-w-[280px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-1.5 text-xs bg-white border border-[#e8eaed] rounded-full focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all text-gray-800 placeholder-gray-400"
          />
          {searching && <div className="absolute right-8 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border border-primary-300 border-t-primary-500 rounded-full animate-spin" />}
          {searchQuery && !searching && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Right Action Icons */}
        <div className="flex items-center gap-1">
          {/* Grid/List Toggle */}
          <button
            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Toggle view"
          >
            {viewMode === 'grid' ? <List className="w-5 h-5" /> : <Grid3X3 className="w-5 h-5" />}
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
              'p-1.5 rounded-lg transition-colors',
              selected.size > 0 ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
            )}
            title="Download selected"
          >
            <Download className="w-5 h-5" />
          </button>

          {/* Upload File */}
          {user?.perm?.create && (
            <button
              onClick={open}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="Upload file"
            >
              <Upload className="w-5 h-5" />
            </button>
          )}

          {/* Info Button */}
          <button
            onClick={() => {
              const foldersCount = items.filter(i => i.isDir).length
              const filesCount = items.filter(i => !i.isDir).length
              toast.success(`Path: ${currentPath}\nFolders: ${foldersCount}\nFiles: ${filesCount}`, { duration: 4000 })
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Folder Info"
          >
            <Info className="w-5 h-5" />
          </button>

          {/* Toggle Select All */}
          <button
            onClick={() => {
              if (selected.size > 0) clearSelection()
              else selectAll()
            }}
            className={clsx(
              'p-1.5 rounded-lg transition-colors',
              selected.size > 0 ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-100'
            )}
            title="Toggle select all"
          >
            <Check className="w-5 h-5" />
          </button>
        </div>
      </header>

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortAsc(a => !a)}
            className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1.5 text-xs font-semibold focus:outline-none"
            title="Toggle sort direction"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Sort</span>
          </button>
          {selected.size > 0 && user?.perm?.delete && (
            <button
              onClick={() => setDeleteTargets(selectedItems)}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1 text-xs"
              title="Delete selected"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
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
          <div className={clsx('gap-3', viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' : 'flex flex-col')}>
            {[...Array(12)].map((_, i) => (
              <div key={i} className={clsx('bg-white rounded-xl border border-[#e8eaed] animate-pulse', viewMode === 'grid' ? 'h-28' : 'h-12')} />
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
            {/* List header */}
            <div className="grid grid-cols-12 gap-3 px-6 py-3 border-b border-gray-100 text-xs font-semibold text-gray-400 tracking-wide select-none">
              <div className="col-span-1">
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
              <button className="col-span-5 text-left hover:text-gray-600 flex items-center gap-1 focus:outline-none"
                onClick={() => { setSortBy('name'); setSortAsc(a => sortBy === 'name' ? !a : true) }}>
                Name {sortBy === 'name' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}
              </button>
              <button className="col-span-2 text-left hover:text-gray-600 flex items-center gap-1 focus:outline-none"
                onClick={() => { setSortBy('size'); setSortAsc(a => sortBy === 'size' ? !a : true) }}>
                Size {sortBy === 'size' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}
              </button>
              <button className="col-span-3 text-left hover:text-gray-600 flex items-center gap-1 hidden md:flex focus:outline-none"
                onClick={() => { setSortBy('modified'); setSortAsc(a => sortBy === 'modified' ? !a : true) }}>
                Modified {sortBy === 'modified' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}
              </button>
              <div className="col-span-1" />
            </div>

            {displayItems.map((item: any) => (
              <div
                key={item.path}
                className={clsx(
                  'grid grid-cols-12 gap-3 px-6 py-3.5 items-center border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer group',
                  selected.has(item.path) && 'bg-primary-50/20'
                )}
                onClick={() => item.isDir ? navigate(item.path) : setPreviewTarget(item)}
              >
                <div className="col-span-1" onClick={e => toggleSelect(item.path, e)}>
                  <div className={clsx(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all bg-white',
                    selected.has(item.path)
                      ? 'bg-primary-500 border-primary-500'
                      : 'border-gray-300 group-hover:border-gray-400'
                  )}>
                    {selected.has(item.path) && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>
                <div className="col-span-5 flex items-center gap-3 min-w-0">
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', BgIcon({ file: item }))}>
                    <FileIcon file={item} />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 truncate">{item.name}</span>
                </div>
                <div className="col-span-2 text-sm text-gray-400">
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
                    {user?.perm?.delete && (
                      <button onClick={() => setDeleteTargets([item])} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors focus:outline-none">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Grid view */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {displayItems.map((item: any) => (
              <div
                key={item.path}
                className={clsx(
                  'bg-white rounded-xl border border-[#e8eaed] p-4 hover:shadow-soft transition-all cursor-pointer group relative',
                  selected.has(item.path) && 'ring-2 ring-primary-500 border-primary-200'
                )}
                onClick={() => item.isDir ? navigate(item.path) : setPreviewTarget(item)}
              >
                <div onClick={e => toggleSelect(item.path, e)}
                  className={clsx(
                    'absolute top-2.5 right-2.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all bg-white',
                    selected.has(item.path)
                      ? 'bg-primary-500 border-primary-500 opacity-100'
                      : 'border-gray-300 opacity-0 group-hover:opacity-100'
                  )}>
                  {selected.has(item.path) && <Check className="w-3 h-3 text-white" />}
                </div>

                <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center mb-3', BgIcon({ file: item }))}>
                  <FileIcon file={item} size="lg" />
                </div>
                <p className="text-xs font-semibold text-gray-800 truncate mb-0.5">{item.name}</p>
                <p className="text-xs text-gray-400">
                  {item.isDir ? 'Folder' : formatBytes(item.size)}
                </p>

                {/* Hover actions */}
                <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  {user?.perm?.download && (
                    <button onClick={() => handleDownload(item)} className="p-1.5 rounded-lg bg-white shadow-card border border-[#e8eaed] text-gray-400 hover:text-gray-600 focus:outline-none">
                      <Download className="w-3 h-3" />
                    </button>
                  )}
                  {user?.perm?.delete && (
                    <button onClick={() => setDeleteTargets([item])} className="p-1.5 rounded-lg bg-white shadow-card border border-[#e8eaed] text-gray-400 hover:text-red-500 focus:outline-none">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
    </div>
  )
}
