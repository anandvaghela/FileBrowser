import { FolderOpen, File, FileText } from 'lucide-react'
import { clsx } from 'clsx'
import { FileItem } from '@/types'

export function FileIcon({ file, size = 'md', selected = false }: { file: FileItem; size?: 'sm' | 'md' | 'lg'; selected?: boolean }) {
  const s = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  if (file.isDir) return <FolderOpen className={clsx(s, selected ? 'text-white fill-white/20' : 'text-blue-500 fill-blue-100')} />
  
  const ext = (file.extension || file.name?.split('.').pop() || '').toLowerCase().replace(/^\./, '')
  const isTxtOrPdf = file.type === 'text' || file.type === 'pdf' || ['txt', 'html', 'css', 'json', 'js', 'ts', 'tsx', 'pdf'].includes(ext)
  
  const colorClass = selected 
    ? 'text-white' 
    : isTxtOrPdf 
    ? 'text-orange-500' 
    : 'text-gray-400'
  
  if (isTxtOrPdf) return <FileText className={clsx(s, colorClass)} />
  return <File className={clsx(s, colorClass)} />
}

export function BgIcon({ file }: { file: FileItem }) {
  if (file.isDir) return 'bg-blue-50'
  const ext = (file.extension || file.name?.split('.').pop() || '').toLowerCase().replace(/^\./, '')
  const isTxtOrPdf = file.type === 'text' || file.type === 'pdf' || ['txt', 'html', 'css', 'json', 'js', 'ts', 'tsx', 'pdf'].includes(ext)

  if (isTxtOrPdf) return 'bg-orange-50'
  return 'bg-gray-50'
}
