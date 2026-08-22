import { useState } from "react";

const PRESETS = [
  { key: "7d", label: "최근 7일", days: 7 },
  { key: "4w", label: "최근 4주", days: 28 },
  { key: "3m", label: "최근 3개월", days: 90 },
  { key: "all", label: "전체 기간", days: null },
  { key: "custom", label: "직접 선택", days: undefined },
];

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

export default function DateRangeFilter({ dataRange, onChange }) {
  const [preset, setPreset] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const maxDate = dataRange?.max || fmt(new Date());
  const minDate = dataRange?.min || "2000-01-01";

  function applyPreset(p) {
    setPreset(p.key);
    if (p.key === "all") {
      onChange({ start: null, end: null });
      return;
    }
    if (p.key === "custom") {
      const s = customStart || minDate;
      const e = customEnd || maxDate;
      setCustomStart(s);
      setCustomEnd(e);
      onChange({ start: s, end: e });
      return;
    }
    const end = new Date(maxDate);
    const start = new Date(end);
    start.setDate(start.getDate() - (p.days - 1));
    const startStr = fmt(start) < minDate ? minDate : fmt(start);
    onChange({ start: startStr, end: fmt(end) });
  }

  function applyCustom(s, e) {
    if (s && e && s <= e) onChange({ start: s, end: e });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => applyPreset(p)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
            preset === p.key ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          {p.label}
        </button>
      ))}
      {preset === "custom" && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={customStart}
            min={minDate}
            max={customEnd || maxDate}
            onChange={(e) => { setCustomStart(e.target.value); applyCustom(e.target.value, customEnd); }}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-violet-300"
          />
          <span className="text-[10px] text-slate-300">~</span>
          <input
            type="date"
            value={customEnd}
            min={customStart || minDate}
            max={maxDate}
            onChange={(e) => { setCustomEnd(e.target.value); applyCustom(customStart, e.target.value); }}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-violet-300"
          />
        </div>
      )}
    </div>
  );
}
