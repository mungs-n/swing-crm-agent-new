import { FunnelChart, Funnel, LabelList, Tooltip, ResponsiveContainer, Cell } from "recharts";

const SHADES = ["#7C3AED", "#8B5CF6", "#A78BFA", "#C4B5FD", "#DDD6FE"];

export default function FunnelViz({ stages, color }) {
  if (!stages || stages.length === 0) return null;
  const first = stages[0]?.value || 1;
  const data = stages.map((s, i) => ({
    name: s.label,
    value: s.value,
    label: `${s.label}  ${s.value.toLocaleString()} (${((s.value / first) * 100).toFixed(0)}%)`,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={56 * data.length + 16}>
        <FunnelChart>
          <Tooltip formatter={(v) => v.toLocaleString()} />
          <Funnel dataKey="value" data={data} isAnimationActive>
            <LabelList position="center" dataKey="label" fill="#fff" fontSize={11} fontWeight={600} />
            {data.map((_, i) => (
              <Cell key={i} fill={color || SHADES[i % SHADES.length]} />
            ))}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-col gap-1 border-t border-slate-100 pt-2">
        {stages.slice(1).map((s, i) => {
          const prev = stages[i].value;
          const rate = prev ? ((s.value / prev) * 100).toFixed(1) : "0.0";
          return (
            <div key={s.label} className="flex justify-between text-[10px]">
              <span className="text-slate-500">{stages[i].label} → {s.label}</span>
              <span className="font-medium text-slate-700">{rate}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
