import { ButtonHTMLAttributes, ReactNode } from 'react'
import { clsx } from 'clsx'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
}

export default function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-bold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none select-none focus:outline-none rounded-full cursor-pointer whitespace-nowrap'

  const variants: Record<string, string> = {
    primary:   'bg-[#007aff] hover:bg-[#0065d4] text-white border border-[#007aff] hover:border-[#0065d4]',
    secondary: 'bg-[#f6f6f6] hover:bg-[#ebebeb] text-[#555555] border border-[#ebebeb]',
    danger:    'bg-red-500 hover:bg-red-600 text-white border border-red-500',
    outline:   'border border-[#007aff] text-[#007aff] hover:bg-[#deeeff] bg-transparent',
    ghost:     'hover:bg-[#f6f6f6] text-[#555555] border border-transparent',
  }

  const sizes: Record<string, string> = {
    sm:   'px-5 py-2 text-[14px] gap-1.5 min-h-[38px]',
    md:   'px-6 py-2.5 text-[15px] gap-2 min-h-[44px]',
    lg:   'px-8 py-3 text-[16px] gap-2 min-h-[50px]',
    icon: 'p-2.5',
  }

  return (
    <button
      disabled={disabled || loading}
      className={clsx(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && (
        <span className={clsx(
          'border-2 border-current/30 border-t-current rounded-full animate-spin flex-shrink-0',
          size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4',
        )} />
      )}
      {!loading && icon && iconPosition === 'left' && (
        <span className="flex items-center flex-shrink-0">{icon}</span>
      )}
      {children && <span>{children}</span>}
      {!loading && icon && iconPosition === 'right' && (
        <span className="flex items-center flex-shrink-0">{icon}</span>
      )}
    </button>
  )
}
