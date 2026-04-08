const DonutChart = ({ data, size = 140, thickness = 18 }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;
  const segments = data.map(item => {
    const frac   = total ? item.value / total : 0;
    const len    = frac * circ;
    const da     = `${len} ${circ - len}`;
    const doff   = -(offset - circ * 0.25); // start at top
    offset += len;
    return { ...item, da, doff };
  });

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={thickness}
        />
        {/* Segments */}
        {segments.map(seg => (
          <circle
            key={seg.label}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={seg.da}
            strokeDashoffset={seg.doff}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .5s ease' }}
          />
        ))}
      </svg>

      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-extrabold text-slate-800 leading-none">{total}</span>
        <span className="text-[10px] font-medium text-slate-400 mt-0.5 uppercase tracking-wider">Total</span>
      </div>
    </div>
  );
};

export default DonutChart;
