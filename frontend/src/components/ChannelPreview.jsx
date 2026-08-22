const WRAP = "mx-auto max-w-[220px] font-sans";

export default function ChannelPreview({ channel, title, body, imageDataUrl }) {
  const t = title || "제목 없음";
  const b = body || "내용입니다.";
  const img = imageDataUrl && (
    <img src={imageDataUrl} alt="" className="mt-1.5 w-full rounded-lg object-cover" />
  );

  if (channel === "webpush") {
    return (
      <div className={`${WRAP} rounded-2xl bg-[#1e1e1e] p-3`}>
        <div className="rounded-xl bg-[#f6f6f6] p-2.5">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#4285f4]" />
              <span className="text-[9px] font-semibold text-slate-700">Chrome</span>
            </div>
            <span className="text-[8px] text-slate-400">지금</span>
          </div>
          <div className="text-[11px] font-bold text-slate-900">{t}</div>
          <div className="mt-0.5 text-[10px] leading-relaxed text-slate-600">{b}</div>
          {img}
        </div>
      </div>
    );
  }

  if (channel === "kakao") {
    return (
      <div className={`${WRAP} rounded-2xl bg-[#abc0d0] p-2.5`}>
        <div className="rounded-t-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-800">Athlepa</div>
        <div className="rounded-b-xl bg-white p-2.5">
          <div className="text-[11px] font-bold text-slate-900">{t}</div>
          {img}
          <div className="mt-1.5 text-[10px] leading-relaxed text-slate-700">{b}</div>
        </div>
      </div>
    );
  }

  if (channel === "sms") {
    return (
      <div className={`${WRAP} rounded-2xl bg-[#f2f2f7] p-2.5`}>
        <div className="rounded-2xl bg-[#e9e9eb] p-2.5 text-[10px] text-slate-900">
          {title && <div className="mb-1 font-bold">(광고) {t}</div>}
          {img}
          <div className="mt-1 leading-relaxed">{b}</div>
        </div>
      </div>
    );
  }

  // email
  return (
    <div className={`${WRAP} rounded-2xl border border-slate-200 bg-white p-3`}>
      <div className="text-[11px] font-bold text-slate-900">{t}</div>
      {img}
      <div className="mt-2 text-[10px] leading-relaxed text-slate-700">{b}</div>
    </div>
  );
}
