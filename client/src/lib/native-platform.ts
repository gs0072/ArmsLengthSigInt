export type Platform = 'web' | 'ios' | 'android' | 'electron';

let cachedPlatform: Platform | null = null;

export function getPlatform(): Platform {
  if (cachedPlatform) return cachedPlatform;

  if (typeof window !== 'undefined') {
    const ua = window.navigator.userAgent;
    if ((window as any).electronAPI) {
      cachedPlatform = 'electron';
    } else if ((window as any).Capacitor?.isNativePlatform?.()) {
      cachedPlatform = (window as any).Capacitor.getPlatform() === 'android' ? 'android' : 'ios';
    } else {
      cachedPlatform = 'web';
    }
  } else {
    cachedPlatform = 'web';
  }

  return cachedPlatform;
}

export function isNative(): boolean {
  const p = getPlatform();
  return p === 'ios' || p === 'android' || p === 'electron';
}

export function isCapacitor(): boolean {
  const p = getPlatform();
  return p === 'ios' || p === 'android';
}

export function isElectron(): boolean {
  return getPlatform() === 'electron';
}

export function supportsNativeBLE(): boolean {
  return isCapacitor();
}

export function supportsUSBDevices(): boolean {
  return isElectron();
}

export function getAPIBaseURL(): string {
  if (isNative() || isElectron()) {
    const stored = localStorage.getItem('sigint_server_url');
    if (stored) return stored;
    return '';
  }
  return '';
}

export function setServerURL(url: string): void {
  localStorage.setItem('sigint_server_url', url);
}
