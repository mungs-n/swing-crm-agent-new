import { useState } from "react";
import FloatingChat from "./components/FloatingChat";
import LoginForm from "./components/LoginForm";
import SignupForm from "./components/SignupForm";
import OnboardingScreen from "./components/OnboardingScreen";
import { ChatProvider } from "./context/ChatContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import DashboardPage from "./pages/DashboardPage";
import CampaignsTab from "./pages/CampaignsTab";
import AbTestTab from "./pages/AbTestTab";
import PerformanceTab from "./pages/PerformanceTab";
import SettingsPage from "./pages/SettingsPage";

function DashboardIcon({ className }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="12" width="4" height="9" /><rect x="10" y="7" width="4" height="14" /><rect x="17" y="3" width="4" height="18" />
    </svg>
  );
}
function AutomationIcon({ className }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 11 14 9 22 21 10 13 10 13 2" />
    </svg>
  );
}
function SettingsIcon({ className }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
const CHEVRON_ROTATE = { left: undefined, right: "rotate(180deg)", down: "rotate(-90deg)", up: "rotate(90deg)" };
function ChevronIcon({ className, dir = "left" }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: CHEVRON_ROTATE[dir] }}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

const NAV_ITEMS = [
  { key: "dashboard", label: "대시보드", Icon: DashboardIcon, title: "대시보드", subtitle: "고객·매출 데이터 개요", Component: DashboardPage },
  {
    key: "automation", label: "자동화", Icon: AutomationIcon, title: "마케팅 자동화", subtitle: "캠페인 발송·A/B 테스트·성과",
    subItems: [
      { key: "campaigns", label: "캠페인 관리", Component: CampaignsTab },
      { key: "ab_test", label: "A/B 테스트", Component: AbTestTab },
      { key: "performance", label: "퍼포먼스 대시보드", Component: PerformanceTab },
    ],
  },
];

const SETTINGS_ITEM = { key: "settings", label: "설정", Icon: SettingsIcon, title: "설정", subtitle: "계정·API 키·챗봇 기본값", Component: SettingsPage };

function Shell() {
  const { session, logout } = useAuth();
  const [page, setPage] = useState("dashboard");
  const [subPage, setSubPage] = useState("campaigns");
  const [collapsed, setCollapsed] = useState(false);
  const [automationExpanded, setAutomationExpanded] = useState(true);

  const allItems = [...NAV_ITEMS, SETTINGS_ITEM];
  const navItem = allItems.find((n) => n.key === page);
  const Active = navItem.subItems ? navItem.subItems.find((s) => s.key === subPage).Component : navItem.Component;
  const pageTitle = navItem.subItems ? navItem.subItems.find((s) => s.key === subPage).label : navItem.title;

  const initial = (session.company_name || "?").trim().slice(0, 1).toUpperCase();

  function NavButton({ item }) {
    const isActive = page === item.key;
    const expandable = Boolean(item.subItems) && !collapsed;
    return (
      <button
        onClick={() => setPage(item.key)}
        title={collapsed ? item.label : undefined}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition ${
          collapsed ? "justify-center" : ""
        } ${isActive ? "bg-violet-500/15 text-violet-300" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
      >
        <item.Icon className="shrink-0" />
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
        {expandable && (
          <span
            role="button"
            tabIndex={0}
            title={automationExpanded ? "하위 메뉴 접기" : "하위 메뉴 펴기"}
            onClick={(e) => { e.stopPropagation(); setAutomationExpanded((v) => !v); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setAutomationExpanded((v) => !v); } }}
            className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-slate-200"
          >
            <ChevronIcon dir={automationExpanded ? "down" : "right"} />
          </span>
        )}
      </button>
    );
  }

  return (
    <ChatProvider>
      <div className="flex min-h-screen bg-[#F7F8FA]">
        <aside className={`flex shrink-0 flex-col bg-[#20232E] px-3 py-4 transition-all ${collapsed ? "w-16" : "w-48"}`}>
          <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}>
            <div className={`flex items-center gap-2 px-1 ${collapsed ? "justify-center" : "min-w-0 flex-1"}`}>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500 text-xs font-bold text-white">{initial}</div>
              {!collapsed && (
                <div className="min-w-0">
                  <h1 className="truncate text-xs font-bold text-white">{session.company_name}</h1>
                  <p className="text-[9px] text-slate-500">CRM 대시보드</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "펼치기" : "접기"}
              className={`flex shrink-0 items-center justify-center rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300 ${collapsed ? "mt-2" : ""}`}
            >
              <ChevronIcon dir={collapsed ? "right" : "left"} />
            </button>
          </div>

          {!collapsed && <p className="mb-1.5 mt-6 px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">메뉴</p>}
          {collapsed && <div className="mt-6" />}
          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <div key={item.key}>
                <NavButton item={item} />
                {item.subItems && automationExpanded && (
                  <div className={`mt-0.5 flex flex-col gap-0.5 ${collapsed ? "" : "border-l border-white/10 pl-3"}`}>
                    {item.subItems.map((sub) => (
                      <button
                        key={sub.key}
                        onClick={() => { setPage(item.key); setSubPage(sub.key); }}
                        title={collapsed ? sub.label : undefined}
                        className={`rounded-md px-2 py-1 text-left text-[11px] font-medium transition ${collapsed ? "text-center" : ""} ${
                          page === item.key && subPage === sub.key ? "text-violet-300" : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
                        }`}
                      >
                        {collapsed ? sub.label.slice(0, 1) : sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-2">
            <NavButton item={SETTINGS_ITEM} />

            <div className={`flex items-center gap-2 border-t border-white/10 px-1 pt-3 ${collapsed ? "justify-center" : ""}`}>
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-slate-200">
                {initial}
              </div>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-medium text-slate-200">{session.company_name}</p>
                  </div>
                  <button onClick={logout} className="shrink-0 text-[9px] font-medium text-slate-500 hover:text-slate-300">
                    로그아웃
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">{pageTitle}</h2>
              <p className="mt-0.5 text-[10px] text-slate-400">{navItem.subtitle}</p>
            </div>
          </header>
          <main className="px-6 py-5">
            <Active />
          </main>
        </div>
      </div>
      <FloatingChat />
    </ChatProvider>
  );
}

function Gate() {
  const { session, checking, onboarding } = useAuth();
  const [authView, setAuthView] = useState("login");

  if (checking) {
    return <div className="grid min-h-screen place-items-center text-xs text-slate-400">불러오는 중...</div>;
  }
  if (!session) {
    return authView === "login" ? (
      <LoginForm onSwitchToSignup={() => setAuthView("signup")} />
    ) : (
      <SignupForm onSwitchToLogin={() => setAuthView("login")} />
    );
  }
  if (onboarding) {
    return <OnboardingScreen />;
  }
  return <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
