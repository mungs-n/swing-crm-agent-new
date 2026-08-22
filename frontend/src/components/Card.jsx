import { useChat } from "../context/ChatContext";

export default function Card({ title, help, children, className = "", askQuestion }) {
  const { askQuestion: ask } = useChat();
  const clickable = Boolean(askQuestion);

  return (
    <div
      onClick={clickable ? () => ask(askQuestion) : undefined}
      className={`group relative rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 transition ${
        clickable ? "cursor-pointer hover:border-violet-300 hover:shadow-md hover:shadow-violet-100/50" : ""
      } ${className}`}
    >
      {clickable && (
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-medium text-violet-600 opacity-0 transition group-hover:opacity-100">
물어보기 →
        </span>
      )}
      {title && (
        <div className="mb-2.5 flex items-center gap-1">
          <h2 className="text-[11px] font-semibold text-slate-800">{title}</h2>
          {help && (
            <span className="group/help relative cursor-help text-[10px] text-slate-300" onClick={(e) => e.stopPropagation()}>
              <span className="rounded-full border border-slate-300 px-1">?</span>
              <span className="pointer-events-none absolute left-0 top-5 z-10 hidden w-60 rounded-md border border-slate-200 bg-white p-2 text-[10px] leading-relaxed text-slate-600 shadow-lg group-hover/help:block">
                {help}
              </span>
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
