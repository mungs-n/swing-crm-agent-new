import { useChat } from "../context/ChatContext";

export function Trend({ value }) {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        up ? "text-emerald-600" : "text-rose-500"
      }`}
    >
      {up ? "↗" : "↘"} {up ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

export function KpiCard({ label, value, delta, askQuestion }) {
  const { askQuestion: ask } = useChat();
  const clickable = Boolean(askQuestion);

  return (
    <div
      onClick={clickable ? () => ask(askQuestion) : undefined}
      className={`group relative rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm shadow-slate-200/40 transition ${
        clickable ? "cursor-pointer hover:border-violet-300 hover:shadow-md hover:shadow-violet-100/50" : ""
      }`}
    >
      {clickable && (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-violet-50 px-1.5 py-0.5 text-[8px] font-medium text-violet-600 opacity-0 transition group-hover:opacity-100">
          물어보기 →
        </span>
      )}
      <span className="text-[10px] font-medium text-slate-500">{label}</span>
      <div className="mt-1 flex items-end justify-between gap-1">
        <div className="text-lg font-bold tracking-tight text-slate-900">{value}</div>
        <Trend value={delta} />
      </div>
    </div>
  );
}
