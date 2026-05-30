'use client'
import { useEffect, useState } from 'react'
import { X, Download, Trash2, Share2, Edit2, ZoomIn, ZoomOut, RotateCcw, ExternalLink } from 'lucide-react'
import { rawUrl, previewUrl, formatBytes } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import Button from '@/components/ui/Button'

export default function FilePreviewModal({
  file, onClose, onDownload, onDelete, onShare, onRename
}: {
  file: any
  onClose: () => void
  onDownload: () => void
  onDelete?: () => void
  onShare?: () => void
  onRename?: () => void
}) {
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [zoom, setZoom] = useState(1)

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('fb_token') : ''
  const isImage = file.type === 'image'
  const isVideo = file.type === 'video'
  const isAudio = file.type === 'audio'
  const isPdf = file.type === 'pdf'
  const isText = file.type === 'text'

  useEffect(() => {
    if (isText) {
      setLoading(true)
      fetch(rawUrl(file.path), { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.text())
        .then(t => setTextContent(t))
        .catch(() => setTextContent('Failed to load file content.'))
        .finally(() => setLoading(false))
    }
  }, [file.path, isText, token])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-4xl max-h-[90vh] flex flex-col animate-slide-up border border-[#e8eaed]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#e8eaed] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-800 text-[15px] truncate">{file.name}</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {formatBytes(file.size)} · Modified {formatDistanceToNow(new Date(file.modified), { addSuffix: true })}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isImage && (
              <>
                <button onClick={() => setZoom(z => Math.min(z + 0.25, 3))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button onClick={() => setZoom(1)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </>
            )}
            {onShare && (
              <button onClick={onShare} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
                <Share2 className="w-4 h-4" />
              </button>
            )}
            {onRename && (
              <button onClick={onRename} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onDownload} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
              <Download className="w-4 h-4" />
            </button>
            <a href={rawUrl(file.path)} target="_blank" rel="noreferrer"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
              <ExternalLink className="w-4 h-4" />
            </a>
            {onDelete && (
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors focus:outline-none">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors ml-1 focus:outline-none">
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
                src={rawUrl(file.path)}
                className="flex-1 rounded-lg border border-[#e8eaed] min-h-[50vh] bg-white"
                title={file.name}
              />
            </div>
          )}

          {isText && (
            <div className="w-full h-full p-4">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                </div>
              ) : (
                <pre className="bg-white rounded-lg border border-[#e8eaed] p-4 text-xs text-gray-700 overflow-auto max-h-[60vh] font-mono leading-relaxed whitespace-pre-wrap break-words">
                  {textContent}
                </pre>
              )}
            </div>
          )}

          {!isImage && !isVideo && !isAudio && !isPdf && !isText && (
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
