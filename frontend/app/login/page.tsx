'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
import { authApi, setToken } from '@/lib/api'
import Image from 'next/image'

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
    <div
      className="min-h-screen flex items-stretch bg-cover bg-bottom bg-no-repeat"
      style={{ backgroundImage: 'url(/images/BackgroundImage.png)' }}
    >
      <div className="flex w-full min-h-[calc(100vh-48px)]">
        {/* LEFT — aside panel */}
        <aside className="leftside-panel w-1/2 py-8 px-12 flex flex-col relative">
          {/* Logo */}
          <div>
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); router.push('/') }}
              className="inline-flex items-center no-underline cursor-pointer"
            >
              <Image
                src="/images/logo.svg"
                alt="FileBrowser"
                width={200}
                height={34}
                className="h-[30px] w-auto"
                priority
              />
            </a>
          </div>

          {/* Headline */}
          <div className="mt-16">
            <h1 className="text-[38px] font-extrabold text-[#1a1a1a] leading-[1.2] mb-3.5 tracking-tight">
              Your files,<br />everywhere.
            </h1>
            <p className="text-[15px] text-[#555555] leading-relaxed max-w-[340px]">
              Securely manage, share and organise all your files from one beautiful place.
            </p>
          </div>
        </aside>

        {/* RIGHT — form panel */}
        <main className="rightside-panel w-1/2 flex flex-col justify-between bg-white/[0.92] backdrop-blur-[16px] border-l border-[#ebebeb]">
          {/* Form area */}
          <div className="flex-1 flex flex-col justify-center py-10 px-10 lg:px-14 w-full">
            <form onSubmit={handleLogin}>
              {/* Username field */}
              <div className="mb-4">
                <label className="block text-sm text-[#333333] mb-2">
                  Enter your username
                </label>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                  className="w-full h-[46px] px-4 text-[15px] text-[#333333] bg-white border border-[#d9d9d9] rounded-lg outline-none transition-all duration-200 focus:border-[#007aff] placeholder:text-[#b0b0b0]"
                />
              </div>

              {/* Password field */}
              <div className="mb-4">
                <label className="block text-sm text-[#333333] mb-2">
                  Enter your password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full h-[46px] pl-4 pr-11 text-[15px] text-[#333333] bg-white border border-[#d9d9d9] rounded-lg outline-none transition-all duration-200 focus:border-[#007aff] placeholder:text-[#b0b0b0]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[#929292] p-1 flex items-center hover:text-[#555555] transition-colors"
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Forgot Password + Login row */}
              <div className="flex items-center justify-between mb-5 mt-1">
                <a
                  href="#"
                  className="text-sm text-[#007aff] underline underline-offset-2 font-medium cursor-pointer hover:text-[#0065d4] transition-colors"
                  onClick={e => { e.preventDefault(); toast('Contact your administrator.') }}
                >
                  Forgot Password?
                </a>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center px-10 h-[42px] text-sm font-semibold text-[#5a8cc5] bg-[#007aff]/[0.1] border-none rounded-full cursor-pointer min-w-[130px] transition-all duration-200 hover:bg-[#007aff] hover:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-[#4a7abf]/30 border-t-[#4a7abf] rounded-full animate-spin inline-block" />
                  ) : 'Login'}
                </button>
              </div>

              
            </form>
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between py-5 px-10 lg:px-14 border-t border-[#f0f0f0]">
            <span className="text-sm text-[#666666] font-medium">
              Don&apos;t have an account on FileBrowser yet?
            </span>
            <button
              onClick={() => toast('Contact your administrator to create an account.')}
              className="inline-flex items-center justify-center px-7 h-10 text-sm font-semibold text-white bg-[#007aff] border-none rounded-full cursor-pointer transition-colors duration-200 hover:bg-[#0065d4]"
            >
              Get Started
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
