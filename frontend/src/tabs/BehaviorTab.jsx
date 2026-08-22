import { useEffect, useState } from "react";
import { api } from "../api";
import Card from "../components/Card";
import FunnelViz from "../components/FunnelViz";
import RawDataButton from "../components/RawDataButton";

export default function BehaviorTab({ range }) {
  const [funnel, setFunnel] = useState(null);
  const [repeatFunnel, setRepeatFunnel] = useState(null);
  const start = range?.start;
  const end = range?.end;

  useEffect(() => {
    setFunnel(null);
    api.funnel(start, end).then(setFunnel);
    api.repeatFunnel().then(setRepeatFunnel);
  }, [start, end]);

  if (!funnel || !repeatFunnel) return <div className="py-12 text-center text-xs text-slate-400">데이터를 불러오는 중...</div>;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="flex justify-end lg:col-span-2">
        <RawDataButton fetcher={api.rawBehavior} />
      </div>
      <Card title="구매 퍼널">
        <FunnelViz stages={funnel} color="#7C3AED" />
      </Card>
      <Card title="회원가입 → 첫 구매 → 재구매" help="재구매는 짧은 기간만 보면 왜곡되기 쉬워서, 날짜 필터와 무관하게 항상 전체 기간 기준으로 보여줘요.">
        <FunnelViz stages={repeatFunnel} color="#F97316" />
      </Card>
    </div>
  );
}
