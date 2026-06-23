export interface UserPermission {
  admin: boolean
  modify: boolean
  delete: boolean
  create: boolean
  share: boolean
  download: boolean
  rename: boolean
}

export interface User {
  id: number
  username: string
  scope: string
  perm: UserPermission
}

export interface FileItem {
  path: string
  name: string
  size: number
  extension?: string
  modified?: string | null
  isDir: boolean
  isSymlink?: boolean
  type?: 'directory' | 'text' | 'pdf' | 'blob' | (string & {})
  mimeType?: string
  isGlobal?: boolean
  sharedBy?: string
  canWrite?: boolean
  isSharedWithMe?: boolean
  created?: string | null
  isVirtual?: boolean
  owner?: string
}

export interface UserShare {
  id: string
  owner_id: number
  shared_with: number
  can_write: number | boolean
  username?: string
  item_path?: string
}

export interface PublicShare {
  id: string
  path: string
  hash: string
  expire: number | null
  password?: string
  user_id: number
}

export interface SystemSettings {
  id: number
  signup: boolean
  create_user_dir: boolean
  user_home_base: string
  theme?: string
}
