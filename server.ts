import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { initializeDatabase, getDb } from './src/server/database.ts';
import {
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  revokeSessionToken,
  extractToken,
  requireAuth,
  createRateLimiter,
  type AuthenticatedRequest,
} from './src/server/auth.ts';
import {
  buildHospitalSummaries,
  searchAndMatchHospitals,
  getHospitalDetail,
  getOverviewStats,
  getBloodBanksDirectory,
  getAllAuditLogs,
  getAnalyticsData,
  getAdminReminders,
  getDuplicateHospitals,
  getPersistedFreshnessThresholds,
  savePersistedFreshnessThresholds,
  validatePhoneNumber,
} from './src/server/queries.ts';
import { runHospiAssistantQuery } from './src/server/hospiAssistant.ts';
import type { FreshnessThresholds } from './src/shared/freshness.ts';
import type {
  AuthUser,
  BedCategory,
  BloodAvailabilityStatus,
  BloodGroup,
  ShiftName,
  VerificationStatus,
} from './src/shared/types.ts';

initializeDatabase();

const app = express();
app.use(express.json({ limit: '1mb' }));

const loginLimiter = createRateLimiter('auth-login', 20, 60_000);
const assistantLimiter = createRateLimiter('hospi-assistant', 30, 60_000);
const adminMutationLimiter = createRateLimiter('admin-mutations', 60, 60_000);

function parseThresholds(query: Record<string, unknown>): FreshnessThresholds {
  const persisted = getPersistedFreshnessThresholds();
  const green = Number(query.greenMaxHours);
  const yellow = Number(query.yellowMaxHours);
  const greenMaxHours = Number.isFinite(green) && green > 0 && green <= 24 ? green : persisted.greenMaxHours;
  const yellowMaxHours =
    Number.isFinite(yellow) && yellow > greenMaxHours && yellow <= 72 ? yellow : Math.max(greenMaxHours + 1, persisted.yellowMaxHours);
  return { greenMaxHours, yellowMaxHours };
}

function parseOrigin(query: Record<string, unknown>): { lat?: number; lng?: number } {
  const lat = query.originLat !== undefined ? Number(query.originLat) : NaN;
  const lng = query.originLng !== undefined ? Number(query.originLng) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { lat, lng };
  }
  return {};
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hospifind-api' });
});

// Persisted freshness thresholds
app.get('/api/settings/freshness', (_req, res) => {
  res.json({ thresholds: getPersistedFreshnessThresholds() });
});

// Overview & KPIs
app.get('/api/overview', (req, res) => {
  try {
    const thresholds = parseThresholds(req.query as Record<string, unknown>);
    const stats = getOverviewStats(thresholds);
    res.json(stats);
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ error: 'Unable to load platform overview.' });
  }
});

// Search & Rule-based hospital matching (with optional Haversine distance)
app.get('/api/hospitals', (req, res) => {
  try {
    const thresholds = parseThresholds(req.query as Record<string, unknown>);
    const q = req.query as Record<string, unknown>;
    const origin = parseOrigin(q);
    const sortBy =
      q.sort_by === 'distance' || q.sort_by === 'freshness' || q.sort_by === 'relevance'
        ? q.sort_by
        : 'relevance';

    const results = searchAndMatchHospitals(
      {
        query: typeof q.query === 'string' ? q.query : undefined,
        city: typeof q.city === 'string' ? q.city : undefined,
        area: typeof q.area === 'string' ? q.area : undefined,
        specialty: typeof q.specialty === 'string' ? q.specialty : undefined,
        bed_type: typeof q.bed_type === 'string' ? (q.bed_type as BedCategory | '') : '',
        require_icu: q.require_icu === 'true',
        require_emergency: q.require_emergency === 'true',
        require_ambulance: q.require_ambulance === 'true',
        require_blood_bank: q.require_blood_bank === 'true',
        require_trauma: q.require_trauma === 'true',
        require_surgery: q.require_surgery === 'true',
        require_diagnostics: q.require_diagnostics === 'true',
        require_critical_care: q.require_critical_care === 'true',
        freshness_filter:
          typeof q.freshness_filter === 'string'
            ? (q.freshness_filter as 'ALL' | 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN')
            : 'ALL',
        originLat: origin.lat,
        originLng: origin.lng,
        sort_by: sortBy,
      },
      thresholds
    );
    res.json({ hospitals: results, thresholds });
  } catch (err) {
    console.error('Search hospitals error:', err);
    res.status(500).json({ error: 'Unable to search hospitals at this time.' });
  }
});

// Single hospital full profile
app.get('/api/hospitals/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid hospital ID.' });
    return;
  }
  try {
    const q = req.query as Record<string, unknown>;
    const thresholds = parseThresholds(q);
    const origin = parseOrigin(q);
    const detail = getHospitalDetail(
      id,
      thresholds,
      origin.lat !== undefined && origin.lng !== undefined ? { lat: origin.lat, lng: origin.lng } : null
    );
    if (!detail) {
      res.status(404).json({ error: 'Hospital record not found.' });
      return;
    }
    res.json(detail);
  } catch (err) {
    console.error('Hospital detail error:', err);
    res.status(500).json({ error: 'Unable to load hospital details.' });
  }
});

