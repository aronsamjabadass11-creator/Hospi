import { useState } from 'react';
import { BedDouble, PhoneCall } from 'lucide-react';
import { formatTimestamp } from '../shared/freshness.ts';
import type { BedCategory, HospitalSummary } from '../shared/types.ts';
import { FreshnessIndicator } from '../components/TrustIndicators.tsx';

interface BedAvailabilityProps {
  hospitals: HospitalSummary[];
  cities: string[];
  onSelectHospital: (hospitalId: number) => void;
}

const CATEGORIES: BedCategory[] = [
  'General Ward',
  'ICU',
  'Emergency Observation',
  'Private Rooms',
];

export function BedAvailability({
  hospitals,
  cities,
  onSelectHospital,
}: BedAvailabilityProps) {
  const [selectedCategory, setSelectedCategory] = useState<BedCategory>('ICU');
  const [cityFilter, setCityFilter] = useState('All');

  const filteredHospitals = hospitals.filter(
    (h) => cityFilter === 'All' || h.city.toLowerCase() === cityFilter.toLowerCase()
  );

  const categoryTotals = CATEGORIES.map((cat) => {
    let total = 0;
    let occupied = 0;
    let available = 0;
    let liveCount = 0;
    for (const h of filteredHospitals) {
      const r = h.resources.find((res) => res.bed_type === cat);
      if (r) {
        total += r.total_beds;
        if (r.is_live_reported && r.occupied_beds !== null && r.available_beds !== null) {
          occupied += r.occupied_beds;
          available += r.available_beds;
          liveCount += 1;
        }
      }
    }
    return { category: cat, total, occupied, available, liveCount };
  });

  const kauverySalem = hospitals.find((h) => h.hospital_name.includes('Kauvery Hospital, Salem'));
  const kauveryGen = kauverySalem?.resources.find((r) => r.bed_type === 'General Ward');
  const kauveryIcu = kauverySalem?.resources.find((r) => r.bed_type === 'ICU');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Bed Capacity &amp; Live Availability Tracker</h1>
          <p className="mt-1 text-sm text-slate-600">
            Displays published hospital capacities alongside live occupied/available counts when reported by hospital administrators (<code className="font-mono">Available = Total − Occupied</code>).
          </p>
        </div>

        <div className="w-48">
          <label className="block text-xs font-medium text-slate-600 mb-1">Filter by City</label>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
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
      </div>

      {/* Category Summary Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categoryTotals.map((ct) => {
          const isActive = ct.category === selectedCategory;
          const occupancyPct = ct.total > 0 && ct.liveCount > 0 ? Math.round((ct.occupied / ct.total) * 100) : 0;
          return (
            <button
              key={ct.category}
              type="button"
              onClick={() => setSelectedCategory(ct.category)}
              className={`text-left rounded-lg border p-4 transition-colors ${
                isActive
                  ? 'border-[#0F4C81] bg-blue-50/40'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">{ct.category}</span>
                <BedDouble className={`h-4 w-4 ${isActive ? 'text-[#0F4C81]' : 'text-slate-400'}`} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono tabular-nums text-[#0F4C81]">
                  {ct.liveCount > 0 ? ct.available : ct.total}
                </span>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {ct.liveCount > 0
                    ? `avail (${ct.liveCount} reporting) / ${ct.total} cap`
                    : `est. total capacity`}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div style={{ width: `${occupancyPct}%` }} className="h-full bg-[#0F4C81]" />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                <span>{ct.liveCount > 0 ? `Occupied: ${ct.occupied}` : 'Live occupancy unreported'}</span>
                <span>{ct.liveCount} live</span>
              </div>
            </button>
          );
        })}
      </section>

      {/* Reference Hospital Spotlight + Chart */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {kauverySalem && (
          <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-[#0D9488]">
                SALEM REFERENCE HOSPITAL · {kauverySalem.data_source}
              </div>
              <h2 className="mt-1 text-base font-bold text-slate-900">
                {kauverySalem.hospital_name}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Real published capacity (~{kauverySalem.published_total_beds} beds). Log in as <code className="font-mono">kauvery_salem</code> in Hospital Admin to submit a live shift count and watch this card update in real time.
              </p>

              <div className="mt-4 divide-y divide-slate-100 text-sm">
                <div className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">General Ward Beds</div>
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      Est. Capacity: {kauveryGen?.total_beds ?? 0} ·{' '}
                      {kauveryGen?.is_live_reported ? `Occupied: ${kauveryGen.occupied_beds}` : 'Occupancy unreported'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {kauveryGen?.is_live_reported && kauveryGen.available_beds !== null
                        ? kauveryGen.available_beds
                        : '—'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {kauveryGen?.is_live_reported ? 'Reported Available' : 'Call to confirm'}
                    </div>
                  </div>
                </div>

                <div className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">ICU Beds</div>
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      Est. Capacity: {kauveryIcu?.total_beds ?? 0} ·{' '}
                      {kauveryIcu?.is_live_reported ? `Occupied: ${kauveryIcu.occupied_beds}` : 'Occupancy unreported'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold font-mono tabular-nums text-[#0F4C81]">
                      {kauveryIcu?.is_live_reported && kauveryIcu.available_beds !== null
                        ? kauveryIcu.available_beds
                        : '—'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {kauveryIcu?.is_live_reported ? 'Reported Available' : 'Call to confirm'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <FreshnessIndicator freshness={kauverySalem.overall_freshness} />
              <button
                type="button"
                onClick={() => onSelectHospital(kauverySalem.hospital_id)}
                className="text-xs font-semibold text-[#0F4C81] hover:underline"
              >
                Open Profile →
              </button>
            </div>
          </div>
        )}

        <div className={`${kauverySalem ? 'lg:col-span-7' : 'lg:col-span-12'} rounded-lg border border-slate-200 bg-white p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {selectedCategory} Capacity &amp; Reporting by Hospital
              </h2>
              <p className="text-xs text-slate-500">
                Teal shows admin-reported available beds; grey indicates unreported live occupancy.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#0D9488]" /> Live Available
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-400" /> Occupied
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-200" /> Unreported
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {filteredHospitals.map((h) => {
              const r = h.resources.find((res) => res.bed_type === selectedCategory);
              const total = r?.total_beds || 0;
              const isLive = Boolean(r?.is_live_reported && r.available_beds !== null && r.occupied_beds !== null);
              const avail = isLive ? r!.available_beds! : 0;
              const occ = isLive ? r!.occupied_beds! : 0;
              const availPct = total > 0 && isLive ? (avail / total) * 100 : 0;
              const occPct = total > 0 && isLive ? (occ / total) * 100 : 0;

              return (
                <div key={h.hospital_id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onSelectHospital(h.hospital_id)}
                      className="font-semibold text-slate-900 hover:text-[#0F4C81] text-left truncate"
                    >
                      {h.hospital_name} <span className="font-normal text-slate-500">({h.city})</span>
                    </button>
                    <span className="font-mono tabular-nums text-slate-700 shrink-0">
                      {isLive ? (
                        <>
                          <strong className="text-[#0D9488]">{avail}</strong> avail · {occ} occ · {total} cap
                        </>
                      ) : (
                        <span className="text-slate-500">~{total} cap · Unreported</span>
                      )}
                    </span>
                  </div>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                    {isLive && (
                      <>
                        <div style={{ width: `${availPct}%` }} className="bg-[#0D9488]" />
                        <div style={{ width: `${occPct}%` }} className="bg-slate-400" />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Full Bed Breakdown Table */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-900">
            {selectedCategory} — Detailed Facility Table
          </h2>
          <span className="text-xs text-slate-500">
            Always verify by calling hospital desk before travel
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Hospital</th>
                <th className="px-4 py-3 text-right">Est. Capacity</th>
                <th className="px-4 py-3 text-right">Occupied</th>
                <th className="px-4 py-3 text-right">Reported Available</th>
                <th className="px-4 py-3">Last Update Time</th>
                <th className="px-4 py-3">Freshness Status</th>
                <th className="px-5 py-3 text-right">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHospitals.map((h) => {
                const r = h.resources.find((res) => res.bed_type === selectedCategory);
                const isLive = Boolean(r?.is_live_reported && r.available_beds !== null);
                return (
                  <tr key={h.hospital_id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectHospital(h.hospital_id)}
                        className="font-semibold text-slate-900 hover:text-[#0F4C81] text-left"
                      >
                        {h.hospital_name}
                      </button>
                      <div className="text-xs text-slate-500">
                        {h.area}, {h.city}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {r?.total_beds ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {isLive ? r!.occupied_beds : 'Unreported'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-[#0F4C81]">
                      {isLive ? r!.available_beds : 'Call desk'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono tabular-nums text-slate-600">
                      {r?.last_updated ? formatTimestamp(r.last_updated) : 'Awaiting admin report'}
                    </td>
                    <td className="px-4 py-3">
                      {r ? <FreshnessIndicator freshness={r.freshness} /> : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <a
                        href={`tel:${h.phone}`}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-mono font-medium text-[#0F4C81] hover:bg-blue-50"
                      >
                        <PhoneCall className="h-3 w-3" />
                        <span>Call</span>
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
