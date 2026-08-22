import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api } from "../api";
import Card from "../components/Card";
import { Trend } from "../components/Kpi";
import DateRangeFilter from "../components/DateRangeFilter";

const METRIC_DEFS = [
  { key: "sent", label: "발송", color: "#94A3B8", axis: "left" },
  { key: "clicks", label: "클릭", color: "#F59E0B", axis: "left" },
  { key: "conversions", label: "전환", color: "#10B981", axis: "left" },
  { key: "revenue", label: "전환매출", color: "#7C3AED", axis: "right" },
];

const CHANNEL_COLORS = {
  email: "#7C3AED", kakao: "#F59E0B", sms: "#F43F5E", webpush: "#10B981", webpopup: "#EC4899",
};
const CHANNEL_BADGE = {
  email: "bg-violet-50 text-violet-600", kakao: "bg-amber-50 text-amber-700",
  sms: "bg-rose-50 text-rose-600", webpush: "bg-emerald-50 text-emerald-600", webpopup: "bg-fuchsia-50 text-fuchsia-600",
};

function fmtWon(v) {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  return abs >= 10000 ? `${sign}₩${(abs / 10000).toFixed(0)}만` : `${sign}₩${Math.round(abs).toLocaleString()}`;
}

function KpiTile({ label, value, delta, deltaIsPp }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/40">
      <div className="text-[10px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-1">
        <div className="text-lg font-bold text-slate-900">{value}</div>
        {delta !== undefined && (deltaIsPp ? (
          <span className={`text-[10px] font-medium ${delta >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%p
          </span>
        ) : (
          <Trend value={delta} />
        ))}
      </div>
    </div>
  );
}

export default function PerformanceTab() {
  const [perf, setPerf] = useState(null);
  const [selectedMetrics, setSelectedMetrics] = useState(new Set(["conversions", "revenue"]));
  const [range, setRange] = useState({ start: null, end: null });

  useEffect(() => {
    api.performance(range.start, range.end).then(setPerf);
  }, [range]);

  if (!perf) return <div className="py-12 text-center text-xs text-slate-400">데이터를 불러오는 중...</div>;

  function toggleMetric(key) {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const showRight = METRIC_DEFS.some((m) => m.axis === "right" && selectedMetrics.has(m.key));
  const weeklyHeight = Math.max(160, perf.weekly_channel.length * 34 + 30);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateRangeFilter dataRange={perf.data_range} onChange={setRange} />
        {perf.date_range && (
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-500">
            {perf.date_range.start} ~ {perf.date_range.end}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <KpiTile label="발송 메시지 수" value={perf.kpi.sent.toLocaleString()} delta={perf.kpi.sent_delta} />
        <KpiTile label="클릭률" value={`${perf.kpi.ctr}%`} delta={perf.kpi.ctr_delta} deltaIsPp />
        <KpiTile label="전환율" value={`${perf.kpi.cvr}%`} delta={perf.kpi.cvr_delta} deltaIsPp />
        <KpiTile label="전환 구매금액" value={fmtWon(perf.kpi.revenue)} delta={perf.kpi.revenue_delta} />
        <KpiTile label="자동화 기여 매출 비중" value={`${perf.kpi.auto_share}%`} delta={perf.kpi.auto_share_delta} deltaIsPp />
      </div>

      {perf.kpi.cvr_uplift_pp !== null && (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/40">
            <div className="text-[10px] font-medium text-slate-500">전환율 증분 (자동화 효과)</div>
            <div className={`mt-1 text-lg font-bold ${perf.kpi.cvr_uplift_pp >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
              {perf.kpi.cvr_uplift_pp >= 0 ? "+" : ""}{perf.kpi.cvr_uplift_pp}%p
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/40">
            <div className="text-[10px] font-medium text-slate-500">증분 매출 (자동화 효과)</div>
            <div className={`mt-1 text-lg font-bold ${perf.kpi.incremental_revenue >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
              {perf.kpi.incremental_revenue >= 0 ? "+" : ""}{fmtWon(perf.kpi.incremental_revenue)}
            </div>
          </div>
          <p className="text-[9px] text-slate-400 md:col-span-2">
            자동화를 하지 않았을 때(같은 세그먼트의 다른 캠페인 평균)와 비교해 늘어난 정도를 추정한 값이에요.
          </p>
        </div>
      )}

      <Card title="자동화 성과 추이">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {METRIC_DEFS.map((m) => (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${
                selectedMetrics.has(m.key) ? "text-white" : "border-slate-200 bg-white text-slate-400"
              }`}
              style={selectedMetrics.has(m.key) ? { background: m.color, borderColor: m.color } : undefined}
            >
              {m.label}{m.axis === "right" ? " (우측축)" : ""}
            </button>
          ))}
        </div>
        {selectedMetrics.size === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">표시할 지표를 선택하세요.</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={perf.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F4" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              {showRight && (
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={fmtWon} />
              )}
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 11 }} formatter={(v, name) => (name === "전환매출" ? [fmtWon(v), name] : [v.toLocaleString(), name])} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {METRIC_DEFS.filter((m) => selectedMetrics.has(m.key)).map((m) => (
                <Line
                  key={m.key} yAxisId={m.axis} type="monotone" dataKey={m.key} name={m.label}
                  stroke={m.color} strokeWidth={2} dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="채널별 주간 발송 현황">
          {perf.weekly_channel.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">데이터가 없어요.</div>
          ) : (
            <ResponsiveContainer width="100%" height={weeklyHeight}>
              <BarChart data={perf.weekly_channel} layout="vertical" margin={{ left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F4" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="week" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => CHANNEL_BADGE[v] ? ({ email: "이메일", kakao: "카카오", sms: "문자", webpush: "웹 푸시", webpopup: "웹 팝업" }[v] || v) : v} />
                {perf.channel_keys.map((ch) => (
                  <Bar key={ch} dataKey={ch} stackId="w" fill={CHANNEL_COLORS[ch] || "#94A3B8"} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="채널별 성과 요약">
          {perf.channels.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">데이터가 없어요.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {perf.channels.map((c) => (
                <div key={c.channel}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CHANNEL_BADGE[c.channel] || "bg-slate-100 text-slate-600"}`}>
                      {c.label}
                    </span>
                    <span className="text-[11px] font-bold text-slate-800">{fmtWon(c.revenue)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${c.share}%`, background: CHANNEL_COLORS[c.channel] || "#94A3B8" }} />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[9px] text-slate-400">
                    <span>{c.sent.toLocaleString()}건 발송</span>
                    <span>전환 {c.cvr.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="자동화 발송 목록">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] text-slate-400">
                <th className="py-1.5 pr-2.5 font-medium">캠페인</th>
                <th className="py-1.5 pr-2.5 font-medium">채널</th>
                <th className="py-1.5 pr-2.5 font-medium">발송</th>
                <th className="py-1.5 pr-2.5 font-medium">클릭률</th>
                <th className="py-1.5 pr-2.5 font-medium">전환율</th>
                <th className="py-1.5 pr-2.5 font-medium">매출</th>
                <th className="py-1.5 pr-2.5 font-medium">전환율 증분</th>
              </tr>
            </thead>
            <tbody>
              {perf.campaigns.map((c) => (
                <tr key={c.campaign_id} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5 pr-2.5 font-medium text-slate-700">{c.name}</td>
                  <td className="py-1.5 pr-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${CHANNEL_BADGE[c.channel] || "bg-slate-100 text-slate-600"}`}>
                      {c.channel_label}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2.5 text-slate-500">{c.sent.toLocaleString()}</td>
                  <td className="py-1.5 pr-2.5 text-slate-500">{c.ctr !== null ? `${c.ctr.toFixed(1)}%` : "-"}</td>
                  <td className="py-1.5 pr-2.5 text-slate-500">{c.cvr}%</td>
                  <td className="py-1.5 pr-2.5 text-slate-500">{fmtWon(c.revenue)}</td>
                  <td className={`py-1.5 pr-2.5 font-medium ${c.cvr_uplift > 0 ? "text-emerald-600" : c.cvr_uplift < 0 ? "text-rose-500" : "text-slate-400"}`}>
                    {c.cvr_uplift !== null ? `${c.cvr_uplift > 0 ? "+" : ""}${c.cvr_uplift}%` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