// Blood bank directory
app.get('/api/blood-banks', (req, res) => {
  try {
    const thresholds = parseThresholds(req.query as Record<string, unknown>);
    const q = req.query;
    const records = getBloodBanksDirectory(
      {
        city: typeof q.city === 'string' ? q.city : undefined,
        blood_group: typeof q.blood_group === 'string' ? q.blood_group : undefined,
        status: typeof q.status === 'string' ? q.status : undefined,
        query: typeof q.query === 'string' ? q.query : undefined,
      },
      thresholds
    );
    res.json({ records });
  } catch (err) {
    console.error('Blood banks error:', err);
    res.status(500).json({ error: 'Unable to load blood bank directory.' });
  }
});

// Historical Resource Analytics (truthful SQLite aggregations only)
app.get('/api/analytics', (req, res) => {
  try {
    const thresholds = parseThresholds(req.query as Record<string, unknown>);
    const periodParam = req.query.period;
    const period =
      periodParam === 'weekly' || periodParam === 'monthly' ? periodParam : 'daily';
    const data = getAnalyticsData(period, thresholds);
    res.json(data);
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Unable to load historical resource analytics.' });
  }
});

// Hospi Assistant: Natural language search grounded strictly in SQLite
app.post('/api/assistant/search', assistantLimiter, async (req, res) => {
  const { query, language, originLat, originLng } = req.body as {
    query?: string;
    language?: 'en' | 'ta';
    originLat?: number;
    originLng?: number;
  };

  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'Please enter a search question or resource need.' });
    return;
  }
  if (query.trim().length > 400) {
    res.status(400).json({ error: 'Query is too long (maximum 400 characters).' });
    return;
  }

  try {
    const thresholds = getPersistedFreshnessThresholds();
    const result = await runHospiAssistantQuery(
      {
        query: query.trim(),
        language: language === 'ta' ? 'ta' : 'en',
        originLat: typeof originLat === 'number' && Number.isFinite(originLat) ? originLat : undefined,
        originLng: typeof originLng === 'number' && Number.isFinite(originLng) ? originLng : undefined,
      },
      thresholds
    );
    res.json(result);
  } catch (err) {
    console.error('Hospi Assistant error:', err);
    res.status(500).json({ error: 'Unable to process assistant search.' });
  }
});

// Authentication
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Please enter both username and password.' });
    return;
  }

  try {
    const db = getDb();
    const row = db
      .prepare(`
        SELECT a.admin_id, a.username, a.password_hash, a.role, a.hospital_id, a.account_status, a.display_name, h.hospital_name
        FROM administrators a
        LEFT JOIN hospitals h ON h.hospital_id = a.hospital_id
        WHERE a.username = ?
      `)
      .get(username.trim()) as
      | {
          admin_id: number;
          username: string;
          password_hash: string;
          role: 'hospital_admin' | 'super_admin';
          hospital_id: number | null;
          account_status: 'active' | 'suspended';
          display_name: string;
          hospital_name: string | null;
        }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid administrator username or password.' });
      return;
    }

    if (row.account_status !== 'active') {
      res.status(403).json({ error: 'This administrator account is currently suspended.' });
      return;
    }

    const user: AuthUser = {
      admin_id: row.admin_id,
      username: row.username,
      role: row.role,
      hospital_id: row.hospital_id,
      hospital_name: row.hospital_name,
      display_name: row.display_name,
      account_status: row.account_status,
    };

    const token = signSessionToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication service encountered an error.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractToken(req);
  const revoked = revokeSessionToken(token);
  res.json({ success: true, revoked });
});

app.get('/api/auth/me', (req, res) => {
  const token = extractToken(req);
  const user = verifySessionToken(token);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  res.json({ user });
});

