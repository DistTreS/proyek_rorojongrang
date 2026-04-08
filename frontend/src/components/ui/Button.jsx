import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none',
  {
    variants: {
      variant: {
        primary:   'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200 focus-visible:ring-emerald-500',
        secondary: 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 focus-visible:ring-slate-400',
        ghost:     'hover:bg-slate-100 text-slate-600 focus-visible:ring-slate-400',
        danger:    'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-400',
        success:   'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 focus-visible:ring-emerald-400',
        dark:      'bg-slate-800 text-white hover:bg-slate-900 focus-visible:ring-slate-600',
      },
      size: {
        xs: 'h-7  px-2.5 text-xs  rounded-lg',
        sm: 'h-8  px-3   text-sm  rounded-xl',
        md: 'h-9  px-4   text-sm  rounded-xl',
        lg: 'h-11 px-5   text-base rounded-xl',
        xl: 'h-13 px-7   text-base rounded-2xl',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

const Button = forwardRef(({ className, variant, size, children, ...props }, ref) => (
  <button
    ref={ref}
    className={buttonVariants({ variant, size, className })}
    {...props}
  >
    {children}
  </button>
));

Button.displayName = 'Button';
export default Button;