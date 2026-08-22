import { createContext, useContext, useState, useCallback, useEffect } from "react";

const ChatContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8600";
const STORAGE_KEY = "athlepa_crm_token";
const EXECUTION_MODE_KEY = "athlepa_crm_execution_mode";

function authHeaders() {
  const token = localStorage.getItem(STORAGE_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function ChatProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  // {role, content, toolCalls?, sources?, thinking?, quickReplies?, campaignProposal?, feedback?}
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  // 채팅창을 열고 입력창에 질문을 "채워만" 두는 용도 (바로 전송하는 askQuestion과 달리
  // 사용자가 확인/수정 후 Tab이나 Enter로 직접 보내게 함) - 차트의 특정 항목(예: 성별
  // 분포의 "여성" 막대)을 클릭했을 때, 그 항목만 콕 집은 구체적인 질문을 미리 채워준다.
  const [draftInput, setDraftInput] = useState("");
  const [executionMode, setExecutionModeState] = useState(() => localStorage.getItem(EXECUTION_MODE_KEY) || "suggest"); // "suggest" | "auto"
  const setExecutionMode = useCallback((mode) => {
    localStorage.setItem(EXECUTION_MODE_KEY, mode);
    setExecutionModeState(mode);
  }, []);

  useEffect(() => {
    if (isOpen) setSeenCount(messages.length);
  }, [isOpen, messages.length]);

  const send = useCallback(async (question, historyOverride = null) => {
    const history = historyOverride ?? messages;
    const nextMessages = [...history, { role: "user", content: question }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          execution_mode: executionMode,
        }),
      });
      const data = await res.json();
      setMessages([...nextMessages, {
        role: "assistant", content: data.text, toolCalls: data.tool_calls,
        sources: data.sources || [], thinking: data.thinking || [], quickReplies: data.quick_replies || [],
        campaignProposal: data.campaign_proposal || null, feedback: null,
      }]);
    } catch (e) {
      setMessages([...nextMessages, { role: "assistant", content: `죄송해요, 답변 중 오류가 발생했어요 (${e.message}).`, toolCalls: [] }]);
    } finally {
      setLoading(false);
    }
  }, [messages, executionMode]);

  const askQuestion = useCallback((question) => {
    setIsOpen(true);
    send(question);
  }, [send]);

  // 카드 전체가 아니라 차트 안의 특정 항목(막대 하나, 도넛 조각 하나 등)을 클릭했을 때 쓴다.
  // 바로 보내지 않고 입력창에 채워서, 사용자가 그대로 보내거나 다듬을 수 있게 한다.
  const proposeQuestion = useCallback((question) => {
    setIsOpen(true);
    setDraftInput(question);
  }, []);

  const setFeedback = useCallback((idx, type) => {
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, feedback: m.feedback === type ? null : type } : m)));
  }, []);

  const updateProposalDraft = useCallback((idx, patch) => {
    setMessages((prev) => prev.map((m, i) => (
      i === idx && m.campaignProposal ? { ...m, campaignProposal: { ...m.campaignProposal, ...patch } } : m
    )));
  }, []);

  const executeProposal = useCallback(async (idx) => {
    const msg = messages[idx];
    if (!msg?.campaignProposal) return;
    const { segment, channel, message, audience } = msg.campaignProposal;
    try {
      const res = await fetch(`${API_BASE}/api/chat/execute-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ segment, channel, message, audience }),
      });
      const data = await res.json();
      updateProposalDraft(idx, { executed: data.executed, campaign_id: data.campaign_id, execute_error: data.execute_error });
    } catch (e) {
      updateProposalDraft(idx, { execute_error: e.message });
    }
  }, [messages, updateProposalDraft]);

  const value = {
    isOpen, setIsOpen, messages, loading, send, askQuestion, proposeQuestion,
    draftInput, setDraftInput,
    seenCount, executionMode, setExecutionMode,
    setFeedback, updateProposalDraft, executeProposal,
  };
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
