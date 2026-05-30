'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FolderOpen, Share2, Users, HardDrive, ArrowRight, Clock, File } from 'lucide-react'
import { resourcesApi, usageApi, sharesApi, formatBytes, getUser } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [usage, setUsage] = useState<any>(null)
  const [recentFiles, setRecentFiles] = useState<any[]>([])
  const [shareCount, setShareCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const u = getUser()
    setUser(u)
    Promise.all([
      usageApi.get('/').catch(() => null),
      resourcesApi.get('/').catch(() => null),
      sharesApi.list().catch(() => null),
    ]).then(([usageRes, filesRes, sharesRes]) => {
      if (usageRes) setUsage(usageRes.data)
      if (filesRes?.data?.items) {
        const sorted = [...filesRes.data.items]
          .sort((a: any, b: any) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
          .slice(0, 5)
        setRecentFiles(sorted)
      }
      if (sharesRes?.data) setShareCount(sharesRes.data.length)
    }).finally(() => setLoading(false))
  }, [])

  const usedPct = usage?.total > 0 ? Math.round((usage.used / usage.total) * 100) : 0

  const stats = [
    {
      label: 'Total Files',
      value: recentFiles.length > 0 ? '—' : '0',
      icon: File,
      color: 'from-blue-500 to-indigo-500',
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      href: '/dashboard/files',
    },
    {
      label: 'Shared Links',
      value: shareCount,
      icon: Share2,
      color: 'from-indigo-500 to-purple-500',
      bg: 'bg-indigo-50',
      text: 'text-indigo-600',
      href: '/dashboard/shares',
    },
    {
      label: 'Storage Used',
      value: usage ? formatBytes(usage.used) : '—',
      icon: HardDrive,
      color: 'from-sky-500 to-blue-500',
      bg: 'bg-sky-50',
      text: 'text-sky-600',
      href: '/dashboard/files',
    },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Welcome */}
      <div className="mb-8 animate-slide-up">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Welcome back, {user?.username} 👋
        </h1>
        <p className="text-gray-500 text-sm">Here's what's happening with your files.</p>
      </div>

      {/* Profile completion card — inspired by UBverse */}
      {!loading && (
        <div className="mb-6 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 flex items-center gap-5 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-white border border-blue-100 flex items-center justify-center shadow-card flex-shrink-0">
            <FolderOpen className="w-7 h-7 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 mb-0.5">Your file storage is ready.</p>
            <p className="text-sm text-gray-500">
              Upload files, create folders and share with anyone using secure links.
            </p>
          </div>
          <Link
            href="/dashboard/files"
            className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-blue transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            Browse Files <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s, i) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-soft transition-all duration-200 hover:-translate-y-0.5 group animate-slide-up"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.text}`} />
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-0.5">{s.value}</p>
            <p className="text-sm text-gray-500">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent files */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Recent Files
            </h2>
            <Link href="/dashboard/files" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              View all →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : recentFiles.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No files yet. Start uploading!</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentFiles.map((f: any) => (
                <Link
                  key={f.path}
                  href={`/dashboard/files?path=${encodeURIComponent(f.path)}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    {f.isDir
                      ? <FolderOpen className="w-4 h-4 text-blue-500" />
                      : <File className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                    <p className="text-xs text-gray-400">{f.isDir ? 'Folder' : formatBytes(f.size)}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatDistanceToNow(new Date(f.modified), { addSuffix: true })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Storage card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <HardDrive className="w-4 h-4 text-gray-400" />
            Storage
          </h2>
          {usage ? (
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">Used</span>
                <span className="font-semibold text-gray-900">{usedPct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                <div
                  className={`h-2 rounded-full transition-all ${usedPct > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(usedPct, 100)}%` }}
                />
              </div>
              <div className="space-y-2 mt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Used</span>
                  <span className="font-medium text-gray-700">{formatBytes(usage.used)}</span>
                </div>
                {usage.total > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total</span>
                    <span className="font-medium text-gray-700">{formatBytes(usage.total)}</span>
                  </div>
                )}
                {usage.total > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Free</span>
                    <span className="font-medium text-green-600">{formatBytes(usage.total - usage.used)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
