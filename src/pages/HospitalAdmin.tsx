import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  KeyRound,
  Lock,
  LogOut,
  Save,
  Shield,
} from 'lucide-react';
import {
  fetchAdminReminders,
  fetchHospitalDetail,
  loginAdmin,
  logoutAdmin,
  setStoredToken,
  updateHospitalBloodBank,
  updateHospitalProfile,
  updateHospitalResources,
  updateHospitalServices,
} from '../lib/api.ts';
import { formatTimestamp, type FreshnessThresholds } from '../shared/freshness.ts';
import type {
  AuthUser,
  BedCategory,
  BloodAvailabilityStatus,
  BloodGroup,
  HospitalDetail,
  NotificationReminder,
  ShiftName,
} from '../shared/types.ts';
import {
  ConfirmationModal,
  FreshnessIndicator,
  ReportingReliabilityBadge,
  VerificationIndicator,
} from '../components/TrustIndicators.tsx';

interface HospitalAdminProps {
  authUser: AuthUser | null;
  thresholds: FreshnessThresholds;
  onAuthChange: (user: AuthUser | null) => void;
  onDataUpdated: () => void;
  onNavigateVerification: () => void;
}

const BED_CATEGORIES: BedCategory[] = [
  'General Ward',
  'ICU',
  'Emergency Observation',
  'Private Rooms',
];

const SHIFTS: ShiftName[] = ['Morning', 'Afternoon', 'Night'];

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const BLOOD_STATUSES: BloodAvailabilityStatus[] = [
  'Reported available',
  'Contact to confirm',
  'Reported unavailable',
  'Information unavailable',
];

const DEMO_ACCOUNTS = [
  {
    label: 'Kauvery Hospital, Salem Admin',
    username: 'kauvery_salem',
    password: 'KauverySalem@2026',
    note: 'Scoped exclusively to Kauvery Hospital, Salem',
  },
  {
    label: 'Manipal Hospital, Salem Admin',
    username: 'manipal_salem',
    password: 'ManipalSalem@2026',
    note: 'Scoped exclusively to Manipal Hospital, Salem',
  },
  {
    label: 'GMKMCH Salem Admin',
    username: 'gmkmch_salem',
    password: 'GmkmchSalem@2026',
    note: 'Government Mohan Kumaramangalam Medical College Hospital',
  },
  {
    label: 'HOSPIFIND Central Super Admin',
    username: 'super_admin',
    password: 'HospifindSuper@2026',
    note: 'Full platform verification & governance access',
  },
];

