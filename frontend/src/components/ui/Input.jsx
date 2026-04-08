import { forwardRef } from 'react';

const Input = forwardRef(({ className = '', error, ...props }, ref) => (
  <input
    ref={ref}
    className={`
      w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800
      placeholder:text-slate-400
      outline-none transition-all duration-150
      ${error
        ? 'border-rose-300 ring-1 ring-rose-300 focus:border-rose-400 focus:ring-rose-400'
        : 'border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
      }
      disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
      ${className}
    `}
    {...props}
  />
));

Input.displayName = 'Input';
export default Input;