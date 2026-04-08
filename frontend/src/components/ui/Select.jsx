import { forwardRef } from 'react';

const Select = forwardRef(({ className = '', error, children, ...props }, ref) => (
  <select
    ref={ref}
    className={`
      w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-800
      outline-none transition-all duration-150 cursor-pointer
      appearance-none
      bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")]
      bg-no-repeat bg-[right_0.75rem_center]
      pr-9
      ${error
        ? 'border-rose-300 ring-1 ring-rose-300 focus:border-rose-400 focus:ring-rose-400'
        : 'border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
      }
      disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
      ${className}
    `}
    {...props}
  >
    {children}
  </select>
));

Select.displayName = 'Select';
export default Select;