import { useEffect, useState } from "react";
import { api } from "../api";

const CHANNEL_LABEL = { kakao: "카카오톡", sms: "문자(SMS/LMS)", webpush: "웹 푸시", email: "이메일" };

export default function RecurringCampaignsPanel() {
  const [campaigns, setCampaigns] = useState(null);

  function load() {
    api.recurringCampaigns().then(setCampaigns);
  }

  useEffect(load, []);

  if (!campaigns || campaigns.length === 0) return null;

  async function handleToggle(id) {
    await api.toggleRecurringCampaign(id);
    load();
  }

  async function handleDelete(id) {
    await api.deleteRecurringCampaign(id);
    load();
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <h3 className="mb-2.5 text-[11px] font-semibold text-slate-800">반복 발송 관리</h3>
      <div className="flex flex-col gap-2">
        {campaigns.map((c) => (
          <div key={c.campaign_id} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2">
            <div>
              <div className="text-[11px] font-medium text-slate-700">
                {c.segment} · {CHANNEL_LABEL[c.channel] || c.channel}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                {c.recurring.freq}
                {c.recurring.freq === "특정 요일 반복" && c.recurring.weekdays?.length > 0 &&
                  ` (${c.recurring.weekdays.map((i) => ["월", "화", "수", "목", "금", "토", "일"][i]).join(", ")})`}
                {" · 대상 " + c.target_count.toLocaleString() + "명"}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.recurring.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                {c.recurring.active ? "진행 중" : "일시정지"}
              </span>
              <button
                onClick={() => handleToggle(c.campaign_id)}
                className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-100"
              >
                {c.recurring.active ? "일시정지" : "재개"}
              </button>
              <button
                onClick={() => handleDelete(c.campaign_id)}
                className="rounded-md border border-rose-100 px-2 py-1 text-[10px] font-medium text-rose-500 hover:bg-rose-50"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
