import { useEffect, useState } from "react";
import { api } from "../api";
import CampaignWizard from "./CampaignWizard";
import RecurringCampaignsPanel from "../components/RecurringCampaignsPanel";
import MarketingRecipes from "../components/MarketingRecipes";
import MarketingRecipesPage from "./MarketingRecipesPage";

const STATUS_OPTIONS = ["초안", "임시 저장", "테스트 발송", "트리거 대기", "예약 대기", "반복 발송", "발송 완료"];
const PAGE_SIZE = 15;

const CHANNEL_STYLES = [
  ["카카오톡", "카카오톡", "#FEF3C7", "#B45309"],
  ["문자", "문자(SMS/LMS)", "#DBEAFE", "#1E40AF"],
  ["웹 푸시", "웹 푸시", "#DCFCE7", "#15803D"],
  ["이메일", "이메일", "#EDE9FE", "#6D28D9"],
];

function statusInfo(raw) {
  const s = String(raw || "");
  if (s.includes("트리거 등록")) return { dot: "#F59E0B", label: "트리거 대기" };
  if (s.includes("반복")) return { dot: "#7C3AED", label: "반복 발송" };
  if (s.includes("예약")) return { dot: "#F59E0B", label: "예약 대기" };
  if (s.includes("완료")) return { dot: "#94A3B8", label: "발송 완료" };
  if (s.includes("테스트")) return { dot: "#0F172A", label: "테스트 발송" };
  if (s.includes("초안")) return { dot: "#94A3B8", label: "초안" };
  return { dot: "#0F172A", label: "임시 저장" };
}

function channelInfo(raw) {
  const s = String(raw || "");
  for (const [needle, label, bg, fg] of CHANNEL_STYLES) {
    if (s.includes(needle)) return { label, bg, fg };
  }
  return null;
}

function DetailPanel({ campaign }) {
  if (!campaign) {
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-200 p-8 text-center text-[11px] text-slate-400">
        왼쪽 목록에서 캠페인을 선택하면<br />여기에 상세 정보가 나와요.
      </div>
    );
  }
  const st = statusInfo(campaign.status);
  const ch = channelInfo(campaign.status);
  const rows = [
    ["세그먼트", campaign.segment || "-"],
    ["채널", ch?.label || "-"],
    ["대상 인원", `${campaign.target_count.toLocaleString()}명`],
    ["발송일시", campaign.sent_at ? new Date(campaign.sent_at).toLocaleString("ko-KR") : "-"],
  ];
  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm shadow-slate-200/40">
      <h3 className="mb-0.5 text-[11px] font-semibold text-slate-800">캠페인 상세</h3>
      <p className="mb-2.5 text-sm font-bold leading-snug text-slate-900">{campaign.name}</p>
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
        {st.label}
      </span>

      <div className="mt-2.5 flex flex-col gap-2 border-t border-slate-100 pt-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">{label}</span>
            <span className="font-medium text-slate-700">{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex min-h-0 flex-1 flex-col border-t border-slate-100 pt-2.5">
        <p className="mb-1.5 text-[10px] font-medium text-slate-400">메시지 내용</p>
        <div className="max-h-[380px] min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-600">
          {campaign.message_summary || "(내용 없음)"}
        </div>
      </div>
    </div>
  );
}

