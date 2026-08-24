import { useEffect, useState } from "react";
import { api, API_BASE } from "../api";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";

function Block({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
      <h3 className="mb-4 text-base font-bold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function PrimaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function AccountSection() {
  const { session } = useAuth();
  return (
    <Block title="계정 정보">
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">회사명</span>
          <span className="font-semibold text-slate-800">{session.company_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">이메일</span>
          <span className="font-semibold text-slate-800">{session.email || "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">회사 ID</span>
          <span className="font-mono text-xs text-slate-600">{session.company_id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">통화</span>
          <span className="font-semibold text-slate-800">{session.currency || "KRW"}</span>
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <input
          type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
          placeholder="현재 비밀번호" required
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-300"
        />
        <input
          type="password" value={next} onChange={(e) => setNext(e.target.value)}
          placeholder="새 비밀번호" required
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-300"
        />
        <input
          type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder="새 비밀번호 확인" required
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-300"
        />
        {error && <p className="text-xs text-rose-500">{error}</p>}
        {message && <p className="text-xs text-emerald-600">{message}</p>}
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
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-1.5">
          <span className="text-slate-500">API 키</span>
          <span className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{apiKey || "불러오는 중..."}</span>
        </div>
        {regenerated && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
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
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없는 환경이면 조용히 무시 - 코드는 여전히 직접 드래그해서 복사 가능
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute right-3 top-3 rounded-md bg-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-slate-600"
      >
        {copied ? "복사됨" : "복사"}
      </button>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 pr-16 text-[13px] leading-relaxed text-slate-100">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function GuideStep({ n, title, note, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded-md bg-violet-100 text-[11px] font-bold text-violet-600">
          {n}
        </span>
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="text-xs text-slate-400">{note}</span>
      </div>
      {children}
    </div>
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
      <p className="mb-5 text-sm leading-relaxed text-slate-500">
        자사 웹사이트/서버에서 아래처럼 요청을 보내면 실시간으로 데이터가 들어와요. 주문·고객 데이터는 위{" "}
        <span className="font-semibold text-violet-600">API 키</span>가 아니라 웹훅 시크릿으로 인증해요 (키 재발급 시 한 번만 표시돼요).
      </p>

      <div className="flex flex-col gap-5">
        <GuideStep n="01" title="이벤트 수집" note="방문·클릭·구매 등, 공개 API 키">
          <CodeBlock>{`curl -X POST ${API_BASE}/api/ingest/track \\
  -H "Content-Type: application/json" \\
  -d '{"api_key": "${key}", "event_type": "page_view", "user_id": "u123"}'`}</CodeBlock>
        </GuideStep>
        <GuideStep n="02" title="주문 데이터 수집" note="서버 전용, 웹훅 시크릿">
          <CodeBlock>{`curl -X POST ${API_BASE}/api/ingest/orders \\
  -H "Content-Type: application/json" \\
  -d '{"webhook_secret": "YOUR_WEBHOOK_SECRET", "order_id": "o123", "user_id": "u123"}'`}</CodeBlock>
        </GuideStep>
        <GuideStep n="03" title="고객 프로필 수집" note="서버 전용, 웹훅 시크릿">
          <CodeBlock>{`curl -X POST ${API_BASE}/api/ingest/users \\
  -H "Content-Type: application/json" \\
  -d '{"webhook_secret": "YOUR_WEBHOOK_SECRET", "user_id": "u123", "email": "user@example.com"}'`}</CodeBlock>
        </GuideStep>
      </div>
    </Block>
  );
}

function ChatbotSection() {
  const { executionMode, setExecutionMode } = useChat();
  const OPTIONS = [
    ["suggest", "제안만 (승인 후 실행)", "챗봇이 캠페인을 제안하면, 확인 후 직접 실행 버튼을 눌러야 실제로 만들어져요."],
    ["auto", "완전 자동 실행", "챗봇이 캠페인을 제안하는 즉시 승인 없이 바로 실행돼요."],
  ];
  return (
    <Block title="AI 챗봇 기본 실행 권한">
      <div className="flex flex-col gap-2">
        {OPTIONS.map(([k, label, desc]) => (
          <label
            key={k}
            className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition ${
              executionMode === k ? "border-violet-400 bg-violet-50" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="radio" name="settings-exec-mode" checked={executionMode === k} onChange={() => setExecutionMode(k)} />
              {label}
            </span>
            <span className="pl-5 text-xs text-slate-500">{desc}</span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">언제든 채팅창 안에서도 바꿀 수 있어요.</p>
    </Block>
  );
}

export default function SettingsPage() {
  const { logout } = useAuth();
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <AccountSection />
          <PasswordSection />
        </div>
        <div className="flex flex-col gap-4">
          <ApiKeysSection />
          <ChatbotSection />
        </div>
      </div>
      <IntegrationGuideSection />
      <Block title="세션">
        <button
          onClick={logout}
          className="rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-medium text-rose-500 hover:bg-rose-50"
        >
          로그아웃
        </button>
      </Block>
    </div>
  );
}
