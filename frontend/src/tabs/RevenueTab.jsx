import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { formatMoney } from "../utils/currency";
import Card from "../components/Card";
import RankedBars from "../components/RankedBars";
import RawDataButton from "../components/RawDataButton";

const SEGMENT_COLORS = { "VIP": "#7C3AED", "충성 고객": "#A78BFA", "이탈 위험": "#C4B5FD", "휴면": "#DDD6FE" };

export default function RevenueTab({ range }) {
  const { session } = useAuth();
  const currency = session?.currency || "KRW";
  const fmtWon = (v) => formatMoney(v, currency, { compact: true });
  const [breakdown, setBreakdown] = useState(null);
  const [trend, setTrend] = useState([]);
  const start = range?.start;
  const end = range?.end;

  useEffect(() => {
    setBreakdown(null);
    api.revenueBreakdown(start, end).then(setBreakdown);
    api.gmvTrend(start, end).then((data) => setTrend(data.map((d) => ({ ...d, gmvM: d.gmv / 1_000_000 }))));
  }, [start, end]);

  if (!breakdown) return <div className="py-12 text-center text-xs text-slate-400">데이터를 불러오는 중...</div>;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="flex justify-end lg:col-span-2">
        <RawDataButton fetcher={api.rawRevenue} />
      </div>
      <Card title="월별 GMV 추이" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EDFB" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#888699" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#888699" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}M`} />
            <Tooltip formatter={(v) => [formatMoney(v * 1_000_000, currency, { compact: true }), "GMV"]} contentStyle={{ borderRadius: 12, border: "1px solid #E5E0F5" }} />
            <Line type="monotone" dataKey="gmvM" stroke="#7C3AED" strokeWidth={2.5} dot={{ r: 4, fill: "#7C3AED" }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="세그먼트별 매출">
        <RankedBars data={breakdown.segment} formatValue={fmtWon} colorMap={SEGMENT_COLORS} chartLabel="세그먼트별 매출" suggestionType="revenue" />
      </Card>
      <Card title="유입 채널별 매출">
        <RankedBars data={breakdown.channel} formatValue={fmtWon} chartLabel="유입 채널별 매출" suggestionType="revenue" />
      </Card>
      <Card title="카테고리별 매출" className="lg:col-span-2">
        <RankedBars data={breakdown.category} formatValue={fmtWon} chartLabel="카테고리별 매출" suggestionType="revenue" />
      </Card>
    </div>
  );
}
