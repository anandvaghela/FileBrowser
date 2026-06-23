import { MoreVertical, Globe } from 'lucide-react'
import { clsx } from 'clsx'
import { FileIcon, BgIcon } from './FileIcon'
import { formatBytes } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { FileItem } from '@/types'

interface FileListRowProps {
  item: FileItem
  isSelected: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

export default function FileListRow({
  item,
  isSelected,
  onClick,
  onDoubleClick,
  onContextMenu
}: FileListRowProps) {
  return (
    <div
      className={clsx(
        'grid grid-cols-12 gap-2 px-3 sm:px-6 py-3 items-center border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer group select-none',
        isSelected && 'bg-[#deeeff]/40'
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="col-span-8 sm:col-span-7 flex items-center gap-2 min-w-0">
        <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', isSelected ? 'bg-[#deeeff]' : BgIcon({ file: item }))}>
          <FileIcon file={item} selected={false} />
        </div>
        <span className={clsx('text-xs sm:text-sm font-semibold truncate', isSelected ? 'text-[#0062cc]' : 'text-gray-800')}>{item.name}</span>
        {item.isGlobal && <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium flex-shrink-0 hidden sm:inline">Global</span>}
        {item.isSharedWithMe && <span className="text-[9px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium flex-shrink-0 hidden sm:inline">Shared</span>}
      </div>
      <div className="hidden sm:block col-span-2 text-xs text-gray-400">
        {formatBytes(item.size)}
      </div>
      <div className="hidden md:block col-span-2 text-xs text-gray-400">
        {item.modified && !isNaN(new Date(item.modified).getTime()) ? formatDistanceToNow(new Date(item.modified), { addSuffix: true }) : '—'}
      </div>
      <div className="col-span-4 sm:col-span-1 flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
        {item.isGlobal && (
          <span title="Global folder">
            <Globe className="w-3.5 h-3.5 text-blue-500 mr-1" />
          </span>
        )}
        <button 
          onClick={onContextMenu} 
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
          title="Actions"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
