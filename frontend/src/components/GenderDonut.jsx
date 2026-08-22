import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const MALE = "#94A3B8";
const FEMALE = "#7C3AED";

export default function GenderDonut({ male, female }) {
  const total = male + female;
  if (total === 0) return <p className="text-xs text-slate-400">표시할 데이터가 없습니다.</p>;
  const data = [{ name: "남성", value: male }, { name: "여성", value: female }];

  return (
    <div className="flex items-center gap-4">
      <div className="h-24 w-24 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={30} outerRadius={46} startAngle={90} endAngle={-270}>
              <Cell fill={MALE} />
              <Cell fill={FEMALE} />
            </Pie>
            <Tooltip formatter={(v) => `${v.toLocaleString()}명`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-2">
        <div>
          <div className="text-[10px] font-semibold" style={{ color: MALE }}>남성</div>
          <div className="text-sm font-bold text-slate-800">
            {male.toLocaleString()}명 <span className="text-[10px] font-normal text-slate-400">({((male / total) * 100).toFixed(0)}%)</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold" style={{ color: FEMALE }}>여성</div>
          <div className="text-sm font-bold text-slate-800">
            {female.toLocaleString()}명 <span className="text-[10px] font-normal text-slate-400">({((female / total) * 100).toFixed(0)}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
