// 상황·세그먼트별로 미리 정해둔 캠페인 템플릿. 실제 메시지 문구는 카피를 대신
// 지어내지 않고, 클릭하면 캠페인 생성 화면이 이 세그먼트/채널로 미리 선택된 채
// 열리면서 이 situation을 소구 포인트로 AI 카피가 그 자리에서 실제로 생성된다.
export const CATEGORIES = ["온보딩 · 첫 구매 유도", "구매 전환 유도", "이탈 방지 · 윈백", "충성 고객 관리"];

export const RECIPES = [
  { id: "welcome", title: "신규 가입 고객 웰컴 메시지", situation: "가입 후 14일 이내, 첫 구매 유도", segment: "신규 탐색자", channel: "kakao", art: "gift", colors: ["#DBEAFE", "#3B82F6"], isNew: true, category: "온보딩 · 첫 구매 유도" },
  { id: "cart", title: "장바구니 이탈 고객 리마인드", situation: "담아둔 상품, 구매 완결 유도", segment: "장바구니 이탈 고객", channel: "webpush", art: "cart", colors: ["#FCE7F3", "#EC4899"], isNew: true, category: "온보딩 · 첫 구매 유도" },
  { id: "discount", title: "할인 구매자 세일 알림", situation: "세일 시즌, 할인 쿠폰 강조", segment: "할인 구매자", channel: "sms", art: "tag", colors: ["#FEF3C7", "#F59E0B"], category: "구매 전환 유도" },
  { id: "impulsive", title: "충동 구매자 신상품 알림", situation: "매진 임박, 긴박감 강조", segment: "충동 구매자", channel: "webpush", art: "bolt", colors: ["#E0E7FF", "#6366F1"], category: "구매 전환 유도" },
  { id: "churn", title: "이탈 위험 고객 리텐션 쿠폰", situation: "45일 이상 미구매, 파격 혜택", segment: "이탈 위험 고객", channel: "kakao", art: "heart-alert", colors: ["#FEE2E2", "#EF4444"], category: "이탈 방지 · 윈백" },
  { id: "dormant", title: "휴면 고객 윈백 캠페인", situation: "90일 이상 미방문, 재유입 유도", segment: "휴면 고객", channel: "email", art: "moon", colors: ["#EDE9FE", "#7C3AED"], category: "이탈 방지 · 윈백" },
  { id: "loyal", title: "브랜드 충성 고객 VIP 혜택", situation: "신제품 사전 공개, 특별 대우", segment: "브랜드 충성 고객", channel: "email", art: "star", colors: ["#D1FAE5", "#10B981"], category: "충성 고객 관리" },
  { id: "vip", title: "VIP 고객 감사 캠페인", situation: "RFM 상위 25%, 특별 이벤트 안내", segment: "RFM: VIP", channel: "email", art: "crown", colors: ["#FCE7F3", "#DB2777"], category: "충성 고객 관리" },
];

export const CHANNEL_LABEL = { kakao: "카카오톡", sms: "문자(SMS/LMS)", webpush: "웹 푸시", email: "이메일" };
