import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BedDouble,
  Building2,
  Droplets,
  PhoneCall,
  Search,
  ShieldCheck,
  Siren,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import type { DistanceOrigin, HospitalSummary, OverviewStats } from '../shared/types.ts';
import { DisclaimerBar, FreshnessIndicator, VerificationIndicator } from '../components/TrustIndicators.tsx';
import { HospitalMap } from '../components/HospitalMap.tsx';
import { HospitalImage } from '../components/HospitalImage.tsx';
import { HospiAssistant } from '../components/HospiAssistant.tsx';
import { LocationOriginSelector } from '../components/LocationOriginSelector.tsx';

export type ModuleKey =
  | 'home'
  | 'search'
  | 'details'
  | 'beds'
  | 'blood'
  | 'emergency'
  | 'analytics'
  | 'admin'
  | 'verification';

interface HomeDashboardProps {
  overview: OverviewStats | null;
  hospitals: HospitalSummary[];
  loading: boolean;
  origin: DistanceOrigin | null;
  onChangeOrigin: (origin: DistanceOrigin | null) => void;
  onNavigate: (module: ModuleKey, preset?: { city?: string; requireIcu?: boolean; query?: string }) => void;
  onSelectHospital: (hospitalId: number) => void;
}

export function HomeDashboard({
  overview,
  hospitals,
  loading,
  origin,
  onChangeOrigin,
  onNavigate,
  onSelectHospital,
}: HomeDashboardProps) {
  const { t } = useLanguage();
  const [quickCity, setQuickCity] = useState('Salem');
  const [quickQuery, setQuickQuery] = useState('');
  const [quickIcu, setQuickIcu] = useState(false);

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate('search', {
      city: quickCity,
      query: quickQuery,
      requireIcu: quickIcu,
    });
  };

  if (loading && !overview) {
    return (
      <div className="space-y-6">
        <div className="h-44 rounded-lg border border-slate-200 bg-white animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-lg border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const totalForFreshness = Math.max(1, overview?.total_hospitals || 1);
  const fc = overview?.freshness_counts || { GREEN: 0, YELLOW: 0, RED: 0, UNKNOWN: 0 };

  return (
    <div className="space-y-6">
      {/* Hero + Quick Discovery */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch rounded-lg border border-slate-200 bg-white p-6">
        <div className="lg:col-span-7 flex flex-col justify-between space-y-5">
          <div>
            <div className="text-xs font-semibold tracking-wide text-[#0D9488]">
              HOSPIFIND · {t.brandSubtitle}
            </div>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 max-w-2xl [text-wrap:balance]">
              {t.tagline}
            </h1>
            <p className="mt-2 text-sm text-slate-600 max-w-xl leading-relaxed">
              Search verified real hospitals across Salem, Coimbatore, Madurai, Tiruchirappalli, Chennai, and Erode with real addresses, direct phone numbers, published capacities, and live hospital-admin reporting.
            </p>
          </div>

          <form onSubmit={handleQuickSearch} className="grid grid-cols-1 gap-3 sm:grid-cols-12 pt-1">
            <div className="sm:col-span-4">
              <label htmlFor="quick-city" className="block text-xs font-medium text-slate-600 mb-1">
                City
              </label>
              <select
                id="quick-city"
                value={quickCity}
                onChange={(e) => setQuickCity(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
              >
                <option value="All">{t.common.allCities}</option>
                {(overview?.cities || ['Salem', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Chennai', 'Erode']).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-5">
              <label htmlFor="quick-query" className="block text-xs font-medium text-slate-600 mb-1">
                Hospital or Specialty
              </label>
              <input
                id="quick-query"
                type="text"
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                placeholder="e.g., Kauvery, Manipal, Cardiology"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3 flex items-end">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#0F4C81] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B3A63] transition-colors whitespace-nowrap"
              >
                <Search className="h-4 w-4" />
                <span>{t.common.findHospitals}</span>
              </button>
            </div>

            <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={quickIcu}
                  onChange={(e) => setQuickIcu(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0F4C81]"
                />
                <span>Filter hospitals with ICU infrastructure</span>
              </label>

              <button
                type="button"
                onClick={() => onNavigate('search', { city: 'Salem', requireIcu: true })}
                className="text-xs font-medium text-[#0F4C81] hover:underline whitespace-nowrap"
              >
                Find Salem hospitals with ICU →
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          <div className="relative h-44 lg:h-full min-h-[180px] overflow-hidden rounded-lg border border-slate-200">
            <HospitalImage
              src="/src/assets/images/hospital_campus_view_1795018450584.jpg"
              alt="Regional Tamil Nadu Medical Campus"
              className="h-full w-full"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent p-4 text-white">
              <div className="text-xs font-medium text-slate-200">Resource Freshness &amp; Trust Engine</div>
              <div className="text-sm font-semibold">
                Real hospital directory details paired with transparent reporting status—never fabricated availability.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Location Origin Selector + Hospi Assistant */}
      <LocationOriginSelector origin={origin} onChangeOrigin={onChangeOrigin} />
      <HospiAssistant origin={origin} onSelectHospital={onSelectHospital} />

      {/* Emergency 112 Notice */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50/70 px-5 py-3.5">
        <div className="flex items-start gap-3">
          <Siren className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-red-950">
              Medical Emergency in India? Dial 112 immediately.
            </div>
            <p className="text-xs text-red-800">{t.emergency.disclaimer}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="tel:112"
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors whitespace-nowrap"
          >
            <PhoneCall className="h-4 w-4" />
            <span>{t.emergency.dial112}</span>
          </a>
          <button
            type="button"
            onClick={() => onNavigate('emergency')}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-50 whitespace-nowrap"
          >
            <span>{t.emergency.locator}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {/* 5-Column KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiBox
          label="Verified Real Hospitals"
          value={overview?.total_hospitals ?? 0}
          subtext={`${overview?.cities.length ?? 6} Tamil Nadu cities covered`}
          icon={<Building2 className="h-4 w-4 text-[#0F4C81]" />}
        />
        <KpiBox
          label="Published Total Capacity"
          value={overview?.total_published_beds ?? 0}
          subtext="Combined sanctioned beds"
          icon={<BedDouble className="h-4 w-4 text-[#0D9488]" />}
        />
        <KpiBox
          label="Live Reported Hospitals"
          value={overview?.live_reported_hospitals ?? 0}
          subtext={`of ${overview?.total_hospitals ?? 0} with admin shift report`}
          icon={<ShieldCheck className="h-4 w-4 text-[#0F4C81]" />}
        />
        <KpiBox
          label="Reported Available ICU"
          value={overview?.total_icu_available ?? 0}
          subtext={
            (overview?.live_reported_hospitals ?? 0) > 0
              ? 'From admin shift updates'
              : 'Submit admin update to populate'
          }
          icon={<Activity className="h-4 w-4 text-[#0D9488]" />}
        />
        <KpiBox
          label="24/7 Emergency Units"
          value={overview?.emergency_hospitals ?? 0}
          subtext="Verified emergency departments"
          icon={<Siren className="h-4 w-4 text-red-600" />}
        />
      </section>

      {/* Freshness Distribution + Map */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Resource Freshness Status</h2>
            <p className="mt-1 text-xs text-slate-600">
              Unreported live occupancy stays clearly marked &ldquo;Unreported&rdquo; until a Hospital Administrator submits a shift count.
            </p>

            {/* Segmented Freshness Bar */}
            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                style={{ width: `${(fc.GREEN / totalForFreshness) * 100}%` }}
                className="bg-emerald-600"
                title={`Current: ${fc.GREEN}`}
              />
              <div
                style={{ width: `${(fc.YELLOW / totalForFreshness) * 100}%` }}
                className="bg-amber-500"
                title={`Reverify: ${fc.YELLOW}`}
              />
              <div
                style={{ width: `${(fc.RED / totalForFreshness) * 100}%` }}
                className="bg-red-600"
                title={`Outdated: ${fc.RED}`}
              />
              <div
                style={{ width: `${(fc.UNKNOWN / totalForFreshness) * 100}%` }}
                className="bg-slate-400"
                title={`Unreported: ${fc.UNKNOWN}`}
              />
            </div>

            <div className="mt-4 divide-y divide-slate-100 text-xs">
              <div className="flex items-center justify-between py-2">
                <span className="font-medium text-emerald-800">{t.freshness.GREEN} (Admin updated &le; 2 hours)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">{fc.GREEN} hospitals</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="font-medium text-amber-800">{t.freshness.YELLOW} (Updated 2–6 hours ago)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">{fc.YELLOW} hospitals</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="font-medium text-red-800">{t.freshness.RED} (Updated &gt; 6 hours ago)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">{fc.RED} hospitals</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="font-medium text-slate-700">{t.freshness.UNKNOWN} (Call hospital to confirm)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">{fc.UNKNOWN} hospitals</span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate('beds')}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              <BedDouble className="h-3.5 w-3.5 text-[#0F4C81]" />
              <span>Beds</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('blood')}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              <Droplets className="h-3.5 w-3.5 text-red-600" />
              <span>Blood</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              <BarChart3 className="h-3.5 w-3.5 text-[#0D9488]" />
              <span>Analytics</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-7">
          <HospitalMap
            hospitals={hospitals}
            origin={origin}
            onSelectHospital={onSelectHospital}
            heightClass="h-[310px]"
          />
        </div>
      </section>

      {/* Hospital Directory Table */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Verified Hospital Directory</h2>
            <p className="text-xs text-slate-600">
              Real Tamil Nadu hospitals with verified contact numbers, published capacity, and live reporting status.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('search')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F4C81] hover:underline"
          >
            <span>Browse all {overview?.total_hospitals ?? 14} hospitals</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Hospital</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-right">Published Beds</th>
                <th className="px-4 py-3 text-right">Live ICU Avail.</th>
                <th className="px-4 py-3">Directory Status</th>
                <th className="px-4 py-3">Live Freshness</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(overview?.recently_updated || []).map((h) => {
                const icu = h.resources.find((r) => r.bed_type === 'ICU');
                return (
                  <tr
                    key={h.hospital_id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => onSelectHospital(h.hospital_id)}
                  >
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-900">{h.hospital_name}</div>
                      <div className="text-xs text-slate-500 font-mono">{h.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {h.area}, {h.city}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      ~{h.published_total_beds}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#0F4C81]">
                      {icu && icu.is_live_reported && icu.available_beds !== null
                        ? `${icu.available_beds} / ${icu.total_beds}`
                        : t.common.callToConfirm}
                    </td>
                    <td className="px-4 py-3">
                      <VerificationIndicator status={h.verification_status} />
                    </td>
                    <td className="px-4 py-3">
                      <FreshnessIndicator freshness={h.overall_freshness} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectHospital(h.hospital_id);
                        }}
                        className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {t.common.viewDetails}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <DisclaimerBar />
    </div>
  );
}

function KpiBox({
  label,
  value,
  subtext,
  icon,
}: {
  label: string;
  value: number;
  subtext: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{subtext}</div>
    </div>
  );
}
