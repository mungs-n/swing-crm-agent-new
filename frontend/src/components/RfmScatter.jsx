import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { formatMoney } from "../utils/currency";

const SEGMENT_COLORS = { "VIP": "#7C3AED", "충성 고객": "#A78BFA", "이탈 위험": "#C4B5FD", "휴면": "#DDD6FE" };
const SEGMENT_ORDER = ["VIP", "충성 고객", "이탈 위험", "휴면"];

export default function RfmScatter({ points, height = 280 }) {
  const { session } = useAuth();
  const currency = session?.currency || "KRW";
  if (!points || points.length === 0) return <p className="text-xs text-slate-400">표시할 데이터가 없습니다.</p>;

  const bySegment = SEGMENT_ORDER.map((seg) => ({
    segment: seg,
    data: points.filter((p) => p.segment === seg),
  })).filter((g) => g.data.length > 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0EDFB" />
        <XAxis type="number" dataKey="frequency" name="구매 빈도" tick={{ fontSize: 11, fill: "#888699" }} label={{ value: "구매 빈도", position: "insideBottom", offset: -5, fontSize: 11, fill: "#888699" }} />
        <YAxis type="number" dataKey="monetary" name="구매 금액" tick={{ fontSize: 11, fill: "#888699" }} tickFormatter={(v) => formatMoney(v, currency, { compact: true })} />
        <ZAxis type="number" dataKey="monetary" range={[40, 300]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          formatter={(value, name) => (name === "구매 금액" ? [formatMoney(value, currency), name] : [value, name])}
          labelFormatter={() => ""}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {bySegment.map((g) => (
          <Scatter key={g.segment} name={g.segment} data={g.data} fill={SEGMENT_COLORS[g.segment]} fillOpacity={0.7} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
