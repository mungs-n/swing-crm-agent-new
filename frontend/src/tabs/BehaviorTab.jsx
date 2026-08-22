import { useEffect, useState } from "react";
import { api } from "../api";
import Card from "../components/Card";
import FunnelViz from "../components/FunnelViz";
import RawDataButton from "../components/RawDataButton";

export default function BehaviorTab() {
  const [funnel, setFunnel] = useState(null);
  const [repeatFunnel, setRepeatFunnel] = useState(null);

  useEffect(() => {
    api.funnel().then(setFunnel);
    api.repeatFunnel().then(setRepeatFunnel);
  }, []);

  if (!funnel || !repeatFunnel) return <div className="py-12 text-center text-xs text-slate-400">데이터를 불러오는 중...</div>;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="flex justify-end lg:col-span-2">
        <RawDataButton fetcher={api.rawBehavior} />
      </div>
      <Card title="구매 퍼널">
        <FunnelViz stages={funnel} color="#7C3AED" />
      </Card>
      <Card title="회원가입 → 첫 구매 → 재구매">
        <FunnelViz stages={repeatFunnel} color="#F97316" />
      </Card>
    </div>
  );
}
