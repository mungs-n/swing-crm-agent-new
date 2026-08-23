import { useEffect, useState } from "react";
import { api } from "../api";
import { requestFcmToken } from "../firebase";
import { cropToWebpushRatio } from "../utils/webpushImage";

const SEGMENT_OPTIONS = ["전체", "신규 탐색자", "충동 구매자", "할인 구매자", "브랜드 충성 고객", "이탈 위험 고객", "휴면 고객"];
const CHANNEL_OPTIONS = [
  { key: "email", label: "이메일", clickTrackable: true },
  { key: "kakao", label: "카카오톡", clickTrackable: false },
  { key: "sms", label: "메시지", clickTrackable: false },
  { key: "webpush", label: "웹 푸시", clickTrackable: true },
  { key: "webpopup", label: "웹 팝업", clickTrackable: true },
];
const TEST_RECEIVER_PLACEHOLDER = { kakao: "휴대폰 번호 입력", sms: "휴대폰 번호 입력", webpush: "FCM 토큰 입력", email: "이메일 주소 입력", webpopup: "수신자 입력" };
const SUCCESS_METRICS = [
  { key: "open", label: "오픈율" },
  { key: "click", label: "클릭률" },
  { key: "conversion", label: "전환율 (구매 완료)" },
];

function Block({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <h3 className="mb-2.5 text-[11px] font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

export default function AbTestWizard({ onCancel, onCreated }) {
  const [segment, setSegment] = useState("전체");
  const [channel, setChannel] = useState("email");
  const [segmentSize, setSegmentSize] = useState(null);
  const [groups, setGroups] = useState([{ label: "A", ratio: 50 }, { label: "B", ratio: 50 }]);
  const [includeControl, setIncludeControl] = useState(true);
  const [controlRatio, setControlRatio] = useState(20);
  const [messages, setMessages] = useState({ A: { title: "", text: "" }, B: { title: "", text: "" } });
  const [activeMsgTab, setActiveMsgTab] = useState("A");
  const [successMetric, setSuccessMetric] = useState("conversion");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [testReceiver, setTestReceiver] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [fcmLoading, setFcmLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState({ src: null, url: null });

  useEffect(() => {
    setSegmentSize(null);
    api.abTestSegmentSize(segment).then((r) => setSegmentSize(r.size)).catch(() => setSegmentSize(0));
  }, [segment]);

  const activeChannel = CHANNEL_OPTIONS.find((c) => c.key === channel);
  const remaining = Math.max(0, 100 - (includeControl ? controlRatio : 0));

  // 컨트롤 비율(따라서 remaining)이 바뀔 때마다 그룹 비율 합이 항상 remaining%가
  // 되도록 다시 맞춘다 - 그렇게 안 하면 초기값(A 50 / B 50)이 기본 컨트롤 20%와
  // 합쳐져 120%가 되는 것처럼, remaining이 줄어들 때 합이 100%를 넘어버린다.
  useEffect(() => {
    setGroups((prev) => {
      if (prev.length === 0) return prev;
      const others = prev.slice(0, -1);
      const sumOthers = others.reduce((a, g) => a + g.ratio, 0);
      const scaled = sumOthers > remaining && sumOthers > 0
        ? others.map((g) => ({ ...g, ratio: Math.floor((g.ratio * remaining) / sumOthers) }))
        : others;
      const usedByOthers = scaled.reduce((a, g) => a + g.ratio, 0);
      const last = { ...prev[prev.length - 1], ratio: Math.max(0, remaining - usedByOthers) };
      return [...scaled, last];
    });
  }, [remaining]);

  function updateRatio(index, value) {
    setGroups((prev) => {
      const next = [...prev];
      const cap = index === prev.length - 1 ? next[index].ratio : Math.max(0, remaining - sumExcept(prev, index));
      next[index] = { ...next[index], ratio: Math.min(value, cap) };
      // 마지막 그룹은 항상 나머지를 자동으로 가져감
      const usedBeforeLast = next.slice(0, -1).reduce((a, g) => a + g.ratio, 0);
      next[next.length - 1] = { ...next[next.length - 1], ratio: Math.max(0, remaining - usedBeforeLast) };
      return next;
    });
  }

  function sumExcept(list, index) {
    return list.reduce((a, g, i) => (i === index || i === list.length - 1 ? a : a + g.ratio), 0);
  }

  function addGroup() {
    if (groups.length >= 5) return;
    const nextLetter = String.fromCharCode(65 + groups.length);
    setGroups((prev) => {
      const next = [...prev, { label: nextLetter, ratio: 0 }];
      const usedBeforeLast = next.slice(0, -1).reduce((a, g) => a + g.ratio, 0);
      next[next.length - 1] = { ...next[next.length - 1], ratio: Math.max(0, remaining - usedBeforeLast) };
      return next;
    });
    setMessages((prev) => ({ ...prev, [nextLetter]: { title: "", text: "" } }));
  }

  function updateMessage(label, field, value) {
    setMessages((prev) => ({ ...prev, [label]: { ...prev[label], [field]: value } }));
  }

  // 웹 푸시 이미지는 FCM이 외부에서 직접 fetch하는 실제 https URL이어야 해서, 보낼 때
  // Supabase Storage에 업로드해 공개 URL로 바꿔서 넣는다. 같은 이미지면 재업로드하지 않는다.
  async function getWebpushImageUrl(imageDataUrl) {
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

  // 그룹별 실제 발송 대상 전체에겐 아직 못 보낸다(users 테이블에 연락처 정보가
  // 없어서) - 대신 지금 편집 중인 그룹(activeMsgTab)의 문구를 사람이 직접 입력한
  // 수신자 한 명에게 실제로 보내서, 채널별로 문구/이미지가 제대로 도착하는지
  // 미리 확인할 수 있게 한다. 캠페인 위저드의 테스트 발송과 같은 경로를 재사용한다.
  async function handleTestSend() {
    setTestResult("");
    const msg = messages[activeMsgTab] || {};
    if (!testReceiver.trim()) {
      setTestResult("수신자 정보를 입력해주세요.");
      return;
    }
    if (!msg.title?.trim() || !msg.text?.trim()) {
      setTestResult(`'${activeMsgTab}' 그룹의 메시지 제목/본문을 먼저 입력해주세요.`);
      return;
    }
    setTestSending(true);
    try {
      const imageUrl = channel === "webpush" ? await getWebpushImageUrl(msg.image_data_url) : null;
      await api.testSendCampaign({ segment, channel, title: msg.title, body: msg.text, receiver: testReceiver, image_url: imageUrl });
      setTestResult(`'${activeMsgTab}' 그룹 메시지가 실제로 발송됐어요.`);
    } catch (e) {
      setTestResult(e.message || "테스트 발송에 실패했어요.");
    } finally {
      setTestSending(false);
    }
  }

  async function handleSubmit() {
    setError("");
    for (const g of groups) {
      if (!messages[g.label]?.title?.trim()) {
        setError(`'${g.label}' 그룹의 메시지 제목을 입력해주세요.`);
        setActiveMsgTab(g.label);
        return;
      }
    }
    setSubmitting(true);
    try {
      const created = await api.createAbTest({
        segment, channel, groups, include_control: includeControl,
        control_ratio: includeControl ? controlRatio : 0, messages, success_metric: successMetric,
      });
      onCreated(created);
    } catch (e) {
      setError(e.message || "테스트 생성에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <button onClick={onCancel} className="w-fit text-[11px] font-medium text-slate-400 hover:text-violet-600">
        ← 목록으로 / 새 A/B 테스트
      </button>

      <Block title="대상 선택">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-400">대상 세그먼트</span>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
            >
              {SEGMENT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-400">발송 채널</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
            >
              {CHANNEL_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <div className="ml-auto text-right">
            <div className="text-[10px] text-slate-400">예상 대상 인원</div>
            <div className="text-lg font-bold text-slate-900">{segmentSize === null ? "…" : `${segmentSize.toLocaleString()}명`}</div>
          </div>
        </div>
        {!activeChannel.clickTrackable && (
          <p className="mt-2 text-[10px] text-amber-600">이 채널은 클릭 추적이 안 돼요. 성공 지표에서 클릭률은 참고용으로만 쓰세요.</p>
        )}
      </Block>

      <Block title="A/B 테스트 그룹 설정">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <input type="checkbox" checked={includeControl} onChange={(e) => setIncludeControl(e.target.checked)} />
            컨트롤 그룹 포함 (발송 없음 — 기준선)
          </label>
          {groups.length < 5 && (
            <button onClick={addGroup} className="rounded-md bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-600 hover:bg-violet-100">
              + 그룹 추가
            </button>
          )}
        </div>

        {includeControl && (
          <div className="mt-2.5 flex items-center gap-2.5">
            <span className="w-14 shrink-0 text-[11px] text-slate-400">컨트롤</span>
            <input
              type="range" min={0} max={100} value={controlRatio}
              onChange={(e) => setControlRatio(Number(e.target.value))}
              className="flex-1 accent-slate-400"
            />
            <span className="w-10 shrink-0 text-right text-[11px] font-semibold text-slate-500">{controlRatio}%</span>
          </div>
        )}

        <div className="mt-2 flex flex-col gap-2">
          {groups.map((g, i) => {
            const isLast = i === groups.length - 1;
            return (
              <div key={g.label} className="flex items-center gap-2.5">
                <span className="w-14 shrink-0 text-[11px] font-medium text-slate-600">{g.label}</span>
                {isLast ? (
                  <span className="flex-1 text-[10px] text-slate-400">나머지 자동 배정</span>
                ) : (
                  <input
                    type="range" min={0} max={remaining} value={g.ratio}
                    onChange={(e) => updateRatio(i, Number(e.target.value))}
                    className="flex-1 accent-violet-500"
                  />
                )}
                <span className="w-10 shrink-0 text-right text-[11px] font-semibold text-violet-600">{g.ratio}%</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2.5">
          {groups.map((g) => (
            <span key={g.label} className="text-[10px] text-slate-400">
              {g.label} · 약 {segmentSize === null ? "-" : Math.round(segmentSize * g.ratio / 100).toLocaleString()}명
            </span>
          ))}
        </div>
      </Block>

      <Block title="그룹별 메시지">
        <div className="mb-2.5 flex gap-1 border-b border-slate-100">
          {groups.map((g) => (
            <button
              key={g.label}
              onClick={() => setActiveMsgTab(g.label)}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition ${
                activeMsgTab === g.label ? "border-b-2 border-violet-600 text-violet-700" : "border-b-2 border-transparent text-slate-400"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <input
            value={messages[activeMsgTab]?.title || ""}
            onChange={(e) => updateMessage(activeMsgTab, "title", e.target.value)}
            placeholder="메시지 제목 입력"
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
          />
          <textarea
            value={messages[activeMsgTab]?.text || ""}
            onChange={(e) => updateMessage(activeMsgTab, "text", e.target.value)}
            placeholder="메시지 내용 입력"
            rows={3}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
          />
          {messages[activeMsgTab]?.image_data_url ? (
            <div className="flex items-center gap-2">
              <img src={messages[activeMsgTab].image_data_url} alt="" className="h-12 w-12 rounded-md object-cover" />
              <button
                onClick={() => updateMessage(activeMsgTab, "image_data_url", null)}
                className="text-[10px] font-medium text-rose-500 hover:underline"
              >
                제거
              </button>
            </div>
          ) : (
            <label className="w-fit cursor-pointer rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-[10px] text-violet-500 hover:bg-violet-50">
              📎 이미지 첨부 (선택)
              <input
                type="file" accept="image/png,image/jpeg" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => updateMessage(activeMsgTab, "image_data_url", reader.result);
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          )}
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-1.5 text-[10px] text-slate-400">
            '{activeMsgTab}' 그룹 문구를 실제 수신자 한 명에게 보내서 미리 확인해볼 수 있어요. (전체 대상자 발송과는 별개예요.)
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {channel === "webpush" && (
              <button
                onClick={handleGetFcmToken}
                disabled={fcmLoading}
                className="rounded-md border border-dashed border-violet-300 px-2 py-1.5 text-[10px] font-medium text-violet-500 hover:bg-violet-50 disabled:opacity-50"
              >
                {fcmLoading ? "가져오는 중..." : "이 브라우저 알림 토큰 가져오기"}
              </button>
            )}
            <input
              value={testReceiver}
              onChange={(e) => setTestReceiver(e.target.value)}
              placeholder={TEST_RECEIVER_PLACEHOLDER[channel]}
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-violet-300"
            />
            <button
              onClick={handleTestSend}
              disabled={testSending}
              className="shrink-0 rounded-md bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {testSending ? "발송 중..." : "테스트 발송"}
            </button>
          </div>
          {testResult && <p className="mt-1.5 text-[10px] text-slate-500">{testResult}</p>}
        </div>
      </Block>

      <Block title="성공 지표">
        <div className="flex flex-wrap gap-1.5">
          {SUCCESS_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setSuccessMetric(m.key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                successMetric === m.key ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-600 hover:bg-violet-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
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
          {submitting ? "생성 중..." : "테스트 시작"}
        </button>
      </div>
    </div>
  );
}
