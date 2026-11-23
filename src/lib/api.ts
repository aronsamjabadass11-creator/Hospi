import type { FreshnessThresholds } from '../shared/freshness.ts';
import type {
  AnalyticsData,
  AuthUser,
  BedCategory,
  BloodAvailabilityStatus,
  BloodBankRecord,
  BloodGroup,
  DuplicateGroup,
  HospiAssistantResponse,
  HospitalDetail,
  HospitalSummary,
  Language,
  NotificationReminder,
  OverviewStats,
  ShiftName,
  UpdateHistoryEntry,
  VerificationEvidence,
  VerificationStatus,
} from '../shared/types.ts';

const TOKEN_STORAGE_KEY = 'hospifind_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

function thresholdParams(thresholds?: FreshnessThresholds): string {
  if (!thresholds) return '';
  return `greenMaxHours=${thresholds.greenMaxHours}&yellowMaxHours=${thresholds.yellowMaxHours}`;
}

export async function fetchFreshnessSettings(): Promise<{ thresholds: FreshnessThresholds }> {
  return requestJson<{ thresholds: FreshnessThresholds }>('/api/settings/freshness');
}

export async function saveFreshnessSettings(
  thresholds: FreshnessThresholds
): Promise<{ success: boolean; thresholds: FreshnessThresholds }> {
  return requestJson<{ success: boolean; thresholds: FreshnessThresholds }>('/api/super-admin/settings/freshness', {
    method: 'PUT',
    body: JSON.stringify(thresholds),
  });
}

export async function fetchOverview(thresholds?: FreshnessThresholds): Promise<OverviewStats> {
  const qs = thresholdParams(thresholds);
  return requestJson<OverviewStats>(`/api/overview${qs ? `?${qs}` : ''}`);
}

export interface SearchParams {
  query?: string;
  city?: string;
  area?: string;
  specialty?: string;
  bed_type?: BedCategory | '';
  require_icu?: boolean;
  require_emergency?: boolean;
  require_ambulance?: boolean;
  require_blood_bank?: boolean;
  require_trauma?: boolean;
  require_surgery?: boolean;
  require_diagnostics?: boolean;
  require_critical_care?: boolean;
  freshness_filter?: 'ALL' | 'GREEN' | 'YELLOW' | 'RED';
  originLat?: number;
  originLng?: number;
  sort_by?: 'relevance' | 'distance' | 'freshness';
}

export async function searchHospitals(
  params: SearchParams,
  thresholds?: FreshnessThresholds
): Promise<{ hospitals: HospitalSummary[]; thresholds: FreshnessThresholds }> {
  const sp = new URLSearchParams();
  if (params.query) sp.set('query', params.query);
  if (params.city && params.city !== 'All') sp.set('city', params.city);
  if (params.area) sp.set('area', params.area);
  if (params.specialty && params.specialty !== 'All') sp.set('specialty', params.specialty);
  if (params.bed_type) sp.set('bed_type', params.bed_type);
  if (params.require_icu) sp.set('require_icu', 'true');
  if (params.require_emergency) sp.set('require_emergency', 'true');
  if (params.require_ambulance) sp.set('require_ambulance', 'true');
  if (params.require_blood_bank) sp.set('require_blood_bank', 'true');
  if (params.require_trauma) sp.set('require_trauma', 'true');
  if (params.require_surgery) sp.set('require_surgery', 'true');
  if (params.require_diagnostics) sp.set('require_diagnostics', 'true');
  if (params.require_critical_care) sp.set('require_critical_care', 'true');
  if (params.freshness_filter && params.freshness_filter !== 'ALL') {
    sp.set('freshness_filter', params.freshness_filter);
  }
  if (typeof params.originLat === 'number' && typeof params.originLng === 'number') {
    sp.set('originLat', String(params.originLat));
    sp.set('originLng', String(params.originLng));
  }
  if (params.sort_by) {
    sp.set('sort_by', params.sort_by);
  }
  if (thresholds) {
    sp.set('greenMaxHours', String(thresholds.greenMaxHours));
    sp.set('yellowMaxHours', String(thresholds.yellowMaxHours));
  }
  return requestJson<{ hospitals: HospitalSummary[]; thresholds: FreshnessThresholds }>(
    `/api/hospitals?${sp.toString()}`
  );
}

export async function fetchHospitalDetail(
  hospitalId: number,
  thresholds?: FreshnessThresholds,
  origin?: { lat: number; lng: number } | null
): Promise<HospitalDetail> {
  const sp = new URLSearchParams();
  if (thresholds) {
    sp.set('greenMaxHours', String(thresholds.greenMaxHours));
    sp.set('yellowMaxHours', String(thresholds.yellowMaxHours));
  }
  if (origin) {
    sp.set('originLat', String(origin.lat));
    sp.set('originLng', String(origin.lng));
  }
  const qs = sp.toString();
  return requestJson<HospitalDetail>(`/api/hospitals/${hospitalId}${qs ? `?${qs}` : ''}`);
}

