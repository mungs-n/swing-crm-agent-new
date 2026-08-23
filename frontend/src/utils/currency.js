// 로그인한 회사(dataset_source)마다 실제 주문 데이터의 통화가 다를 수 있다 (예:
// athlepa는 원화, dacon 데모 데이터는 달러). "₩"/100만 단위를 어디서든 하드코딩해
// 쓰면 다른 통화 데이터에서는 값은 맞는데 단위 표기가 틀려서 이상하게 보인다 -
// 회사의 currency(로그인 세션에 포함)를 넘겨서 통화에 맞게 표기한다.
const CURRENCY_SYMBOLS = { KRW: "₩", USD: "$", EUR: "€", JPY: "¥", GBP: "£" };

export function formatMoney(value, currency = "KRW", { compact = false } = {}) {
  const amount = value ?? 0;
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);

  if (currency === "KRW") {
    if (compact && abs >= 10000) return `${sign}${symbol}${(abs / 10000).toFixed(0)}만`;
    return `${sign}${symbol}${Math.round(abs).toLocaleString()}`;
  }

  if (compact && abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (compact && abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${symbol}${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