export default function CampaignsTab() {
  const [campaigns, setCampaigns] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState(null);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [activeStatuses, setActiveStatuses] = useState(new Set(STATUS_OPTIONS));
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [page, setPage] = useState(1);

  function load() {
    api.campaigns().then(setCampaigns);
  }

  useEffect(load, []);
  useEffect(() => { setPage(1); }, [search, activeStatuses]);

  function openWizard(prefill = null) {
    setWizardPrefill(prefill);
    setWizardOpen(true);
  }

  if (wizardOpen) {
    return (
      <CampaignWizard
        onCancel={() => setWizardOpen(false)}
        onCreated={() => { setWizardOpen(false); load(); }}
        onTestSent={load}
        initialSegment={wizardPrefill?.segment}
        initialChannel={wizardPrefill?.channel}
        initialSituation={wizardPrefill?.situation}
        templateTitle={wizardPrefill?.templateTitle}
        templateBody={wizardPrefill?.templateBody}
        recipeTitle={wizardPrefill?.title}
        recipeArt={wizardPrefill?.art}
        recipeColors={wizardPrefill?.colors}
      />
    );
  }

  if (recipesOpen) {
    return (
      <MarketingRecipesPage
        onBack={() => setRecipesOpen(false)}
        onSelectRecipe={(r) => { setRecipesOpen(false); openWizard(r); }}
      />
    );
  }

  if (!campaigns) return <div className="py-12 text-center text-xs text-slate-400">데이터를 불러오는 중...</div>;

  function toggleStatus(s) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  const filtered = campaigns.filter((c) => {
    if (search && !c.name.includes(search) && !c.segment.includes(search)) return false;
    return activeStatuses.has(statusInfo(c.status).label);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedCampaign = campaigns.find((c) => c.campaign_id === selectedId) || null;

  const statusFilterSuffix = activeStatuses.size === STATUS_OPTIONS.length ? "" :
    activeStatuses.size === 0 ? " (없음)" :
    activeStatuses.size <= 2 ? ` (${[...activeStatuses].join(", ")})` : ` (${activeStatuses.size}개)`;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between rounded-lg border border-violet-200 bg-white p-3 shadow-sm shadow-violet-100/40">
        <div>
          <h2 className="text-sm font-bold text-slate-900">캠페인 관리</h2>
          <p className="mt-0.5 text-[10px] text-slate-400">총 {campaigns.length}건의 캠페인</p>
        </div>
        <button
          onClick={() => openWizard()}
          className="flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-violet-300/50 transition hover:bg-violet-700"
        >
          <span className="text-base leading-none">+</span> 새 캠페인
        </button>
      </div>

      <MarketingRecipes onSelectRecipe={(r) => openWizard(r)} onOpenAll={() => setRecipesOpen(true)} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_260px]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
          <div className="flex items-center gap-2 border-b border-slate-100 p-2.5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="캠페인명 또는 세그먼트 검색"
              className="w-full max-w-sm rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-slate-400"
            />
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] text-slate-400">
                <th className="px-3 py-2 font-medium">이름</th>
                <th className="relative px-3 py-2 font-medium">
                  <button
                    onClick={() => setStatusFilterOpen((v) => !v)}
                    className={`inline-flex items-center gap-0.5 font-medium transition ${statusFilterOpen ? "text-violet-600" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    상태{statusFilterSuffix}
                    <svg
                      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`shrink-0 transition-transform ${statusFilterOpen ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {statusFilterOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setStatusFilterOpen(false)} />
                      <div className="absolute left-0 top-6 z-20 w-40 rounded-md border border-slate-200 bg-white p-2.5 shadow-lg">
                        <p className="mb-1.5 text-[10px] text-slate-400">표시할 상태를 선택하세요</p>
                        <div className="flex flex-col gap-1">
                          {STATUS_OPTIONS.map((s) => (
                            <label key={s} className="flex items-center gap-1.5 text-[11px] font-normal text-slate-600">
                              <input type="checkbox" checked={activeStatuses.has(s)} onChange={() => toggleStatus(s)} />
                              {s}
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </th>
                <th className="px-3 py-2 font-medium">대상</th>
                <th className="px-3 py-2 font-medium">발송일시</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">검색/필터 조건에 맞는 캠페인이 없습니다.</td></tr>
              )}
              {pageRows.map((c) => {
                const st = statusInfo(c.status);
                const ch = channelInfo(c.status);
                const isSelected = selectedId === c.campaign_id;
                return (
                  <tr
                    key={c.campaign_id}
                    onClick={() => setSelectedId(isSelected ? null : c.campaign_id)}
                    className={`cursor-pointer border-b border-slate-50 last:border-0 ${isSelected ? "bg-slate-50" : "hover:bg-slate-50/60"}`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">{c.name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {c.segment} · {c.target_count}명
                      {ch && (
                        <span className="ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: ch.bg, color: ch.fg }}>
                          {ch.label}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-400">{c.sent_at ? new Date(c.sent_at).toLocaleString("ko-KR") : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={currentPage <= 1}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              이전
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={currentPage >= totalPages}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              다음
            </button>
            <span className="text-[11px] text-slate-400">{currentPage} / {totalPages} 페이지 · 총 {filtered.length}개</span>
          </div>
        </div>

        <DetailPanel campaign={selectedCampaign} />
      </div>

      <RecurringCampaignsPanel />
    </div>
  );
}
