import { getDb } from './database.ts';
import {
  DEFAULT_FRESHNESS_THRESHOLDS,
  evaluateFreshness,
  pickWorstOrLatestFreshness,
  type FreshnessThresholds,
} from '../shared/freshness.ts';
import { calculateHaversineKm } from '../shared/geo.ts';
import type {
  AnalyticsData,
  AnalyticsTrendPoint,
  BedCategory,
  BloodAvailabilityStatus,
  BloodBankRecord,
  BloodGroup,
  CityReportingStat,
  DuplicateGroup,
  HospitalDetail,
  HospitalResource,
  HospitalService,
  HospitalSummary,
  HospitalUpdateFrequencyItem,
  NotificationReminder,
  OverviewStats,
  ReportingReliabilitySummary,
  ShiftReportEntry,
  UpdateHistoryEntry,
  VerificationEvidence,
  VerificationRecord,
  VerificationStatus,
} from '../shared/types.ts';

interface RawHospitalRow {
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
  is_simulated: number;
}

interface RawResourceRow {
  resource_id: number;
  hospital_id: number;
  bed_type: BedCategory;
  total_beds: number;
  occupied_beds: number | null;
  available_beds: number | null;
  is_live_reported: number;
  last_updated: string | null;
  updated_by: string | null;
}

interface RawServiceRow {
  service_id: number;
  hospital_id: number;
  specialty: string;
  emergency_available: number;
  ambulance_available: number;
  trauma_care: number;
  emergency_surgery: number;
  diagnostic_facility: number;
  critical_care: number;
}

interface RawBloodRow {
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
}

export function validatePhoneNumber(phone: string): boolean {
  const cleaned = phone.trim();
  if (cleaned.length < 8 || cleaned.length > 22) return false;
  return /^\+?[0-9\s\-()]{8,22}$/.test(cleaned);
}

export function getPersistedFreshnessThresholds(): FreshnessThresholds {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'freshness_thresholds'")
      .get() as { setting_value: string } | undefined;
    if (!row) return DEFAULT_FRESHNESS_THRESHOLDS;
    const parsed = JSON.parse(row.setting_value) as { greenMaxHours?: number; yellowMaxHours?: number };
    const green = Number(parsed.greenMaxHours);
    const yellow = Number(parsed.yellowMaxHours);
    if (Number.isFinite(green) && green > 0 && Number.isFinite(yellow) && yellow > green) {
      return { greenMaxHours: green, yellowMaxHours: yellow };
    }
  } catch {
    // fallback to default
  }
  return DEFAULT_FRESHNESS_THRESHOLDS;
}

