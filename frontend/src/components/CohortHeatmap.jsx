const SCALE = ["#F5F3FF", "#DDD6FE", "#C4B5FD", "#A78BFA", "#8B5CF6", "#7C3AED"];

function colorFor(v) {
  if (v === null || v === undefined) return "transparent";
  const idx = Math.min(SCALE.length - 1, Math.floor((v / 100) * SCALE.length));
  return SCALE[idx];
}

export default function CohortHeatmap({ months, cohorts }) {
  if (!cohorts || cohorts.length === 0) {
    return <p className="text-xs text-slate-400">표시할 데이터가 없습니다.</p>;
  }
  // 화면이 너무 넓어지지 않도록 최근 12개월차까지만 표시
  const visibleMonths = months.slice(0, 12);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 4 }}>
        <thead>
          <tr>
            <th className="w-16 text-left text-[10px] font-medium text-slate-400">가입월</th>
            {visibleMonths.map((m) => (
              <th key={m} className="min-w-[42px] text-center text-[9px] font-medium text-slate-400">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((row) => (
            <tr key={row.cohort}>
              <td className="text-[10px] text-slate-500">{row.cohort}</td>
              {visibleMonths.map((_, i) => {
                const v = row.values[i];
                return (
                  <td
                    key={i}
                    className="rounded-md text-center text-[9px] font-medium"
                    style={{ background: colorFor(v), color: v && v > 55 ? "#fff" : "#4C1D95", height: 24 }}
                  >
                    {v === null || v === undefined ? "" : `${v}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[9px] text-slate-400">낮음</span>
        <div className="h-1.5 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${SCALE.join(",")})` }} />
        <span className="text-[9px] text-slate-400">높음</span>
      </div>
    </div>
  );
}
