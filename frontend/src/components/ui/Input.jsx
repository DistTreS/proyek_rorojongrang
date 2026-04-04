import { forwardRef } from 'react';

const Input = forwardRef(({ className = '', ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-sm outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-200 ${className}`}
      {...props}
    />
  );
});

export default Input;