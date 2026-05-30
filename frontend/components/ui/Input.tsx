import { InputHTMLAttributes, ReactNode, forwardRef } from 'react'
import { clsx } from 'clsx'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  error?: string
  prefixIcon?: ReactNode
  suffixIcon?: ReactNode
  variant?: 'white' | 'grey'
}

const Input = forwardRef<HTMLInputElement, InputProps>((
  { className, label, size = 'md', error, prefixIcon, suffixIcon, variant = 'white', ...props },
  ref
) => {
  const sizes: Record<string, string> = {
    sm: 'px-4 py-2 text-[14px] h-[42px]',
    md: 'px-4 py-3 text-[15px] h-[50px]',
    lg: 'px-4 py-3.5 text-[16px] h-[54px]',
  }

  return (
    <div className={className}>
      {label && (
        <label className="block text-[15px] text-[#555555] mb-2 font-medium">{label}</label>
      )}
      <div className="relative">
        {prefixIcon && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center text-[#929292] pointer-events-none">
            {prefixIcon}
          </span>
        )}
        <input
          ref={ref}
          className={clsx(
            'w-full rounded-xl text-[#333333] placeholder-[#929292]',
            variant === 'white' ? 'bg-white border border-[#ebebeb]' : 'bg-[#f6f6f6] border border-transparent',
            'focus:outline-none focus:border-[#007aff] transition-all duration-200',
            sizes[size],
            prefixIcon && 'pl-11',
            suffixIcon && 'pr-11',
            error && 'border-red-400 focus:border-red-500',
          )}
          {...props}
        />
        {suffixIcon && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
            {suffixIcon}
          </span>
        )}
      </div>
      {error && <p className="text-[13px] text-red-500 mt-1">{error}</p>}
    </div>
  )
})

Input.displayName = 'Input'
export default Input
