'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SharesRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/settings?tab=shares')
  }, [router])
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )
}

