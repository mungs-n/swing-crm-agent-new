import { useState } from "react";

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

function downloadCsv(rows, filename) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RawDataButton({ fetcher, label = "원본 데이터 보기" }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null); // array 또는 {구분 라벨: rows}
  const [activeTab, setActiveTab] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (!open && !data) {
      setLoading(true);
      try {
        const result = await fetcher();
        setData(result);
        if (!Array.isArray(result)) setActiveTab(Object.keys(result)[0]);
      } finally {
        setLoading(false);
      }
    }
    setOpen((v) => !v);
  }

  const rows = data ? (Array.isArray(data) ? data : data[activeTab] || []) : [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="relative inline-block">
      <button
        onClick={handleToggle}
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-500 transition hover:bg-violet-50"
      >
        {loading ? "불러오는 중..." : label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 max-h-[420px] w-[min(850px,90vw)] overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-2xl">
            {!Array.isArray(data) && (
              <div className="mb-2 flex gap-1 border-b border-slate-100">
                {Object.keys(data).map((name) => (
                  <button
                    key={name}
                    onClick={() => setActiveTab(name)}
                    className={`px-2 py-1 text-[10px] font-medium transition ${
                      activeTab === name ? "border-b-2 border-violet-600 text-violet-700" : "border-b-2 border-transparent text-slate-400"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[9px] text-slate-400">{rows.length.toLocaleString()}건{rows.length >= 500 ? " (최근 500건까지 표시)" : ""}</span>
              {rows.length > 0 && (
                <button
                  onClick={() => downloadCsv(rows, `${activeTab || "data"}.csv`)}
                  className="text-[9px] font-medium text-violet-500 hover:underline"
                >
                  CSV 다운로드
                </button>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-[10px] text-slate-400">표시할 데이터가 없습니다.</p>
            ) : (
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-400">
                    {columns.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1 font-medium">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {columns.map((c) => <td key={c} className="whitespace-nowrap px-2 py-1 text-slate-600">{r[c] === null || r[c] === undefined ? "-" : String(r[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
