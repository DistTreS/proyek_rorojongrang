const EmptyState = ({ title = 'Belum ada data', description = 'Data akan muncul di sini setelah ditambahkan.', children }) => {
  return (
    <div className="rounded-3xl border border-dashed border-neutral-200 bg-white p-8 text-center">
      <div className="mx-auto max-w-xs">
        <div className="text-6xl mb-4">📭</div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
};

export default EmptyState;