function authorizeHospitalAccess(req: AuthenticatedRequest, hospitalId: number): string | null {
  const user = req.authUser;
  if (!user) return 'Authentication required.';
  if (user.role === 'super_admin') return null;
  if (user.role === 'hospital_admin' && user.hospital_id === hospitalId) return null;
  return 'Access denied: Hospital administrators can only modify their assigned hospital records.';
}

// Hospital Admin: Active Update Reminders
app.get('/api/admin/hospital/:id/reminders', requireAuth(['hospital_admin', 'super_admin']), (req: AuthenticatedRequest, res) => {
  const hospitalId = Number(req.params.id);
  if (!Number.isInteger(hospitalId) || hospitalId <= 0) {
    res.status(400).json({ error: 'Invalid hospital ID.' });
    return;
  }
  const accessErr = authorizeHospitalAccess(req, hospitalId);
  if (accessErr) {
    res.status(403).json({ error: accessErr });
    return;
  }
  try {
    const thresholds = parseThresholds(req.query as Record<string, unknown>);
    const reminders = getAdminReminders(hospitalId, thresholds);
    res.json({ reminders });
  } catch (err) {
    console.error('Admin reminders error:', err);
    res.status(500).json({ error: 'Unable to load reminders.' });
  }
});

// Update hospital profile
app.put('/api/admin/hospital/:id/profile', adminMutationLimiter, requireAuth(['hospital_admin', 'super_admin']), (req: AuthenticatedRequest, res) => {
  const hospitalId = Number(req.params.id);
  if (!Number.isInteger(hospitalId) || hospitalId <= 0) {
    res.status(400).json({ error: 'Invalid hospital ID.' });
    return;
  }
  const accessErr = authorizeHospitalAccess(req, hospitalId);
  if (accessErr) {
    res.status(403).json({ error: accessErr });
    return;
  }

  const { address, city, area, phone, operating_hours } = req.body as {
    address?: string;
    city?: string;
    area?: string;
    phone?: string;
    operating_hours?: string;
  };

  if (!address?.trim() || !city?.trim() || !area?.trim() || !phone?.trim() || !operating_hours?.trim()) {
    res.status(400).json({ error: 'All profile fields (address, city, area, phone, operating hours) are required.' });
    return;
  }
  if (!validatePhoneNumber(phone)) {
    res.status(400).json({ error: 'Please provide a valid phone number (8–22 digits, spaces, +, -, or parentheses).' });
    return;
  }

  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM hospitals WHERE hospital_id = ?').get(hospitalId) as
      | { address: string; city: string; area: string; phone: string; operating_hours: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Hospital not found.' });
      return;
    }

    const now = new Date().toISOString();
    const actor = `${req.authUser!.display_name} (${req.authUser!.username})`;

    db.prepare(`
      UPDATE hospitals
      SET address = ?, city = ?, area = ?, phone = ?, operating_hours = ?
      WHERE hospital_id = ?
    `).run(address.trim(), city.trim(), area.trim(), phone.trim(), operating_hours.trim(), hospitalId);

    db.prepare(`
      INSERT INTO resource_update_history (hospital_id, resource_type, previous_value, new_value, updated_by, timestamp, notes)
      VALUES (?, 'Hospital Profile', ?, ?, ?, ?, 'Profile details updated by administrator')
    `).run(
      hospitalId,
      `${existing.phone} · ${existing.address}`,
      `${phone.trim()} · ${address.trim()}`,
      actor,
      now
    );

    res.json({ success: true, detail: getHospitalDetail(hospitalId) });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update hospital profile.' });
  }
});

