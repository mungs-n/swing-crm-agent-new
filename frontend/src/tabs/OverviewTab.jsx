import { useEffect, useState } from "react";
import { api } from "../api";
import Card from "../components/Card";
import RankedBars from "../components/RankedBars";
import GenderDonut from "../components/GenderDonut";
import RawDataButton from "../components/RawDataButton";

export default function OverviewTab({ range }) {
  const [profile, setProfile] = useState(null);
  const start = range?.start;
  const end = range?.end;

  useEffect(() => {
    setProfile(null);
    api.customerProfile(start, end).then(setProfile);
  }, [start, end]);

  if (!profile) return <div className="py-12 text-center text-xs text-slate-400">데이터를 불러오는 중...</div>;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="flex justify-end lg:col-span-2">
        <RawDataButton fetcher={api.rawOverview} />
      </div>
      <Card title="기간 내 활동 고객 수" className="lg:col-span-2">
        <div className="text-3xl font-bold text-slate-900">{profile.active_count.toLocaleString()}명</div>
        <p className="mt-0.5 text-[11px] text-slate-400">구매 여부와 무관하게 방문 등 활동이 있었던 고객</p>
      </Card>
      <Card title="성별 분포">
        <GenderDonut male={profile.gender.male} female={profile.gender.female} chartLabel="성별 분포" />
      </Card>
      <Card title="연령대 분포">
        <RankedBars data={profile.age} formatValue={(v) => `${v.toLocaleString()}명`} chartLabel="연령대 분포" />
      </Card>
      <Card title="페르소나별 고객 수" className="lg:col-span-2">
        <RankedBars data={profile.persona} formatValue={(v) => `${v.toLocaleString()}명`} chartLabel="페르소나별 고객 수" />
      </Card>
    </div>
  );
}
