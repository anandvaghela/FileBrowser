'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Download, FolderOpen, File, Lock, Eye, EyeOff, FileText } from 'lucide-react'
import axios from 'axios'
import { formatBytes } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

// Separate public axios instance — no auth interceptor so 401 won't trigger logout
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://filebrowser-server.onrender.com'
const publicApi = axios.create({ baseURL: `${API_URL}/api`, timeout: 30000 })

const publicSharesApi = {
  getPublic: (hash: string, password?: string) =>
    publicApi.get(`/public/share/${hash}`, { params: password ? { password } : {} }),
  downloadUrl: (hash: string, password?: string) =>
    `${API_URL}/api/public/dl/${hash}${password ? `?password=${encodeURIComponent(password)}` : ''}`,
}

function FileIcon({ file }: { file: any }) {
  if (file.isDir) return <FolderOpen className="w-4 h-4 text-primary-500" />
  const ext = (file.extension || file.name?.split('.').pop() || '').toLowerCase().replace(/^\./, '')
  const isTxtOrPdf = file.type === 'text' || file.type === 'pdf' || ['txt', 'html', 'css', 'json', 'js', 'ts', 'tsx', 'pdf'].includes(ext)

  if (isTxtOrPdf) return <FileText className="w-4 h-4 text-amber-500" />
  return <File className="w-4 h-4 text-gray-400" />
}

export default function SharePage() {
  const params = useParams()
  const hash = params.hash as string
  const [state, setState] = useState<'loading' | 'password' | 'ready' | 'error' | 'expired'>('loading')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [info, setInfo] = useState<any>(null)
  const [error, setError] = useState('')

  const load = async (pwd?: string) => {
    setState('loading')
    try {
      const res = await publicSharesApi.getPublic(hash, pwd)
      setInfo(res.data)
      setState('ready')
    } catch (err: any) {
      const status = err.response?.status
      if (status === 410) { setState('expired'); return }
      if (status === 401) { setState('password'); return }
      if (status === 403) { setError('Wrong password'); setState('password'); return }
      setError(err.response?.data?.error || 'Not found')
      setState('error')
    }
  }

  useEffect(() => { load() }, [hash])

  const download = () => {
    const url = publicSharesApi.downloadUrl(hash, password || undefined)
    const a = document.createElement('a')
    a.href = url
    a.click()
  }

  return (
    <div className="min-h-screen bg-[#fcfcfd] flex items-center justify-center p-4">
      {/* Background patterns */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-primary-100/30 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-blue-100/30 blur-3xl" />
      </div>

      <div className="relative z-10 bg-white rounded-xl shadow-soft w-full max-w-md overflow-hidden border border-[#e8eaed] animate-slide-up">
        {/* Header Branding */}
        <div className="px-8 py-5 border-b border-[#e8eaed] bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary-500" />
            <span className="font-bold text-gray-800 text-[14px]">FileBrowser</span>
          </div>
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Public Share</span>
        </div>

        <div className="p-8">
          {state === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
              <p className="text-gray-400 text-xs">Loading shared files…</p>
            </div>
          )}

          {state === 'expired' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-4 border border-amber-100">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-[15px] font-bold text-gray-800 mb-1.5">Link Expired</h2>
              <p className="text-xs text-gray-400 leading-relaxed">This share link has expired and is no longer available.</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-4 border border-red-100">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-[15px] font-bold text-gray-800 mb-1.5">Not Found</h2>
              <p className="text-xs text-gray-400 leading-relaxed">{error || 'This share link does not exist.'}</p>
            </div>
          )}

          {state === 'password' && (
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center border border-primary-100">
                <Lock className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-gray-800 mb-1">Password Required</h2>
                <p className="text-xs text-gray-400 leading-relaxed">This file is password protected. Enter the password to access it.</p>
              </div>
              {error && <p className="text-red-500 text-xs font-semibold">{error}</p>}
              <div className="space-y-4">
                <div className="relative">
                  <Input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && load(password)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 bottom-3 text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  onClick={() => load(password)}
                  className="w-full"
                >
                  Access Files
                </Button>
              </div>
            </div>
          )}

          {state === 'ready' && info && (
            <div className="space-y-6">
              {/* File/dir info */}
              <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl border border-[#e8eaed]">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${info.isDir ? 'bg-primary-50 border border-primary-100' : 'bg-white border border-[#e8eaed]'}`}>
                  {info.isDir ? <FolderOpen className="w-6 h-6 text-primary-500" /> : <File className="w-6 h-6 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-gray-800 text-[15px] truncate">{info.name}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {info.isDir
                      ? `${info.numDirs || 0} folders · ${info.numFiles || 0} files`
                      : formatBytes(info.size)
                    }
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Modified {formatDistanceToNow(new Date(info.modified), { addSuffix: true })}
                  </p>
                </div>
              </div>

              {/* Directory listing */}
              {info.isDir && info.items && info.items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Contents</p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 border border-[#e8eaed] rounded-xl p-2 bg-gray-50/50">
                    {info.items.slice(0, 20).map((item: any) => (
                      <div key={item.path} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-[#e8eaed] hover:border-gray-300 transition-colors">
                        <div className="w-7 h-7 rounded bg-gray-50 flex items-center justify-center flex-shrink-0 border border-[#e8eaed]">
                          <FileIcon file={item} />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 truncate flex-1">{item.name}</span>
                        {!item.isDir && <span className="text-[10px] text-gray-400 flex-shrink-0 font-mono">{formatBytes(item.size)}</span>}
                      </div>
                    ))}
                    {info.items.length > 20 && (
                      <p className="text-[10px] text-gray-400 text-center py-2">+{info.items.length - 20} more files</p>
                    )}
                  </div>
                </div>
              )}

              {/* Download button */}
              <Button
                onClick={download}
                className="w-full py-3 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                {info.isDir ? 'Download as ZIP' : 'Download File'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