// Update bed availability (with strict calculation, validation & shift_reports logging)
app.put('/api/admin/hospital/:id/resources', adminMutationLimiter, requireAuth(['hospital_admin', 'super_admin']), (req: AuthenticatedRequest, res) => {
  const hospitalId = Number(req.params.id);
  if (!Number.isInteger(hospitalId) || hospitalId <= 0) {
    res.status(400).json({ error: 'Invalid hospital ID.' });
    return;
  }
  const accessErr = authorizeHospitalAccess(req, hospitalId);
  if (accessErr) {
    res.status(403).json({ error: accessErr });
    return;
  }

  const { updates, notes, shift_name } = req.body as {
    updates?: Array<{ bed_type: BedCategory; total_beds: number; occupied_beds: number }>;
    notes?: string;
    shift_name?: ShiftName;
  };

  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: 'Provide at least one bed category update.' });
    return;
  }

  const validShifts: ShiftName[] = ['Morning', 'Afternoon', 'Night'];
  const shift: ShiftName = shift_name && validShifts.includes(shift_name) ? shift_name : 'Morning';

  const allowedTypes: BedCategory[] = ['General Ward', 'ICU', 'Emergency Observation', 'Private Rooms'];
  for (const item of updates) {
    if (!allowedTypes.includes(item.bed_type)) {
      res.status(400).json({ error: `Unsupported bed category: ${item.bed_type}` });
      return;
    }
    if (!Number.isInteger(item.total_beds) || !Number.isInteger(item.occupied_beds)) {
      res.status(400).json({ error: `Bed counts for ${item.bed_type} must be whole integers.` });
      return;
    }
    if (item.total_beds < 0 || item.occupied_beds < 0) {
      res.status(400).json({ error: `Negative bed counts are not permitted (${item.bed_type}).` });
      return;
    }
    if (item.occupied_beds > item.total_beds) {
      res.status(400).json({
        error: `Invalid count for ${item.bed_type}: Occupied beds (${item.occupied_beds}) cannot exceed total beds (${item.total_beds}).`,
      });
      return;
    }
  }

  try {
    const db = getDb();
    const now = new Date().toISOString();
    const actor = `${req.authUser!.display_name} (${req.authUser!.username})`;

    // Calculate reporting delay relative to last report if beyond expected 8-hour shift cadence
    const prevShiftRow = db
      .prepare('SELECT reported_at FROM shift_reports WHERE hospital_id = ? ORDER BY reported_at DESC LIMIT 1')
      .get(hospitalId) as { reported_at: string } | undefined;
    let delayMinutes = 0;
    if (prevShiftRow) {
      const hoursElapsed = (Date.parse(now) - Date.parse(prevShiftRow.reported_at)) / (1000 * 60 * 60);
      if (hoursElapsed > 8) {
        delayMinutes = Math.round((hoursElapsed - 8) * 60);
      }
    }

    const selectPrev = db.prepare(
      'SELECT total_beds, occupied_beds, available_beds, is_live_reported FROM hospital_resources WHERE hospital_id = ? AND bed_type = ?'
    );
    const updateRow = db.prepare(`
      UPDATE hospital_resources
      SET total_beds = ?, occupied_beds = ?, available_beds = ?, is_live_reported = 1, last_updated = ?, updated_by = ?
      WHERE hospital_id = ? AND bed_type = ?
    `);
    const insertHistory = db.prepare(`
      INSERT INTO resource_update_history (hospital_id, resource_type, previous_value, new_value, updated_by, timestamp, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertShiftReport = db.prepare(`
      INSERT INTO shift_reports (hospital_id, shift_name, bed_type, total_beds, occupied_beds, available_beds, reported_by, reported_at, delay_minutes, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN');
    try {
      for (const item of updates) {
        const available = item.total_beds - item.occupied_beds;
        const prev = selectPrev.get(hospitalId, item.bed_type) as
          | { total_beds: number; occupied_beds: number | null; available_beds: number | null; is_live_reported: number }
          | undefined;

        updateRow.run(item.total_beds, item.occupied_beds, available, now, actor, hospitalId, item.bed_type);

        const prevStr = prev && prev.is_live_reported && prev.occupied_beds !== null
          ? `Occupied: ${prev.occupied_beds} / ${prev.total_beds} (Available: ${prev.available_beds})`
          : `Unreported live occupancy (Capacity: ${prev?.total_beds ?? item.total_beds})`;
        const newStr = `Occupied: ${item.occupied_beds} / ${item.total_beds} (Available: ${available})`;

        insertHistory.run(
          hospitalId,
          `${item.bed_type} Beds (${shift} Shift)`,
          prevStr,
          newStr,
          actor,
          now,
          notes?.trim() || `${shift} shift bed occupancy reported via Hospital Admin Dashboard`
        );

        insertShiftReport.run(
          hospitalId,
          shift,
          item.bed_type,
          item.total_beds,
          item.occupied_beds,
          available,
          actor,
          now,
          delayMinutes,
          notes?.trim() || null
        );
      }

      // Acknowledge open update reminders for this hospital
      db.prepare('UPDATE notification_queue SET acknowledged = 1 WHERE hospital_id = ?').run(hospitalId);

      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }

    res.json({ success: true, detail: getHospitalDetail(hospitalId) });
  } catch (err) {
    console.error('Update resources error:', err);
    res.status(500).json({ error: 'Database error while updating bed availability.' });
  }
});

