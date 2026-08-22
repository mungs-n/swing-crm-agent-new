import { useEffect, useState } from "react";
import { api } from "../api";
import Card from "../components/Card";
import RfmScatter from "../components/RfmScatter";
import CohortHeatmap from "../components/CohortHeatmap";
import RawDataButton from "../components/RawDataButton";

export default function DetailTab({ range }) {
  const [rfm, setRfm] = useState(null);
  const [cohort, setCohort] = useState(null);
  const start = range?.start;
  const end = range?.end;

  useEffect(() => {
    api.rfmScatter().then(setRfm);
    setCohort(null);
    api.cohort(start, end).then(setCohort);
  }, [start, end]);

  if (!rfm || !cohort) return <div className="py-12 text-center text-xs text-slate-400">데이터를 불러오는 중...</div>;

  // 재구매 유지율 표는 가입월 행 수만큼 자연스럽게 늘어나므로, RFM 산포도도 같은
  // 높이로 맞춰서 두 카드가 나란히 볼 때 단차 없이 보이게 한다.
  const chartHeight = Math.max(280, 32 * cohort.cohorts.length + 60);

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex justify-end">
        <RawDataButton fetcher={api.rawDetail} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card
          title="RFM 산포도"
          help={"RFM은 고객을 최근성(Recency)·구매빈도(Frequency)·구매금액(Monetary) 세 지표로 분류하는 방법이에요.\n\nX축: 구매 빈도, Y축: 구매 금액, 점 크기: 구매 금액, 색상: 세그먼트(VIP/충성고객/이탈위험/휴면)"}
        >
          <RfmScatter points={rfm} height={chartHeight} />
        </Card>
        <Card
          title="재구매 유지율"
          help="가입 월(행)별 고객이 이후 몇 개월 차(열)에 다시 구매했는지 보여줘요. 색이 진할수록 재구매율이 높다는 뜻이에요."
          askQuestion="재구매 유지율을 분석해줘"
        >
          <div style={{ height: chartHeight }} className="flex flex-col justify-center overflow-y-auto">
            <CohortHeatmap months={cohort.months} cohorts={cohort.cohorts} />
          </div>
        </Card>
      </div>
    </div>
  );
}