export function savePersistedFreshnessThresholds(
  thresholds: FreshnessThresholds,
  updatedBy: string
): FreshnessThresholds {
  const db = getDb();
  const safeGreen = Math.max(1, Math.min(24, Math.round(thresholds.greenMaxHours)));
  const safeYellow = Math.max(safeGreen + 1, Math.min(72, Math.round(thresholds.yellowMaxHours)));
  const payload: FreshnessThresholds = { greenMaxHours: safeGreen, yellowMaxHours: safeYellow };
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO system_settings (setting_key, setting_value, updated_at, updated_by)
    VALUES ('freshness_thresholds', ?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(JSON.stringify(payload), now, updatedBy);

  return payload;
}

function mapResources(rows: RawResourceRow[], thresholds: FreshnessThresholds): HospitalResource[] {
  return rows.map((r) => ({
    resource_id: r.resource_id,
    hospital_id: r.hospital_id,
    bed_type: r.bed_type,
    total_beds: r.total_beds,
    occupied_beds: r.occupied_beds,
    available_beds: r.available_beds,
    is_live_reported: Boolean(r.is_live_reported),
    last_updated: r.last_updated,
    updated_by: r.updated_by,
    freshness: evaluateFreshness(r.last_updated, thresholds),
  }));
}

function mapService(row: RawServiceRow | undefined): HospitalService | null {
  if (!row) return null;
  return {
    service_id: row.service_id,
    hospital_id: row.hospital_id,
    specialty: row.specialty,
    emergency_available: Boolean(row.emergency_available),
    ambulance_available: Boolean(row.ambulance_available),
    trauma_care: Boolean(row.trauma_care),
    emergency_surgery: Boolean(row.emergency_surgery),
    diagnostic_facility: Boolean(row.diagnostic_facility),
    critical_care: Boolean(row.critical_care),
  };
}

function computeReliability(
  shiftRows: ShiftReportEntry[],
  latestUpdate: string | null,
  thresholds: FreshnessThresholds
): ReportingReliabilitySummary {
  if (shiftRows.length === 0) {
    return {
      completed_reports: 0,
      expected_reports: 0,
      compliance_rate: null,
      avg_delay_minutes: null,
      last_shift_at: latestUpdate,
      last_shift_name: null,
      status_label: 'No Shift Reports Yet',
    };
  }

  // Group distinct reporting submissions (by minute timestamp + shift_name)
  const batchKeys = new Set<string>();
  let totalDelay = 0;
  for (const s of shiftRows) {
    batchKeys.add(`${s.reported_at.slice(0, 16)}|${s.shift_name}`);
    totalDelay += s.delay_minutes || 0;
  }

  const completedReports = batchKeys.size;
  const earliestMs = Math.min(...shiftRows.map((s) => Date.parse(s.reported_at)));
  const latestShift = shiftRows[0];
  const latestMs = Date.parse(latestShift.reported_at);
  const hoursSinceLast = Math.max(0, (Date.now() - latestMs) / (1000 * 60 * 60));

  const spanHours = Math.max(8, (Date.now() - earliestMs) / (1000 * 60 * 60));
  const expectedReports = Math.max(completedReports, Math.ceil(spanHours / 8));
  const complianceRate = Math.min(100, Math.round((completedReports / expectedReports) * 100));
  const avgDelayMinutes = Math.round(totalDelay / shiftRows.length);

  let statusLabel: ReportingReliabilitySummary['status_label'] = 'Overdue / Low Reporting';
  if (complianceRate >= 70 && hoursSinceLast <= thresholds.yellowMaxHours) {
    statusLabel = 'Consistent Reporting';
  } else if (complianceRate >= 35 || hoursSinceLast <= 24) {
    statusLabel = 'Intermittent Reporting';
  }

  return {
    completed_reports: completedReports,
    expected_reports: expectedReports,
    compliance_rate: complianceRate,
    avg_delay_minutes: avgDelayMinutes,
    last_shift_at: latestShift.reported_at,
    last_shift_name: latestShift.shift_name,
    status_label: statusLabel,
  };
}

export function buildHospitalSummaries(
  thresholds: FreshnessThresholds = getPersistedFreshnessThresholds(),
  origin?: { lat: number; lng: number } | null
): HospitalSummary[] {
  const db = getDb();
  const hospitals = db.prepare('SELECT * FROM hospitals ORDER BY hospital_id ASC').all() as unknown as RawHospitalRow[];
  const allResources = db.prepare('SELECT * FROM hospital_resources ORDER BY hospital_id, resource_id').all() as unknown as RawResourceRow[];
  const allServices = db.prepare('SELECT * FROM hospital_services').all() as unknown as RawServiceRow[];
  const allBlood = db.prepare('SELECT * FROM blood_banks').all() as unknown as RawBloodRow[];
  const allVerifications = db
    .prepare('SELECT * FROM verification_records ORDER BY verification_timestamp DESC')
    .all() as unknown as VerificationRecord[];
  const allShiftReports = db
    .prepare('SELECT * FROM shift_reports ORDER BY reported_at DESC')
    .all() as unknown as ShiftReportEntry[];
  const evidenceCounts = db
    .prepare("SELECT hospital_id, COUNT(*) as cnt FROM verification_evidence WHERE status = 'verified' GROUP BY hospital_id")
    .all() as Array<{ hospital_id: number; cnt: number }>;

  const resourcesByHospital = new Map<number, RawResourceRow[]>();
  for (const r of allResources) {
    const arr = resourcesByHospital.get(r.hospital_id) || [];
    arr.push(r);
    resourcesByHospital.set(r.hospital_id, arr);
  }

  const serviceByHospital = new Map<number, RawServiceRow>();
  for (const s of allServices) {
    serviceByHospital.set(s.hospital_id, s);
  }

  const bloodByHospital = new Map<number, RawBloodRow[]>();
  for (const b of allBlood) {
    const arr = bloodByHospital.get(b.hospital_id) || [];
    arr.push(b);
    bloodByHospital.set(b.hospital_id, arr);
  }

  const auditByHospital = new Map<number, VerificationRecord>();
  for (const v of allVerifications) {
    if (v.verification_type === 'Independent Resource Audit' && !auditByHospital.has(v.hospital_id)) {
      auditByHospital.set(v.hospital_id, v);
    }
  }

  const shiftsByHospital = new Map<number, ShiftReportEntry[]>();
  for (const sr of allShiftReports) {
    const arr = shiftsByHospital.get(sr.hospital_id) || [];
    arr.push(sr);
    shiftsByHospital.set(sr.hospital_id, arr);
  }

  const evidenceCountMap = new Map<number, number>();
  for (const ec of evidenceCounts) {
    evidenceCountMap.set(ec.hospital_id, ec.cnt);
  }

  return hospitals.map((h) => {
    const rawRes = resourcesByHospital.get(h.hospital_id) || [];
    const resources = mapResources(rawRes, thresholds);
    const service = mapService(serviceByHospital.get(h.hospital_id));
    const specialties = service
      ? service.specialty
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const bloodRows = bloodByHospital.get(h.hospital_id) || [];
    const availableGroups = bloodRows
      .filter((b) => b.availability_status === 'Reported available')
      .map((b) => b.blood_group);

    let latestUpdate: string | null = null;
    let latestUpdatedBy: string | null = null;
    for (const r of resources) {
      if (r.last_updated && (!latestUpdate || Date.parse(r.last_updated) > Date.parse(latestUpdate))) {
        latestUpdate = r.last_updated;
        latestUpdatedBy = r.updated_by;
      }
    }

    const overallLevel = pickWorstOrLatestFreshness(resources.map((r) => r.freshness.level));
    const overallFreshness = latestUpdate
      ? evaluateFreshness(latestUpdate, thresholds)
      : {
          level: overallLevel,
          label: 'Unreported',
          description: 'Live occupancy has not been submitted by this hospital desk yet. Call hospital directly to confirm.',
          hoursAgo: null,
          relativeTime: 'Call to confirm',
          requiresWarning: true,
        };

    const audit = auditByHospital.get(h.hospital_id);
    const shiftRows = shiftsByHospital.get(h.hospital_id) || [];
    const reliability = computeReliability(shiftRows, latestUpdate, thresholds);

    let distanceKm: number | null = null;
    if (
      origin &&
      Number.isFinite(origin.lat) &&
      Number.isFinite(origin.lng) &&
      typeof h.latitude === 'number' &&
      typeof h.longitude === 'number'
    ) {
      distanceKm = calculateHaversineKm(origin.lat, origin.lng, h.latitude, h.longitude);
    }

    return {
      hospital_id: h.hospital_id,
      hospital_name: h.hospital_name,
      address: h.address,
      city: h.city,
      area: h.area,
      phone: h.phone,
      latitude: h.latitude,
      longitude: h.longitude,
      verification_status: h.verification_status,
      registration_date: h.registration_date,
      image_url: h.image_url,
      operating_hours: h.operating_hours,
      official_website: h.official_website,
      data_source: h.data_source,
      published_total_beds: h.published_total_beds,
      is_simulated: Boolean(h.is_simulated),
      resources,
      services: service,
      specialties,
      blood_bank_name: bloodRows[0]?.blood_bank_name ?? null,
      blood_bank_phone: bloodRows[0]?.contact_number ?? null,
      blood_bank_available_groups: availableGroups,
      latest_update: latestUpdate,
      latest_updated_by: latestUpdatedBy,
      overall_freshness: overallFreshness,
      independent_confirmation: audit?.verification_status === 'verified',
      independent_confirmation_note: audit?.notes ?? null,
      distance_km: distanceKm,
      reliability,
      evidence_count: evidenceCountMap.get(h.hospital_id) || 0,
    };
  });
}

export interface SearchFilterInput {
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
  freshness_filter?: 'ALL' | 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  originLat?: number;
  originLng?: number;
  sort_by?: 'relevance' | 'distance' | 'freshness';
}

export function searchAndMatchHospitals(
  filters: SearchFilterInput,
  thresholds: FreshnessThresholds = getPersistedFreshnessThresholds()
): HospitalSummary[] {
  const origin =
    typeof filters.originLat === 'number' &&
    Number.isFinite(filters.originLat) &&
    typeof filters.originLng === 'number' &&
    Number.isFinite(filters.originLng)
      ? { lat: filters.originLat, lng: filters.originLng }
      : null;

  const all = buildHospitalSummaries(thresholds, origin);

  const q = (filters.query || '').trim().toLowerCase();
  const city = (filters.city || '').trim().toLowerCase();
  const area = (filters.area || '').trim().toLowerCase();
  const specialty = (filters.specialty || '').trim().toLowerCase();

  const matched: HospitalSummary[] = [];

  for (const h of all) {
    const reasons: string[] = [];
    let score = 0;

    if (q) {
      const hay = `${h.hospital_name} ${h.city} ${h.area} ${h.address} ${h.specialties.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) continue;
      reasons.push(`Matches keyword "${filters.query?.trim()}"`);
      score += 20;
    }

    if (city && city !== 'all') {
      if (!h.city.toLowerCase().includes(city)) continue;
      reasons.push(`City match: ${h.city}`);
      score += 25;
    }

    if (area) {
      if (!h.area.toLowerCase().includes(area) && !h.address.toLowerCase().includes(area)) continue;
      reasons.push(`Area match: ${h.area}`);
      score += 15;
    }

    if (specialty && specialty !== 'all') {
      const hasSpec = h.specialties.some((s) => s.toLowerCase().includes(specialty));
      if (!hasSpec) continue;
      reasons.push(`Specialty listed: ${filters.specialty}`);
      score += 25;
    }

    if (filters.bed_type) {
      const targetBed = h.resources.find((r) => r.bed_type === filters.bed_type);
      if (!targetBed || targetBed.total_beds <= 0) continue;
      if (targetBed.is_live_reported && targetBed.available_beds !== null) {
        if (targetBed.available_beds <= 0) continue;
        reasons.push(`Admin-reported ${targetBed.available_beds} ${filters.bed_type} beds available`);
        score += 25 + Math.min(targetBed.available_beds, 15);
      } else {
        reasons.push(`${filters.bed_type} ward present (~${targetBed.total_beds} capacity — call to confirm live beds)`);
        score += 10;
      }
    }

    if (filters.require_icu) {
      const icu = h.resources.find((r) => r.bed_type === 'ICU');
      if (!icu || icu.total_beds <= 0) continue;
      if (icu.is_live_reported && icu.available_beds !== null) {
        reasons.push(`ICU ward: ${icu.available_beds} of ${icu.total_beds} reported available`);
        score += 25 + Math.min(icu.available_beds, 10);
      } else {
        reasons.push(`ICU infrastructure present (~${icu.total_beds} capacity — call to confirm live occupancy)`);
        score += 12;
      }
    }

    if (filters.require_emergency) {
      if (!h.services?.emergency_available) continue;
      reasons.push('24/7 Emergency department available');
      score += 15;
    }

    if (filters.require_ambulance) {
      if (!h.services?.ambulance_available) continue;
      reasons.push('Ambulance services listed');
      score += 10;
    }

    if (filters.require_blood_bank) {
      if (!h.blood_bank_name) continue;
      reasons.push(`On-site blood bank: ${h.blood_bank_name}`);
      score += 10;
    }

    if (filters.require_trauma) {
      if (!h.services?.trauma_care) continue;
      reasons.push('Trauma care unit listed');
      score += 10;
    }

    if (filters.require_surgery) {
      if (!h.services?.emergency_surgery) continue;
      reasons.push('Emergency surgery capability');
      score += 10;
    }

    if (filters.require_diagnostics) {
      if (!h.services?.diagnostic_facility) continue;
      reasons.push('Diagnostic imaging facility');
      score += 8;
    }

    if (filters.require_critical_care) {
      if (!h.services?.critical_care) continue;
      reasons.push('Critical care department');
      score += 10;
    }

    if (filters.freshness_filter && filters.freshness_filter !== 'ALL') {
      if (h.overall_freshness.level !== filters.freshness_filter) continue;
    }

    if (h.overall_freshness.level === 'GREEN') {
      reasons.push(`Live occupancy: Current (${h.overall_freshness.relativeTime})`);
      score += 30;
    } else if (h.overall_freshness.level === 'YELLOW') {
      reasons.push(`Live occupancy: Needs reverification (${h.overall_freshness.relativeTime})`);
      score += 15;
    } else if (h.overall_freshness.level === 'RED') {
      reasons.push(`Live occupancy: Outdated (${h.overall_freshness.relativeTime})`);
      score += 2;
    } else {
      reasons.push('Live occupancy: Unreported (call hospital desk to confirm)');
    }

    if (typeof h.distance_km === 'number') {
      reasons.push(`Straight-line distance: ${h.distance_km} km from selected origin`);
      if (h.distance_km <= 10) score += 20;
      else if (h.distance_km <= 50) score += 10;
    }

    if (h.verification_status === 'verified') {
      score += 12;
    }

    matched.push({
      ...h,
      match_score: score,
      match_reasons: reasons,
    });
  }

  if (filters.sort_by === 'distance' && origin) {
    matched.sort((a, b) => {
      const da = typeof a.distance_km === 'number' ? a.distance_km : Number.POSITIVE_INFINITY;
      const dbDist = typeof b.distance_km === 'number' ? b.distance_km : Number.POSITIVE_INFINITY;
      return da - dbDist;
    });
  } else if (filters.sort_by === 'freshness') {
    const rank = { GREEN: 0, YELLOW: 1, RED: 2, UNKNOWN: 3 };
    matched.sort((a, b) => rank[a.overall_freshness.level] - rank[b.overall_freshness.level]);
  } else {
    matched.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
  }

  return matched;
}

export function getHospitalDetail(
  hospitalId: number,
  thresholds: FreshnessThresholds = getPersistedFreshnessThresholds(),
  origin?: { lat: number; lng: number } | null
): HospitalDetail | null {
  const summaries = buildHospitalSummaries(thresholds, origin);
  const summary = summaries.find((h) => h.hospital_id === hospitalId);
  if (!summary) return null;

  const db = getDb();
  const bloodRows = db
    .prepare('SELECT * FROM blood_banks WHERE hospital_id = ? ORDER BY blood_bank_id ASC')
    .all(hospitalId) as unknown as RawBloodRow[];

  const blood_banks: BloodBankRecord[] = bloodRows.map((b) => ({
    ...b,
    freshness: evaluateFreshness(b.last_updated, thresholds),
  }));

  const update_history = db
    .prepare('SELECT * FROM resource_update_history WHERE hospital_id = ? ORDER BY timestamp DESC LIMIT 50')
    .all(hospitalId) as unknown as UpdateHistoryEntry[];

  const verification_records = db
    .prepare('SELECT * FROM verification_records WHERE hospital_id = ? ORDER BY verification_timestamp DESC')
    .all(hospitalId) as unknown as VerificationRecord[];

  const verification_evidence = db
    .prepare('SELECT * FROM verification_evidence WHERE hospital_id = ? ORDER BY verified_at DESC')
    .all(hospitalId) as unknown as VerificationEvidence[];

  const shift_reports = db
    .prepare('SELECT * FROM shift_reports WHERE hospital_id = ? ORDER BY reported_at DESC LIMIT 40')
    .all(hospitalId) as unknown as ShiftReportEntry[];

  return {
    ...summary,
    blood_banks,
    update_history,
    verification_records,
    verification_evidence,
    shift_reports,
  };
}

export function getOverviewStats(thresholds: FreshnessThresholds = getPersistedFreshnessThresholds()): OverviewStats {
  const hospitals = buildHospitalSummaries(thresholds);

  let verified = 0;
  let pending = 0;
  let publishedBeds = 0;
  let generalAvail = 0;
  let generalTotal = 0;
  let icuAvail = 0;
  let icuTotal = 0;
  let liveReportedHospitals = 0;
  let emergencyCount = 0;

  const freshness_counts = { GREEN: 0, YELLOW: 0, RED: 0, UNKNOWN: 0 };
  const citySet = new Set<string>();
  const specSet = new Set<string>();

  for (const h of hospitals) {
    if (h.verification_status === 'verified') verified++;
    if (h.verification_status === 'pending') pending++;
    if (h.services?.emergency_available) emergencyCount++;
    publishedBeds += h.published_total_beds || 0;

    freshness_counts[h.overall_freshness.level]++;
    citySet.add(h.city);
    for (const sp of h.specialties) specSet.add(sp);

    let hasLive = false;
    for (const r of h.resources) {
      if (r.is_live_reported) hasLive = true;
      if (r.bed_type === 'General Ward') {
        if (r.available_beds !== null) generalAvail += r.available_beds;
        generalTotal += r.total_beds;
      } else if (r.bed_type === 'ICU') {
        if (r.available_beds !== null) icuAvail += r.available_beds;
        icuTotal += r.total_beds;
      }
    }
    if (hasLive) liveReportedHospitals++;
  }

  const recently_updated = [...hospitals]
    .sort((a, b) => {
      const ta = a.latest_update ? Date.parse(a.latest_update) : 0;
      const tb = b.latest_update ? Date.parse(b.latest_update) : 0;
      return tb - ta;
    })
    .slice(0, 6);

  return {
    total_hospitals: hospitals.length,
    verified_hospitals: verified,
    pending_hospitals: pending,
    total_published_beds: publishedBeds,
    total_general_available: generalAvail,
    total_general_beds: generalTotal,
    total_icu_available: icuAvail,
    total_icu_beds: icuTotal,
    live_reported_hospitals: liveReportedHospitals,
    emergency_hospitals: emergencyCount,
    freshness_counts,
    recently_updated,
    cities: Array.from(citySet).sort(),
    specialties: Array.from(specSet).sort(),
  };
}

export function getBloodBanksDirectory(
  filters: {
    city?: string;
    blood_group?: string;
    status?: string;
    query?: string;
  },
  thresholds: FreshnessThresholds = getPersistedFreshnessThresholds()
): BloodBankRecord[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT bb.*, h.hospital_name, h.city, h.area
      FROM blood_banks bb
      JOIN hospitals h ON h.hospital_id = bb.hospital_id
      ORDER BY h.city ASC, h.hospital_name ASC, bb.blood_bank_id ASC
    `)
    .all() as unknown as RawBloodRow[];

  const q = (filters.query || '').trim().toLowerCase();
  const city = (filters.city || '').trim().toLowerCase();
  const group = (filters.blood_group || '').trim();
  const status = (filters.status || '').trim();

  return rows
    .filter((r) => {
      if (city && city !== 'all' && !(r.city || '').toLowerCase().includes(city)) return false;
      if (group && group !== 'all' && r.blood_group !== group) return false;
      if (status && status !== 'all' && r.availability_status !== status) return false;
      if (q) {
        const hay = `${r.blood_bank_name} ${r.hospital_name || ''} ${r.city || ''} ${r.area || ''} ${r.address}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .map((r) => ({
      ...r,
      freshness: evaluateFreshness(r.last_updated, thresholds),
    }));
}

export function getAllAuditLogs(limit = 60): UpdateHistoryEntry[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT u.*, h.hospital_name
      FROM resource_update_history u
      JOIN hospitals h ON h.hospital_id = u.hospital_id
      ORDER BY u.timestamp DESC
      LIMIT ?
    `)
    .all(limit) as unknown as UpdateHistoryEntry[];
}

export function getAnalyticsData(
  period: 'daily' | 'weekly' | 'monthly' = 'daily',
  thresholds: FreshnessThresholds = getPersistedFreshnessThresholds()
): AnalyticsData {
  const db = getDb();
  const hospitals = buildHospitalSummaries(thresholds);

  const shiftRows = db
    .prepare('SELECT * FROM shift_reports ORDER BY reported_at ASC')
    .all() as unknown as ShiftReportEntry[];

  const auditRows = db
    .prepare(`
      SELECT u.*, h.hospital_name
      FROM resource_update_history u
      JOIN hospitals h ON h.hospital_id = u.hospital_id
      ORDER BY u.timestamp DESC
    `)
    .all() as unknown as UpdateHistoryEntry[];

  // Build occupancy trend buckets from real shift_reports
  const trendMap = new Map<
    string,
    { bucket: string; bed_type: BedCategory; pctSum: number; availSum: number; count: number }
  >();

  for (const sr of shiftRows) {
    const dt = new Date(sr.reported_at);
    if (Number.isNaN(dt.getTime())) continue;
    let bucket = sr.reported_at.slice(0, 10);
    if (period === 'monthly') {
      bucket = sr.reported_at.slice(0, 7);
    } else if (period === 'weekly') {
      const startOfYear = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
      const days = Math.floor((dt.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const week = Math.ceil((days + startOfYear.getUTCDay() + 1) / 7);
      bucket = `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }

    const key = `${bucket}|${sr.bed_type}`;
    const pct = sr.total_beds > 0 ? Math.round((sr.occupied_beds / sr.total_beds) * 100) : 0;
    const prev = trendMap.get(key);
    if (prev) {
      prev.pctSum += pct;
      prev.availSum += sr.available_beds;
      prev.count += 1;
    } else {
      trendMap.set(key, {
        bucket,
        bed_type: sr.bed_type,
        pctSum: pct,
        availSum: sr.available_beds,
        count: 1,
      });
    }
  }

  const occupancy_trends: AnalyticsTrendPoint[] = Array.from(trendMap.values()).map((t) => ({
    bucket: t.bucket,
    bed_type: t.bed_type,
    avg_occupancy_pct: Math.round(t.pctSum / t.count),
    avg_available_beds: Math.round(t.availSum / t.count),
    report_count: t.count,
  }));

  // City-wise reporting stats
  const cityMap = new Map<string, CityReportingStat>();
  const shiftCountByHospital = new Map<number, number>();
  for (const sr of shiftRows) {
    shiftCountByHospital.set(sr.hospital_id, (shiftCountByHospital.get(sr.hospital_id) || 0) + 1);
  }

  for (const h of hospitals) {
    const existing = cityMap.get(h.city) || {
      city: h.city,
      total_hospitals: 0,
      verified_hospitals: 0,
      live_reporting_hospitals: 0,
      total_published_beds: 0,
      shift_reports_count: 0,
      latest_update: null,
    };
    existing.total_hospitals += 1;
    if (h.verification_status === 'verified') existing.verified_hospitals += 1;
    if (h.resources.some((r) => r.is_live_reported)) existing.live_reporting_hospitals += 1;
    existing.total_published_beds += h.published_total_beds || 0;
    existing.shift_reports_count += shiftCountByHospital.get(h.hospital_id) || 0;
    if (h.latest_update && (!existing.latest_update || Date.parse(h.latest_update) > Date.parse(existing.latest_update))) {
      existing.latest_update = h.latest_update;
    }
    cityMap.set(h.city, existing);
  }

  // Hospital update frequency
  const auditCountByHospital = new Map<number, number>();
  for (const a of auditRows) {
    auditCountByHospital.set(a.hospital_id, (auditCountByHospital.get(a.hospital_id) || 0) + 1);
  }

  const hospital_frequency: HospitalUpdateFrequencyItem[] = hospitals
    .map((h) => ({
      hospital_id: h.hospital_id,
      hospital_name: h.hospital_name,
      city: h.city,
      total_updates: auditCountByHospital.get(h.hospital_id) || 0,
      shift_reports_count: shiftCountByHospital.get(h.hospital_id) || 0,
      last_updated: h.latest_update,
      freshness_level: h.overall_freshness.level,
      reliability_label: h.reliability?.status_label || 'No Shift Reports Yet',
    }))
    .sort((a, b) => b.total_updates - a.total_updates || b.shift_reports_count - a.shift_reports_count);

  // Blood bank reporting summary
  const bloodRows = db
    .prepare('SELECT hospital_id, availability_status, last_updated FROM blood_banks')
    .all() as Array<{ hospital_id: number; availability_status: string; last_updated: string | null }>;
  const bloodReportingHospitals = new Set<number>();
  let availCount = 0;
  let confirmCount = 0;
  let unavailCount = 0;
  for (const b of bloodRows) {
    if (b.last_updated) bloodReportingHospitals.add(b.hospital_id);
    if (b.availability_status === 'Reported available') availCount++;
    else if (b.availability_status === 'Contact to confirm') confirmCount++;
    else if (b.availability_status === 'Reported unavailable') unavailCount++;
  }

  const bloodLogs = auditRows.filter((a) => a.resource_type.toLowerCase().includes('blood')).slice(0, 15);

  return {
    period,
    has_shift_history: shiftRows.length > 0,
    total_shift_reports: shiftRows.length,
    total_audit_updates: auditRows.length,
    occupancy_trends,
    city_stats: Array.from(cityMap.values()).sort((a, b) => b.total_hospitals - a.total_hospitals),
    hospital_frequency,
    blood_bank_summary: {
      total_updates: bloodLogs.length,
      hospitals_reporting: bloodReportingHospitals.size,
      reported_available_entries: availCount,
      contact_to_confirm_entries: confirmCount,
      reported_unavailable_entries: unavailCount,
      recent_logs: bloodLogs,
    },
  };
}

export function getAdminReminders(
  hospitalId: number,
  thresholds: FreshnessThresholds = getPersistedFreshnessThresholds()
): NotificationReminder[] {
  const db = getDb();
  const detail = getHospitalDetail(hospitalId, thresholds);
  if (!detail) return [];

  const reminders: NotificationReminder[] = [];
  const now = new Date().toISOString();

  if (detail.overall_freshness.level === 'UNKNOWN') {
    reminders.push({
      notif_id: -1,
      hospital_id: hospitalId,
      hospital_name: detail.hospital_name,
      severity: 'warning',
      message: 'No live shift bed report has been submitted yet. Submit your ward occupancy counts so patients see verified current counts.',
      created_at: now,
      acknowledged: false,
    });
  } else if (detail.overall_freshness.level === 'RED') {
    reminders.push({
      notif_id: -2,
      hospital_id: hospitalId,
      hospital_name: detail.hospital_name,
      severity: 'urgent',
      message: `Live bed occupancy is outdated (${detail.overall_freshness.relativeTime}, exceeding ${thresholds.yellowMaxHours}h threshold). Please submit a fresh shift report.`,
      created_at: detail.latest_update || now,
      acknowledged: false,
    });
  } else if (detail.overall_freshness.level === 'YELLOW') {
    reminders.push({
      notif_id: -3,
      hospital_id: hospitalId,
      hospital_name: detail.hospital_name,
      severity: 'info',
      message: `Bed update is approaching reverification window (${detail.overall_freshness.relativeTime}). Confirm next shift numbers when ready.`,
      created_at: detail.latest_update || now,
      acknowledged: false,
    });
  }

  const persisted = db
    .prepare('SELECT * FROM notification_queue WHERE hospital_id = ? AND acknowledged = 0 ORDER BY created_at DESC LIMIT 10')
    .all(hospitalId) as Array<{
    notif_id: number;
    hospital_id: number;
    severity: 'info' | 'warning' | 'urgent';
    message: string;
    created_at: string;
    acknowledged: number;
  }>;

  for (const p of persisted) {
    reminders.push({
      notif_id: p.notif_id,
      hospital_id: p.hospital_id,
      hospital_name: detail.hospital_name,
      severity: p.severity,
      message: p.message,
      created_at: p.created_at,
      acknowledged: Boolean(p.acknowledged),
    });
  }

  return reminders;
}

export function getDuplicateHospitals(): DuplicateGroup[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT hospital_id, hospital_name, city, phone, verification_status FROM hospitals ORDER BY hospital_id')
    .all() as Array<{
    hospital_id: number;
    hospital_name: string;
    city: string;
    phone: string;
    verification_status: VerificationStatus;
  }>;

  const groups: DuplicateGroup[] = [];
  const phoneMap = new Map<string, typeof rows>();
  const nameMap = new Map<string, typeof rows>();

  for (const r of rows) {
    const cleanPhone = r.phone.replace(/\D/g, '').slice(-8);
    if (cleanPhone.length >= 8) {
      const arr = phoneMap.get(cleanPhone) || [];
      arr.push(r);
      phoneMap.set(cleanPhone, arr);
    }

    const cleanName = r.hospital_name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const nArr = nameMap.get(cleanName) || [];
    nArr.push(r);
    nameMap.set(cleanName, nArr);
  }

  for (const [phone, list] of phoneMap.entries()) {
    if (list.length > 1) {
      groups.push({ reason: `Shared contact digits (…${phone})`, hospitals: list });
    }
  }
  for (const [, list] of nameMap.entries()) {
    if (list.length > 1) {
      groups.push({ reason: 'Normalized hospital name match', hospitals: list });
    }
  }

  return groups;
}
