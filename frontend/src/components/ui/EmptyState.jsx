import Icon from './Icon';

const EmptyState = ({
  icon = 'Inbox',
  title = 'Belum ada data',
  description = 'Data akan muncul di sini setelah ditambahkan.',
  children,
}) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
      <Icon name={icon} size={26} className="text-slate-400" />
    </div>
    <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
    <p className="mt-1 max-w-xs text-sm text-slate-400 leading-relaxed">{description}</p>
    {children && <div className="mt-6">{children}</div>}
  </div>
);

export default EmptyState;