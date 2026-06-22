'use client'
import { useEffect, useState } from 'react'
import { X, Download, Trash2, Share2, Edit2, ZoomIn, ZoomOut, RotateCcw, ExternalLink, Save } from 'lucide-react'
import { clsx } from 'clsx'
import { rawUrl, previewUrl, formatBytes, resourcesApi, getUser, sharedResourcesApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import Button from '@/components/ui/Button'

export default function FilePreviewModal({
  file, onClose, onDownload, onDelete, onShare, onRename, isSharedContext
}: {
  file: any
  onClose: () => void
  onDownload: () => void
  onDelete?: () => void
  onShare?: () => void
  onRename?: () => void
  isSharedContext?: boolean
}) {
  const [textContent, setTextContent] = useState<string | null>(null)
  const [originalContent, setOriginalContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    setUser(getUser())
  }, [])

  const handleSave = async () => {
    if (textContent === null) return
    setSaving(true)
    try {
      if (isSharedContext) {
        await sharedResourcesApi.updateFile(file.path, textContent)
      } else {
        await resourcesApi.updateFile(file.path, textContent)
      }
      toast.success('File saved successfully')
      setOriginalContent(textContent)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save file')
    } finally {
      setSaving(false)
    }
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('fb_token') : ''
  const isImage = file.type === 'image'
  const isVideo = file.type === 'video'
  const isAudio = file.type === 'audio'
  const isPdf = file.type === 'pdf'
  const isText = file.type === 'text'

  const ext = file.name?.split('.').pop()?.toLowerCase() || ''
  const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'csv'].includes(ext)
  // For office & pdf fallback: Google Docs Viewer needs a publicly accessible URL — we pass the raw URL
  const rawFileUrl = rawUrl(file.path)
  const rawDownloadUrl = rawUrl(file.path, true)

  useEffect(() => {
    if (isText) {
      setLoading(true)
      fetch(rawUrl(file.path), { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.text())
        .then(t => {
          setTextContent(t)
          setOriginalContent(t)
        })
        .catch(() => {
          setTextContent('Failed to load file content.')
          setOriginalContent('Failed to load file content.')
        })
        .finally(() => setLoading(false))
    }
  }, [file.path, isText, token])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4 animate-fade-in">
      <div className="bg-white sm:rounded-xl shadow-modal w-full sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-slide-up border-t sm:border border-[#e8eaed] rounded-t-2xl sm:rounded-xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[#e8eaed] flex-shrink-0">
          <div className="flex items-start justify-between w-full sm:w-auto min-w-0 gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-gray-800 text-[15px] truncate" title={file.name}>{file.name}</h2>
              <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
                {formatBytes(file.size)} · Modified {formatDistanceToNow(new Date(file.modified), { addSuffix: true })}
              </p>
            </div>
            {/* Close button on mobile */}
            <button onClick={onClose} className="sm:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-start sm:justify-end w-full sm:w-auto">
            {isImage && (
              <>
                <button onClick={() => setZoom(z => Math.min(z + 0.25, 3))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                  title="Zoom In">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                  title="Zoom Out">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button onClick={() => setZoom(1)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                  title="Reset Zoom">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </>
            )}

            {isText && user?.perm?.modify && textContent !== originalContent && textContent !== null && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-1.5 rounded-lg hover:bg-green-50 text-green-500 hover:text-green-600 transition-all focus:outline-none border border-green-200 bg-green-50/50 flex items-center gap-1 px-2.5 animate-pulse"
                title="Save Changes"
              >
                <Save className="w-4 h-4" />
                <span className="text-xs font-semibold">Save</span>
              </button>
            )}
            {onShare && (
              <button onClick={onShare} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none" title="Share">
                <Share2 className="w-4 h-4" />
              </button>
            )}
            {onRename && (
              <button onClick={onRename} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none" title="Rename">
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onDownload} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none" title="Download">
              <Download className="w-4 h-4" />
            </button>
            <a href={rawDownloadUrl} target="_blank" rel="noreferrer"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none" title="Open Original">
              <ExternalLink className="w-4 h-4" />
            </a>
            {onDelete && (
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors focus:outline-none" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {/* Close button on desktop */}
            <button onClick={onClose} className="hidden sm:block p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors ml-1 focus:outline-none" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 rounded-b-xl min-h-0">
          {isImage && (
            <div className="overflow-auto w-full h-full flex items-center justify-center p-6">
              <img
                src={previewUrl(file.path, 'big')}
                alt={file.name}
                className="object-contain transition-transform duration-200 rounded-lg shadow-soft"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center', maxWidth: '100%', maxHeight: '60vh' }}
              />
            </div>
          )}

          {isVideo && (
            <div className="w-full p-6">
              <video
                controls
                className="w-full max-h-[60vh] rounded-lg bg-black shadow-soft"
                src={rawUrl(file.path)}
              >
                Your browser does not support video playback.
              </video>
            </div>
          )}

          {isAudio && (
            <div className="p-8">
              <div className="bg-white rounded-xl shadow-soft border border-[#e8eaed] p-8 text-center max-w-sm">
                <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-800 mb-4 truncate">{file.name}</p>
                <audio controls className="w-full" src={rawUrl(file.path)}>
                  Your browser does not support audio playback.
                </audio>
              </div>
            </div>
          )}

          {isPdf && (
            <div className="w-full h-full flex flex-col p-4">
              <iframe
                src={rawFileUrl}
                className="flex-1 rounded-lg border border-[#e8eaed] min-h-[60vh] bg-white"
                title={file.name}
              />
            </div>
          )}

          {isOffice && (
            <div className="w-full h-full flex flex-col p-4">
              <iframe
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(rawFileUrl)}&embedded=true`}
                className="flex-1 rounded-lg border border-[#e8eaed] min-h-[60vh] bg-white"
                title={file.name}
              />
            </div>
          )}

          {isText && (
            <div className="w-full h-full p-4 flex flex-col min-h-[350px]">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                </div>
              ) : user?.perm?.modify ? (
                <textarea
                  value={textContent || ''}
                  onChange={e => setTextContent(e.target.value)}
                  className="w-full flex-1 min-h-[300px] bg-white rounded-lg border border-[#e8eaed] p-4 text-xs text-gray-700 font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 resize-y text-left"
                  autoFocus
                />
              ) : (
                <pre className="bg-white rounded-lg border border-[#e8eaed] p-4 text-xs text-gray-700 overflow-auto max-h-[60vh] font-mono leading-relaxed whitespace-pre-wrap break-words text-left w-full">
                  {textContent}
                </pre>
              )}
            </div>
          )}

          {!isImage && !isVideo && !isAudio && !isPdf && !isText && !isOffice && (
            <div className="text-center p-12">
              <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4 border border-[#e8eaed]">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-gray-700 mb-1">No preview available</p>
              <p className="text-xs text-gray-400 mb-5">{file.mimeType || 'Binary file'}</p>
              <Button
                onClick={onDownload}
              >
                <Download className="w-4 h-4 mr-1.5" />
                Download File
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
