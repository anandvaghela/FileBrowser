import { SelectHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  options: SelectOption[]
  error?: string
  variant?: 'white' | 'grey'
}

const Select = forwardRef<HTMLSelectElement, SelectProps>((
  { className, label, size = 'md', options, error, variant = 'white', ...props },
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
        <select
          ref={ref}
          className={clsx(
            'w-full rounded-xl text-[#333333] appearance-none cursor-pointer pr-10',
            variant === 'white' ? 'bg-white border border-[#ebebeb]' : 'bg-[#f6f6f6] border border-transparent',
            'focus:outline-none focus:border-[#007aff] transition-all duration-200',
            sizes[size],
            error && 'border-red-400',
          )}
          {...props}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#929292]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </span>
      </div>
      {error && <p className="text-[13px] text-red-500 mt-1">{error}</p>}
    </div>
  )
})

Select.displayName = 'Select'
export default Select
