import { useAuth } from "../context/AuthContext";

export default function OnboardingScreen() {
  const { onboarding, dismissOnboarding } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFC]">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
        <h1 className="text-center text-lg font-bold text-slate-900">가입 완료!</h1>
        <p className="mt-0.5 text-center text-[11px] text-slate-400">아래 키는 다시 보여드리지 않으니 지금 복사해두세요</p>

        <div className="mt-5">
          <p className="text-[11px] font-semibold text-slate-600">웹사이트에 심는 트래킹 키 (공개용)</p>
          <code className="mt-0.5 block break-all rounded-md bg-violet-50 px-2.5 py-1.5 text-[11px] text-violet-700">{onboarding.api_key}</code>
          <p className="mt-0.5 text-[10px] text-slate-400">고객 웹사이트 스니펫의 data-api-key 값으로 사용하세요.</p>
        </div>

        <div className="mt-3">
          <p className="text-[11px] font-semibold text-slate-600">주문 데이터 연동용 웹훅 시크릿 (절대 노출 금지)</p>
          <code className="mt-0.5 block break-all rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">{onboarding.webhook_secret}</code>
          <p className="mt-0.5 text-[10px] text-slate-400">자사 서버(백엔드)에서만 사용하세요. 브라우저 코드에는 절대 넣지 마세요.</p>
        </div>

        <button
          onClick={dismissOnboarding}
          className="mt-5 w-full rounded-md bg-violet-600 py-2 text-xs font-medium text-white transition hover:bg-violet-700"
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
