'use client'
import { useEffect, useState, useMemo } from 'react'
import {
  Folder, FolderOpen, File, FileText, Image as ImageIcon, Film, Music,
  X, Share2, Users, Download, Globe, Clock, User as UserIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import { resourcesApi, userSharesApi, activityApi, formatBytes, getUser, api } from '@/lib/api'
import { format, formatDistanceToNow } from 'date-fns'

function ItemIcon({ item, className }: { item: any; className?: string }) {
  if (item.isDir) return <Folder className={clsx('text-blue-500 fill-blue-100', className)} />
  const t = item.type || ''
  if (t === 'image') return <ImageIcon className={clsx('text-pink-500', className)} />
  if (t === 'video') return <Film className={clsx('text-purple-500', className)} />
  if (t === 'audio') return <Music className={clsx('text-green-500', className)} />
  if (t === 'text' || t === 'pdf') return <FileText className={clsx('text-orange-500', className)} />
  return <File className={clsx('text-gray-400', className)} />
}

function Avatar({ name }: { name: string }) {
  const colors = ['bg-purple-500', 'bg-pink-500', 'bg-green-500', 'bg-orange-500', 'bg-blue-500']
  const idx = (name || '').charCodeAt(0) % colors.length
  return (
    <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold ring-2 ring-white flex-shrink-0', colors[idx] || 'bg-gray-400')}>
      {(name || '?')[0]?.toUpperCase()}
    </div>
  )
}

// ── Folder tree (recursive) ───────────────────────────────────────────────────
type TreeNode = { path: string; name: string; children: TreeNode[] }

function buildTree(flatDirs: { path: string; name: string }[]): TreeNode {
  const root: TreeNode = { path: '/', name: 'Data Room', children: [] }
  const map = new Map<string, TreeNode>()
  map.set('/', root)

  const sorted = [...flatDirs].sort((a, b) => a.path.split('/').length - b.path.split('/').length)
  for (const d of sorted) {
    if (map.has(d.path)) continue
    const node: TreeNode = { path: d.path, name: d.name, children: [] }
    map.set(d.path, node)
    const parentPath = d.path.split('/').slice(0, -1).join('/') || '/'
    const parent = map.get(parentPath) || root
    parent.children.push(node)
  }
  return root
}

function extractAllDirs(allItems: any[]): { path: string; name: string }[] {
  const dirPaths = new Set<string>()
  
  for (const item of allItems) {
    if (!item) continue
    if (item.isDir) {
      const cleanPath = item.path.replace(/\/$/, '')
      if (cleanPath && cleanPath !== '') {
        dirPaths.add(cleanPath)
      }
    } else if (item.path) {
      const parts = item.path.split('/').filter(Boolean)
      let current = ''
      for (let i = 0; i < parts.length - 1; i++) {
        current += '/' + parts[i]
        dirPaths.add(current)
      }
    }
  }

  return Array.from(dirPaths).map(p => {
    return {
      path: p,
      name: p.split('/').pop() || ''
    }
  })
}

function TreeRow({ node, depth, activePath, onNavigate, globalPaths }: {
  node: TreeNode; depth: number; activePath: string; onNavigate: (p: string) => void; globalPaths: Set<string>
}) {
  const isActive = node.path === activePath
  return (
    <div className="w-full">
      <button
        onClick={() => onNavigate(node.path)}
        className={clsx(
          'w-full flex items-center gap-2 py-1.5 px-3 rounded-lg text-left text-xs font-semibold transition-colors focus:outline-none my-0.5',
          isActive
            ? 'bg-[#deeeff] text-[#0062cc] shadow-soft'
            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
        )}
      >
        <Folder className={clsx('w-4 h-4 flex-shrink-0', isActive ? 'text-[#007aff] fill-[#007aff]/20' : 'text-blue-500 fill-blue-50')} />
        <span className="truncate flex-1">{node.name}</span>
        {globalPaths.has(node.path.replace(/\/$/, '')) && (
          <span className={clsx(
            'text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0',
            isActive ? 'bg-white/80 text-[#0062cc]' : 'bg-gray-100 text-gray-500'
          )}>
            Global
          </span>
        )}
      </button>
      {node.children.length > 0 && (
        <div className="ml-5 pl-4 border-l border-gray-200/80 space-y-0.5 relative">
          {node.children.map(child => (
            <TreeRow key={child.path} node={child} depth={depth + 1} activePath={activePath} onNavigate={onNavigate} globalPaths={globalPaths} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DetailsPanel({
  currentPath,
  items,
  selectedItem,
  onNavigate,
  onClearSelection,
  onShareLink,
  onShareUsers,
  onDownload,
  onMakeGlobal,
  onRemoveGlobal,
}: {
  currentPath: string
  items: any[]
  selectedItem: any | null
  onNavigate: (path: string) => void
  onClearSelection: () => void
  onShareLink?: () => void
  onShareUsers?: () => void
  onDownload?: () => void
  onMakeGlobal?: () => void
  onRemoveGlobal?: () => void
}) {
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [allItemsRecursive, setAllItemsRecursive] = useState<any[]>([])
  const [tab, setTab] = useState<'details' | 'activity'>('details')
  const [access, setAccess] = useState<any | null>(null)
  const [activity, setActivity] = useState<any[]>([])
  const [loadingSide, setLoadingSide] = useState(false)
  const [globalPaths, setGlobalPaths] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)
  const user = getUser()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    api.get('/global-folders').then(res => {
      const folders = res.data.folders || []
      setGlobalPaths(new Set(folders.map((f: any) => f.folder_path.replace(/\/$/, ''))))
    }).catch(() => { })
  }, [])

  // Load folder structure tree + aggregate stats (root-level overview)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await resourcesApi.getRecursive('/')
        const all = Array.isArray(res.data) ? res.data : []
        if (cancelled) return
        setAllItemsRecursive(all)
        const dirs = extractAllDirs(all)
        setTree(buildTree(dirs))
      } catch { }
    }
    load()
    return () => { cancelled = true }
  }, [currentPath])

  const activePath = selectedItem?.isDir ? selectedItem.path : currentPath
 
  const activeStats = useMemo(() => {
    const list = Array.isArray(allItemsRecursive) ? allItemsRecursive : []
    const normalised = activePath.replace(/\/$/, '')
    const prefix = normalised === '' ? '/' : normalised + '/'
 
    const subDirs = list.filter(i => 
      i && i.isDir && 
      (normalised === '' 
        ? true 
        : i.path && i.path.startsWith(prefix) && i.path.replace(/\/$/, '') !== normalised)
    )
    const subFiles = list.filter(i => 
      i && !i.isDir && 
      (normalised === '' 
        ? true 
        : i.path && i.path.startsWith(prefix))
    )
 
    const size = subFiles.reduce((s, f) => s + (f?.size || 0), 0)
     
    let latest = 0
    subFiles.forEach(f => {
      if (f?.modified) {
        const t = new Date(f.modified).getTime()
        if (t > latest) latest = t
      }
    })
 
    const folderObj = list.find(i => i && i.isDir && i.path && i.path.replace(/\/$/, '') === normalised)
    if (folderObj && !latest && folderObj.modified) {
      latest = new Date(folderObj.modified).getTime()
    }
 
    return {
      folders: subDirs.length,
      files: subFiles.length,
      size,
      latest: latest || null,
      owner: folderObj?.owner || user?.username || 'Admin',
      modified: folderObj?.modified || (latest ? new Date(latest).toISOString() : null),
      created: folderObj?.created || folderObj?.modified || (latest ? new Date(latest).toISOString() : null)
    }
  }, [allItemsRecursive, activePath, user])
 
  const displayItem = useMemo(() => {
    if (selectedItem) return selectedItem
 
    const isRoot = currentPath === '/' || currentPath === ''
    const name = isRoot ? 'Home' : (currentPath.split('/').filter(Boolean).pop() || 'Home')
 
    return {
      name,
      path: currentPath,
      isDir: true,
      size: activeStats.size,
      modified: activeStats.modified,
      created: activeStats.created,
      isGlobal: globalPaths.has(currentPath.replace(/\/$/, '')),
      isVirtual: true,
    }
  }, [selectedItem, currentPath, activeStats, globalPaths])
 
  const showTree = currentPath === '/' && displayItem?.isDir
 
  // Load access + activity for the selected file or virtual directory
  useEffect(() => {
    if (!displayItem || (displayItem.isDir && showTree)) { setAccess(null); setActivity([]); return }
    setTab('details')
    setLoadingSide(true)
    Promise.all([
      userSharesApi.access(displayItem.path).catch(() => ({ data: null })),
      activityApi.getForPath(displayItem.path).catch(() => ({ data: { items: [] } })),
    ]).then(([accessRes, activityRes]) => {
      setAccess(accessRes.data)
      setActivity(activityRes.data?.items || [])
    }).finally(() => setLoadingSide(false))
  }, [displayItem?.path, showTree])
 
  const isFileSelected = !!displayItem && !displayItem.isDir
 
  if (!mounted) {
    return <aside className="hidden lg:flex flex-col w-[300px] xl:w-[330px] flex-shrink-0 border-l border-gray-100 bg-white" />
  }

  return (
    <aside className="hidden lg:flex flex-col w-[300px] xl:w-[330px] flex-shrink-0 border-l border-gray-100 bg-white overflow-y-auto">
      {isFileSelected || !showTree ? (
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <div className={clsx(
              "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
              displayItem.isDir ? "bg-blue-50" : "bg-orange-50"
            )}>
              <ItemIcon item={displayItem} className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{displayItem.name}</p>
              <p className="text-[11px] text-gray-400 uppercase">
                {displayItem.isDir ? 'folder' : (displayItem.type || 'file')} · {formatBytes(displayItem.size || 0)}
              </p>
            </div>
            {selectedItem && (
              <button onClick={onClearSelection} className="text-gray-400 hover:text-gray-600 focus:outline-none flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex w-full border-b border-gray-100">
            {(['details', 'activity'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'flex-1 py-3 text-xs font-bold capitalize border-b-2 -mb-px transition-colors focus:outline-none text-center',
                  tab === t ? 'text-[#007aff] border-[#007aff]' : 'text-gray-400 border-transparent hover:text-gray-600'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'details' ? (
            <div className="px-5 py-4 space-y-5">
              {/* Who has access */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-800">Who has access</p>
                  {onShareUsers && (
                    <button onClick={onShareUsers} className="border border-[#dadce0] text-[#1a73e8] rounded-full px-3 py-1 text-[10px] font-bold hover:bg-blue-50/20 focus:outline-none transition-all">
                      Manage access
                    </button>
                  )}
                </div>
                {loadingSide ? (
                  <div className="h-7 w-24 bg-gray-100 rounded-full animate-pulse" />
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar name={access?.owner || user?.username || 'A'} />
                      {((access?.people && access.people.length > 0) || access?.hasActiveLink) && (
                        <div className="w-[1px] h-4 bg-gray-200 self-center flex-shrink-0" />
                      )}
                      {(access?.people || []).slice(0, 4).map((p: any) => (
                        <Avatar key={p.id} name={p.username} />
                      ))}
                      {access?.hasActiveLink && (
                        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Globe className="w-3.5 h-3.5 text-green-600" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 leading-snug">
                      Owned by you.{access?.hasActiveLink ? ' Anyone on the internet with the link can edit.' : ''} {access?.people?.length ? `Shared with ${access.people.length} ${access.people.length === 1 ? 'person' : 'people'}.` : ''}
                    </p>
                  </>
                )}
              </div>

              {/* Options */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-sm font-bold text-gray-800 mb-3">Options</p>
                <div className="space-y-3">
                  {onShareLink && (
                    <button onClick={onShareLink} className="w-full flex items-center gap-3.5 text-left focus:outline-none group">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600 group-hover:bg-blue-100 transition-colors">
                        <Share2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800">Share link</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{displayItem.isDir ? 'Folders' : 'Files'}</p>
                      </div>
                    </button>
                  )}
                  {onShareUsers && (
                    <button onClick={onShareUsers} className="w-full flex items-center gap-3.5 text-left focus:outline-none group">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600 group-hover:bg-blue-100 transition-colors">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800">Share with users</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{displayItem.isDir ? 'Folders' : 'Files'}</p>
                      </div>
                    </button>
                  )}
                  {onDownload && (
                    <button onClick={onDownload} className="w-full flex items-center gap-3.5 text-left focus:outline-none group">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600 group-hover:bg-blue-100 transition-colors">
                        <Download className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800">Download</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{displayItem.isDir ? 'Folders' : 'Files'}</p>
                      </div>
                    </button>
                  )}
                  {/* Make/Remove Global (only for admins and directories) */}
                  {user?.perm?.admin && displayItem.isDir && (
                    displayItem.isGlobal ? (
                      onRemoveGlobal && (
                        <button onClick={onRemoveGlobal} className="w-full flex items-center gap-3.5 text-left focus:outline-none group">
                          <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 text-red-600 group-hover:bg-red-100 transition-colors">
                            <Globe className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-red-600">Remove Global</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Folders</p>
                          </div>
                        </button>
                      )
                    ) : (
                      onMakeGlobal && (
                        <button onClick={onMakeGlobal} className="w-full flex items-center gap-3.5 text-left focus:outline-none group">
                          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600 group-hover:bg-blue-100 transition-colors">
                            <Globe className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-blue-600">Make Global</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Folders</p>
                          </div>
                        </button>
                      )
                    )
                  )}
                </div>
              </div>

              {/* File details */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-sm font-bold text-gray-800 mb-3">File Details</p>
                <div className="grid grid-cols-2 gap-y-3.5 text-xs">
                  <div>
                    <p className="font-bold text-gray-800 mb-0.5">Type</p>
                    <p className="text-gray-400 capitalize">{displayItem.isDir ? 'Folders' : (displayItem.type || 'Files')}</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 mb-0.5">Size</p>
                    <p className="text-gray-400">{formatBytes(displayItem.size || 0)}</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 mb-0.5">Owner</p>
                    <p className="text-gray-400">{access?.owner || user?.username || '—'}</p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 mb-0.5">Last Modified</p>
                    <p className="text-gray-400">
                      {displayItem.modified && !isNaN(new Date(displayItem.modified).getTime()) ? format(new Date(displayItem.modified), 'MMM d, yyyy') : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 mb-0.5">Created Date</p>
                    <p className="text-gray-400">
                      {displayItem.created && !isNaN(new Date(displayItem.created).getTime())
                        ? format(new Date(displayItem.created), 'MMM d, yyyy')
                        : displayItem.modified && !isNaN(new Date(displayItem.modified).getTime())
                        ? format(new Date(displayItem.modified), 'MMM d, yyyy')
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-5 py-4">
              {loadingSide ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
                </div>
              ) : activity.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No activity yet</p>
              ) : (
                <div className="space-y-4">
                  {activity.map((a) => (
                    <div key={a.id} className="flex items-start gap-2.5">
                      <Avatar name={a.username} />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-700 leading-snug">
                          <span className="font-bold">{a.username}</span> {a.action}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {a.createdAt ? format(new Date(a.createdAt * 1000), 'h:mm a, MMM d') : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Folder structure */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <p className="text-sm font-bold text-gray-800">Folder Structure</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {allItemsRecursive.length > 0
                  ? `${activeStats.folders} Folders • ${activeStats.files} Files`
                  : '—'}
              </p>
            </div>
            {selectedItem && (
              <button onClick={onClearSelection} className="text-gray-400 hover:text-gray-600 focus:outline-none flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="px-3 py-2 max-h-[45vh] overflow-y-auto">
            {tree ? (
              <TreeRow node={tree} depth={0} activePath={activePath} onNavigate={onNavigate} globalPaths={globalPaths} />
            ) : (
              <div className="space-y-2 p-2">
                {[...Array(4)].map((_, i) => <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />)}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="px-5 py-3 border-t border-gray-100 bg-white">
            <p className="text-sm font-bold text-gray-800 mb-3">Options</p>
            <div className="space-y-3">
              {onShareLink && (
                <button onClick={onShareLink} className="w-full flex items-center gap-3.5 text-left focus:outline-none group">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600 group-hover:bg-blue-100 transition-colors">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">Share link</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Folders</p>
                  </div>
                </button>
              )}
              {onShareUsers && (
                <button onClick={onShareUsers} className="w-full flex items-center gap-3.5 text-left focus:outline-none group">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600 group-hover:bg-blue-100 transition-colors">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">Share with users</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Folders</p>
                  </div>
                </button>
              )}
              {onDownload && (
                <button onClick={onDownload} className="w-full flex items-center gap-3.5 text-left focus:outline-none group">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600 group-hover:bg-blue-100 transition-colors">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">Download</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Folders</p>
                  </div>
                </button>
              )}
              {/* Make/Remove Global (only for admins) */}
              {user?.perm?.admin && (
                displayItem?.isGlobal ? (
                  onRemoveGlobal && (
                    <button onClick={onRemoveGlobal} className="w-full flex items-center gap-3.5 text-left focus:outline-none group">
                      <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 text-red-600 group-hover:bg-red-100 transition-colors">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-red-600">Remove Global</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Folders</p>
                      </div>
                    </button>
                  )
                ) : (
                  onMakeGlobal && (
                    <button onClick={onMakeGlobal} className="w-full flex items-center gap-3.5 text-left focus:outline-none group">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600 group-hover:bg-blue-100 transition-colors">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-blue-600">Make Global</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Folders</p>
                      </div>
                    </button>
                  )
                )
              )}
            </div>
          </div>

          {/* File details */}
          <div className="px-5 py-4 border-t border-gray-100 mt-2 bg-white">
            <p className="text-sm font-bold text-gray-800 mb-3">File Details</p>
            <div className="grid grid-cols-2 gap-y-3.5 text-xs">
              <div>
                <p className="font-bold text-gray-800 mb-0.5">Type</p>
                <p className="text-gray-400">Folders</p>
              </div>
              <div>
                <p className="font-bold text-gray-800 mb-0.5">Size</p>
                <p className="text-gray-400">
                  {allItemsRecursive.length > 0 ? formatBytes(activeStats.size) : '—'}
                </p>
              </div>
              <div>
                <p className="font-bold text-gray-800 mb-0.5">Owner</p>
                <p className="text-gray-400 capitalize">{activeStats.owner}</p>
              </div>
              <div>
                <p className="font-bold text-gray-800 mb-0.5">Last Modified</p>
                <p className="text-gray-400">
                  {activeStats.modified && !isNaN(new Date(activeStats.modified).getTime())
                    ? format(new Date(activeStats.modified), 'MMM d, yyyy')
                    : '—'}
                </p>
              </div>
              <div>
                <p className="font-bold text-gray-800 mb-0.5">Created Date</p>
                <p className="text-gray-400">
                  {activeStats.created && !isNaN(new Date(activeStats.created).getTime())
                    ? format(new Date(activeStats.created), 'MMM d, yyyy')
                    : activeStats.modified && !isNaN(new Date(activeStats.modified).getTime())
                    ? format(new Date(activeStats.modified), 'MMM d, yyyy')
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
