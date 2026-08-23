import { useEffect, useState } from "react";
import { api } from "../api";
import ChannelPreview from "../components/ChannelPreview";
import { buildRecipeBanner } from "../utils/recipeBanner";
import { requestFcmToken } from "../firebase";

const SEGMENT_OPTIONS = [
  "신규 탐색자", "충동 구매자", "할인 구매자", "브랜드 충성 고객", "이탈 위험 고객", "휴면 고객",
  "RFM: VIP", "RFM: 충성 고객", "RFM: 이탈 위험", "RFM: 휴면", "장바구니 이탈 고객",
];
const CHANNEL_OPTIONS = [
  { key: "kakao", label: "카카오톡" },
  { key: "sms", label: "문자(SMS/LMS)" },
  { key: "webpush", label: "웹 푸시" },
  { key: "email", label: "이메일" },
];
const RECEIVER_PLACEHOLDER = { kakao: "휴대폰 번호 입력", sms: "휴대폰 번호 입력", webpush: "FCM 토큰 입력", email: "이메일 주소 입력" };
const RECURRING_FREQS = ["매일 발송", "3일마다", "일주일마다", "특정 요일 반복"];
const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const TRIGGER_TYPES = [["schedule", "스케줄 기반"], ["event", "이벤트 트리거 기반"], ["api", "API 트리거 기반"]];
const EVENT_TRIGGERS = [
  "장바구니 담기 후 미구매", "위시리스트 등록 후 미구매", "회원가입 완료", "첫 구매 완료",
  "재구매 주기 도래", "리뷰 작성 요청 (배송 완료 후)", "생일/기념일", "회원 등급 승급",
  "포인트 소멸 임박", "관심 상품 재입고", "관심 상품 가격 인하", "장기 미접속 (휴면 전환 예정)",
];

