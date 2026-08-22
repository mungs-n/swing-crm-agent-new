import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useChat } from "../context/ChatContext";
import { suggestChartQuestion } from "../utils/chartSuggestions";

const MALE = "#94A3B8";
const FEMALE = "#7C3AED";

export default function GenderDonut({ male, female, chartLabel }) {
  const { proposeQuestion } = useChat();
  const total = male + female;
  if (total === 0) return <p className="text-xs text-slate-400">표시할 데이터가 없습니다.</p>;
  const data = [{ name: "남성", value: male }, { name: "여성", value: female }];

  function select(name) {
    if (!chartLabel) return;
    proposeQuestion(suggestChartQuestion("distribution", chartLabel, name));
  }

  return (
    <div className="flex items-center gap-4">
      <div className="h-24 w-24 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="value" innerRadius={30} outerRadius={46} startAngle={90} endAngle={-270}
              onClick={chartLabel ? (entry) => select(entry.name) : undefined}
              style={chartLabel ? { cursor: "pointer" } : undefined}
            >
              <Cell fill={MALE} />
              <Cell fill={FEMALE} />
            </Pie>
            <Tooltip formatter={(v) => `${v.toLocaleString()}명`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-2">
        {[["남성", male, MALE], ["여성", female, FEMALE]].map(([label, value, color]) => {
          const content = (
            <>
              <div className="text-[10px] font-semibold" style={{ color }}>{label}</div>
              <div className="text-sm font-bold text-slate-800">
                {value.toLocaleString()}명 <span className="text-[10px] font-normal text-slate-400">({((value / total) * 100).toFixed(0)}%)</span>
              </div>
            </>
          );
          return chartLabel ? (
            <button key={label} onClick={(e) => { e.stopPropagation(); select(label); }} className="rounded px-1 py-0.5 text-left transition hover:bg-violet-50">
              {content}
            </button>
          ) : (
            <div key={label}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}
