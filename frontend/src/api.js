// 배포 환경에서는 Vercel 등에 VITE_API_BASE 환경변수로 실제 백엔드 URL을 지정한다.
// 로컬 개발에서는 지정 안 하면 기존처럼 로컬 백엔드를 그대로 바라본다.
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8600";
const STORAGE_KEY = "athlepa_crm_token";

class UnauthorizedError extends Error {}

// 탭을 넘나들 때마다 백엔드가 이미 60초 캐싱 중인 값을 다시 네트워크로 왕복하며
// 기다리는 게 체감 지연의 대부분이었다 - 그래서 여기서도 짧게(45초) 캐싱해서
// 같은 탭을 다시 눌렀을 때는 네트워크 왕복 없이 즉시 그려지게 한다. 쓰기(post/del)
// 이후에는 캐시가 낡을 수 있으니 통째로 비우고, 로그인/로그아웃(계정 전환) 때도
// AuthContext에서 clearCache()를 호출해 다른 회사 데이터가 섞이지 않게 한다.
const _cache = new Map(); // path -> {data, ts}
const CACHE_TTL_MS = 45000;

function clearCache() {
  _cache.clear();
}

async function get(path) {
  const hit = _cache.get(path);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const token = localStorage.getItem(STORAGE_KEY);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) throw new UnauthorizedError("로그인이 필요합니다.");
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  const data = await res.json();
  _cache.set(path, { data, ts: Date.now() });
  return data;
}

async function post(path, body) {
  const token = localStorage.getItem(STORAGE_KEY);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  if (res.status === 401) throw new UnauthorizedError("로그인이 필요합니다.");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `${path} failed: ${res.status}`);
  }
  const data = await res.json();
  clearCache();
  return data;
}

async function del(path) {
  const token = localStorage.getItem(STORAGE_KEY);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) throw new UnauthorizedError("로그인이 필요합니다.");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `${path} failed: ${res.status}`);
  }
  const data = await res.json();
  clearCache();
  return data;
}

function withRange(path, startDate, endDate) {
  return startDate && endDate ? `${path}?start_date=${startDate}&end_date=${endDate}` : path;
}

export const api = {
  UnauthorizedError,
  clearCache,
  kpi: (startDate, endDate) => get(withRange("/api/kpi", startDate, endDate)),
  gmvTrend: (startDate, endDate) => get(withRange("/api/gmv-trend", startDate, endDate)),
  revenueBreakdown: (startDate, endDate) => get(withRange("/api/revenue-breakdown", startDate, endDate)),
  rfmScatter: (startDate, endDate) => get(withRange("/api/rfm-scatter", startDate, endDate)),
  funnel: (startDate, endDate) => get(withRange("/api/funnel", startDate, endDate)),
  repeatFunnel: () => get("/api/repeat-funnel"),
  cohort: (startDate, endDate) => get(withRange("/api/cohort", startDate, endDate)),
  customerProfile: (startDate, endDate) => get(withRange("/api/customer-profile", startDate, endDate)),
  campaigns: () => get("/api/campaigns"),
  performance: (startDate, endDate) => get(withRange("/api/performance", startDate, endDate)),
  abTests: () => get("/api/ab-tests"),
  abTestSegmentSize: (segment) => get(`/api/ab-tests/segment-size?segment=${encodeURIComponent(segment)}`),
  createAbTest: (payload) => post("/api/ab-tests", payload),
  endAbTest: (testId, winnerGroupId) => post(`/api/ab-tests/${testId}/end`, { winner_group_id: winnerGroupId }),
  campaignTargetSize: (segment) => get(`/api/campaigns/target-size?segment=${encodeURIComponent(segment)}`),
  generateCampaignCopy: (segment, channel, situation) => post("/api/campaigns/generate-copy", { segment, channel, situation: situation || null }),
  createCampaign: (payload) => post("/api/campaigns", payload),
  rawOverview: () => get("/api/raw/overview"),
  rawRevenue: () => get("/api/raw/revenue"),
  rawBehavior: () => get("/api/raw/behavior"),
  rawDetail: () => get("/api/raw/detail"),
  testSendCampaign: (payload) => post("/api/campaigns/test-send", payload),
  uploadCampaignImage: (imageDataUrl) => post("/api/campaigns/upload-image", { image_data_url: imageDataUrl }),
  recurringCampaigns: () => get("/api/campaigns/recurring"),
  toggleRecurringCampaign: (id) => post(`/api/campaigns/recurring/${id}/toggle`),
  deleteRecurringCampaign: (id) => del(`/api/campaigns/recurring/${id}`),
  changePassword: (currentPassword, newPassword) => post("/api/auth/change-password", { current_password: currentPassword, new_password: newPassword }),
  getKeys: () => get("/api/settings/keys"),
  regenerateKeys: () => post("/api/settings/keys/regenerate"),
};
