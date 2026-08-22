// 레시피 카드의 RecipeArt 아이콘과 같은 모양을 재사용해서, 캠페인 이미지 첨부란에
// 바로 넣을 수 있는 배너 이미지를 직접 그려서 만든다 (외부 사진을 가져오지 않음).
const ICON_PATHS = {
  gift: '<rect x="3" y="10" width="18" height="10" rx="1"/><rect x="3" y="6" width="18" height="4" rx="1"/><line x1="12" y1="6" x2="12" y2="20"/><path d="M12 6c-1.5-3-6-3-6-.5S9 6 12 6z"/><path d="M12 6c1.5-3 6-3 6-.5S15 6 12 6z"/>',
  cart: '<circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><circle cx="18" cy="6" r="0.8" fill="currentColor" stroke="none"/><circle cx="20.5" cy="9" r="0.5" fill="currentColor" stroke="none"/>',
  "heart-alert": '<path d="M12 20s-7-4.35-9.5-8.5C.7 8 2.3 4.5 6 4.5c2 0 3.3 1.2 4 2.2.7-1 2-2.2 4-2.2 3.7 0 5.3 3.5 3.5 7C19 15.65 12 20 12 20z"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="14.5" r="0.6" fill="currentColor" stroke="none"/>',
  tag: '<path d="M3 11.5V5a2 2 0 0 1 2-2h6.5L21 11.5a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0L3 12.7z"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/>',
  star: '<polygon points="12 3 14.7 9.2 21.5 9.9 16.4 14.4 17.9 21 12 17.5 6.1 21 7.6 14.4 2.5 9.9 9.3 9.2"/>',
  bolt: '<polygon points="13 2 4 14 11 14 10 22 20 9 13 9"/>',
  crown: '<path d="M3 8l4 4 5-6 5 6 4-4-2 11H5L3 8z"/><line x1="5" y1="19" x2="19" y2="19"/>',
};

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildRecipeBanner({ title, art, colors }) {
  const [c1, c2] = colors;
  const icon = (ICON_PATHS[art] || ICON_PATHS.star).replace(/currentColor/g, c2);
  const safeTitle = escapeXml(title);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="600" height="300" fill="url(#bg)"/>
  <text x="36" y="46" font-family="'Pretendard','Apple SD Gothic Neo',sans-serif" font-size="17" font-weight="800" letter-spacing="1" fill="${c2}" opacity="0.85">ATHLEPA</text>
  <svg x="220" y="52" width="160" height="160" viewBox="0 0 24 24" fill="none" stroke="${c2}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
    ${icon}
  </svg>
  <text x="300" y="264" text-anchor="middle" font-family="'Pretendard','Apple SD Gothic Neo',sans-serif" font-size="25" font-weight="700" fill="${c2}">${safeTitle}</text>
</svg>`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
