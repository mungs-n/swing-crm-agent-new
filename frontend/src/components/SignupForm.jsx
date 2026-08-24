import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const CURRENCY_OPTIONS = [
  { code: "KRW", label: "KRW - 원화 (₩)" },
  { code: "USD", label: "USD - 달러 ($)" },
  { code: "EUR", label: "EUR - 유로 (€)" },
  { code: "JPY", label: "JPY - 엔화 (¥)" },
  { code: "GBP", label: "GBP - 파운드 (£)" },
];

export default function SignupForm({ onSwitchToLogin }) {
  const { signup } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currency, setCurrency] = useState("KRW");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!companyName || !email || !password) {
      setError("모든 항목을 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      await signup(companyName, email, password, currency);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFC]">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
        <h1 className="text-center text-lg font-bold text-slate-900">회사 계정 등록</h1>
        <p className="mt-0.5 text-center text-[11px] text-slate-400">새 회사로 AI CRM 플랫폼을 시작하세요</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2.5">
          <input
            placeholder="회사명"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs outline-none focus:border-violet-300"
          />
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs outline-none focus:border-violet-300"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs outline-none focus:border-violet-300"
          />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-400">사용 통화</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs outline-none focus:border-violet-300"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <span className="text-[9px] text-slate-300">가입 후에는 바꿀 수 없어요 - 주문 금액 표시 기준이에요.</span>
          </label>
          {error && <p className="text-[11px] text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-0.5 rounded-md bg-violet-600 py-2 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? "가입 중..." : "가입하기"}
          </button>
        </form>

        <button
          onClick={onSwitchToLogin}
          className="mt-2.5 w-full rounded-md py-1.5 text-[11px] font-medium text-violet-500 hover:bg-violet-50"
        >
          이미 계정이 있으신가요? 로그인
        </button>
      </div>
    </div>
  );
}
