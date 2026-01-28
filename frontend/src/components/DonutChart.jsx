const DonutChart = ({ data }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = data.map((item) => {
    const fraction = total ? item.value / total : 0;
    const length = fraction * circumference;
    const dasharray = `${length} ${circumference - length}`;
    const dashoffset = -offset;
    offset += length;
    return {
      ...item,
      dasharray,
      dashoffset
    };
  });

  return (
    <div className="donut">
      <svg viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} className="donut-bg" />
        {segments.map((segment) => (
          <circle
            key={segment.label}
            cx="70"
            cy="70"
            r={radius}
            className="donut-segment"
            stroke={segment.color}
            strokeDasharray={segment.dasharray}
            strokeDashoffset={segment.dashoffset}
          />
        ))}
      </svg>
      <div className="donut-center">
        <div className="donut-total">{total}</div>
        <div className="donut-label">Total</div>
      </div>
    </div>
  );
};

export default DonutChart;