// Update medical specialties and emergency services
app.put('/api/admin/hospital/:id/services', adminMutationLimiter, requireAuth(['hospital_admin', 'super_admin']), (req: AuthenticatedRequest, res) => {
  const hospitalId = Number(req.params.id);
  if (!Number.isInteger(hospitalId) || hospitalId <= 0) {
    res.status(400).json({ error: 'Invalid hospital ID.' });
    return;
  }
  const accessErr = authorizeHospitalAccess(req, hospitalId);
  if (accessErr) {
    res.status(403).json({ error: accessErr });
    return;
  }

  const {
    specialty,
    emergency_available,
    ambulance_available,
    trauma_care,
    emergency_surgery,
    diagnostic_facility,
    critical_care,
  } = req.body as {
    specialty?: string;
    emergency_available?: boolean;
    ambulance_available?: boolean;
    trauma_care?: boolean;
    emergency_surgery?: boolean;
    diagnostic_facility?: boolean;
    critical_care?: boolean;
  };

  if (!specialty || !specialty.trim()) {
    res.status(400).json({ error: 'Please specify at least one medical specialty.' });
    return;
  }

  try {
    const db = getDb();
    const prev = db.prepare('SELECT * FROM hospital_services WHERE hospital_id = ?').get(hospitalId) as
      | { specialty: string; emergency_available: number; ambulance_available: number; trauma_care: number }
      | undefined;

    const now = new Date().toISOString();
    const actor = `${req.authUser!.display_name} (${req.authUser!.username})`;

    db.prepare(`
      UPDATE hospital_services
      SET specialty = ?, emergency_available = ?, ambulance_available = ?,
          trauma_care = ?, emergency_surgery = ?, diagnostic_facility = ?, critical_care = ?
      WHERE hospital_id = ?
    `).run(
      specialty.trim(),
      emergency_available ? 1 : 0,
      ambulance_available ? 1 : 0,
      trauma_care ? 1 : 0,
      emergency_surgery ? 1 : 0,
      diagnostic_facility ? 1 : 0,
      critical_care ? 1 : 0,
      hospitalId
    );

    db.prepare(`
      INSERT INTO resource_update_history (hospital_id, resource_type, previous_value, new_value, updated_by, timestamp, notes)
      VALUES (?, 'Specialties & Emergency Services', ?, ?, ?, ?, 'Services configuration updated')
    `).run(
      hospitalId,
      prev ? `${prev.specialty} (Emergency: ${prev.emergency_available ? 'Yes' : 'No'})` : 'Previous services',
      `${specialty.trim()} (Emergency: ${emergency_available ? 'Yes' : 'No'}, Ambulance: ${ambulance_available ? 'Yes' : 'No'})`,
      actor,
      now
    );

    res.json({ success: true, detail: getHospitalDetail(hospitalId) });
  } catch (err) {
    console.error('Update services error:', err);
    res.status(500).json({ error: 'Unable to update hospital services.' });
  }
});

// Update blood bank statuses
app.put('/api/admin/hospital/:id/blood-bank', adminMutationLimiter, requireAuth(['hospital_admin', 'super_admin']), (req: AuthenticatedRequest, res) => {
  const hospitalId = Number(req.params.id);
  if (!Number.isInteger(hospitalId) || hospitalId <= 0) {
    res.status(400).json({ error: 'Invalid hospital ID.' });
    return;
  }
  const accessErr = authorizeHospitalAccess(req, hospitalId);
  if (accessErr) {
    res.status(403).json({ error: accessErr });
    return;
  }

  const { blood_bank_name, contact_number, statuses } = req.body as {
    blood_bank_name?: string;
    contact_number?: string;
    statuses?: Array<{ blood_group: BloodGroup; availability_status: BloodAvailabilityStatus }>;
  };

  if (!blood_bank_name?.trim() || !contact_number?.trim() || !validatePhoneNumber(contact_number)) {
    res.status(400).json({ error: 'Valid blood bank name and contact phone number are required.' });
    return;
  }

  const validStatuses: BloodAvailabilityStatus[] = [
    'Reported available',
    'Contact to confirm',
    'Reported unavailable',
    'Information unavailable',
  ];
  if (!Array.isArray(statuses) || statuses.length === 0) {
    res.status(400).json({ error: 'Provide blood group availability statuses.' });
    return;
  }

  for (const s of statuses) {
    if (!validStatuses.includes(s.availability_status)) {
      res.status(400).json({ error: `Invalid availability status for ${s.blood_group}` });
      return;
    }
  }

  try {
    const db = getDb();
    const now = new Date().toISOString();
    const actor = `${req.authUser!.display_name} (${req.authUser!.username})`;

    const updateStmt = db.prepare(`
      UPDATE blood_banks
      SET blood_bank_name = ?, contact_number = ?, availability_status = ?, last_updated = ?
      WHERE hospital_id = ? AND blood_group = ?
    `);

    db.exec('BEGIN');
    try {
      for (const s of statuses) {
        updateStmt.run(blood_bank_name.trim(), contact_number.trim(), s.availability_status, now, hospitalId, s.blood_group);
      }

      const availableList = statuses
        .filter((s) => s.availability_status === 'Reported available')
        .map((s) => s.blood_group)
        .join(', ');

      db.prepare(`
        INSERT INTO resource_update_history (hospital_id, resource_type, previous_value, new_value, updated_by, timestamp, notes)
        VALUES (?, 'Blood Bank Inventory Report', 'Previous blood group status', ?, ?, ?, 'Blood bank availability status updated')
      `).run(
        hospitalId,
        availableList ? `Reported available: ${availableList}` : 'No groups marked reported available',
        actor,
        now
      );
      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }

    res.json({ success: true, detail: getHospitalDetail(hospitalId) });
  } catch (err) {
    console.error('Update blood bank error:', err);
    res.status(500).json({ error: 'Failed to update blood bank status.' });
  }
});

