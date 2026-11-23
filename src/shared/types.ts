export type VerificationStatus = 'verified' | 'pending' | 'rejected';

export type BedCategory =
  | 'General Ward'
  | 'ICU'
  | 'Emergency Observation'
  | 'Private Rooms';

export type FreshnessLevel = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export type ShiftName = 'Morning' | 'Afternoon' | 'Night';

export type Language = 'en' | 'ta';

export type BloodGroup =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-';

export type BloodAvailabilityStatus =
  | 'Reported available'
  | 'Contact to confirm'
  | 'Reported unavailable'
  | 'Information unavailable';

export type AdminRole = 'hospital_admin' | 'super_admin';

export interface DistanceOrigin {
  label: string;
  city?: string;
  lat: number;
  lng: number;
  source: 'geolocation' | 'manual';
}

export interface FreshnessResult {
  level: FreshnessLevel;
  label: string;
  description: string;
  hoursAgo: number | null;
  relativeTime: string;
  requiresWarning: boolean;
}

export interface ReportingReliabilitySummary {
  completed_reports: number;
  expected_reports: number;
  compliance_rate: number | null;
  avg_delay_minutes: number | null;
  last_shift_at: string | null;
  last_shift_name: string | null;
  status_label: 'Consistent Reporting' | 'Intermittent Reporting' | 'Overdue / Low Reporting' | 'No Shift Reports Yet';
}

export interface HospitalResource {
  resource_id: number;
  hospital_id: number;
  bed_type: BedCategory;
  total_beds: number;
  occupied_beds: number | null;
  available_beds: number | null;
  is_live_reported: boolean;
  last_updated: string | null;
  updated_by: string | null;
  freshness: FreshnessResult;
}

export interface HospitalService {
  service_id: number;
  hospital_id: number;
  specialty: string;
  emergency_available: boolean;
  ambulance_available: boolean;
  trauma_care: boolean;
  emergency_surgery: boolean;
  diagnostic_facility: boolean;
  critical_care: boolean;
}

export interface BloodBankRecord {
  blood_bank_id: number;
  hospital_id: number;
  hospital_name?: string;
  city?: string;
  area?: string;
  blood_bank_name: string;
  contact_number: string;
  address: string;
  blood_group: BloodGroup;
  availability_status: BloodAvailabilityStatus;
  last_updated: string | null;
  freshness: FreshnessResult;
}

export interface UpdateHistoryEntry {
  update_id: number;
  hospital_id: number;
  hospital_name?: string;
  resource_type: string;
  previous_value: string;
  new_value: string;
  updated_by: string;
  timestamp: string;
  notes: string | null;
}

export interface VerificationRecord {
  verification_id: number;
  hospital_id: number;
  verification_type: string;
  verification_status: string;
  verified_by: string;
  verification_timestamp: string;
  notes: string | null;
}

export interface VerificationEvidence {
  evidence_id: number;
  hospital_id: number;
  hospital_name?: string;
  check_type: 'identity' | 'website' | 'phone' | 'address' | 'capacity';
  verified_source: string;
  evidence_ref: string;
  status: 'verified' | 'pending' | 'flagged';
  verified_by: string;
  verified_at: string;
  notes: string | null;
}

export interface ShiftReportEntry {
  report_id: number;
  hospital_id: number;
  hospital_name?: string;
  shift_name: ShiftName;
  bed_type: BedCategory;
  total_beds: number;
  occupied_beds: number;
  available_beds: number;
  reported_by: string;
  reported_at: string;
  delay_minutes: number;
  notes: string | null;
}

export interface NotificationReminder {
  notif_id: number;
  hospital_id: number;
  hospital_name?: string;
  severity: 'info' | 'warning' | 'urgent';
  message: string;
  created_at: string;
  acknowledged: boolean;
}

