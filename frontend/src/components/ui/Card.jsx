import { forwardRef } from 'react';

const Card = forwardRef(({ className = '', children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={`bg-white border border-neutral-100 rounded-3xl shadow-card hover:shadow-xl transition-shadow duration-300 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

export default Card;