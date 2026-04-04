const Badge = ({ children, variant = 'default', className = '' }) => {
  const styles = {
    default: 'bg-neutral-100 text-neutral-700',
    success: 'bg-emerald-100 text-emerald-700',
    danger: 'bg-rose-100 text-rose-700',
    warning: 'bg-amber-100 text-amber-700',
    primary: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;