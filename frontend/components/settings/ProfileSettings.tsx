'use client'
import { useEffect, useState } from 'react'
import { usersApi } from '@/lib/api'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'

import { User } from '@/types'

interface ProfileSettingsProps {
  readonly currentUser: User
}

export default function ProfileSettings({ currentUser }: ProfileSettingsProps) {
  const [profileLoading, setProfileLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [hideDotfiles, setHideDotfiles] = useState(false)
  const [singleClick, setSingleClick] = useState(false)
  const [redirectAfterCopy, setRedirectAfterCopy] = useState(true)
  const [dateFormat, setDateFormat] = useState(false)
  const [locale, setLocale] = useState('en')
  const [editorTheme, setEditorTheme] = useState('chrome')
  // Password Change
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [currentPass, setCurrentPass] = useState('')

  const loadProfile = async () => {
    if (!currentUser) return
    setProfileLoading(true)
    try {
      const res = await usersApi.get(currentUser.id)
      const u = res.data
      setHideDotfiles(!!u.hideDotfiles)
      setSingleClick(!!u.singleClick)
      setDateFormat(!!u.dateFormat)
      setLocale(u.locale || 'en')
      // Custom states saved on localStorage or just form state
      setEditorTheme(localStorage.getItem('fb_editor_theme') || 'chrome')
      setRedirectAfterCopy(localStorage.getItem('fb_redirect_copy') !== 'false')
    } catch {
      toast.error('Failed to load profile')
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [currentUser])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const payload = {
        hideDotfiles,
        singleClick,
        dateFormat,
        locale,
      }
      const res = await usersApi.update(currentUser.id, payload)
      // Update stored user details
      localStorage.setItem('fb_user', JSON.stringify(res.data))
      localStorage.setItem('fb_editor_theme', editorTheme)
      localStorage.setItem('fb_redirect_copy', String(redirectAfterCopy))
      toast.success('Profile settings updated')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update profile settings')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPass) { toast.error('New password is required'); return }
    if (newPass !== confirmPass) { toast.error('Passwords do not match'); return }
    try {
      await usersApi.update(currentUser.id, {
        password: newPass,
        currentPassword: currentPass
      })
      toast.success('Password changed successfully')
      setNewPass('')
      setConfirmPass('')
      setCurrentPass('')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update password')
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Profile Preferences */}
      <div className="bg-white rounded-xl border border-[#ebebeb] p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-bold text-[#333333]">
            Profile Settings
          </h2>
          <Button
            type="submit"
            form="profile-form"
            loading={savingProfile}
            size="md"
          >
            Update
          </Button>
        </div>
        {profileLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 bg-gray-100 rounded-lg" />
            <div className="h-10 bg-gray-100 rounded-lg" />
            <div className="h-10 bg-gray-100 rounded-lg" />
          </div>
        ) : (
          <form id="profile-form" onSubmit={handleUpdateProfile} className="space-y-5">
            {/* Checkboxes */}
            <div className="space-y-3.5">
              <Checkbox
                label="Hide dotfiles"
                checked={hideDotfiles}
                onChange={setHideDotfiles}
              />

              <Checkbox
                label="Use single clicks to open files and directories"
                checked={singleClick}
                onChange={setSingleClick}
              />

              <Checkbox
                label="Redirect to destination after copy/move"
                checked={redirectAfterCopy}
                onChange={setRedirectAfterCopy}
              />

              <Checkbox
                label="Set exact date format"
                checked={dateFormat}
                onChange={setDateFormat}
              />
            </div>

            {/* Dropdowns */}
            <div className="space-y-4 pt-2">
              <Select
                label="Language"
                value={locale}
                onChange={e => setLocale(e.target.value)}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'zh-cn', label: '简体中文' },
                  { value: 'es', label: 'Español' },
                  { value: 'fr', label: 'Français' },
                ]}
              />

              <Select
                label="Ace editor theme"
                value={editorTheme}
                onChange={e => setEditorTheme(e.target.value)}
                options={[
                  { value: 'chrome', label: 'chrome' },
                  { value: 'tomorrow_night', label: 'tomorrow_night' },
                  { value: 'github', label: 'github' },
                  { value: 'monokai', label: 'monokai' },
                ]}
              />
            </div>
          </form>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-[#ebebeb] p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-bold text-[#333333]">
            Change Password
          </h2>
          <Button
            type="submit"
            form="password-form"
            size="md"
          >
            Update
          </Button>
        </div>
        <form id="password-form" onSubmit={handleUpdatePassword} className="space-y-4">
          <Input
            label="Your new password"
            type="password"
            value={newPass}
            onChange={e => setNewPass(e.target.value)}
            required
            placeholder="••••••••••••"
          />

          <Input
            label="Confirm your new password"
            type="password"
            value={confirmPass}
            onChange={e => setConfirmPass(e.target.value)}
            required
            placeholder="••••••••••••"
          />

          <Input
            label="Your Current Password"
            type="password"
            value={currentPass}
            onChange={e => setCurrentPass(e.target.value)}
            required
            placeholder="••••••••••••"
          />
        </form>
      </div>
    </div>
  )
}