// Super Admin: Get platform governance view (hospitals, audit logs, verifications, evidence, duplicates)
app.get('/api/super-admin/governance', requireAuth(['super_admin']), (req, res) => {
  try {
    const thresholds = parseThresholds(req.query as Record<string, unknown>);
    const hospitals = buildHospitalSummaries(thresholds);
    const auditLogs = getAllAuditLogs(80);
    const duplicates = getDuplicateHospitals();
    const db = getDb();
    const verifications = db
      .prepare(`
        SELECT v.*, h.hospital_name
        FROM verification_records v
        JOIN hospitals h ON h.hospital_id = v.hospital_id
        ORDER BY v.verification_timestamp DESC
        LIMIT 80
      `)
      .all();

    const evidence = db
      .prepare(`
        SELECT ve.*, h.hospital_name
        FROM verification_evidence ve
        JOIN hospitals h ON h.hospital_id = ve.hospital_id
        ORDER BY ve.verified_at DESC
        LIMIT 120
      `)
      .all();

    res.json({ hospitals, auditLogs, verifications, evidence, duplicates, thresholds });
  } catch (err) {
    console.error('Super admin fetch error:', err);
    res.status(500).json({ error: 'Unable to load verification centre data.' });
  }
});

// Super Admin: Persist Freshness Thresholds in system_settings
app.put('/api/super-admin/settings/freshness', adminMutationLimiter, requireAuth(['super_admin']), (req: AuthenticatedRequest, res) => {
  const { greenMaxHours, yellowMaxHours } = req.body as { greenMaxHours?: number; yellowMaxHours?: number };
  if (
    typeof greenMaxHours !== 'number' ||
    typeof yellowMaxHours !== 'number' ||
    !Number.isFinite(greenMaxHours) ||
    !Number.isFinite(yellowMaxHours) ||
    greenMaxHours < 1 ||
    yellowMaxHours <= greenMaxHours
  ) {
    res.status(400).json({ error: 'Invalid threshold configuration: yellowMaxHours must exceed greenMaxHours (>= 1).' });
    return;
  }

  try {
    const actor = `${req.authUser!.display_name} (${req.authUser!.username})`;
    const saved = savePersistedFreshnessThresholds({ greenMaxHours, yellowMaxHours }, actor);
    res.json({ success: true, thresholds: saved });
  } catch (err) {
    console.error('Save freshness thresholds error:', err);
    res.status(500).json({ error: 'Failed to save freshness thresholds.' });
  }
});