export interface HospitalSummary {
  hospital_id: number;
  hospital_name: string;
  address: string;
  city: string;
  area: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  verification_status: VerificationStatus;
  registration_date: string;
  image_url: string;
  operating_hours: string;
  official_website: string | null;
  data_source: string;
  published_total_beds: number;
  is_simulated: boolean;
  resources: HospitalResource[];
  services: HospitalService | null;
  specialties: string[];
  blood_bank_name: string | null;
  blood_bank_phone: string | null;
  blood_bank_available_groups: BloodGroup[];
  latest_update: string | null;
  latest_updated_by: string | null;
  overall_freshness: FreshnessResult;
  independent_confirmation: boolean;
  independent_confirmation_note: string | null;
  distance_km?: number | null;
  reliability?: ReportingReliabilitySummary;
  evidence_count?: number;
  match_score?: number;
  match_reasons?: string[];
}

export interface HospitalDetail extends HospitalSummary {
  blood_banks: BloodBankRecord[];
  update_history: UpdateHistoryEntry[];
  verification_records: VerificationRecord[];
  verification_evidence: VerificationEvidence[];
  shift_reports: ShiftReportEntry[];
}

export interface OverviewStats {
  total_hospitals: number;
  verified_hospitals: number;
  pending_hospitals: number;
  total_published_beds: number;
  total_general_available: number;
  total_general_beds: number;
  total_icu_available: number;
  total_icu_beds: number;
  live_reported_hospitals: number;
  emergency_hospitals: number;
  freshness_counts: {
    GREEN: number;
    YELLOW: number;
    RED: number;
    UNKNOWN: number;
  };
  recently_updated: HospitalSummary[];
  cities: string[];
  specialties: string[];
}

export interface AuthUser {
  admin_id: number;
  username: string;
  role: AdminRole;
  hospital_id: number | null;
  hospital_name: string | null;
  display_name: string;
  account_status: 'active' | 'suspended';
}

export interface AnalyticsTrendPoint {
  bucket: string;
  bed_type: BedCategory;
  avg_occupancy_pct: number;
  avg_available_beds: number;
  report_count: number;
}

export interface CityReportingStat {
  city: string;
  total_hospitals: number;
  verified_hospitals: number;
  live_reporting_hospitals: number;
  total_published_beds: number;
  shift_reports_count: number;
  latest_update: string | null;
}

export interface HospitalUpdateFrequencyItem {
  hospital_id: number;
  hospital_name: string;
  city: string;
  total_updates: number;
  shift_reports_count: number;
  last_updated: string | null;
  freshness_level: FreshnessLevel;
  reliability_label: string;
}

export interface BloodBankHistorySummary {
  total_updates: number;
  hospitals_reporting: number;
  reported_available_entries: number;
  contact_to_confirm_entries: number;
  reported_unavailable_entries: number;
  recent_logs: UpdateHistoryEntry[];
}

export interface AnalyticsData {
  period: 'daily' | 'weekly' | 'monthly';
  has_shift_history: boolean;
  total_shift_reports: number;
  total_audit_updates: number;
  occupancy_trends: AnalyticsTrendPoint[];
  city_stats: CityReportingStat[];
  hospital_frequency: HospitalUpdateFrequencyItem[];
  blood_bank_summary: BloodBankHistorySummary;
}

export interface DuplicateGroup {
  reason: string;
  hospitals: Array<{
    hospital_id: number;
    hospital_name: string;
    city: string;
    phone: string;
    verification_status: VerificationStatus;
  }>;
}

export interface HospiAssistantFilters {
  city?: string;
  area?: string;
  specialty?: string;
  bed_type?: BedCategory | '';
  blood_group?: BloodGroup | '';
  require_icu?: boolean;
  require_emergency?: boolean;
  require_ambulance?: boolean;
  require_blood_bank?: boolean;
  require_trauma?: boolean;
  require_diagnostics?: boolean;
  freshness_filter?: 'ALL' | 'GREEN' | 'YELLOW' | 'RED';
  intent_summary: string;
}

export interface HospiAssistantResponse {
  mode: 'ai' | 'fallback';
  fallbackReason?: string;
  extractedFilters: HospiAssistantFilters;
  explanation: string;
  hospitals: HospitalSummary[];
  bloodRecords: BloodBankRecord[];
}
