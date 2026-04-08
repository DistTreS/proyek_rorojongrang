const VARIANTS = {
  default:  'bg-slate-100  text-slate-600  ring-slate-200',
  success:  'bg-emerald-100 text-emerald-700 ring-emerald-200',
  primary:  'bg-emerald-100 text-emerald-700 ring-emerald-200',
  danger:   'bg-rose-100   text-rose-700   ring-rose-200',
  warning:  'bg-amber-100  text-amber-700  ring-amber-200',
  info:     'bg-sky-100    text-sky-700    ring-sky-200',
  dark:     'bg-slate-800  text-slate-100  ring-slate-700',
};

const Badge = ({ children, variant = 'default', dot = false, className = '' }) => (
  <span
    className={`
      inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5
      text-xs font-semibold ring-1
      ${VARIANTS[variant] ?? VARIANTS.default}
      ${className}
    `}
  >
    {dot && (
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
    )}
    {children}
  </span>
);

export default Badge;