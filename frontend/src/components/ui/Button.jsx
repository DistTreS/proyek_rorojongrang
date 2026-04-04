import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-2xl font-semibold transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200',
        secondary: 'border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700',
        ghost: 'hover:bg-neutral-100 text-neutral-700',
        danger: 'border border-rose-200 text-rose-700 hover:bg-rose-50',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

const Button = forwardRef(({ className, variant, size, children, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={buttonVariants({ variant, size, className })}
      {...props}
    >
      {children}
    </button>
  );
});

export default Button;