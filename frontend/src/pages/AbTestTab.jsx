import { useEffect, useState } from "react";
import { api } from "../api";
import AbTestWizard from "./AbTestWizard";

const SUCCESS_METRIC_LABEL = { open: "오픈율", click: "클릭률", conversion: "전환율" };
const METRIC_COUNT_LABEL = { open: "오픈 수", click: "클릭 수", conversion: "전환 수" };

function StatusBadge({ status }) {
  const isRunning = status === "진행중";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isRunning ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
      {status}
    </span>
  );
}

function GroupTable({ test }) {
  const metricLabel = SUCCESS_METRIC_LABEL[test.success_metric] || "전환율";
  const countLabel = METRIC_COUNT_LABEL[test.success_metric] || "전환 수";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-slate-100 text-left text-[10px] text-slate-400">
            <th className="py-1.5 pr-3 font-medium">그룹</th>
            <th className="py-1.5 pr-3 font-medium">유저 수</th>
            <th className="py-1.5 pr-3 font-medium">{countLabel}</th>
            <th className="py-1.5 pr-3 font-medium">{metricLabel}</th>
            <th className="py-1.5 pr-3 font-medium">기준 대비 개선율</th>
            <th className="py-1.5 pr-3 font-medium">95% CI</th>
            <th className="py-1.5 pr-3 font-medium">p-value</th>
            <th className="py-1.5 pr-3 font-medium">유의성</th>
          </tr>
        </thead>
        <tbody>
          {test.groups.map((g) => (
            <tr key={g.group_id} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5 pr-3 font-semibold text-slate-700">
                {g.label}
                {g.is_control && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">컨트롤</span>}
                {test.winner_group_id === g.group_id && <span className="ml-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold text-white">WINNER</span>}
              </td>
              <td className="py-1.5 pr-3 text-slate-500">{g.users.toLocaleString()}</td>
              <td className="py-1.5 pr-3 text-slate-500">{g[{ open: "opens", click: "clicks", conversion: "conversions" }[test.success_metric]].toLocaleString()}</td>
              <td className="py-1.5 pr-3 font-semibold text-slate-700">{g.rate}%</td>
              <td className="py-1.5 pr-3">
                {g.is_baseline ? (
                  <span className="text-slate-300">기준 그룹</span>
                ) : g.uplift === null ? (
                  <span className="text-slate-300">-</span>
                ) : (
                  <span className={`font-semibold ${g.uplift > 0 ? "text-emerald-600" : "text-rose-500"}`}>{g.uplift > 0 ? "+" : ""}{g.uplift}%</span>
                )}
              </td>
              <td className="py-1.5 pr-3 text-slate-400">{g.ci_low !== null ? `${g.ci_low > 0 ? "+" : ""}${g.ci_low}%p ~ ${g.ci_high > 0 ? "+" : ""}${g.ci_high}%p` : "-"}</td>
              <td className="py-1.5 pr-3 text-slate-400">{g.p_value !== null ? g.p_value : "-"}</td>
              <td className="py-1.5 pr-3">
                {g.p_value === null ? (
                  <span className="text-[10px] text-slate-300">-</span>
                ) : g.significant ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">유의미</span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">유의미하지 않음</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[9px] text-slate-300">
        * p-value 0.05 미만이면 통계적으로 유의미해요. 실제 발송 연동 전이라 오픈/클릭/전환 수는 채널 히스토리 기반 시뮬레이션이에요.
      </p>
    </div>
  );
}

function TestCard({ test, onEnded }) {
  const [winner, setWinner] = useState(test.groups.find((g) => !g.is_control)?.group_id || "");
  const [ending, setEnding] = useState(false);

  async function handleEnd() {
    setEnding(true);
    try {
      const updated = await api.endAbTest(test.test_id, winner);
      onEnded(updated);
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-slate-800">{test.test_name}</span>
          <StatusBadge status={test.status} />
        </div>
        {test.status === "진행중" && (
          <div className="flex items-center gap-1.5">
            <select
              value={winner}
              onChange={(e) => setWinner(e.target.value)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] outline-none"
            >
              {test.groups.filter((g) => !g.is_control).map((g) => (
                <option key={g.group_id} value={g.group_id}>{g.label}</option>
              ))}
            </select>
            <button
              onClick={handleEnd}
              disabled={ending}
              className="rounded-md bg-violet-600 px-2.5 py-1 text-[10px] font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              테스트 종료
            </button>
          </div>
        )}
      </div>
      <div className="mt-2.5">
        <GroupTable test={test} />
      </div>
    </div>
  );
}

export default function AbTestTab() {
  const [data, setData] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  function load() {
    api.abTests().then(setData);
  }

  useEffect(load, []);

  if (wizardOpen) {
    return (
      <AbTestWizard
        onCancel={() => setWizardOpen(false)}
        onCreated={() => { setWizardOpen(false); load(); }}
      />
    );
  }

  if (!data) return <div className="py-12 text-center text-xs text-slate-400">데이터를 불러오는 중...</div>;

  return (
    <div>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-xs font-semibold text-slate-700">A/B 테스트</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">A/B 테스트를 통해 어떤 메시지와 전략이 고객 전환에 더 효과적인지 비교해보세요.</p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="shrink-0 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700"
        >
          + 새 A/B 테스트
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {[["진행 중인 테스트", data.summary.running], ["완료된 테스트", data.summary.done], ["통계적으로 유의미", data.summary.significant]].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm shadow-slate-200/40">
            <div className="text-lg font-bold text-slate-900">{value}</div>
            <div className="mt-0.5 text-[10px] text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        {data.tests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs text-slate-400">
            아직 생성된 A/B 테스트가 없어요. 위에서 새 테스트를 만들어보세요.
          </div>
        ) : (
          data.tests.map((t) => (
            <TestCard key={t.test_id} test={t} onEnded={load} />
          ))
        )}
      </div>
    </div>
  );
}
