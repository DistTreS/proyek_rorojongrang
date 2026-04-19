const VARIANTS = {
  default:   'bg-slate-100   text-slate-600   ring-slate-200',
  success:   'bg-emerald-100 text-emerald-700  ring-emerald-200',
  primary:   'bg-emerald-100 text-emerald-700  ring-emerald-200',
  danger:    'bg-rose-100    text-rose-700     ring-rose-200',
  warning:   'bg-amber-100   text-amber-700    ring-amber-200',
  info:      'bg-sky-100     text-sky-700      ring-sky-200',
  dark:      'bg-slate-800   text-slate-100    ring-slate-700',
  amber:     'bg-amber-100   text-amber-700    ring-amber-200',
  sky:       'bg-sky-100     text-sky-700      ring-sky-200',
  emerald:   'bg-emerald-100 text-emerald-700  ring-emerald-200',
  rose:      'bg-rose-100    text-rose-700     ring-rose-200',
  violet:    'bg-violet-100  text-violet-700   ring-violet-200',
  peminatan: 'bg-amber-100   text-amber-800    ring-amber-200',
  utama:     'bg-emerald-100 text-emerald-800  ring-emerald-200',
};

const SIZES = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2.5 py-0.5 text-xs',
};

const Badge = ({ children, variant = 'default', dot = false, size = 'sm', className = '' }) => (
  <span
    className={`
      inline-flex items-center gap-1.5 rounded-full font-semibold ring-1
      ${SIZES[size] ?? SIZES.sm}
      ${VARIANTS[variant] ?? VARIANTS.default}
      ${className}
    `}
  >
    {dot && (
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80 flex-shrink-0" />
    )}
    {children}
  </span>
);

export default Badge;