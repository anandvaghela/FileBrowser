'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FolderOpen, File, Grid3X3, List, Download,
  Image, Film, Music, FileText, ArrowUpDown,
  Search, Info, Users, Shield, ShieldAlert
} from 'lucide-react'
import { api, getUser, rawUrl, previewUrl, formatBytes } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import FilePreviewModal from '@/components/files/FilePreviewModal'

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

export default function SharedPage() {
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [user, setUser] = useState<any>(null)
  const [previewTarget, setPreviewTarget] = useState<any>(null)
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    const u = getUser()
    setUser(u)
    
    // Load shared items
    api.get('/user-shares/shared-with-me')
      .then(res => {
        setItems(res.data.items || [])
      })
      .catch(err => {
        toast.error(err.response?.data?.error || 'Failed to load shared items')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const handleItemClick = (item: any) => {
    if (item.isDir) {
      router.push(`/dashboard/files?path=${encodeURIComponent(item.path)}`)
    } else {
      setPreviewTarget(item)
    }
  }

  const handleDownload = (item: any) => {
    const url = rawUrl(item.path, true)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    a.click()
  }

  // Filter & Sort
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sharedBy.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    let cmp = 0
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortBy === 'size') cmp = a.size - b.size
    else if (sortBy === 'modified') cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime()
    return sortAsc ? cmp : -cmp
  })

  return (
    <div className="flex flex-col h-full bg-[#f8f9fb]">
      {/* Sub-Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#333333]">
          <Users className="w-5 h-5 text-green-600" />
          <h1 className="text-[16px] font-bold tracking-tight">Shared with me</h1>
          <span className="text-[12px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Search bar inside header */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search shared items..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-xs bg-[#f1f3f4] border-0 rounded-lg focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-500 transition-all text-[#333333] placeholder-gray-400 w-48 sm:w-60"
            />
          </div>

          <div className="flex items-center gap-0.5 bg-gray-50 px-1.5 py-0.5 rounded-lg border border-gray-100/50">
            {/* Grid/List Toggle */}
            <button
              onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              className="p-1 rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 hover:shadow-sm transition-all focus:outline-none"
              title="Toggle view"
            >
              {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
            </button>

            {/* Info Button */}
            <button
              onClick={() => {
                const foldersCount = items.filter(i => i.isDir).length
                const filesCount = items.filter(i => !i.isDir).length
                toast.success(`Shared files: ${filesCount}\nShared folders: ${foldersCount}`)
              }}
              className="p-1 rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 hover:shadow-sm transition-all focus:outline-none"
              title="Overview Info"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>

          {/* Sort Toggle */}
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

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className={clsx('gap-3', viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'flex flex-col')}>
            {[...Array(10)].map((_, i) => (
              <div key={i} className={clsx('bg-white rounded-xl border border-[#e8eaed] animate-pulse', viewMode === 'grid' ? 'h-24' : 'h-14')} />
            ))}
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Users className="w-16 h-16 mb-4 opacity-30 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">
              {searchQuery ? 'No matching shared items' : 'No items have been shared with you yet'}
            </p>
            {!searchQuery && (
              <p className="text-sm mt-1 text-gray-400">When others share files or folders with you, they will appear here.</p>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-[#e8eaed] overflow-hidden shadow-soft">
            <div className="grid grid-cols-12 gap-3 px-6 py-3 border-b border-gray-100 text-xs font-semibold text-gray-400 tracking-wide select-none">
              <button className="col-span-4 text-left hover:text-gray-600 flex items-center gap-1 focus:outline-none"
                onClick={() => { setSortBy('name'); setSortAsc(a => sortBy === 'name' ? !a : true) }}>
                Name {sortBy === 'name' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}
              </button>
              <div className="col-span-2 text-left">Shared By</div>
              <div className="col-span-2 text-left">Permissions</div>
              <button className="col-span-2 text-left hover:text-gray-600 flex items-center gap-1 focus:outline-none"
                onClick={() => { setSortBy('size'); setSortAsc(a => sortBy === 'size' ? !a : true) }}>
                Size {sortBy === 'size' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}
              </button>
              <button className="col-span-2 text-left hover:text-gray-600 flex items-center gap-1 focus:outline-none"
                onClick={() => { setSortBy('modified'); setSortAsc(a => sortBy === 'modified' ? !a : true) }}>
                Modified {sortBy === 'modified' && <ArrowUpDown className="w-3 h-3 text-gray-400" />}
              </button>
            </div>

            {sortedItems.map(item => (
              <div
                key={item.path}
                className="grid grid-cols-12 gap-3 px-6 py-4 items-center border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer select-none"
                onClick={() => handleItemClick(item)}
              >
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', BgIcon({ file: item }))}>
                    <FileIcon file={item} />
                  </div>
                  <span className="text-sm font-semibold truncate text-gray-800">{item.name}</span>
                </div>
                <div className="col-span-2 text-sm text-gray-500 font-medium">{item.sharedBy}</div>
                <div className="col-span-2 text-sm">
                  {item.canWrite ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                      <Shield className="w-3 h-3" /> Read & Write
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <ShieldAlert className="w-3 h-3" /> Read Only
                    </span>
                  )}
                </div>
                <div className="col-span-2 text-sm text-gray-400">
                  {item.isDir ? '—' : formatBytes(item.size)}
                </div>
                <div className="col-span-2 text-sm text-gray-400">
                  {item.modified && !isNaN(new Date(item.modified).getTime())
                    ? formatDistanceToNow(new Date(item.modified), { addSuffix: true })
                    : '—'
                  }
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Grid view */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedItems.map(item => (
              <div
                key={item.path}
                className="rounded-xl border border-[#e8eaed] bg-white p-4 transition-all cursor-pointer hover:shadow-soft hover:border-gray-300 select-none relative group"
                onClick={() => handleItemClick(item)}
              >
                {/* Permissions badge top right */}
                <div className="absolute top-2.5 right-2.5">
                  {item.canWrite ? (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700">R/W</span>
                  ) : (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700">R</span>
                  )}
                </div>

                {/* File Icon */}
                <div className={clsx(
                  'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors mb-4',
                  BgIcon({ file: item })
                )}>
                  <FileIcon file={item} size="lg" />
                </div>

                {/* Details */}
                <div className="flex flex-col min-w-0">
                  <p className="text-xs font-bold truncate text-gray-800 mb-1" title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-[10px] text-gray-400 font-medium mb-1">
                    Shared by {item.sharedBy}
                  </p>
                  <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400 border-t border-gray-50 pt-2">
                    <span>{item.isDir ? 'Folder' : formatBytes(item.size)}</span>
                    <span>
                      {item.modified && !isNaN(new Date(item.modified).getTime())
                        ? formatDistanceToNow(new Date(item.modified), { addSuffix: true })
                        : '—'
                      }
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewTarget && (
        <FilePreviewModal
          file={previewTarget}
          isSharedContext={true}
          onClose={() => setPreviewTarget(null)}
          onDownload={() => handleDownload(previewTarget)}
        />
      )}
    </div>
  )
}