function Block({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <h3 className="mb-2.5 text-[11px] font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

function todayLocalDatetime() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 크롬 등 브라우저는 웹 푸시의 큰 이미지를 가로로 넓은 배너 비율(약 2:1)로 강제
// 크롭해서 보여준다. 원본을 그대로 올리면 브라우저가 어디를 자를지 우리가 통제할
// 수 없으니, 업로드 전에 미리 같은 비율로 가운데를 기준 잘라서 보낸다.
const WEBPUSH_IMAGE_RATIO = 2;

function cropToWebpushRatio(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const srcRatio = img.width / img.height;
      let sx, sy, sw, sh;
      if (srcRatio > WEBPUSH_IMAGE_RATIO) {
        sh = img.height;
        sw = sh * WEBPUSH_IMAGE_RATIO;
        sx = (img.width - sw) / 2;
        sy = 0;
      } else {
        sw = img.width;
        sh = sw / WEBPUSH_IMAGE_RATIO;
        sx = 0;
        sy = (img.height - sh) / 2;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 1000 / WEBPUSH_IMAGE_RATIO;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default function CampaignWizard({ onCancel, onCreated, onTestSent, initialSegment, initialChannel, initialSituation, templateTitle, templateBody, recipeTitle, recipeArt, recipeColors }) {
  const [segment, setSegment] = useState(initialSegment && SEGMENT_OPTIONS.includes(initialSegment) ? initialSegment : SEGMENT_OPTIONS[0]);
  const [channel, setChannel] = useState(initialChannel && CHANNEL_OPTIONS.some((c) => c.key === initialChannel) ? initialChannel : "kakao");
  const [targetSize, setTargetSize] = useState(null);
  const [title, setTitle] = useState(templateTitle || "");
  const [body, setBody] = useState(templateBody || "");
  const [imageDataUrl, setImageDataUrl] = useState(
    recipeArt && recipeColors ? buildRecipeBanner({ title: recipeTitle, art: recipeArt, colors: recipeColors }) : null
  );
  const [generating, setGenerating] = useState(false);
  const [triggerType, setTriggerType] = useState("schedule");
  const [sendMode, setSendMode] = useState("immediate");
  const [sendAt, setSendAt] = useState(todayLocalDatetime());
  const [recurringFreq, setRecurringFreq] = useState(RECURRING_FREQS[0]);
  const [recurringWeekdays, setRecurringWeekdays] = useState([]);
  const [eventTrigger, setEventTrigger] = useState(EVENT_TRIGGERS[0]);
  const [apiEndpointKey, setApiEndpointKey] = useState("api_v1_campaign_trigger");
  const [triggerStartAt, setTriggerStartAt] = useState(todayLocalDatetime());
  const [hasTriggerEnd, setHasTriggerEnd] = useState(false);
  const [triggerEndAt, setTriggerEndAt] = useState(todayLocalDatetime());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [testReceiver, setTestReceiver] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [fcmLoading, setFcmLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState({ src: null, url: null });

  // 웹 푸시 이미지는 FCM이 외부에서 직접 fetch하는 실제 https URL이어야 해서
  // (로컬 파일을 읽어 만든 data: URL은 그대로 안 뜬다), 보낼 때 Supabase Storage에
  // 업로드해 공개 URL로 바꿔서 넣는다. 같은 이미지면 재업로드하지 않고 캐시해 둔다.
  async function getWebpushImageUrl() {
    if (!imageDataUrl) return null;
    if (!imageDataUrl.startsWith("data:")) return imageDataUrl;
    if (uploadedImage.src === imageDataUrl) return uploadedImage.url;
    const cropped = await cropToWebpushRatio(imageDataUrl);
    const { url } = await api.uploadCampaignImage(cropped);
    setUploadedImage({ src: imageDataUrl, url });
    return url;
  }

  async function handleGetFcmToken() {
    setFcmLoading(true);
    setTestResult("");
    try {
      const token = await requestFcmToken();
      setTestReceiver(token);
      setTestResult("이 브라우저의 알림 토큰을 가져왔어요. 테스트 발송을 누르면 이 브라우저로 실제 알림이 와요.");
    } catch (e) {
      setTestResult(e.message || "토큰을 가져오지 못했어요.");
    } finally {
      setFcmLoading(false);
    }
  }

  useEffect(() => {
    setTargetSize(null);
    api.campaignTargetSize(segment).then((r) => setTargetSize(r.size)).catch(() => setTargetSize(0));
  }, [segment]);

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const copy = await api.generateCampaignCopy(segment, channel, initialSituation);
      setTitle(copy.title);
      setBody(copy.body);
    } catch (e) {
      setError(e.message || "카피 생성에 실패했어요.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageDataUrl(await fileToDataUrl(file));
  }

  function toggleWeekday(i) {
    setRecurringWeekdays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]));
  }

  async function handleTestSend() {
    setTestResult("");
    if (!testReceiver.trim()) {
      setTestResult("수신자 정보를 입력해주세요.");
      return;
    }
    if (!title.trim() || !body.trim()) {
      setTestResult("메시지 제목/본문을 먼저 입력해주세요.");
      return;
    }
    setTestSending(true);
    try {
      const imageUrl = channel === "webpush" ? await getWebpushImageUrl() : null;
      await api.testSendCampaign({ segment, channel, title, body, receiver: testReceiver, image_url: imageUrl });
      setTestResult(`[${CHANNEL_OPTIONS.find((c) => c.key === channel).label}] 테스트 메시지가 발송 이력에 기록됐어요.`);
      onTestSent?.();
    } catch (e) {
      setTestResult(e.message || "테스트 발송에 실패했어요.");
    } finally {
      setTestSending(false);
    }
  }

  async function handleSubmit() {
    setError("");
    if (!title.trim() || !body.trim()) {
      setError("메시지 제목/본문을 입력해주세요.");
      return;
    }
    if (triggerType === "schedule") {
      if (sendMode === "scheduled" && !sendAt) {
        setError("예약 발송 시각을 선택해주세요.");
        return;
      }
      if (sendMode === "recurring" && recurringFreq === "특정 요일 반복" && recurringWeekdays.length === 0) {
        setError("반복할 요일을 1개 이상 선택해주세요.");
        return;
      }
    } else if (triggerType === "api" && !apiEndpointKey.trim()) {
      setError("API Endpoint Key를 입력해주세요.");
      return;
    }
    if ((triggerType === "event" || triggerType === "api") && hasTriggerEnd && triggerEndAt <= triggerStartAt) {
      setError("종료일시는 시작일시보다 나중이어야 해요.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.createCampaign({
        segment, channel, title, body, trigger_type: triggerType,
        send_mode: sendMode,
        send_at: triggerType === "schedule" && sendMode !== "immediate" ? new Date(sendAt).toISOString() : null,
        recurring_freq: triggerType === "schedule" && sendMode === "recurring" ? recurringFreq : null,
        recurring_weekdays: triggerType === "schedule" && sendMode === "recurring" ? recurringWeekdays : [],
        event_trigger: triggerType === "event" ? eventTrigger : null,
        api_endpoint_key: triggerType === "api" ? apiEndpointKey.trim() : null,
        trigger_start_at: triggerType === "event" || triggerType === "api" ? new Date(triggerStartAt).toISOString() : null,
        trigger_end_at: (triggerType === "event" || triggerType === "api") && hasTriggerEnd ? new Date(triggerEndAt).toISOString() : null,
        image_data_url: imageDataUrl,
      });
      onCreated(created);
    } catch (e) {
      setError(e.message || "캠페인 생성에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel = submitting ? "생성 중..." :
    triggerType === "event" ? "이벤트 트리거 등록" :
    triggerType === "api" ? "API 트리거 등록" :
    sendMode === "immediate" ? "전체 발송" :
    sendMode === "scheduled" ? "예약 등록" : "반복 발송 등록";

  return (
    <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1fr_260px]">
      <div className="flex flex-col gap-2.5">
        <button onClick={onCancel} className="w-fit text-[11px] font-medium text-slate-400 hover:text-violet-600">
          ← 목록으로 / 새 캠페인
        </button>

        {recipeTitle && (
          <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
            <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-600">레시피</span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-violet-800">{recipeTitle}</p>
              <p className="truncate text-[10px] text-violet-400">{initialSituation} · 이 상황에 맞춘 템플릿 문구와 배너 이미지를 채워넣었어요.</p>
            </div>
          </div>
        )}

        <Block title="타겟 및 채널 선택">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-400">타겟 세그먼트</span>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
              >
                {SEGMENT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-400">발송 채널</span>
              <div className="flex gap-1.5">
                {CHANNEL_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setChannel(c.key)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      channel === c.key ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-600 hover:bg-violet-100"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[10px] text-slate-400">예상 대상 인원</div>
              <div className="text-lg font-bold text-slate-900">{targetSize === null ? "…" : `${targetSize.toLocaleString()}명`}</div>
            </div>
          </div>
        </Block>

        <Block title="메시지 작성">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">AI로 카피를 생성하거나 직접 작성하세요.</span>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-md bg-violet-50 px-2.5 py-1 text-[10px] font-medium text-violet-600 transition hover:bg-violet-100 disabled:opacity-50"
            >
              {generating ? "생성 중..." : title || body ? "🔄 AI로 다시 생성" : "✨ AI 카피 자동 생성"}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="메시지 제목 입력"
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="메시지 본문 입력"
              rows={4}
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
            />
            {imageDataUrl ? (
              <div className="flex items-center gap-2">
                <img src={imageDataUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
                <button onClick={() => setImageDataUrl(null)} className="text-[10px] font-medium text-rose-500 hover:underline">제거</button>
              </div>
            ) : (
              <label className="w-fit cursor-pointer rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-[10px] text-violet-500 hover:bg-violet-50">
                📎 이미지 첨부 (선택)
                <input type="file" accept="image/png,image/jpeg" onChange={handleImageChange} className="hidden" />
              </label>
            )}
            <span className="text-[9px] text-slate-300">글자 수: {(title + body).length}자</span>
          </div>
        </Block>

        <Block title="발송 설정">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-400">발송 방식</span>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className="w-fit rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
            >
              {TRIGGER_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>

          {triggerType === "schedule" && (
            <div className="mt-2.5 flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400">발송 빈도</span>
                <div className="flex gap-1.5">
                  {[["immediate", "즉시 발송"], ["scheduled", "예약 발송"], ["recurring", "반복 발송"]].map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setSendMode(k)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                        sendMode === k ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-600 hover:bg-violet-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {sendMode === "scheduled" && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400">발송 일시</span>
                  <input
                    type="datetime-local"
                    value={sendAt}
                    onChange={(e) => setSendAt(e.target.value)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
                  />
                </label>
              )}
            </div>
          )}

          {triggerType === "schedule" && sendMode === "recurring" && (
            <div className="mt-2.5 flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400">반복 빈도</span>
                <select
                  value={recurringFreq}
                  onChange={(e) => setRecurringFreq(e.target.value)}
                  className="w-fit rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
                >
                  {RECURRING_FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              {recurringFreq === "특정 요일 반복" && (
                <div className="flex gap-1">
                  {WEEKDAY_LABELS.map((w, i) => (
                    <button
                      key={w}
                      onClick={() => toggleWeekday(i)}
                      className={`h-6 w-6 rounded-full text-[10px] font-medium transition ${
                        recurringWeekdays.includes(i) ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-500"
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400">첫 발송 일시</span>
                <input
                  type="datetime-local"
                  value={sendAt}
                  onChange={(e) => setSendAt(e.target.value)}
                  className="w-fit rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
                />
              </label>
            </div>
          )}

          {triggerType === "event" && (
            <label className="mt-2.5 flex flex-col gap-1">
              <span className="text-[10px] text-slate-400">트리거 이벤트</span>
              <select
                value={eventTrigger}
                onChange={(e) => setEventTrigger(e.target.value)}
                className="w-fit rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
              >
                {EVENT_TRIGGERS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
              <p className="mt-1 text-[9px] text-slate-300">이 이벤트가 발생한 고객에게 자동으로 발송되도록 등록돼요.</p>
            </label>
          )}

          {triggerType === "api" && (
            <label className="mt-2.5 flex flex-col gap-1">
              <span className="text-[10px] text-slate-400">API Endpoint Key</span>
              <input
                value={apiEndpointKey}
                onChange={(e) => setApiEndpointKey(e.target.value)}
                className="w-fit rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
              />
              <p className="mt-1 text-[9px] text-slate-300">외부 시스템이 이 키로 API를 호출하면 자동으로 발송되도록 등록돼요.</p>
            </label>
          )}

          {(triggerType === "event" || triggerType === "api") && (
            <div className="mt-2.5 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400">활성 시작일시</span>
                <input
                  type="datetime-local"
                  value={triggerStartAt}
                  onChange={(e) => setTriggerStartAt(e.target.value)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
                />
              </label>
              <label className="flex items-center gap-1.5 pb-1.5 text-[11px] text-slate-600">
                <input type="checkbox" checked={hasTriggerEnd} onChange={(e) => setHasTriggerEnd(e.target.checked)} />
                종료일 설정
              </label>
              {hasTriggerEnd && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400">종료일시</span>
                  <input
                    type="datetime-local"
                    value={triggerEndAt}
                    onChange={(e) => setTriggerEndAt(e.target.value)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
                  />
                </label>
              )}
              <p className="w-full text-[9px] text-slate-300">
                {hasTriggerEnd ? "이 기간에만 트리거를 감지해요." : "시작일시부터 무기한으로 트리거를 감지해요."}
              </p>
            </div>
          )}

          <p className="mt-2 text-[9px] text-slate-300">
            전체/예약/반복 발송은 아직 실제 발송 연동 전이라, 캠페인 기록만 생성되고 실제 메시지는 나가지 않아요 (실험 버전). 이메일·웹 푸시 테스트 발송만 실제로 나가요.
          </p>
        </Block>

        <Block title="테스트 발송">
          <p className="mb-2 text-[10px] text-slate-400">
            {channel === "email" && "실제 이메일이 발송돼요 (SendGrid 연동됨)."}
            {channel === "webpush" && "실제 웹 푸시가 발송돼요 (FCM 연동됨) - 수신자 칸에 FCM 등록 토큰을 입력하세요."}
            {channel !== "email" && channel !== "webpush" && "카카오톡/문자는 아직 발송 연동 전이라 기록만 남아요."}
          </p>
          {channel === "webpush" && (
            <button
              onClick={handleGetFcmToken}
              disabled={fcmLoading}
              className="mb-1.5 w-fit rounded-md border border-dashed border-violet-300 px-2.5 py-1 text-[10px] font-medium text-violet-500 transition hover:bg-violet-50 disabled:opacity-50"
            >
              {fcmLoading ? "토큰 요청 중..." : "🔔 이 브라우저 알림 토큰 가져오기"}
            </button>
          )}
          <div className="flex gap-1.5">
            <input
              value={testReceiver}
              onChange={(e) => setTestReceiver(e.target.value)}
              placeholder={RECEIVER_PLACEHOLDER[channel]}
              className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
            />
            <button
              onClick={handleTestSend}
              disabled={testSending}
              className="shrink-0 rounded-md border border-violet-200 px-2.5 py-1.5 text-[11px] font-medium text-violet-600 transition hover:bg-violet-50 disabled:opacity-50"
            >
              {testSending ? "발송 중..." : "테스트 발송"}
            </button>
          </div>
          {testResult && <p className="mt-1.5 text-[10px] text-slate-500">{testResult}</p>}
        </Block>

        {error && <p className="text-[11px] text-rose-500">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded-md border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-violet-50">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <Block title="실시간 미리보기">
          <ChannelPreview channel={channel} title={title} body={body} imageDataUrl={imageDataUrl} />
        </Block>
      </div>
    </div>
  );
}
