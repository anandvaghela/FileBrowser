import { InputHTMLAttributes, ReactNode, forwardRef } from 'react'
import { clsx } from 'clsx'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  label?: ReactNode
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>((
  { className, label, description, checked, onChange, disabled, ...props },
  ref
) => {
  return (
    <label className={clsx(
      'flex items-start gap-3 cursor-pointer select-none group',
      disabled && 'opacity-50 cursor-not-allowed',
      className,
    )}>
      <div className="pt-0.5 flex-shrink-0">
        <div className={clsx(
          'w-[22px] h-[22px] rounded-[4px] border-2 flex items-center justify-center transition-all duration-150',
          checked
            ? 'bg-[#007aff] border-[#007aff]'
            : 'border-[#dddddd] bg-white group-hover:border-[#007aff]',
        )}>
          {checked && (
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path d="M1 5L4.5 8.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <input
          ref={ref}
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
          {...props}
        />
      </div>
      <div>
        {label && <span className="text-[15px] text-[#555555] leading-snug">{label}</span>}
        {description && <p className="text-[13px] text-[#929292] mt-0.5">{description}</p>}
      </div>
    </label>
  )
})

Checkbox.displayName = 'Checkbox'
export default Checkbox
