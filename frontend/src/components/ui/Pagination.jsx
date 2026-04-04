const buildVisiblePages = (page, totalPages) => {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  return [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
};

const Pagination = ({ page, totalPages, totalItems, pageSize, onPageChange }) => {
  if (totalPages <= 1) {
    return null;
  }

  const visiblePages = buildVisiblePages(page, totalPages);
  const startItem = totalItems ? ((page - 1) * pageSize) + 1 : 0;
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-500">
        Menampilkan {startItem}-{endItem} dari {totalItems} data
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sebelumnya
        </button>
        {visiblePages.map((itemPage, index) => {
          const previousPage = visiblePages[index - 1];
          const showGap = previousPage && itemPage - previousPage > 1;

          return (
            <span key={itemPage} className="flex items-center gap-2">
              {showGap ? <span className="px-1 text-slate-400">...</span> : null}
              <button
                type="button"
                onClick={() => onPageChange(itemPage)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  itemPage === page
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
                    : 'border border-slate-200 text-slate-700 hover:border-emerald-200 hover:text-emerald-700'
                }`}
              >
                {itemPage}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
};

export default Pagination;
