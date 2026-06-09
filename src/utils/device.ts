export function isMobileBrowser() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const touch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  return touch && /android|iphone|ipad|ipod|mobile/.test(ua);
}

export function mobilePlatform() {
  if (typeof navigator === 'undefined') return 'mobile';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'mobile';
}
