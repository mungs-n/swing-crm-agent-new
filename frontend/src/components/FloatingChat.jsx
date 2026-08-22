import { useEffect, useRef, useState } from "react";
import { useChat } from "../context/ChatContext";

const EXAMPLE_QUESTIONS = [
  "지금 가장 시급한 문제는?",
  "저번 달보다 매출 늘었어?",
  "구매 퍼널에서 어디가 제일 많이 새?",
  "전환율을 어떻게 올리면 좋을까?",
];

const CAMPAIGN_CHANNELS = ["카카오톡", "SMS", "이메일", "웹푸시"];

function renderText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <b key={i} className="font-semibold text-violet-700">{part.slice(2, -2)}</b>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function CampaignProposalCard({ idx, proposal }) {
  const { updateProposalDraft, executeProposal } = useChat();
  const [executing, setExecuting] = useState(false);

  if (proposal.executed) {
    return (
      <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] text-emerald-700">
        ✅ 실행 완료 — 캠페인 관리 목록에 기록했어요 (ID: {proposal.campaign_id || "-"})
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 p-2.5">
      <div className="text-[10px] font-semibold text-violet-700">
        📣 캠페인 제안 · {proposal.segment}
        {proposal.audience != null && ` · 대상 약 ${proposal.audience.toLocaleString()}명`}
      </div>
      {proposal.execute_error && (
        <p className="mt-1 text-[9px] text-rose-500">실행 중 문제가 생겼어요: {proposal.execute_error}</p>
      )}
      <select
        value={proposal.channel}
        onChange={(e) => updateProposalDraft(idx, { channel: e.target.value })}
        className="mt-1.5 w-full rounded-md border border-violet-100 bg-white px-2 py-1 text-[10px] outline-none"
      >
        {CAMPAIGN_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <textarea
        value={proposal.message}
        onChange={(e) => updateProposalDraft(idx, { message: e.target.value })}
        rows={3}
        className="mt-1.5 w-full rounded-md border border-violet-100 bg-white px-2 py-1 text-[10px] outline-none"
      />
      <button
        onClick={async () => { setExecuting(true); await executeProposal(idx); setExecuting(false); }}
        disabled={executing}
        className="mt-1.5 w-full rounded-md bg-violet-600 py-1 text-[10px] font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
      >
        {executing ? "실행 중..." : "🚀 실행 (발송 이력에 기록)"}
      </button>
    </div>
  );
}

function Message({ idx, msg, isLast, onQuickReply }) {
  const { setFeedback } = useChat();
  const isUser = msg.role === "user";
  const thinking = msg.thinking || [];
  const sources = msg.sources || [];
  const quickReplies = isLast ? (msg.quickReplies || []) : [];

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl bg-violet-600 px-3 py-2 text-xs leading-relaxed text-white">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-xl bg-violet-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
        {thinking.length > 1 && (
          <details className="mb-1.5 rounded-md bg-white/60 px-2 py-1 text-[9px] text-slate-500">
            <summary className="cursor-pointer select-none font-medium">🔍 생각 과정 보기</summary>
            <div className="mt-1 flex flex-col gap-0.5">
              {thinking.map((step, i) => <span key={i}>· {step}</span>)}
            </div>
          </details>
        )}

        <div className="whitespace-pre-wrap">{renderText(msg.content)}</div>

        {msg.campaignProposal && <CampaignProposalCard idx={idx} proposal={msg.campaignProposal} />}

        {sources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1 border-t border-violet-100 pt-1.5">
            {sources.map((s, i) => (
              <span key={i} className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium text-violet-500 shadow-sm" title={s.label}>
                {s.chart_key ? "📊" : ""} 출처: {s.label}
              </span>
            ))}
          </div>
        )}

        {quickReplies.length > 0 && (
          <div className="mt-1.5 border-t border-violet-100 pt-1.5">
            <p className="mb-1 text-[9px] text-slate-400">이어서 물어보기</p>
            <div className="flex flex-wrap gap-1">
              {quickReplies.map((q, i) => (
                <button
                  key={i}
                  onClick={() => onQuickReply(q)}
                  className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[9px] font-medium text-violet-600 hover:bg-violet-100"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-1 border-t border-violet-100 pt-1">
          <button
            onClick={() => setFeedback(idx, "up")}
            className={`rounded px-1 text-[10px] ${msg.feedback === "up" ? "bg-violet-600 text-white" : "text-slate-400 hover:bg-white"}`}
          >
            👍
          </button>
          <button
            onClick={() => setFeedback(idx, "down")}
            className={`rounded px-1 text-[10px] ${msg.feedback === "down" ? "bg-violet-600 text-white" : "text-slate-400 hover:bg-white"}`}
          >
            👎
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FloatingChat() {
  const {
    isOpen, setIsOpen, messages, loading, send, askQuestion, seenCount, executionMode, setExecutionMode,
    draftInput, setDraftInput, ghostSuggestion, setGhostSuggestion,
  } = useChat();
  const input = draftInput;
  const setInput = setDraftInput;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && ghostSuggestion && inputRef.current) inputRef.current.focus();
  }, [isOpen, ghostSuggestion]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const handleSend = (q) => {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setInput("");
    setGhostSuggestion("");
    send(question);
  };

  // 회색 추천 문구가 떠있고 아직 아무것도 안 쳤을 때 Tab/Enter를 누르면, 그 추천을
  // 그대로 전송한다. 뭔가 타이핑을 시작하면(=input이 비어있지 않으면) 이 분기를
  // 타지 않으니 추천은 자연히 무시되고 원래 입력이 그대로 나간다.
  const acceptGhost = () => {
    if (!ghostSuggestion || input) return false;
    handleSend(ghostSuggestion);
    return true;
  };

  const unseen = messages.length - seenCount;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/10" onClick={() => setIsOpen(false)} />
      )}

      {isOpen && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[500px] w-[320px] flex-col overflow-hidden rounded-xl border border-violet-100 bg-white shadow-2xl shadow-violet-300/30">
          <div className="flex items-center justify-between border-b border-violet-100 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-800">🤖 AI 어시스턴트</span>
              <span className="flex items-center gap-1 text-[9px] text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />온라인
              </span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          <div className="border-b border-violet-100">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-medium text-slate-500 hover:bg-violet-50/50"
            >
              ⚙️ AI 실행 권한
              <span>{settingsOpen ? "▲" : "▼"}</span>
            </button>
            {settingsOpen && (
              <div className="px-3 pb-2">
                <div className="flex flex-col gap-1">
                  {[["suggest", "제안만 (승인 후 실행)"], ["auto", "완전 자동 실행"]].map(([k, label]) => (
                    <label key={k} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                      <input type="radio" name="execution_mode" checked={executionMode === k} onChange={() => setExecutionMode(k)} />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
                  '제안만'을 고르면 캠페인 제안 카드에서 문구를 확인·수정한 뒤 실행 버튼을 눌러야
                  기록되고, '완전 자동 실행'을 고르면 제안이 나오자마자 자동으로 기록돼요.
                </p>
              </div>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <>
                <p className="text-xs text-slate-500">
                  안녕하세요! ATHLEPA CRM AI 어시스턴트입니다.<br />고객 데이터 분석, 세그먼트 조회 등 원하는 걸 물어보세요.
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      className="rounded-md border border-violet-100 bg-violet-50/50 px-2.5 py-1.5 text-left text-[11px] text-violet-700 transition hover:bg-violet-100"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m, i) => (
              <Message key={i} idx={i} msg={m} isLast={i === messages.length - 1} onQuickReply={handleSend} />
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-slate-400">데이터 확인 중...</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 border-t border-violet-100 p-2.5">
            <div className="relative flex-1">
              {ghostSuggestion && !input && (
                <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-md px-2.5 py-1.5 text-xs text-slate-400">
                  <span className="truncate">{ghostSuggestion}</span>
                  <span className="ml-1.5 shrink-0 rounded border border-slate-300 px-1 text-[9px] text-slate-400">Tab</span>
                </div>
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); if (e.target.value) setGhostSuggestion(""); }}
                onKeyDown={(e) => {
                  if (e.key === "Tab" || e.key === "Enter") {
                    if (acceptGhost()) { e.preventDefault(); return; }
                  }
                  if (e.key === "Enter") handleSend();
                  // Tab으로도 직접 입력한 걸 보낼 수 있게 (추천 문구가 없을 때).
                  if (e.key === "Tab" && input.trim()) { e.preventDefault(); handleSend(); }
                }}
                placeholder={ghostSuggestion ? "" : "궁금한 걸 물어보세요 (Tab으로 바로 전송)"}
                className="relative w-full rounded-md border border-violet-100 bg-violet-50/30 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={loading}
              className="rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-40"
            >
              보내기
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-2.5 text-[11px] font-medium text-white shadow-lg shadow-violet-400/40 transition hover:bg-violet-700 hover:shadow-xl"
      >
        {isOpen ? "✕" : unseen > 0 ? `💬 ${unseen}` : "💬 AI 어시스턴트"}
      </button>
    </>
  );
}