export async function fetchBloodBanks(
  params: { city?: string; blood_group?: string; status?: string; query?: string },
  thresholds?: FreshnessThresholds
): Promise<{ records: BloodBankRecord[] }> {
  const sp = new URLSearchParams();
  if (params.city && params.city !== 'All') sp.set('city', params.city);
  if (params.blood_group && params.blood_group !== 'All') sp.set('blood_group', params.blood_group);
  if (params.status && params.status !== 'All') sp.set('status', params.status);
  if (params.query) sp.set('query', params.query);
  if (thresholds) {
    sp.set('greenMaxHours', String(thresholds.greenMaxHours));
    sp.set('yellowMaxHours', String(thresholds.yellowMaxHours));
  }
  return requestJson<{ records: BloodBankRecord[] }>(`/api/blood-banks?${sp.toString()}`);
}

export async function fetchAnalytics(
  period: 'daily' | 'weekly' | 'monthly',
  thresholds?: FreshnessThresholds
): Promise<AnalyticsData> {
  const sp = new URLSearchParams({ period });
  if (thresholds) {
    sp.set('greenMaxHours', String(thresholds.greenMaxHours));
    sp.set('yellowMaxHours', String(thresholds.yellowMaxHours));
  }
  return requestJson<AnalyticsData>(`/api/analytics?${sp.toString()}`);
}

export async function queryHospiAssistant(payload: {
  query: string;
  language: Language;
  originLat?: number;
  originLng?: number;
}): Promise<HospiAssistantResponse> {
  return requestJson<HospiAssistantResponse>('/api/assistant/search', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginAdmin(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  return requestJson<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logoutAdmin(): Promise<{ success: boolean }> {
  try {
    return await requestJson<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
  } finally {
    setStoredToken(null);
  }
}

export async function fetchCurrentUser(): Promise<{ user: AuthUser }> {
  return requestJson<{ user: AuthUser }>('/api/auth/me');
}

export async function fetchAdminReminders(
  hospitalId: number,
  thresholds?: FreshnessThresholds
): Promise<{ reminders: NotificationReminder[] }> {
  const qs = thresholdParams(thresholds);
  return requestJson<{ reminders: NotificationReminder[] }>(
    `/api/admin/hospital/${hospitalId}/reminders${qs ? `?${qs}` : ''}`
  );
}

export async function updateHospitalProfile(
  hospitalId: number,
  payload: { address: string; city: string; area: string; phone: string; operating_hours: string }
): Promise<{ success: boolean; detail: HospitalDetail }> {
  return requestJson<{ success: boolean; detail: HospitalDetail }>(`/api/admin/hospital/${hospitalId}/profile`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateHospitalResources(
  hospitalId: number,
  payload: {
    updates: Array<{ bed_type: BedCategory; total_beds: number; occupied_beds: number }>;
    notes?: string;
    shift_name?: ShiftName;
  }
): Promise<{ success: boolean; detail: HospitalDetail }> {
  return requestJson<{ success: boolean; detail: HospitalDetail }>(`/api/admin/hospital/${hospitalId}/resources`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateHospitalServices(
  hospitalId: number,
  payload: {
    specialty: string;
    emergency_available: boolean;
    ambulance_available: boolean;
    trauma_care: boolean;
    emergency_surgery: boolean;
    diagnostic_facility: boolean;
    critical_care: boolean;
  }
): Promise<{ success: boolean; detail: HospitalDetail }> {
  return requestJson<{ success: boolean; detail: HospitalDetail }>(`/api/admin/hospital/${hospitalId}/services`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateHospitalBloodBank(
  hospitalId: number,
  payload: {
    blood_bank_name: string;
    contact_number: string;
    statuses: Array<{ blood_group: BloodGroup; availability_status: BloodAvailabilityStatus }>;
  }
): Promise<{ success: boolean; detail: HospitalDetail }> {
  return requestJson<{ success: boolean; detail: HospitalDetail }>(`/api/admin/hospital/${hospitalId}/blood-bank`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchSuperAdminGovernance(thresholds?: FreshnessThresholds): Promise<{
  hospitals: HospitalSummary[];
  auditLogs: UpdateHistoryEntry[];
  verifications: Array<{
    verification_id: number;
    hospital_id: number;
    hospital_name: string;
    verification_type: string;
    verification_status: string;
    verified_by: string;
    verification_timestamp: string;
    notes: string | null;
  }>;
  evidence: VerificationEvidence[];
  duplicates: DuplicateGroup[];
  thresholds: FreshnessThresholds;
}> {
  const qs = thresholdParams(thresholds);
  return requestJson(`/api/super-admin/governance${qs ? `?${qs}` : ''}`);
}

export async function logVerificationEvidence(
  hospitalId: number,
  payload: {
    check_type: 'identity' | 'website' | 'phone' | 'address' | 'capacity';
    verified_source: string;
    evidence_ref: string;
    status: 'verified' | 'pending' | 'flagged';
    notes?: string;
  }
): Promise<{ success: boolean; detail: HospitalDetail }> {
  return requestJson(`/api/super-admin/hospitals/${hospitalId}/evidence`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyHospital(
  hospitalId: number,
  payload: { verification_status: VerificationStatus; verification_type?: string; notes?: string }
): Promise<{ success: boolean; detail: HospitalDetail }> {
  return requestJson(`/api/super-admin/hospitals/${hospitalId}/verify`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function registerHospital(payload: {
  hospital_name: string;
  address: string;
  city: string;
  area: string;
  phone: string;
  specialty: string;
  general_beds: number;
  icu_beds: number;
  latitude: number | null;
  longitude: number | null;
  official_website?: string | null;
}): Promise<{ success: boolean; detail: HospitalDetail }> {
  return requestJson('/api/super-admin/hospitals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
