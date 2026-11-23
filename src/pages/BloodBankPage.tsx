import { useEffect, useState } from 'react';
import { AlertCircle, Droplets, PhoneCall, Search } from 'lucide-react';
import { fetchBloodBanks } from '../lib/api.ts';
import { formatTimestamp, type FreshnessThresholds } from '../shared/freshness.ts';
import type { BloodAvailabilityStatus, BloodBankRecord, BloodGroup } from '../shared/types.ts';
import { FreshnessIndicator } from '../components/TrustIndicators.tsx';

interface BloodBankPageProps {
  cities: string[];
  thresholds: FreshnessThresholds;
  onSelectHospital: (hospitalId: number) => void;
  refreshTrigger: number;
}

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const STATUS_OPTIONS: BloodAvailabilityStatus[] = [
  'Reported available',
  'Contact to confirm',
  'Reported unavailable',
  'Information unavailable',
];

export function BloodBankPage({
  cities,
  thresholds,
  onSelectHospital,
  refreshTrigger,
}: BloodBankPageProps) {
  const [city, setCity] = useState('All');
  const [bloodGroup, setBloodGroup] = useState('All');
  const [status, setStatus] = useState('All');
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<BloodBankRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchBloodBanks(
      { city, blood_group: bloodGroup, status, query },
      thresholds
    )
      .then((res) => {
        if (!cancelled) setRecords(res.records);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load blood banks.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [city, bloodGroup, status, query, thresholds, refreshTrigger]);

  // Group records by hospital for clean scanning
  const grouped = new Map<
    number,
    {
      hospital_id: number;
      hospital_name: string;
      blood_bank_name: string;
      contact_number: string;
      address: string;
      city: string;
      area: string;
      last_updated: string | null;
      freshness: BloodBankRecord['freshness'];
      items: BloodBankRecord[];
    }
  >();

  for (const r of records) {
    const existing = grouped.get(r.hospital_id);
    if (existing) {
      existing.items.push(r);
    } else {
      grouped.set(r.hospital_id, {
        hospital_id: r.hospital_id,
        hospital_name: r.hospital_name || 'Hospital',
        blood_bank_name: r.blood_bank_name,
        contact_number: r.contact_number,
        address: r.address,
        city: r.city || '',
        area: r.area || '',
        last_updated: r.last_updated,
        freshness: r.freshness,
        items: [r],
      });
    }
  }

  const banks = Array.from(grouped.values());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Blood Bank Information Directory</h1>
        <p className="mt-1 text-sm text-slate-600">
          Hospital-associated blood banks, reported blood group statuses, and direct contact numbers across Tamil Nadu.
        </p>
      </div>

      {/* Important Blood Bank Disclaimer */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-950">
        <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <strong>Important Clinical Notice:</strong> HOSPIFIND does not guarantee the availability of blood units and does not treat voluntary donor lists as confirmed blood bank inventory. Always contact the authorized blood bank directly to confirm stock, compatibility, and cross-matching requirements.
        </div>
      </div>

      {/* Filters */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Search Blood Bank / Hospital</label>
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, area, or hospital..."
                className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
            >
              <option value="All">All Cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Blood Group</label>
            <select
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
            >
              <option value="All">All Blood Groups</option>
              {BLOOD_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Reported Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
            >
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-44 rounded-lg border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : banks.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-900">No matching blood bank records found</p>
          <p className="mt-1 text-xs text-slate-600">Try selecting &ldquo;All Blood Groups&rdquo; or &ldquo;All Statuses&rdquo;.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {banks.map((bank) => (
            <article key={bank.hospital_id} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-red-600 shrink-0" />
                    <h2 className="text-base font-bold text-slate-900">{bank.blood_bank_name}</h2>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Associated Hospital:{' '}
                    <button
                      type="button"
                      onClick={() => onSelectHospital(bank.hospital_id)}
                      className="font-semibold text-[#0F4C81] hover:underline"
                    >
                      {bank.hospital_name}
                    </button>
                    {' · '}
                    <span>{bank.address}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Last updated: <span className="font-mono tabular-nums">{formatTimestamp(bank.last_updated)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <FreshnessIndicator freshness={bank.freshness} />
                  <a
                    href={`tel:${bank.contact_number}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#0F4C81] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B3A63] whitespace-nowrap"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    <span className="font-mono">{bank.contact_number}</span>
                  </a>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
                {bank.items.map((item) => {
                  const style =
                    item.availability_status === 'Reported available'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : item.availability_status === 'Contact to confirm'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : item.availability_status === 'Reported unavailable'
                      ? 'border-red-200 bg-red-50 text-red-900'
                      : 'border-slate-200 bg-slate-50 text-slate-600';

                  return (
                    <div key={item.blood_bank_id} className={`rounded-md border p-2.5 ${style}`}>
                      <div className="text-sm font-bold font-mono">{item.blood_group}</div>
                      <div className="mt-0.5 text-[11px] font-medium leading-tight">
                        {item.availability_status}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
