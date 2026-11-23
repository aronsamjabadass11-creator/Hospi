import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  fetchSuperAdminGovernance,
  logVerificationEvidence,
  registerHospital,
  saveFreshnessSettings,
  verifyHospital,
} from '../lib/api.ts';
import {
  DEFAULT_FRESHNESS_THRESHOLDS,
  formatTimestamp,
  type FreshnessThresholds,
} from '../shared/freshness.ts';
import type {
  AuthUser,
  DuplicateGroup,
  HospitalSummary,
  UpdateHistoryEntry,
  VerificationEvidence,
  VerificationStatus,
} from '../shared/types.ts';
import { FreshnessIndicator, ReportingReliabilityBadge, VerificationIndicator } from '../components/TrustIndicators.tsx';

interface VerificationCentreProps {
  authUser: AuthUser | null;
  hospitals: HospitalSummary[];
  thresholds: FreshnessThresholds;
  onUpdateThresholds: (next: FreshnessThresholds) => void;
  onSelectHospital: (hospitalId: number) => void;
  onNavigateAdminLogin: () => void;
  onDataUpdated: () => void;
  refreshTrigger: number;
}

export function VerificationCentre({
  authUser,
  hospitals,
  thresholds,
  onUpdateThresholds,
  onSelectHospital,
  onNavigateAdminLogin,
  onDataUpdated,
  refreshTrigger,
}: VerificationCentreProps) {
  const isSuperAdmin = authUser?.role === 'super_admin';

  const [auditLogs, setAuditLogs] = useState<UpdateHistoryEntry[]>([]);
  const [evidence, setEvidence] = useState<VerificationEvidence[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | VerificationStatus>('all');

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showRegister, setShowRegister] = useState(false);
  const [newHospital, setNewHospital] = useState({
    hospital_name: '',
    address: '',
    city: 'Salem',
    area: '',
    phone: '',
    official_website: '',
    specialty: 'General Medicine, Emergency Medicine, Critical Care',
    general_beds: '40',
    icu_beds: '10',
  });

  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [evidenceForm, setEvidenceForm] = useState({
    hospital_id: hospitals[0]?.hospital_id ? String(hospitals[0].hospital_id) : '1',
    check_type: 'website' as 'identity' | 'website' | 'phone' | 'address' | 'capacity',
    verified_source: '',
    evidence_ref: '',
    status: 'verified' as 'verified' | 'pending' | 'flagged',
    notes: '',
  });

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchSuperAdminGovernance(thresholds)
      .then((res) => {
        setAuditLogs(res.auditLogs);
        setEvidence(res.evidence || []);
        setDuplicates(res.duplicates || []);
      })
      .catch(() => {
        // handled silently if not super_admin
      });
  }, [isSuperAdmin, thresholds, refreshTrigger]);

  const handleSaveThresholds = async () => {
    if (!isSuperAdmin) return;
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await saveFreshnessSettings(thresholds);
      onUpdateThresholds(res.thresholds);
      setActionMessage(`Saved freshness thresholds (${res.thresholds.greenMaxHours}h / ${res.thresholds.yellowMaxHours}h) to SQLite.`);
      onDataUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to save thresholds.');
    }
  };

  const handleVerifyAction = async (
    hospitalId: number,
    status: VerificationStatus,
    verificationType = 'Hospital Identity Registration',
    notes?: string
  ) => {
    setActionMessage(null);
    setActionError(null);
    try {
      await verifyHospital(hospitalId, {
        verification_status: status,
        verification_type: verificationType,
        notes,
      });
      setActionMessage(`Updated verification status to "${status}".`);
      onDataUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update verification.');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(null);
    setActionError(null);
    try {
      await registerHospital({
        hospital_name: newHospital.hospital_name,
        address: newHospital.address,
        city: newHospital.city,
        area: newHospital.area,
        phone: newHospital.phone,
        official_website: newHospital.official_website || null,
        specialty: newHospital.specialty,
        general_beds: Number(newHospital.general_beds),
        icu_beds: Number(newHospital.icu_beds),
        latitude: null,
        longitude: null,
      });
      setActionMessage(`Registered "${newHospital.hospital_name}" as pending verification.`);
      setShowRegister(false);
      setNewHospital({
        hospital_name: '',
        address: '',
        city: 'Salem',
        area: '',
        phone: '',
        official_website: '',
        specialty: 'General Medicine, Emergency Medicine, Critical Care',
        general_beds: '40',
        icu_beds: '10',
      });
      onDataUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to register hospital.');
    }
  };

  const handleLogEvidenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(null);
    setActionError(null);
    try {
      await logVerificationEvidence(Number(evidenceForm.hospital_id), {
        check_type: evidenceForm.check_type,
        verified_source: evidenceForm.verified_source,
        evidence_ref: evidenceForm.evidence_ref,
        status: evidenceForm.status,
        notes: evidenceForm.notes,
      });
      setActionMessage('Logged verification evidence check to SQLite.');
      setShowEvidenceForm(false);
      setEvidenceForm({
        hospital_id: hospitals[0]?.hospital_id ? String(hospitals[0].hospital_id) : '1',
        check_type: 'website',
        verified_source: '',
        evidence_ref: '',
        status: 'verified',
        notes: '',
      });
      onDataUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to log verification evidence.');
    }
  };

  const outdatedCount = hospitals.filter((h) => h.overall_freshness.level === 'RED').length;
  const reverifyCount = hospitals.filter((h) => h.overall_freshness.level === 'YELLOW').length;

  const filteredHospitals = hospitals.filter(
    (h) => statusFilter === 'all' || h.verification_status === statusFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Verification Centre &amp; Resource Freshness Engine
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Central governance for hospital identity verification, documented evidence checks, duplicate detection, configurable freshness rules, and audit trails.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin ? (
            <>
              <button
                type="button"
                onClick={() => setShowEvidenceForm(!showEvidenceForm)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#0F4C81] bg-white px-3.5 py-2 text-xs font-semibold text-[#0F4C81] hover:bg-blue-50 whitespace-nowrap"
              >
                <FileCheck2 className="h-4 w-4" />
                <span>Log Verification Evidence</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRegister(!showRegister)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A63] whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                <span>Register New Hospital</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onNavigateAdminLogin}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <ShieldCheck className="h-4 w-4 text-[#0F4C81]" />
              <span>Super Admin Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* Configurable Freshness Engine Panel */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#0F4C81]" />
            <h2 className="text-sm font-bold text-slate-900">
              Configurable Freshness Thresholds
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onUpdateThresholds(DEFAULT_FRESHNESS_THRESHOLDS)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline"
            >
              Reset Defaults (2h / 6h)
            </button>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={handleSaveThresholds}
                className="inline-flex items-center gap-1 rounded bg-[#0F4C81] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0B3A63]"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Persist Rules</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              GREEN (Current) Max Age (hours)
            </label>
            <input
              type="number"
              min={1}
              max={24}
              value={thresholds.greenMaxHours}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value) || 1);
                onUpdateThresholds({
                  greenMaxHours: v,
                  yellowMaxHours: Math.max(v + 1, thresholds.yellowMaxHours),
                });
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm focus:border-[#0F4C81] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              YELLOW (Reverify) Max Age (hours)
            </label>
            <input
              type="number"
              min={thresholds.greenMaxHours + 1}
              max={72}
              value={thresholds.yellowMaxHours}
              onChange={(e) => {
                const v = Math.max(thresholds.greenMaxHours + 1, Number(e.target.value) || 6);
                onUpdateThresholds({ ...thresholds, yellowMaxHours: v });
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm focus:border-[#0F4C81] focus:outline-none"
            />
          </div>

          <div className="flex flex-col justify-center rounded-md bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
            <div>
              <strong>Outdated (RED):</strong> &gt; {thresholds.yellowMaxHours} hours
            </div>
            <div className="mt-0.5 font-mono tabular-nums text-slate-600">
              Flagged now: <strong className="text-red-700">{outdatedCount} Outdated</strong> ·{' '}
              <strong className="text-amber-700">{reverifyCount} Reverify</strong>
            </div>
          </div>
        </div>
      </section>

      {actionMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertCircle className="h-4 w-4 text-red-700 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Duplicate Detection Status (Super Admin) */}
      {isSuperAdmin && (
        <section className="rounded-lg border border-slate-200 bg-white px-5 py-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            {duplicates.length > 0 ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            <span>
              Duplicate Registration Check:{' '}
              {duplicates.length === 0
                ? 'No duplicate hospital names or phone numbers detected across directory.'
                : `${duplicates.length} potential duplicate group(s) flagged for review.`}
            </span>
          </div>
          {duplicates.length > 0 && (
            <div className="mt-2 space-y-1.5 text-xs">
              {duplicates.map((d, idx) => (
                <div key={idx} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                  <strong>{d.reason}:</strong> {d.hospitals.map((h) => `${h.hospital_name} (${h.city})`).join(' vs ')}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Log Verification Evidence Form */}
      {isSuperAdmin && showEvidenceForm && (
        <form onSubmit={handleLogEvidenceSubmit} className="rounded-lg border border-blue-200 bg-white p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Record Verification Evidence Check</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Hospital</label>
              <select
                value={evidenceForm.hospital_id}
                onChange={(e) => setEvidenceForm({ ...evidenceForm, hospital_id: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                {hospitals.map((h) => (
                  <option key={h.hospital_id} value={h.hospital_id}>
                    {h.hospital_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Check Type</label>
              <select
                value={evidenceForm.check_type}
                onChange={(e) =>
                  setEvidenceForm({
                    ...evidenceForm,
                    check_type: e.target.value as 'identity' | 'website' | 'phone' | 'address' | 'capacity',
                  })
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value="website">Official Website</option>
                <option value="phone">Phone Desk Check</option>
                <option value="address">Physical Address / Coordinates</option>
                <option value="capacity">Published Bed Capacity</option>
                <option value="identity">Facility Identity Registration</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Check Status</label>
              <select
                value={evidenceForm.status}
                onChange={(e) =>
                  setEvidenceForm({
                    ...evidenceForm,
                    status: e.target.value as 'verified' | 'pending' | 'flagged',
                  })
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value="verified">Verified</option>
                <option value="pending">Pending</option>
                <option value="flagged">Flagged / Discrepancy</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Verified Source</label>
              <input
                type="text"
                required
                placeholder="e.g., District Health Portal / Direct Desk Call"
                value={evidenceForm.verified_source}
                onChange={(e) => setEvidenceForm({ ...evidenceForm, verified_source: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Evidence Reference / URL / Contact</label>
              <input
                type="text"
                required
                placeholder="https://... or +91 427 ..."
                value={evidenceForm.evidence_ref}
                onChange={(e) => setEvidenceForm({ ...evidenceForm, evidence_ref: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                placeholder="Optional audit remarks"
                value={evidenceForm.notes}
                onChange={(e) => setEvidenceForm({ ...evidenceForm, notes: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEvidenceForm(false)}
              className="rounded-md border border-slate-300 px-4 py-1.5 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#0F4C81] px-4 py-1.5 text-xs font-semibold text-white"
            >
              Save Evidence Record
            </button>
          </div>
        </form>
      )}

      {/* Super Admin Register New Hospital Form */}
      {isSuperAdmin && showRegister && (
        <form onSubmit={handleRegisterSubmit} className="rounded-lg border border-blue-200 bg-white p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Register New Hospital Record</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Hospital Name</label>
              <input
                type="text"
                required
                value={newHospital.hospital_name}
                onChange={(e) => setNewHospital({ ...newHospital, hospital_name: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
              <input
                type="text"
                required
                value={newHospital.city}
                onChange={(e) => setNewHospital({ ...newHospital, city: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Area</label>
              <input
                type="text"
                required
                value={newHospital.area}
                onChange={(e) => setNewHospital({ ...newHospital, area: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
              <input
                type="text"
                required
                value={newHospital.address}
                onChange={(e) => setNewHospital({ ...newHospital, address: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                required
                placeholder="+91 427 ..."
                value={newHospital.phone}
                onChange={(e) => setNewHospital({ ...newHospital, phone: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Official Website (optional)</label>
              <input
                type="url"
                placeholder="https://..."
                value={newHospital.official_website}
                onChange={(e) => setNewHospital({ ...newHospital, official_website: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Initial General Beds</label>
              <input
                type="number"
                min={0}
                value={newHospital.general_beds}
                onChange={(e) => setNewHospital({ ...newHospital, general_beds: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Initial ICU Beds</label>
              <input
                type="number"
                min={0}
                value={newHospital.icu_beds}
                onChange={(e) => setNewHospital({ ...newHospital, icu_beds: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">Specialties</label>
              <input
                type="text"
                value={newHospital.specialty}
                onChange={(e) => setNewHospital({ ...newHospital, specialty: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRegister(false)}
              className="rounded-md border border-slate-300 px-4 py-1.5 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#0F4C81] px-4 py-1.5 text-xs font-semibold text-white"
            >
              Create Hospital Record
            </button>
          </div>
        </form>
      )}

      {/* Hospital Verification & Freshness Matrix */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Hospital Identity Verification &amp; Resource Freshness Ledger
            </h2>
            <p className="text-xs text-slate-500">
              Distinguishes verified hospital identity from self-reported resource freshness, reporting reliability, and independent audits.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
            {(['all', 'verified', 'pending', 'rejected'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded px-2.5 py-1 text-xs font-semibold capitalize ${
                  statusFilter === st ? 'bg-white text-[#0F4C81] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Hospital</th>
                <th className="px-4 py-3">Identity Verification</th>
                <th className="px-4 py-3">Resource Freshness</th>
                <th className="px-4 py-3">Reporting Reliability</th>
                <th className="px-4 py-3">Evidence Checks</th>
                <th className="px-4 py-3">Independent Audit</th>
                <th className="px-5 py-3 text-right">
                  {isSuperAdmin ? 'Governance Actions' : 'Profile'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHospitals.map((h) => (
                <tr key={h.hospital_id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => onSelectHospital(h.hospital_id)}
                      className="font-semibold text-slate-900 hover:text-[#0F4C81] text-left"
                    >
                      {h.hospital_name}
                    </button>
                    <div className="text-slate-500">
                      {h.area}, {h.city}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <VerificationIndicator status={h.verification_status} />
                  </td>
                  <td className="px-4 py-3">
                    <FreshnessIndicator freshness={h.overall_freshness} />
                  </td>
                  <td className="px-4 py-3">
                    <ReportingReliabilityBadge reliability={h.reliability} />
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                    {h.evidence_count ?? 0} verified
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {h.independent_confirmation ? 'Audited by Trust Desk' : 'Directory + Self-reported'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {isSuperAdmin ? (
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {h.verification_status !== 'verified' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleVerifyAction(
                                h.hospital_id,
                                'verified',
                                'Hospital Identity Registration',
                                'Approved by HOSPIFIND Super Admin'
                              )
                            }
                            className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                        )}
                        {h.verification_status !== 'rejected' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleVerifyAction(
                                h.hospital_id,
                                'rejected',
                                'Hospital Identity Registration',
                                'Rejected pending documentation update'
                              )
                            }
                            className="rounded border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                          >
                            Reject
                          </button>
                        )}
                        {!h.independent_confirmation && (
                          <button
                            type="button"
                            onClick={() =>
                              handleVerifyAction(
                                h.hospital_id,
                                'verified',
                                'Independent Resource Audit',
                                'Desk verification check completed by Trust Desk'
                              )
                            }
                            className="rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#0F4C81] hover:bg-blue-100"
                          >
                            Log Audit
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectHospital(h.hospital_id)}
                        className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Inspect
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Verification Evidence Records (Super Admin) */}
      {isSuperAdmin && evidence.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-base font-semibold text-slate-900">
              Recent Directory Verification Evidence Checks
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-2.5">Hospital</th>
                  <th className="px-4 py-2.5">Check Type</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Reference</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Verified At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {evidence.slice(0, 25).map((ev) => (
                  <tr key={ev.evidence_id}>
                    <td className="px-5 py-2.5 font-semibold text-slate-900">{ev.hospital_name}</td>
                    <td className="px-4 py-2.5 capitalize text-slate-700">{ev.check_type}</td>
                    <td className="px-4 py-2.5 text-slate-700">{ev.verified_source}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600 truncate max-w-[240px]">
                      {ev.evidence_ref}
                    </td>
                    <td className="px-4 py-2.5 capitalize font-semibold text-[#0F4C81]">{ev.status}</td>
                    <td className="px-5 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {formatTimestamp(ev.verified_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Platform Audit Logs (Super Admin) */}
      {isSuperAdmin && (
        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-base font-semibold text-slate-900">
              Central Platform Resource Update Audit Trail
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Hospital</th>
                  <th className="px-4 py-2.5">Resource</th>
                  <th className="px-4 py-2.5">Change</th>
                  <th className="px-5 py-2.5">Updated By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.update_id}>
                    <td className="px-5 py-2.5 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{log.hospital_name}</td>
                    <td className="px-4 py-2.5 text-slate-700">{log.resource_type}</td>
                    <td className="px-4 py-2.5 text-[#0F4C81]">{log.new_value}</td>
                    <td className="px-5 py-2.5 text-slate-600">{log.updated_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