// Super Admin: Log Verification Evidence (Website, Phone, Address, Capacity, Identity)
app.post('/api/super-admin/hospitals/:id/evidence', adminMutationLimiter, requireAuth(['super_admin']), (req: AuthenticatedRequest, res) => {
  const hospitalId = Number(req.params.id);
  if (!Number.isInteger(hospitalId) || hospitalId <= 0) {
    res.status(400).json({ error: 'Invalid hospital ID.' });
    return;
  }

  const { check_type, verified_source, evidence_ref, status, notes } = req.body as {
    check_type?: 'identity' | 'website' | 'phone' | 'address' | 'capacity';
    verified_source?: string;
    evidence_ref?: string;
    status?: 'verified' | 'pending' | 'flagged';
    notes?: string;
  };

  if (
    !check_type ||
    !['identity', 'website', 'phone', 'address', 'capacity'].includes(check_type) ||
    !verified_source?.trim() ||
    !evidence_ref?.trim() ||
    !status ||
    !['verified', 'pending', 'flagged'].includes(status)
  ) {
    res.status(400).json({ error: 'Check type, source, evidence reference, and valid status are required.' });
    return;
  }

  try {
    const db = getDb();
    const exists = db.prepare('SELECT hospital_id FROM hospitals WHERE hospital_id = ?').get(hospitalId);
    if (!exists) {
      res.status(404).json({ error: 'Hospital not found.' });
      return;
    }

    const now = new Date().toISOString();
    const actor = `${req.authUser!.display_name} (${req.authUser!.username})`;

    db.prepare(`
      INSERT INTO verification_evidence (hospital_id, check_type, verified_source, evidence_ref, status, verified_by, verified_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(hospitalId, check_type, verified_source.trim(), evidence_ref.trim(), status, actor, now, notes?.trim() || null);

    db.prepare(`
      INSERT INTO resource_update_history (hospital_id, resource_type, previous_value, new_value, updated_by, timestamp, notes)
      VALUES (?, ?, 'Evidence audit', ?, ?, ?, ?)
    `).run(
      hospitalId,
      `Verification Evidence (${check_type})`,
      `${status}: ${verified_source.trim()} (${evidence_ref.trim()})`,
      actor,
      now,
      notes?.trim() || 'Super administrator verification evidence logged'
    );

    res.status(201).json({ success: true, detail: getHospitalDetail(hospitalId) });
  } catch (err) {
    console.error('Log evidence error:', err);
    res.status(500).json({ error: 'Failed to log verification evidence.' });
  }
});

// Super Admin: Approve / Reject / Update Hospital Verification Status
app.put('/api/super-admin/hospitals/:id/verify', adminMutationLimiter, requireAuth(['super_admin']), (req: AuthenticatedRequest, res) => {
  const hospitalId = Number(req.params.id);
  if (!Number.isInteger(hospitalId) || hospitalId <= 0) {
    res.status(400).json({ error: 'Invalid hospital ID.' });
    return;
  }

  const { verification_status, verification_type, notes } = req.body as {
    verification_status?: VerificationStatus;
    verification_type?: string;
    notes?: string;
  };

  if (!verification_status || !['verified', 'pending', 'rejected'].includes(verification_status)) {
    res.status(400).json({ error: 'Verification status must be verified, pending, or rejected.' });
    return;
  }

  try {
    const db = getDb();
    const prev = db.prepare('SELECT verification_status FROM hospitals WHERE hospital_id = ?').get(hospitalId) as
      | { verification_status: VerificationStatus }
      | undefined;

    if (!prev) {
      res.status(404).json({ error: 'Hospital not found.' });
      return;
    }

    const now = new Date().toISOString();
    const actor = `${req.authUser!.display_name} (${req.authUser!.username})`;
    const vType = verification_type?.trim() || 'Hospital Identity Registration';

    db.exec('BEGIN');
    try {
      if (vType === 'Hospital Identity Registration') {
        db.prepare('UPDATE hospitals SET verification_status = ? WHERE hospital_id = ?').run(verification_status, hospitalId);
      }

      db.prepare(`
        INSERT INTO verification_records (hospital_id, verification_type, verification_status, verified_by, verification_timestamp, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        hospitalId,
        vType,
        verification_status,
        actor,
        now,
        notes?.trim() || `Verification updated to ${verification_status}`
      );

      db.prepare(`
        INSERT INTO resource_update_history (hospital_id, resource_type, previous_value, new_value, updated_by, timestamp, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        hospitalId,
        vType,
        prev.verification_status,
        verification_status,
        actor,
        now,
        notes?.trim() || 'Super administrator verification action'
      );

      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }

    res.json({ success: true, detail: getHospitalDetail(hospitalId) });
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ error: 'Failed to update verification status.' });
  }
});

// Super Admin: Register a new hospital (with duplicate name & phone check)
app.post('/api/super-admin/hospitals', adminMutationLimiter, requireAuth(['super_admin']), (req: AuthenticatedRequest, res) => {
  const { hospital_name, address, city, area, phone, specialty, general_beds, icu_beds, latitude, longitude, official_website } = req.body as {
    hospital_name?: string;
    address?: string;
    city?: string;
    area?: string;
    phone?: string;
    specialty?: string;
    general_beds?: number;
    icu_beds?: number;
    latitude?: number | null;
    longitude?: number | null;
    official_website?: string | null;
  };

  if (!hospital_name?.trim() || !address?.trim() || !city?.trim() || !area?.trim() || !phone?.trim()) {
    res.status(400).json({ error: 'Hospital name, address, city, area, and phone number are required.' });
    return;
  }

  if (!validatePhoneNumber(phone)) {
    res.status(400).json({ error: 'Invalid phone number format.' });
    return;
  }

  const genTotal = Number.isInteger(general_beds) && (general_beds as number) >= 0 ? (general_beds as number) : 40;
  const icuTotal = Number.isInteger(icu_beds) && (icu_beds as number) >= 0 ? (icu_beds as number) : 10;

  try {
    const db = getDb();
    const dup = db
      .prepare('SELECT hospital_id FROM hospitals WHERE LOWER(hospital_name) = LOWER(?)')
      .get(hospital_name.trim());
    if (dup) {
      res.status(409).json({ error: `A hospital named "${hospital_name.trim()}" is already registered.` });
      return;
    }

    const now = new Date().toISOString();
    const actor = `${req.authUser!.display_name} (${req.authUser!.username})`;

    db.exec('BEGIN');
    let newHospitalId = 0;
    try {
      const insertH = db.prepare(`
        INSERT INTO hospitals (
          hospital_name, address, city, area, phone, latitude, longitude,
          verification_status, registration_date, image_url, operating_hours,
          official_website, data_source, published_total_beds, is_simulated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, '24/7 Open', ?, 'Admin Registered Facility', ?, 0)
      `).run(
        hospital_name.trim(),
        address.trim(),
        city.trim(),
        area.trim(),
        phone.trim(),
        typeof latitude === 'number' && Number.isFinite(latitude) ? latitude : null,
        typeof longitude === 'number' && Number.isFinite(longitude) ? longitude : null,
        now,
        '/src/assets/images/hospital_modern_facade_1795018448579.jpg',
        official_website?.trim() || null,
        genTotal + icuTotal + 18
      );
      newHospitalId = Number(insertH.lastInsertRowid);

      const bedDefaults: Array<[BedCategory, number]> = [
        ['General Ward', genTotal],
        ['ICU', icuTotal],
        ['Emergency Observation', 8],
        ['Private Rooms', 10],
      ];
      const insRes = db.prepare(`
        INSERT INTO hospital_resources (hospital_id, bed_type, total_beds, occupied_beds, available_beds, is_live_reported, last_updated, updated_by)
        VALUES (?, ?, ?, NULL, NULL, 0, NULL, NULL)
      `);
      for (const [bType, bTotal] of bedDefaults) {
        insRes.run(newHospitalId, bType, bTotal);
      }

      db.prepare(`
        INSERT INTO hospital_services (
          hospital_id, specialty, emergency_available, ambulance_available,
          trauma_care, emergency_surgery, diagnostic_facility, critical_care
        ) VALUES (?, ?, 1, 1, 0, 0, 1, 1)
      `).run(newHospitalId, specialty?.trim() || 'General Medicine, Emergency Medicine, Critical Care');

      const groups: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      const insBlood = db.prepare(`
        INSERT INTO blood_banks (hospital_id, blood_bank_name, contact_number, address, blood_group, availability_status, last_updated)
        VALUES (?, ?, ?, ?, ?, 'Contact to confirm', ?)
      `);
      for (const g of groups) {
        insBlood.run(newHospitalId, `${hospital_name.trim()} Blood Desk`, phone.trim(), address.trim(), g, now);
      }

      db.prepare(`
        INSERT INTO verification_records (hospital_id, verification_type, verification_status, verified_by, verification_timestamp, notes)
        VALUES (?, 'Hospital Identity Registration', 'pending', ?, ?, 'Registered via Verification Centre')
      `).run(newHospitalId, actor, now);

      db.prepare(`
        INSERT INTO verification_evidence (hospital_id, check_type, verified_source, evidence_ref, status, verified_by, verified_at, notes)
        VALUES (?, 'identity', 'Admin Registration Form', ?, 'pending', ?, ?, 'Awaiting verification review')
      `).run(newHospitalId, `${hospital_name.trim()} (${phone.trim()})`, actor, now);

      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }

    res.status(201).json({ success: true, detail: getHospitalDetail(newHospitalId) });
  } catch (err) {
    console.error('Register hospital error:', err);
    res.status(500).json({ error: 'Unable to register hospital.' });
  }
});

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HOSPIFIND server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
