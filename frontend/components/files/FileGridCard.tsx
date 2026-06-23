import { MoreVertical, FolderOpen } from 'lucide-react'
import { clsx } from 'clsx'
import { FileIcon, BgIcon } from './FileIcon'
import { formatBytes } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { FileItem } from '@/types'

interface FileGridCardProps {
  item: FileItem
  isSelected: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

export default function FileGridCard({
  item,
  isSelected,
  onClick,
  onDoubleClick,
  onContextMenu
}: FileGridCardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border p-3.5 transition-all cursor-pointer group relative flex flex-col items-start justify-between select-none w-full h-[125px]',
        isSelected
          ? 'bg-[#deeeff] border-[#bcdcff] text-[#0062cc] shadow-soft'
          : 'bg-white border-[#e8eaed] text-gray-800 hover:shadow-soft hover:border-gray-300'
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* 3-dots actions button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onContextMenu(e)
        }}
        className="absolute top-2.5 right-2.5 w-5 h-5 rounded-md flex items-center justify-center bg-white border border-gray-200 z-10 hover:bg-gray-50 text-gray-400 hover:text-gray-600 focus:outline-none"
        title="Actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {/* Icon */}
      <div className={clsx(
        'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
        isSelected 
          ? 'bg-white/70' 
          : item.isDir ? 'bg-blue-50' : BgIcon({ file: item })
      )}>
        {item.isDir ? (
          <FolderOpen className={clsx('w-5 h-5', isSelected ? 'text-[#007aff] fill-[#deeeff]' : 'text-blue-500 fill-blue-100')} />
        ) : (
          <FileIcon file={item} size="md" selected={false} />
        )}
      </div>

      {/* Name & Badges */}
      <div className="w-full min-w-0 flex-1 flex flex-col justify-end pb-1">
        <div className="flex items-center gap-1.5 min-w-0 w-full flex-wrap">
          <p className={clsx(
            'text-xs font-semibold truncate min-w-0 flex-1',
            isSelected ? 'text-[#0062cc]' : 'text-gray-800'
          )}>
            {item.name}
          </p>
          {item.isGlobal && (
            <span className={clsx('text-[8px] px-1 py-0.5 rounded font-medium flex-shrink-0', isSelected ? 'bg-white/70 text-[#0062cc]' : 'bg-blue-100 text-blue-700')}>Global</span>
          )}
          {item.isSharedWithMe && (
            <span className={clsx('text-[8px] px-1 py-0.5 rounded font-medium flex-shrink-0', isSelected ? 'bg-white/70 text-green-700' : 'bg-green-100 text-green-700')}>Shared</span>
          )}
        </div>
      </div>

      {/* Bottom Details */}
      <div className={clsx(
        'w-full flex items-center justify-between text-[9px] font-medium',
        isSelected ? 'text-[#0062cc]/60' : 'text-gray-400'
      )}>
        <span>{formatBytes(item.size)}</span>
        <span>
          {item.modified && !isNaN(new Date(item.modified).getTime())
            ? formatDistanceToNow(new Date(item.modified), { addSuffix: true })
            : '—'}
        </span>
      </div>
    </div>
  )
}
