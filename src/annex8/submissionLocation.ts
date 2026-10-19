export type SubmissionLocation = {
  status: 'not_requested' | 'denied' | 'timeout' | 'unavailable' | 'captured';
  latitude?: number;
  longitude?: number;
  accuracy_m?: number;
  captured_at?: string;
  consent?: true;
  source?: 'browser_geolocation';
};

export function normalizeSubmissionLocation(value: any, now = Date.now()): SubmissionLocation {
  if (value?.status !== 'captured') {
    const status = ['not_requested', 'denied', 'timeout', 'unavailable'].includes(value?.status)
      ? value.status : 'not_requested';
    return { status };
  }
  const { latitude, longitude, accuracy_m } = value;
  const timestamp = Date.parse(value.captured_at);
  if (value.consent !== true || value.source !== 'browser_geolocation'
    || typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || typeof accuracy_m !== 'number' || !Number.isFinite(accuracy_m) || accuracy_m < 0
    || !Number.isFinite(timestamp) || now - timestamp > 120000 || timestamp - now > 30000) {
    return { status: 'unavailable' };
  }
  return { status: 'captured', consent: true, source: 'browser_geolocation',
    latitude, longitude, accuracy_m: Math.round(accuracy_m), captured_at: new Date(timestamp).toISOString() };
}

// One fresh fix at submission only. No background tracking or IP geolocation.
export async function captureSubmissionLocation(
  requested: boolean,
  geolocation: Pick<Geolocation, 'getCurrentPosition'> | undefined = globalThis.navigator?.geolocation,
): Promise<SubmissionLocation> {
  if (!requested) return { status: 'not_requested' };
  if (!geolocation) return { status: 'unavailable' };
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: SubmissionLocation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish({ status: 'timeout' }), 9000);
    try {
      geolocation.getCurrentPosition(position => finish(normalizeSubmissionLocation({
        status: 'captured', consent: true, source: 'browser_geolocation',
        latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracy_m: position.coords.accuracy, captured_at: new Date(position.timestamp).toISOString(),
      })), error => finish({ status: error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
    } catch { finish({ status: 'unavailable' }); }
  });
}
