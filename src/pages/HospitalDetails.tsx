import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Droplets,
  ExternalLink,
  MapPin,
  Navigation,
  PhoneCall,
  ShieldCheck,
  X,
} from 'lucide-react';
import { fetchHospitalDetail } from '../lib/api.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { buildDirectionsUrl } from '../shared/geo.ts';
import { formatTimestamp, type FreshnessThresholds } from '../shared/freshness.ts';
import type { DistanceOrigin, HospitalDetail, HospitalSummary } from '../shared/types.ts';
import { HospitalImage } from '../components/HospitalImage.tsx';
import { HospitalMap } from '../components/HospitalMap.tsx';
import {
  DisclaimerBar,
  FreshnessIndicator,
  ReportingReliabilityBadge,
  TrustEngineBreakdown,
  VerificationIndicator,
} from '../components/TrustIndicators.tsx';

interface HospitalDetailsProps {
  hospitalId: number;
  hospitals: HospitalSummary[];
  thresholds: FreshnessThresholds;
  origin: DistanceOrigin | null;
  onChangeHospital: (hospitalId: number) => void;
  refreshTrigger: number;
}

export function HospitalDetails({
  hospitalId,
  hospitals,
  thresholds,
  origin,
  onChangeHospital,
  refreshTrigger,
}: HospitalDetailsProps) {
  const { t } = useLanguage();
  const [detail, setDetail] = useState<HospitalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchHospitalDetail(
      hospitalId,
      thresholds,
      origin ? { lat: origin.lat, lng: origin.lng } : null
    )
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load hospital profile.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hospitalId, thresholds, origin, refreshTrigger]);

  return (
    <div className="space-y-6">
      {/* Selector Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-3.5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Hospital Profile &amp; Resource Verification</h1>
          <p className="text-xs text-slate-600">
            Verified facility details, official contact desk, verification evidence, shift reports, and audit trail.
          </p>
        </div>
        <div className="w-full sm:w-96">
          <select
            value={hospitalId}
            onChange={(e) => onChangeHospital(Number(e.target.value))}
            aria-label="Select hospital profile"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-[#0F4C81] focus:outline-none"
          >
            {hospitals.map((h) => (
              <option key={h.hospital_id} value={h.hospital_id}>
                {h.hospital_name} ({h.city})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && !detail ? (
        <div className="h-64 rounded-lg border border-slate-200 bg-white animate-pulse" />
      ) : error || !detail ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {error || 'Hospital details unavailable.'}
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3 text-xs text-[#0F4C81]">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>Patient Advisory:</strong> Always call the hospital desk at{' '}
              <span className="font-mono font-semibold">{detail.phone}</span> to confirm live bed or specialist availability before travelling. Source: {detail.data_source}.
            </span>
          </div>

          {/* Main Profile Card */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 rounded-lg border border-slate-200 bg-white p-6">
            <div className="lg:col-span-5">
              <div className="h-64 overflow-hidden rounded-lg border border-slate-200">
                <HospitalImage
                  src={detail.image_url}
                  alt={detail.hospital_name}
                  className="h-full w-full"
                />
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <VerificationIndicator status={detail.verification_status} />
                  <FreshnessIndicator freshness={detail.overall_freshness} />
                  <ReportingReliabilityBadge reliability={detail.reliability} />
                </div>

                <h2 className="mt-2.5 text-2xl font-bold text-slate-900">{detail.hospital_name}</h2>
                <div className="mt-1 flex items-start gap-1.5 text-sm text-slate-600">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
                  <span>
                    {detail.address}
                    {typeof detail.distance_km === 'number' && (
                      <span className="ml-2 font-mono font-semibold text-[#0F4C81]">
                        ({detail.distance_km} {t.common.distanceAway})
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {detail.operating_hours}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Published Capacity: ~{detail.published_total_beds} beds</span>
                  {detail.official_website && (
                    <>
                      <span aria-hidden="true">·</span>
                      <a
                        href={detail.official_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[#0F4C81] hover:underline"
                      >
                        <span>{t.common.officialWebsite}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-700">Medical Specialties</div>
                  <div className="mt-1 text-sm text-slate-800">
                    {detail.specialties.join(' · ') || 'General Medical Care'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">Hospital Reception / Emergency Desk</div>
                  <div className="text-base font-bold font-mono text-slate-900">{detail.phone}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {detail.latitude !== null && detail.longitude !== null && (
                    <a
                      href={buildDirectionsUrl(detail.latitude, detail.longitude, detail.hospital_name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-[#0F4C81] hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Navigation className="h-4 w-4" />
                      <span>{t.common.directions}</span>
                    </a>
                  )}
                  <a
                    href={`tel:${detail.phone}`}
                    className="inline-flex items-center gap-2 rounded-md bg-[#0F4C81] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0B3A63] transition-colors whitespace-nowrap"
                  >
                    <PhoneCall className="h-4 w-4" />
                    <span>{t.common.callHospital}</span>
                  </a>
                </div>
              </div>
            </div>
          </section>

          <TrustEngineBreakdown hospital={detail} />

          {/* Bed Availability & Services */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-3.5">
                <h3 className="text-base font-semibold text-slate-900">Ward Capacity &amp; Live Occupancy</h3>
                <p className="text-xs text-slate-500">
                  Shows estimated ward capacity and live occupancy once reported by the hospital administrator.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-2.5">Category</th>
                      <th className="px-3 py-2.5 text-right">Capacity</th>
                      <th className="px-3 py-2.5 text-right">Occupied</th>
                      <th className="px-3 py-2.5 text-right">Available</th>
                      <th className="px-4 py-2.5">Freshness</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.resources.map((r) => (
                      <tr key={r.resource_id}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900">{r.bed_type}</div>
                          <div className="text-[11px] text-slate-500">
                            {r.updated_by ? `By ${r.updated_by}` : 'No live shift report yet'}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                          {r.total_beds}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                          {r.is_live_reported && r.occupied_beds !== null ? r.occupied_beds : 'Unreported'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-bold text-[#0F4C81]">
                          {r.is_live_reported && r.available_beds !== null ? r.available_beds : 'Call desk'}
                        </td>
                        <td className="px-4 py-3">
                          <FreshnessIndicator freshness={r.freshness} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="text-base font-semibold text-slate-900">Facilities &amp; Emergency Capabilities</h3>
              <p className="text-xs text-slate-500 mb-4">Clinical support departments verified in hospital directory.</p>
              <div className="divide-y divide-slate-100 text-sm">
                <FacilityRow label="24/7 Emergency Services" active={Boolean(detail.services?.emergency_available)} />
                <FacilityRow label="Ambulance Services" active={Boolean(detail.services?.ambulance_available)} />
                <FacilityRow label="Trauma Care Unit" active={Boolean(detail.services?.trauma_care)} />
                <FacilityRow label="Emergency Surgery" active={Boolean(detail.services?.emergency_surgery)} />
                <FacilityRow label="Diagnostic Imaging Facility" active={Boolean(detail.services?.diagnostic_facility)} />
                <FacilityRow label="Critical Care Department" active={Boolean(detail.services?.critical_care)} />
              </div>
            </div>
          </section>

          {/* Blood Bank + Location Map */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-6 rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-red-600" />
                  <h3 className="text-base font-semibold text-slate-900">
                    {detail.blood_bank_name || 'Associated Blood Bank'}
                  </h3>
                </div>
                {detail.blood_bank_phone && (
                  <a
                    href={`tel:${detail.blood_bank_phone}`}
                    className="text-xs font-mono font-semibold text-[#0F4C81] hover:underline"
                  >
                    {detail.blood_bank_phone}
                  </a>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {detail.blood_banks.map((b) => {
                  const statusColor =
                    b.availability_status === 'Reported available'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : b.availability_status === 'Contact to confirm'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : b.availability_status === 'Reported unavailable'
                      ? 'border-red-200 bg-red-50 text-red-900'
                      : 'border-slate-200 bg-slate-50 text-slate-600';
                  return (
                    <div key={b.blood_bank_id} className={`rounded-md border p-2.5 ${statusColor}`}>
                      <div className="text-sm font-bold font-mono">{b.blood_group}</div>
                      <div className="mt-0.5 text-[11px] font-medium leading-tight">{b.availability_status}</div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Contact the authorized blood bank directly to verify live blood units and cross-matching.
              </p>
            </div>

            <div className="lg:col-span-6">
              <HospitalMap
                hospitals={[detail]}
                selectedHospitalId={detail.hospital_id}
                origin={origin}
                heightClass="h-[320px]"
              />
            </div>
          </section>

          {/* Verification Evidence Ledger */}
          <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
              <ShieldCheck className="h-4 w-4 text-[#0F4C81]" />
              <div>
                <h3 className="text-base font-semibold text-slate-900">Directory Verification Evidence</h3>
                <p className="text-xs text-slate-500">
                  Documented checks for official website, phone desk, physical address, and published bed capacity.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-2.5">Check Type</th>
                    <th className="px-4 py-2.5">Source</th>
                    <th className="px-4 py-2.5">Evidence Reference</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Verified At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.verification_evidence.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-5 text-center text-slate-500">
                        No verification evidence records logged yet.
                      </td>
                    </tr>
                  ) : (
                    detail.verification_evidence.map((ev) => (
                      <tr key={ev.evidence_id}>
                        <td className="px-5 py-2.5 font-semibold capitalize text-slate-900">{ev.check_type}</td>
                        <td className="px-4 py-2.5 text-slate-700">{ev.verified_source}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-700 break-all">{ev.evidence_ref}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-block rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                              ev.status === 'verified'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : ev.status === 'flagged'
                                ? 'border-red-200 bg-red-50 text-red-800'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                            }`}
                          >
                            {ev.status}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                          {formatTimestamp(ev.verified_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Shift Reports & Resource Update History */}
          <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-base font-semibold text-slate-900">Shift Reports &amp; Resource Update Audit Trail</h3>
              <p className="text-xs text-slate-500">
                Chronological log recording administrator submissions, shift cycles, previous values, and new values.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-2.5">Timestamp</th>
                    <th className="px-4 py-2.5">Resource</th>
                    <th className="px-4 py-2.5">Previous Value</th>
                    <th className="px-4 py-2.5">New Value</th>
                    <th className="px-4 py-2.5">Updated By</th>
                    <th className="px-5 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.update_history.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                        No live resource updates submitted yet by this hospital&apos;s administrator.
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

          <DisclaimerBar />
        </>
      )}
    </div>
  );
}

function FacilityRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-slate-700">{label}</span>
      {active ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          <span>Available</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
          <X className="h-3.5 w-3.5" />
          <span>Not Listed</span>
        </span>
      )}
    </div>
  );
}
