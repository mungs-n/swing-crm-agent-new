// 차트 종류에 따라 다른 추천 질문을 만든다. "이 항목에 대해 자세히 분석해줘" 같은
// 뻔한 문구 하나로 통일하지 않고, 분포형/매출형 차트의 성격에 맞는 질문을 던진다.
// 어차피 회색 추천일 뿐이라 사용자가 그대로 받아들이거나(Tab) 자기 질문으로 덮어쓸 수 있다.
const TEMPLATES = {
  distribution: (label, name) => `[${label} 중 ${name}] 이 항목이 다른 항목보다 왜 이렇게 두드러지는지 알려줘`,
  revenue: (label, name) => `[${label} 중 ${name}] 이 항목에서 매출을 더 늘리려면 어떻게 하면 좋을지 알려줘`,
};

export function suggestChartQuestion(type, chartLabel, name) {
  const build = TEMPLATES[type] || TEMPLATES.distribution;
  return build(chartLabel, name);
}
