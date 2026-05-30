'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Eye, EyeOff, FolderOpen } from 'lucide-react'
import { authApi, setToken } from '@/lib/api'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) { toast.error('Enter username and password'); return }
    setLoading(true)
    try {
      const res = await authApi.login(username, password)
      setToken(res.data.token, res.data.user)
      toast.success('Welcome back!')
      router.replace('/dashboard/files')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* LEFT — decorative blob panel */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-white flex-col justify-between p-12">
        {/* Animated blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-gradient-to-br from-[#007aff] via-indigo-400 to-purple-400 opacity-80 animate-blob blur-sm" />
          <div className="absolute bottom-20 left-24 w-72 h-72 rounded-full bg-gradient-to-br from-pink-300 via-purple-300 to-blue-300 opacity-60 animate-blob animation-delay-2000 blur-sm" />
          <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-gradient-to-tr from-indigo-300 to-cyan-200 opacity-40 animate-blob animation-delay-4000 blur-md" />
          <div className="absolute top-1/3 -left-10 w-48 h-48 rounded-full bg-gradient-to-br from-blue-200 to-indigo-200 opacity-50 animate-blob animation-delay-200 blur-sm" />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#007aff] via-indigo-500 to-purple-500 flex items-center justify-center">
            <FolderOpen className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-[#333333] tracking-tight">FileBrowser</span>
        </div>

        {/* Headline */}
        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-[#333333] leading-tight mb-3">
            Your files,<br />everywhere.
          </h1>
          <p className="text-[#555555] text-base leading-relaxed max-w-xs">
            Securely manage, share and organise all your files from one beautiful place.
          </p>
        </div>
      </div>

      {/* RIGHT — form panel */}
      <div className="flex-1 flex flex-col justify-between bg-white border-l border-[#f0f0f0]">
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-3 p-6 border-b border-[#f0f0f0]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#007aff] via-indigo-500 to-purple-500 flex items-center justify-center">
            <FolderOpen className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-[#333333]">FileBrowser</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-md animate-slide-up">
            <div className="mb-10">
              <h2 className="text-3xl font-bold text-[#333333] mb-2">Sign in</h2>
              <p className="text-[#929292]">Your gateway to all your files.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <Input
                label="Enter your username"
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                size="lg"
                autoFocus
              />

              <Input
                label="Enter your password"
                type={showPass ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                size="lg"
                suffixIcon={
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="text-[#929292] hover:text-[#555555] transition-colors focus:outline-none"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm text-[#929292]">Forgot password?</span>
                <Button type="submit" loading={loading} size="lg">
                  Login
                </Button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-4 py-2">
                <div className="flex-1 h-px bg-[#f0f0f0]" />
                <span className="text-xs text-[#929292]">Or</span>
                <div className="flex-1 h-px bg-[#f0f0f0]" />
              </div>
            </form>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex items-center justify-between px-8 py-6 border-t border-[#f0f0f0]">
          <p className="text-sm text-[#929292]">
            Don&apos;t have an account yet?
          </p>
          <Button
            onClick={() => toast('Contact your administrator to create an account.')}
            size="md"
          >
            Get Started
          </Button>
        </div>
      </div>
    </div>
  )
}
