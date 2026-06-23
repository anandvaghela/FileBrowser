'use client'
import { useEffect, useState } from 'react'
import { settingsApi } from '@/lib/api'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'

const DEFAULT_PERM = {
  admin: false, execute: false, create: true,
  rename: true, modify: true, delete: true, share: true, download: true,
}

interface GlobalSettingsProps {
  currentUser: any
}

export default function GlobalSettings({ currentUser }: GlobalSettingsProps) {
  const [globalSettings, setGlobalSettings] = useState<any>(null)
  const [globalLoading, setGlobalLoading] = useState(true)
  const [savingGlobal, setSavingGlobal] = useState(false)

  const loadGlobalSettings = async () => {
    setGlobalLoading(true)
    try {
      const res = await settingsApi.get()
      setGlobalSettings(res.data)
    } catch {
      toast.error('Failed to load global settings')
    } finally {
      setGlobalLoading(false)
    }
  }

  useEffect(() => {
    loadGlobalSettings()
  }, [])

  const updateGlobalSetting = (key: string, val: any) => {
    setGlobalSettings((prev: any) => ({
      ...prev,
      [key]: val
    }))
  }

  const updateBrandingSetting = (key: string, val: any) => {
    setGlobalSettings((prev: any) => ({
      ...prev,
      branding: {
        ...(prev?.branding || {}),
        [key]: val
      }
    }))
  }

  const updateDefaultPermSetting = (key: string, val: boolean) => {
    setGlobalSettings((prev: any) => {
      const branding = prev?.branding || {}
      const defaultPerm = branding.defaultPerm || DEFAULT_PERM
      return {
        ...prev,
        branding: {
          ...branding,
          defaultPerm: {
            ...defaultPerm,
            [key]: val
          }
        }
      }
    })
  }

  const handleUpdateGlobal = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingGlobal(true)
    try {
      await settingsApi.update(globalSettings)
      toast.success('Global settings updated')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save global settings')
    } finally {
      setSavingGlobal(false)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
      {/* Main Global Config Form */}
      <div className="md:col-span-2 space-y-6">
        <div className="bg-white rounded-xl border border-[#ebebeb] p-6">
          {globalLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-10 bg-gray-100 rounded-lg" />
              <div className="h-10 bg-gray-100 rounded-lg" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
          ) : (
            <form onSubmit={handleUpdateGlobal} className="space-y-6">
              {/* Global Settings */}
              <div className="space-y-4">
                <h2 className="text-[15px] font-bold text-[#333333]">
                  Global Settings
                </h2>

                <div className="space-y-3.5">
                  <Checkbox
                    label="Allow users to signup"
                    checked={globalSettings?.signup || false}
                    onChange={checked => updateGlobalSetting('signup', checked)}
                  />

                  <Checkbox
                    label="Auto create user home dir while adding new user"
                    checked={globalSettings?.createUserDir || false}
                    onChange={checked => updateGlobalSetting('createUserDir', checked)}
                  />
                </div>

                <div className="pt-2">
                  <Input
                    label="Base path for user home directories"
                    value={globalSettings?.userHomeBasePath || '/users'}
                    onChange={e => updateGlobalSetting('userHomeBasePath', e.target.value)}
                    placeholder="/users"
                  />
                </div>
              </div>

              {/* Rules section */}
              <div className="border-t border-[#f0f0f0] pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-bold text-[#333333]">Rules</h2>
                  <Button type="button" size="sm" className="px-4 py-1.5 text-xs">New</Button>
                </div>
                <p className="text-xs text-[#929292] leading-relaxed">
                  This is a global set of allow and disallow rules. They apply to every user. You can define specific rules on each user's settings to override these ones.
                </p>
              </div>

              {/* Execute on shell section */}
              <div className="border-t border-[#f0f0f0] pt-5 space-y-3">
                <h2 className="text-[15px] font-bold text-[#333333]">Execute on shell</h2>
                <p className="text-xs text-[#929292] leading-relaxed">
                  By default, File Browser executes the commands by calling their binaries directly. If you wish to run them on a shell instead (such as Bash or PowerShell), you can define it here with the required arguments and flags. If set, the command you execute will be appended as an argument. This applies to both user commands and event hooks.
                </p>
                <Input
                  value={globalSettings?.shell || ''}
                  onChange={e => updateGlobalSetting('shell', e.target.value)}
                  placeholder="/users"
                />
              </div>

              {/* Branding section */}
              <div className="border-t border-[#f0f0f0] pt-5 space-y-4">
                <h2 className="text-[15px] font-bold text-[#333333]">Branding</h2>
                <p className="text-xs text-[#929292] leading-relaxed">
                  You can customize how your File Browser instance looks and feels by changing its name, replacing the logo, adding custom styles and even disable external links to GitHub. For more information about custom branding, please check out the documentation.
                </p>

                <div className="space-y-3 pt-2">
                  <Checkbox
                    label="Disable external links (except documentation)"
                    checked={globalSettings?.branding?.disableExternalLinks || false}
                    onChange={checked => updateBrandingSetting('disableExternalLinks', checked)}
                  />

                  <Checkbox
                    label="Disable used disk percentage graph"
                    checked={globalSettings?.branding?.disableDiskGraph || false}
                    onChange={checked => updateBrandingSetting('disableDiskGraph', checked)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <Select
                    label="Theme"
                    value={globalSettings?.branding?.theme || 'system'}
                    onChange={e => updateBrandingSetting('theme', e.target.value)}
                    options={[
                      { value: 'system', label: 'System default' },
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' }
                    ]}
                  />

                  <Input
                    label="Instance Name"
                    value={globalSettings?.branding?.name || ''}
                    onChange={e => updateBrandingSetting('name', e.target.value)}
                    placeholder="FileBrowser"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#f0f0f0] flex justify-end">
                <Button
                  type="submit"
                  loading={savingGlobal}
                >
                  UPDATE
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* User Default Settings column */}
      <div className="bg-white rounded-xl border border-[#ebebeb] p-6 h-fit space-y-6">
        <div>
          <h2 className="text-[15px] font-bold text-[#333333] mb-2">
            User default settings
          </h2>
          <p className="text-xs text-[#929292]">These are the default settings for new users.</p>
        </div>

        {globalLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-6 bg-gray-100 rounded-lg" />
            <div className="h-6 bg-gray-100 rounded-lg" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Scope"
                variant="grey"
                value={globalSettings?.branding?.defaultScope || '.'}
                onChange={e => updateBrandingSetting('defaultScope', e.target.value)}
                placeholder="Scope here"
              />
              <Select
                label="Language"
                variant="grey"
                value={globalSettings?.branding?.defaultLanguage || 'en'}
                onChange={e => updateBrandingSetting('defaultLanguage', e.target.value)}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'es', label: 'Español' },
                  { value: 'zh-cn', label: '简体中文' }
                ]}
              />
            </div>

            {/* Permissions default */}
            <div className="space-y-3 pt-3 border-t border-[#f0f0f0]">
              <div>
                <h3 className="text-sm font-bold text-[#333333] mb-1">Permission</h3>
                <p className="text-xs text-[#929292]">You can set user to be an administrator</p>
              </div>

              <div className="space-y-2.5">
                {[
                  { key: 'admin', label: 'Administrator' },
                  { key: 'create', label: 'Create files & directories' },
                  { key: 'delete', label: 'Delete files & directories' },
                  { key: 'download', label: 'Download' },
                  { key: 'modify', label: 'Edit files' },
                  { key: 'execute', label: 'Execute commands' },
                  { key: 'rename', label: 'Rename or move files and directories' },
                  { key: 'share', label: 'Share files' }
                ].map(p => {
                  const permState = globalSettings?.branding?.defaultPerm || DEFAULT_PERM
                  const checked = !!permState[p.key as keyof typeof permState]
                  return (
                    <Checkbox
                      key={p.key}
                      label={p.label}
                      checked={checked}
                      onChange={val => updateDefaultPermSetting(p.key, val)}
                    />
                  )
                })}
              </div>
            </div>

            {/* Commands default */}
            <div className="space-y-3 pt-3 border-t border-[#f0f0f0]">
              <div>
                <h3 className="text-sm font-bold text-[#333333] mb-1">Commands</h3>
                <p className="text-xs text-[#929292]">A space separated list with the available commands for this user. Example: git svn hg.</p>
              </div>
              <Input
                variant="grey"
                value={globalSettings?.branding?.defaultCommands || ''}
                onChange={e => updateBrandingSetting('defaultCommands', e.target.value)}
                placeholder="Text here"
              />
            </div>

            <div className="pt-2 border-t border-[#f0f0f0] flex justify-end">
              <Button
                onClick={handleUpdateGlobal}
                loading={savingGlobal}
                size="sm"
              >
                UPDATE
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
