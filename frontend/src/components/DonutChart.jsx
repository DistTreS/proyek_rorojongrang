const DonutChart = ({ data, size = 148, thickness = 20 }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  const GAP = total > 0 ? 3 : 0; // gap between segments in px

  let offset = 0;
  const segments = data.map(item => {
    const frac = total ? item.value / total : 0;
    const len = Math.max(0, frac * circ - GAP);
    const da = `${len} ${circ - len}`;
    const doff = -(offset - circ * 0.25); // start at top
    offset += frac * circ;
    return { ...item, da, doff, frac };
  });

  const hadrPct = total > 0 ? Math.round(((data.find(d => d.label === 'Hadir')?.value ?? 0) / total) * 100) : 0;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={thickness}
        />
        {total === 0 ? (
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={thickness}
          />
        ) : (
          segments.map(seg => (
            <circle
              key={seg.label}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={seg.da}
              strokeDashoffset={seg.doff}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray .6s cubic-bezier(.4,0,.2,1)' }}
            />
          ))
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-extrabold text-slate-800 leading-none tabular-nums">
          {total > 0 ? hadrPct + '%' : '—'}
        </span>
        <span className="text-[10px] font-semibold text-slate-400 mt-1 uppercase tracking-widest">
          {total > 0 ? 'Hadir' : 'Kosong'}
        </span>
      </div>
    </div>
  );
};

export default DonutChart;
