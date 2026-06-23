'use client'
import { Suspense } from 'react'
import { RefreshCw } from 'lucide-react'
import FilesPageContent from '@/components/files/FilesPageContent'

export default function FilesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    }>
      <FilesPageContent />
    </Suspense>
  )
}
