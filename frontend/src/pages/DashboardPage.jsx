import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { formatMoney } from "../utils/currency";
import { KpiCard } from "../components/Kpi";
import DateRangeFilter from "../components/DateRangeFilter";
import OverviewTab from "../tabs/OverviewTab";
import RevenueTab from "../tabs/RevenueTab";
import BehaviorTab from "../tabs/BehaviorTab";
import DetailTab from "../tabs/DetailTab";

const TABS = [
  { key: "overview", label: "개요", Component: OverviewTab },
  { key: "revenue", label: "매출 분석", Component: RevenueTab },
  { key: "behavior", label: "행동 분석", Component: BehaviorTab },
  { key: "detail", label: "상세 분석", Component: DetailTab },
];

export default function DashboardPage() {
  const { session } = useAuth();
  const currency = session?.currency || "KRW";
  const [kpi, setKpi] = useState(null);
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState({ start: null, end: null });

  useEffect(() => {
    api.kpi(range.start, range.end).then(setKpi);
  }, [range]);

  const ActiveTab = TABS.find((t) => t.key === tab).Component;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <DateRangeFilter dataRange={kpi?.data_range} onChange={setRange} />
        {range.start && range.end && <span className="text-[10px] text-slate-400">{range.start} ~ {range.end}</span>}
      </div>

      <div className="sticky top-4 z-10 mb-5 grid grid-cols-2 gap-3 rounded-xl bg-[#F7F8FA]/90 py-1.5 backdrop-blur md:grid-cols-3 lg:grid-cols-6">
        {kpi ? (
          <>
            <KpiCard label="DAU (일간)" value={`${kpi.dau.toLocaleString()}명`} delta={kpi.dau_delta} askQuestion="오늘 하루 활성 고객 수를 분석해줘" />
            <KpiCard label="WAU (주간)" value={`${kpi.wau.toLocaleString()}명`} delta={kpi.wau_delta} askQuestion="최근 7일 활성 고객 수를 분석해줘" />
            <KpiCard label="MAU (월간)" value={`${kpi.mau.toLocaleString()}명`} delta={kpi.mau_delta} askQuestion="최근 30일 활성 고객 수를 분석해줘" />
            <KpiCard label="GMV" value={formatMoney(kpi.gmv, currency, { compact: true })} delta={kpi.gmv_delta} askQuestion="GMV 변화 원인을 분석해줘" />
            <KpiCard label="AOV" value={formatMoney(kpi.aov, currency)} delta={kpi.aov_delta} askQuestion="평균 주문 금액(AOV) 변화를 분석해줘" />
            <KpiCard label="구매 전환율" value={`${kpi.conversion.toFixed(1)}%`} delta={kpi.conversion_delta} askQuestion="구매 전환율 변화 원인을 분석해줘" />
          </>
        ) : (
          <div className="col-span-full py-5 text-center text-xs text-slate-400">KPI 불러오는 중...</div>
        )}
      </div>

      <nav className="mb-5 flex gap-0.5 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium transition ${
              tab === t.key
                ? "border-b-2 border-violet-600 text-violet-700"
                : "border-b-2 border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <ActiveTab range={range} />
    </div>
  );
}
