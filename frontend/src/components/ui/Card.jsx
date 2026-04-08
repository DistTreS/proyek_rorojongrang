import { forwardRef } from 'react';

/**
 * Card variants:
 *  default  – white, subtle border, soft shadow
 *  flat     – white, no shadow
 *  gradient – green-tinted gradient header feel
 *  dark     – dark card (for stats highlight)
 */
const Card = forwardRef(({ className = '', variant = 'default', children, ...props }, ref) => {
  const base = 'rounded-2xl transition-shadow duration-200';
  const variants = {
    default:  'bg-white border border-slate-100 shadow-sm hover:shadow-md',
    flat:     'bg-white border border-slate-100',
    gradient: 'bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 shadow-sm hover:shadow-md',
    dark:     'bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-lg text-white',
  };

  return (
    <div
      ref={ref}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';
export default Card;