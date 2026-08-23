// 상황·세그먼트별로 미리 정해둔 캠페인 템플릿. 클릭하면 캠페인 생성 화면이 이
// 세그먼트/채널로 미리 선택된 채 열리고, 아래 templateTitle/templateBody가 그대로
// 채워진다 - AI가 자동으로 카피를 지어내지 않는다. 다른 느낌으로 바꾸고 싶으면
// 화면의 "AI 카피 자동 생성" 버튼을 눌러 그 자리에서 다시 생성할 수 있다.
export const CATEGORIES = ["온보딩 · 첫 구매 유도", "구매 전환 유도", "이탈 방지 · 윈백", "충성 고객 관리"];

export const RECIPES = [
  { id: "welcome", title: "신규 가입 고객 웰컴 메시지", situation: "가입 후 14일 이내, 첫 구매 유도", segment: "신규 탐색자", channel: "kakao", art: "gift", colors: ["#DBEAFE", "#3B82F6"], isNew: true, category: "온보딩 · 첫 구매 유도",
    templateTitle: "환영해요! 첫 구매 혜택이 도착했어요 🎁",
    templateBody: "가입해주셔서 감사해요!\n첫 구매 시 바로 쓸 수 있는 웰컴 쿠폰을 준비했어요.\n지금 인기 상품들도 함께 둘러보세요 :)" },
  { id: "cart", title: "장바구니 이탈 고객 리마인드", situation: "담아둔 상품, 구매 완결 유도", segment: "장바구니 이탈 고객", channel: "webpush", art: "cart", colors: ["#FCE7F3", "#EC4899"], isNew: true, category: "온보딩 · 첫 구매 유도",
    templateTitle: "장바구니를 잊으셨나요?",
    templateBody: "담아두신 상품이 아직 그대로 있어요!" },
  { id: "discount", title: "할인 구매자 세일 알림", situation: "세일 시즌, 할인 쿠폰 강조", segment: "할인 구매자", channel: "sms", art: "tag", colors: ["#FEF3C7", "#F59E0B"], category: "구매 전환 유도",
    templateTitle: "[세일 알림] 최대 30% 할인",
    templateBody: "오늘부터 3일간 할인 쿠폰이 지급돼요. 지금 바로 확인해보세요!" },
  { id: "impulsive", title: "충동 구매자 신상품 알림", situation: "매진 임박, 긴박감 강조", segment: "충동 구매자", channel: "webpush", art: "bolt", colors: ["#E0E7FF", "#6366F1"], category: "구매 전환 유도",
    templateTitle: "매진 임박 🔥",
    templateBody: "인기 신상품, 얼마 안 남았어요!" },
  { id: "churn", title: "이탈 위험 고객 리텐션 쿠폰", situation: "45일 이상 미구매, 파격 혜택", segment: "이탈 위험 고객", channel: "kakao", art: "heart-alert", colors: ["#FEE2E2", "#EF4444"], category: "이탈 방지 · 윈백",
    templateTitle: "오랜만이에요, 특별한 혜택을 드려요",
    templateBody: "요즘 뜸하셨던 것 같아 아쉬운 마음에 준비했어요.\n지금 사용하실 수 있는 파격 할인 쿠폰, 확인해보세요!" },
  { id: "dormant", title: "휴면 고객 윈백 캠페인", situation: "90일 이상 미방문, 재유입 유도", segment: "휴면 고객", channel: "email", art: "moon", colors: ["#EDE9FE", "#7C3AED"], category: "이탈 방지 · 윈백",
    templateTitle: "오랜만이에요, 다시 만나고 싶어요",
    templateBody: "그동안 새로워진 상품과 서비스를 다시 한번 만나보셨으면 해요. 오랜만에 돌아오신 고객님을 위한 특별 혜택을 준비했으니, 지금 다시 둘러봐 주세요." },
  { id: "loyal", title: "브랜드 충성 고객 VIP 혜택", situation: "신제품 사전 공개, 특별 대우", segment: "브랜드 충성 고객", channel: "email", art: "star", colors: ["#D1FAE5", "#10B981"], category: "충성 고객 관리",
    templateTitle: "가장 먼저 소식을 전해드려요",
    templateBody: "항상 함께해주셔서 감사합니다. 곧 출시될 신제품을 누구보다 먼저 만나보실 수 있도록 사전 공개 소식을 전해드려요. 특별한 혜택도 함께 준비했습니다." },
  { id: "vip", title: "VIP 고객 감사 캠페인", situation: "RFM 상위 25%, 특별 이벤트 안내", segment: "RFM: VIP", channel: "email", art: "crown", colors: ["#FCE7F3", "#DB2777"], category: "충성 고객 관리",
    templateTitle: "가장 소중한 고객님을 위한 자리에 초대합니다",
    templateBody: "고객님은 저희의 가장 소중한 VIP 고객이십니다. 감사한 마음을 담아 특별한 이벤트를 준비했으니, 지금 확인해보세요." },
];

export const CHANNEL_LABEL = { kakao: "카카오톡", sms: "문자(SMS/LMS)", webpush: "웹 푸시", email: "이메일" };
