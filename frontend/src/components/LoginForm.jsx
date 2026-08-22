import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginForm({ onSwitchToSignup }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFC]">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
        <h1 className="text-center text-lg font-bold text-slate-900">ATHLEPA CRM</h1>
        <p className="mt-0.5 text-center text-[11px] text-slate-400">회사 계정으로 로그인하세요</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2.5">
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
          {error && <p className="text-[11px] text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-0.5 rounded-md bg-violet-600 py-2 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <details className="mt-3 rounded-md bg-slate-50 p-2.5 text-[11px] text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-600">데모 계정 안내</summary>
          <div className="mt-1.5 space-y-1">
            <p>athlepa@demo.com / demo1234 — ATHLEPA</p>
            <p>dacon@demo.com / demo1234 — 데이콘 리테일(예시 2번째 기업)</p>
          </div>
        </details>

        <button
          onClick={onSwitchToSignup}
          className="mt-2.5 w-full rounded-md py-1.5 text-[11px] font-medium text-violet-500 hover:bg-violet-50"
        >
          계정이 없으신가요? 회사 등록하기
        </button>
      </div>
    </div>
  );
}
