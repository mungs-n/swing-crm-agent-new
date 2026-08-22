const ACCENT = "#7C3AED";
const PALE = "#C4B5FD";

export default function RankedBars({ data, formatValue = (v) => v.toLocaleString(), colorMap = null }) {
  if (!data || data.length === 0) return <p className="text-xs text-slate-400">표시할 데이터가 없습니다.</p>;
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-1.5">
      {data.map((d, i) => (
        <div key={d.name} className="flex items-center gap-2">
          <div className="w-20 shrink-0 truncate text-[10px] text-slate-500">{d.name}</div>
          <div className="h-4 flex-1 overflow-hidden bg-slate-100">
            <div
              className="h-full"
              style={{
                width: `${max ? (d.value / max) * 100 : 0}%`,
                background: colorMap?.[d.name] ?? (i === 0 ? ACCENT : PALE),
              }}
            />
          </div>
          <div className="w-16 shrink-0 text-right text-[10px] font-medium text-slate-700">{formatValue(d.value)}</div>
        </div>
      ))}
    </div>
  );
}
