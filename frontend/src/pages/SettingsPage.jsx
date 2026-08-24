import { useEffect, useState } from "react";
import { api, API_BASE } from "../api";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";

function Block({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <h3 className="mb-3 text-[11px] font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

function PrimaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="rounded-md bg-violet-600 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function AccountSection() {
  const { session } = useAuth();
  return (
    <Block title="계정 정보">
      <div className="flex flex-col gap-2 text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-400">회사명</span>
          <span className="font-medium text-slate-700">{session.company_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">이메일</span>
          <span className="font-medium text-slate-700">{session.email || "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">회사 ID</span>
          <span className="font-mono text-[10px] text-slate-500">{session.company_id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">통화</span>
          <span className="font-medium text-slate-700">{session.currency || "KRW"}</span>
        </div>
      </div>
    </Block>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (next.length < 4) {
      setError("새 비밀번호는 4자 이상이어야 해요.");
      return;
    }
    if (next !== confirm) {
      setError("새 비밀번호가 서로 일치하지 않아요.");
      return;
    }
    setSubmitting(true);
    try {
      await api.changePassword(current, next);
      setMessage("비밀번호가 변경됐어요.");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e2) {
      setError(e2.message || "비밀번호 변경에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Block title="비밀번호 변경">
      <form onSubmit={handleSubmit} className="flex max-w-xs flex-col gap-2">
        <input
          type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
          placeholder="현재 비밀번호" required
          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
        />
        <input
          type="password" value={next} onChange={(e) => setNext(e.target.value)}
          placeholder="새 비밀번호" required
          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
        />
        <input
          type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder="새 비밀번호 확인" required
          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
        />
        {error && <p className="text-[10px] text-rose-500">{error}</p>}
        {message && <p className="text-[10px] text-emerald-600">{message}</p>}
        <PrimaryButton type="submit" disabled={submitting}>{submitting ? "변경 중..." : "비밀번호 변경"}</PrimaryButton>
      </form>
    </Block>
  );
}

function ApiKeysSection() {
  const [apiKey, setApiKey] = useState(null);
  const [regenerated, setRegenerated] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getKeys().then((r) => setApiKey(r.api_key));
  }, []);

  async function handleRegenerate() {
    if (!confirm("키를 재발급하면 기존 API 키/웹훅 시크릿은 더 이상 쓸 수 없어요. 계속할까요?")) return;
    setLoading(true);
    try {
      const r = await api.regenerateKeys();
      setRegenerated(r);
      setApiKey(r.api_key);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Block title="API 키 관리">
      <div className="flex flex-col gap-2 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">API 키</span>
          <span className="rounded-md bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-600">{apiKey || "불러오는 중..."}</span>
        </div>
        {regenerated && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-700">
            <p className="font-semibold">새 웹훅 시크릿 (지금만 표시돼요, 꼭 복사해두세요)</p>
            <p className="mt-1 break-all font-mono">{regenerated.webhook_secret}</p>
          </div>
        )}
        <PrimaryButton onClick={handleRegenerate} disabled={loading} className="w-fit">
          {loading ? "재발급 중..." : "키 재발급"}
        </PrimaryButton>
      </div>
    </Block>
  );
}

function CodeBlock({ children }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-slate-800 p-2.5 text-[10px] leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

function IntegrationGuideSection() {
  const [apiKey, setApiKey] = useState(null);

  useEffect(() => {
    api.getKeys().then((r) => setApiKey(r.api_key));
  }, []);

  const key = apiKey || "YOUR_API_KEY";

  return (
    <Block title="API 연동 가이드">
      <p className="mb-3 text-[10px] text-slate-400">
        자사 웹사이트/서버에서 아래처럼 요청을 보내면 실시간으로 데이터가 들어와요.
        주문·고객 데이터는 위 "API 키"가 아니라 웹훅 시크릿으로 인증해요 (키 재발급 시 한 번만 표시돼요).
      </p>

      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold text-slate-600">이벤트 수집 (방문·클릭·구매 등, 공개 API 키)</p>
          <CodeBlock>{`curl -X POST ${API_BASE}/api/ingest/track \\
  -H "Content-Type: application/json" \\
  -d '{"api_key": "${key}", "event_type": "purchase", "user_id": "u123", "session_id": "s123"}'`}</CodeBlock>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold text-slate-600">주문 데이터 수집 (서버 전용, 웹훅 시크릿)</p>
          <CodeBlock>{`curl -X POST ${API_BASE}/api/ingest/orders \\
  -H "Content-Type: application/json" \\
  -d '{"webhook_secret": "YOUR_WEBHOOK_SECRET", "order_id": "o123", "user_id": "u123", "total_amount": 39000}'`}</CodeBlock>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold text-slate-600">고객 프로필 수집 (서버 전용, 웹훅 시크릿)</p>
          <CodeBlock>{`curl -X POST ${API_BASE}/api/ingest/users \\
  -H "Content-Type: application/json" \\
  -d '{"webhook_secret": "YOUR_WEBHOOK_SECRET", "user_id": "u123", "email": "user@example.com"}'`}</CodeBlock>
        </div>
      </div>
    </Block>
  );
}

function ChatbotSection() {
  const { executionMode, setExecutionMode } = useChat();
  return (
    <Block title="AI 챗봇 기본 실행 권한">
      <div className="flex flex-col gap-1.5">
        {[["suggest", "제안만 (승인 후 실행)"], ["auto", "완전 자동 실행"]].map(([k, label]) => (
          <label key={k} className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <input type="radio" name="settings-exec-mode" checked={executionMode === k} onChange={() => setExecutionMode(k)} />
            {label}
          </label>
        ))}
      </div>
      <p className="mt-2 text-[9px] text-slate-400">
        챗봇이 캠페인을 제안했을 때 바로 실행할지, 확인 후 실행할지의 기본값이에요. 언제든 채팅창 안에서도 바꿀 수 있어요.
      </p>
    </Block>
  );
}

export default function SettingsPage() {
  const { logout } = useAuth();
  return (
    <div className="flex max-w-4xl flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <AccountSection />
          <PasswordSection />
        </div>
        <div className="flex flex-col gap-3">
          <ApiKeysSection />
          <ChatbotSection />
        </div>
      </div>
      <IntegrationGuideSection />
      <Block title="세션">
        <button
          onClick={logout}
          className="rounded-md border border-rose-200 px-3 py-1.5 text-[11px] font-medium text-rose-500 hover:bg-rose-50"
        >
          로그아웃
        </button>
      </Block>
    </div>
  );
}