export function HospitalAdmin({
  authUser,
  thresholds,
  onAuthChange,
  onDataUpdated,
  onNavigateVerification,
}: HospitalAdminProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [detail, setDetail] = useState<HospitalDetail | null>(null);
  const [reminders, setReminders] = useState<NotificationReminder[]>([]);
  const [loadingHospital, setLoadingHospital] = useState(false);
  const [activeTab, setActiveTab] = useState<'beds' | 'profile' | 'services' | 'blood' | 'history'>('beds');

  // Bed form state
  const [shiftName, setShiftName] = useState<ShiftName>('Morning');
  const [bedInputs, setBedInputs] = useState<Record<BedCategory, { total: string; occupied: string }>>({
    'General Ward': { total: '0', occupied: '0' },
    ICU: { total: '0', occupied: '0' },
    'Emergency Observation': { total: '0', occupied: '0' },
    'Private Rooms': { total: '0', occupied: '0' },
  });
  const [bedNote, setBedNote] = useState('');
  const [pendingBedPayload, setPendingBedPayload] = useState<{
    updates: Array<{ bed_type: BedCategory; total_beds: number; occupied_beds: number }>;
    notes: string;
    shift_name: ShiftName;
  } | null>(null);

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    address: '',
    city: '',
    area: '',
    phone: '',
    operating_hours: '',
  });

  // Services form state
  const [servicesForm, setServicesForm] = useState({
    specialty: '',
    emergency_available: false,
    ambulance_available: false,
    trauma_care: false,
    emergency_surgery: false,
    diagnostic_facility: false,
    critical_care: false,
  });

  // Blood bank form state
  const [bloodBankName, setBloodBankName] = useState('');
  const [bloodBankPhone, setBloodBankPhone] = useState('');
  const [bloodStatuses, setBloodStatuses] = useState<Record<BloodGroup, BloodAvailabilityStatus>>({
    'A+': 'Contact to confirm',
    'A-': 'Contact to confirm',
    'B+': 'Contact to confirm',
    'B-': 'Contact to confirm',
    'AB+': 'Contact to confirm',
    'AB-': 'Contact to confirm',
    'O+': 'Contact to confirm',
    'O-': 'Contact to confirm',
  });

  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAssignedHospital = async (hospitalId: number) => {
    setLoadingHospital(true);
    try {
      const [data, remRes] = await Promise.all([
        fetchHospitalDetail(hospitalId, thresholds),
        fetchAdminReminders(hospitalId, thresholds).catch(() => ({ reminders: [] })),
      ]);
      hydrateForms(data);
      setReminders(remRes.reminders);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to load hospital data.');
    } finally {
      setLoadingHospital(false);
    }
  };

  const hydrateForms = (data: HospitalDetail) => {
    setDetail(data);
    const nextBeds: Record<BedCategory, { total: string; occupied: string }> = {
      'General Ward': { total: '0', occupied: '0' },
      ICU: { total: '0', occupied: '0' },
      'Emergency Observation': { total: '0', occupied: '0' },
      'Private Rooms': { total: '0', occupied: '0' },
    };
    for (const r of data.resources) {
      nextBeds[r.bed_type] = {
        total: String(r.total_beds),
        occupied: r.occupied_beds !== null ? String(r.occupied_beds) : '0',
      };
    }
    setBedInputs(nextBeds);

    setProfileForm({
      address: data.address,
      city: data.city,
      area: data.area,
      phone: data.phone,
      operating_hours: data.operating_hours,
    });

    if (data.services) {
      setServicesForm({
        specialty: data.services.specialty,
        emergency_available: data.services.emergency_available,
        ambulance_available: data.services.ambulance_available,
        trauma_care: data.services.trauma_care,
        emergency_surgery: data.services.emergency_surgery,
        diagnostic_facility: data.services.diagnostic_facility,
        critical_care: data.services.critical_care,
      });
    }

    setBloodBankName(data.blood_bank_name || `${data.hospital_name} Blood Bank`);
    setBloodBankPhone(data.blood_bank_phone || data.phone);
    const nextBlood = { ...bloodStatuses };
    for (const b of data.blood_banks) {
      nextBlood[b.blood_group] = b.availability_status;
    }
    setBloodStatuses(nextBlood);
  };

  useEffect(() => {
    if (authUser?.role === 'hospital_admin' && authUser.hospital_id) {
      loadAssignedHospital(authUser.hospital_id);
    }
  }, [authUser, thresholds]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await loginAdmin(username, password);
      setStoredToken(res.token);
      onAuthChange(res.user);
      setUsername('');
      setPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutAdmin();
    onAuthChange(null);
    setDetail(null);
    setReminders([]);
    setSaveMessage(null);
    setSaveError(null);
  };

  const handleRequestBedSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSaveMessage(null);
    setSaveError(null);

    const updates: Array<{ bed_type: BedCategory; total_beds: number; occupied_beds: number }> = [];
    for (const cat of BED_CATEGORIES) {
      const totalNum = Number(bedInputs[cat].total);
      const occNum = Number(bedInputs[cat].occupied);
      if (!Number.isInteger(totalNum) || !Number.isInteger(occNum)) {
        setSaveError(`Bed counts for ${cat} must be whole numbers.`);
        return;
      }
      if (totalNum < 0 || occNum < 0) {
        setSaveError(`Negative bed counts are not allowed (${cat}).`);
        return;
      }
      if (occNum > totalNum) {
        setSaveError(`Occupied beds (${occNum}) cannot exceed Total beds (${totalNum}) in ${cat}.`);
        return;
      }
      updates.push({ bed_type: cat, total_beds: totalNum, occupied_beds: occNum });
    }

    setPendingBedPayload({
      updates,
      notes: bedNote,
      shift_name: shiftName,
    });
  };

  const confirmSaveBeds = async () => {
    if (!detail || !pendingBedPayload) return;
    const payload = pendingBedPayload;
    setPendingBedPayload(null);
    setSaving(true);
    try {
      const res = await updateHospitalResources(detail.hospital_id, payload);
      hydrateForms(res.detail);
      setBedNote('');
      const remRes = await fetchAdminReminders(detail.hospital_id, thresholds).catch(() => ({ reminders: [] }));
      setReminders(remRes.reminders);
      setSaveMessage(
        `${payload.shift_name} shift bed counts saved to SQLite. Public views, analytics history, and freshness timestamps are updated.`
      );
      onDataUpdated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save bed updates.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSaveMessage(null);
    setSaveError(null);
    setSaving(true);
    try {
      const res = await updateHospitalProfile(detail.hospital_id, profileForm);
      hydrateForms(res.detail);
      setSaveMessage('Hospital profile details saved to SQLite.');
      onDataUpdated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveServices = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSaveMessage(null);
    setSaveError(null);
    setSaving(true);
    try {
      const res = await updateHospitalServices(detail.hospital_id, servicesForm);
      hydrateForms(res.detail);
      setSaveMessage('Specialties and emergency capabilities updated.');
      onDataUpdated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update services.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBlood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSaveMessage(null);
    setSaveError(null);
    setSaving(true);
    try {
      const statuses = BLOOD_GROUPS.map((g) => ({
        blood_group: g,
        availability_status: bloodStatuses[g],
      }));
      const res = await updateHospitalBloodBank(detail.hospital_id, {
        blood_bank_name: bloodBankName,
        contact_number: bloodBankPhone,
        statuses,
      });
      hydrateForms(res.detail);
      setSaveMessage('Blood bank availability statuses saved.');
      onDataUpdated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update blood bank.');
    } finally {
      setSaving(false);
    }
  };

  // Logged out view
  if (!authUser) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-[#0F4C81]">
            <Lock className="h-5 w-5" />
            <h1 className="text-xl font-bold text-slate-900">Hospital Administrator Login</h1>
          </div>
          <p className="mt-1.5 text-sm text-slate-600">
            Role-based access control ensures each hospital administrator can update only their assigned hospital&apos;s resources. Sessions are persisted and revocable.
          </p>

          {loginError && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Administrator Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g., kauvery_salem"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter administrator password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full rounded-md bg-[#0F4C81] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60"
            >
              {loggingIn ? 'Authenticating...' : 'Sign In to Administrator Portal'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-6 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-[#0D9488]">
            <KeyRound className="h-5 w-5" />
            <h2 className="text-base font-bold text-slate-900">Demonstration Administrator Accounts</h2>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Passwords are stored using salted <code className="font-mono">scrypt</code> hashes in SQLite. Use one of these accounts to test role-scoped updates:
          </p>

          <div className="mt-4 divide-y divide-slate-100">
            {DEMO_ACCOUNTS.map((acc) => (
              <div key={acc.username} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{acc.label}</div>
                  <div className="text-xs text-slate-500">{acc.note}</div>
                  <div className="mt-1 font-mono text-xs text-slate-700">
                    User: <strong>{acc.username}</strong> · Pass: <strong>{acc.password}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUsername(acc.username);
                    setPassword(acc.password);
                    setLoginError(null);
                  }}
                  className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                >
                  Fill Credentials
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Super Admin guidance
  if (authUser.role === 'super_admin') {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#0F4C81]" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">Signed in as HOSPIFIND Super Administrator</h1>
              <p className="text-xs text-slate-600">
                {authUser.display_name} ({authUser.username}) — Platform Verification &amp; Governance Role
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        <p className="text-sm text-slate-700">
          Super administrators manage hospital verification, verification evidence, duplicate checks, freshness rules, and audit logs in the Verification Centre. To update live ward beds for a specific hospital, sign out and log in as <code className="font-mono">kauvery_salem</code>.
        </p>

        <button
          type="button"
          onClick={onNavigateVerification}
          className="rounded-md bg-[#0F4C81] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B3A63]"
        >
          Open Verification Centre →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4">
        <div>
          <div className="text-xs font-semibold text-[#0D9488]">
            Assigned Hospital Scope Only · {authUser.display_name} ({authUser.username})
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {detail?.hospital_name || authUser.hospital_name || 'Hospital Admin Dashboard'}
          </h1>
          {detail && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <VerificationIndicator status={detail.verification_status} />
              <FreshnessIndicator freshness={detail.overall_freshness} />
              <ReportingReliabilityBadge reliability={detail.reliability} />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </section>

      {/* Active Update Reminders */}
      {reminders.length > 0 && (
        <section className="space-y-2">
          {reminders.map((rem) => (
            <div
              key={rem.notif_id}
              className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs ${
                rem.severity === 'urgent'
                  ? 'border-red-200 bg-red-50 text-red-900'
                  : rem.severity === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-blue-200 bg-blue-50 text-[#0F4C81]'
              }`}
            >
              <Bell className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold uppercase tracking-wide">{rem.severity} Reminder: </span>
                <span>{rem.message}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Feedback messages */}
      {saveMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertCircle className="h-4 w-4 text-red-700 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Module Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
        {(
          [
            ['beds', 'Shift Bed Availability'],
            ['profile', 'Hospital Profile'],
            ['services', 'Specialties & Emergency'],
            ['blood', 'Blood Bank'],
            ['history', 'Update & Shift History'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setActiveTab(key);
              setSaveMessage(null);
              setSaveError(null);
            }}
            className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === key
                ? 'bg-white text-[#0F4C81] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loadingHospital || !detail ? (
        <div className="h-64 rounded-lg border border-slate-200 bg-white animate-pulse" />
      ) : (
        <>
          {activeTab === 'beds' && (
            <form onSubmit={handleRequestBedSave} className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Submit Shift Bed Availability Count</h2>
                  <p className="text-xs text-slate-600">
                    Available beds are automatically calculated as <code className="font-mono">Total − Occupied</code>. Occupied beds cannot exceed total beds.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Duty Shift</label>
                  <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
                    {SHIFTS.map((sh) => (
                      <button
                        key={sh}
                        type="button"
                        onClick={() => setShiftName(sh)}
                        className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                          shiftName === sh
                            ? 'bg-white text-[#0F4C81] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {sh}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Bed Category</th>
                      <th className="px-4 py-2.5">Total Beds</th>
                      <th className="px-4 py-2.5">Occupied Beds</th>
                      <th className="px-4 py-2.5 text-right">Calculated Available</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {BED_CATEGORIES.map((cat) => {
                      const totalVal = Number(bedInputs[cat].total);
                      const occVal = Number(bedInputs[cat].occupied);
                      const valid =
                        Number.isInteger(totalVal) &&
                        Number.isInteger(occVal) &&
                        totalVal >= 0 &&
                        occVal >= 0 &&
                        occVal <= totalVal;
                      const calcAvail = valid ? totalVal - occVal : 'Invalid';

                      return (
                        <tr key={cat}>
                          <td className="px-4 py-3 font-semibold text-slate-900">{cat}</td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={bedInputs[cat].total}
                              onChange={(e) =>
                                setBedInputs((prev) => ({
                                  ...prev,
                                  [cat]: { ...prev[cat], total: e.target.value },
                                }))
                              }
                              className="w-28 rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums focus:border-[#0F4C81] focus:outline-none"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={bedInputs[cat].occupied}
                              onChange={(e) =>
                                setBedInputs((prev) => ({
                                  ...prev,
                                  [cat]: { ...prev[cat], occupied: e.target.value },
                                }))
                              }
                              className="w-28 rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums focus:border-[#0F4C81] focus:outline-none"
                            />
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono tabular-nums font-bold ${
                              valid ? 'text-[#0F4C81]' : 'text-red-600'
                            }`}
                          >
                            {calcAvail}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Shift Handover Note (recorded in audit &amp; analytics trail)
                </label>
                <input
                  type="text"
                  value={bedNote}
                  onChange={(e) => setBedNote(e.target.value)}
                  placeholder={`e.g., ${shiftName} ICU handover count verified`}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0F4C81] focus:outline-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-[#0F4C81] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? 'Saving...' : `Submit ${shiftName} Shift Bed Update`}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Edit Hospital Profile</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Address</label>
                  <input
                    type="text"
                    required
                    value={profileForm.address}
                    onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0F4C81] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={profileForm.city}
                    onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0F4C81] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Area / Locality</label>
                  <input
                    type="text"
                    required
                    value={profileForm.area}
                    onChange={(e) => setProfileForm({ ...profileForm, area: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0F4C81] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Reception / Emergency Phone</label>
                  <input
                    type="text"
                    required
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-[#0F4C81] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Operating Hours</label>
                  <input
                    type="text"
                    required
                    value={profileForm.operating_hours}
                    onChange={(e) => setProfileForm({ ...profileForm, operating_hours: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0F4C81] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-[#0F4C81] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'services' && (
            <form onSubmit={handleSaveServices} className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
              <h2 className="text-base font-bold text-slate-900">Medical Specialties &amp; Emergency Facilities</h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Medical Specialties (comma-separated)
                </label>
                <input
                  type="text"
                  required
                  value={servicesForm.specialty}
                  onChange={(e) => setServicesForm({ ...servicesForm, specialty: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0F4C81] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ['emergency_available', '24/7 Emergency Services'],
                    ['ambulance_available', 'Ambulance Services'],
                    ['trauma_care', 'Trauma Care Unit'],
                    ['emergency_surgery', 'Emergency Surgery'],
                    ['diagnostic_facility', 'Diagnostic Imaging'],
                    ['critical_care', 'Critical Care Department'],
                  ] as const
                ).map(([field, label]) => (
                  <label
                    key={field}
                    className="flex items-center gap-2.5 rounded-md border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={servicesForm[field]}
                      onChange={(e) => setServicesForm({ ...servicesForm, [field]: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-[#0F4C81]"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-[#0F4C81] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? 'Saving...' : 'Save Services Configuration'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'blood' && (
            <form onSubmit={handleSaveBlood} className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
              <h2 className="text-base font-bold text-slate-900">Blood Bank Availability Status</h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Blood Bank Name</label>
                  <input
                    type="text"
                    required
                    value={bloodBankName}
                    onChange={(e) => setBloodBankName(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#0F4C81] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Blood Bank Contact Phone</label>
                  <input
                    type="text"
                    required
                    value={bloodBankPhone}
                    onChange={(e) => setBloodBankPhone(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-[#0F4C81] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {BLOOD_GROUPS.map((grp) => (
                  <div key={grp} className="rounded-md border border-slate-200 p-3">
                    <div className="text-sm font-bold font-mono text-slate-900 mb-1.5">{grp}</div>
                    <select
                      value={bloodStatuses[grp]}
                      onChange={(e) =>
                        setBloodStatuses({
                          ...bloodStatuses,
                          [grp]: e.target.value as BloodAvailabilityStatus,
                        })
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#0F4C81] focus:outline-none"
                    >
                      {BLOOD_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-[#0F4C81] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? 'Saving...' : 'Submit Blood Bank Update'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'history' && (
            <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-3.5">
                <h2 className="text-base font-bold text-slate-900">Hospital Update History</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="px-5 py-2.5">Timestamp</th>
                      <th className="px-4 py-2.5">Resource</th>
                      <th className="px-4 py-2.5">Previous</th>
                      <th className="px-4 py-2.5">New Value</th>
                      <th className="px-4 py-2.5">Admin</th>
                      <th className="px-5 py-2.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.update_history.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                          No updates recorded yet for this hospital.
                        </td>
                      </tr>
                    ) : (
                      detail.update_history.map((u) => (
                        <tr key={u.update_id}>
                          <td className="px-5 py-2.5 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {formatTimestamp(u.timestamp)}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-900">{u.resource_type}</td>
                          <td className="px-4 py-2.5 text-slate-600">{u.previous_value}</td>
                          <td className="px-4 py-2.5 font-medium text-[#0F4C81]">{u.new_value}</td>
                          <td className="px-4 py-2.5 text-slate-700">{u.updated_by}</td>
                          <td className="px-5 py-2.5 text-slate-500">{u.notes || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <ConfirmationModal
        open={Boolean(pendingBedPayload)}
        title={`Confirm ${pendingBedPayload?.shift_name ?? ''} Shift Bed Update`}
        message={
          pendingBedPayload
            ? `You are about to publish ${pendingBedPayload.shift_name} shift bed availability for ${detail?.hospital_name}: ` +
              pendingBedPayload.updates
                .map((u) => `${u.bed_type}: ${u.total_beds - u.occupied_beds}/${u.total_beds} avail`)
                .join(' · ')
            : ''
        }
        confirmLabel="Publish Shift Counts"
        onConfirm={confirmSaveBeds}
        onCancel={() => setPendingBedPayload(null)}
      />
    </div>
  );
}
