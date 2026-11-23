import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckSquare,
  ExternalLink,
  Info,
  Navigation,
  Phone,
  RotateCcw,
  Scale,
  Search,
  Square,
} from 'lucide-react';
import { searchHospitals } from '../lib/api.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { buildDirectionsUrl } from '../shared/geo.ts';
import type { FreshnessThresholds } from '../shared/freshness.ts';
import type { BedCategory, DistanceOrigin, HospitalResource, HospitalSummary } from '../shared/types.ts';
import {
  DisclaimerBar,
  FreshnessIndicator,
  ReportingReliabilityBadge,
  VerificationIndicator,
} from '../components/TrustIndicators.tsx';
import { LocationOriginSelector } from '../components/LocationOriginSelector.tsx';

interface HospitalSearchProps {
  cities: string[];
  specialties: string[];
  thresholds: FreshnessThresholds;
  origin: DistanceOrigin | null;
  onChangeOrigin: (origin: DistanceOrigin | null) => void;
  preset?: { city?: string; requireIcu?: boolean; query?: string } | null;
  onSelectHospital: (hospitalId: number) => void;
  refreshTrigger: number;
}

function formatBedCell(res: HospitalResource | undefined): string {
  if (!res) return '—';
  if (res.is_live_reported && res.available_beds !== null) {
    return `${res.available_beds} avail / ${res.total_beds}`;
  }
  return `~${res.total_beds} cap · Unreported`;
}

const QUICK_SUGGESTIONS = ['Cardiology', 'Trauma Care', 'Oncology', 'Pediatrics', 'Kauvery', 'Apollo'];

export function HospitalSearch({
  cities,
  specialties,
  thresholds,
  origin,
  onChangeOrigin,
  preset,
  onSelectHospital,
  refreshTrigger,
}: HospitalSearchProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState(preset?.query || '');
  const [city, setCity] = useState(preset?.city || 'All');
  const [area, setArea] = useState('');
  const [specialty, setSpecialty] = useState('All');
  const [bedType, setBedType] = useState<BedCategory | ''>('');
  const [requireIcu, setRequireIcu] = useState(Boolean(preset?.requireIcu));
  const [requireEmergency, setRequireEmergency] = useState(false);
  const [requireAmbulance, setRequireAmbulance] = useState(false);
  const [requireBloodBank, setRequireBloodBank] = useState(false);
  const [requireTrauma, setRequireTrauma] = useState(false);
  const [requireDiagnostics, setRequireDiagnostics] = useState(false);
  const [freshnessFilter, setFreshnessFilter] = useState<'ALL' | 'GREEN' | 'YELLOW' | 'RED'>('ALL');
  const [sortBy, setSortBy] = useState<'relevance' | 'distance' | 'freshness'>('relevance');

  const [results, setResults] = useState<HospitalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);

  useEffect(() => {
    if (preset) {
      if (preset.city !== undefined) setCity(preset.city || 'All');
      if (preset.requireIcu !== undefined) setRequireIcu(preset.requireIcu);
      if (preset.query !== undefined) setQuery(preset.query);
    }
  }, [preset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    searchHospitals(
      {
        query,
        city,
        area,
        specialty,
        bed_type: bedType,
        require_icu: requireIcu,
        require_emergency: requireEmergency,
        require_ambulance: requireAmbulance,
        require_blood_bank: requireBloodBank,
        require_trauma: requireTrauma,
        require_diagnostics: requireDiagnostics,
        freshness_filter: freshnessFilter,
        originLat: origin?.lat,
        originLng: origin?.lng,
        sort_by: origin ? sortBy : sortBy === 'distance' ? 'relevance' : sortBy,
      },
      thresholds
    )
      .then((res) => {
        if (!cancelled) setResults(res.hospitals);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to search hospitals.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    query,
    city,
    area,
    specialty,
    bedType,
    requireIcu,
    requireEmergency,
    requireAmbulance,
    requireBloodBank,
    requireTrauma,
    requireDiagnostics,
    freshnessFilter,
    origin,
    sortBy,
    thresholds,
    refreshTrigger,
  ]);

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const resetFilters = () => {
    setQuery('');
    setCity('All');
    setArea('');
    setSpecialty('All');
    setBedType('');
    setRequireIcu(false);
    setRequireEmergency(false);
    setRequireAmbulance(false);
    setRequireBloodBank(false);
    setRequireTrauma(false);
    setRequireDiagnostics(false);
    setFreshnessFilter('ALL');
    setSortBy('relevance');
  };

  const comparedHospitals = results.filter((h) => compareIds.includes(h.hospital_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Find Real Hospitals &amp; Smart Rule-Based Matching</h1>
          <p className="mt-1 text-sm text-slate-600">
            Search verified Tamil Nadu hospitals by city, area, specialty, infrastructure, distance, and live reporting status.
          </p>
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{t.common.resetFilters}</span>
        </button>
      </div>

      <LocationOriginSelector origin={origin} onChangeOrigin={onChangeOrigin} />

      {/* Filter Panel */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Hospital Name / Keyword</label>
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Kauvery, Manipal, KMCH..."
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
              <option value="All">{t.common.allCities}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Area / Locality</label>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Hasthampatti, Peelamedu"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Medical Specialty</label>
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
            >
              <option value="All">{t.common.allSpecialties}</option>
              {specialties.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bed Category</label>
            <select
              value={bedType}
              onChange={(e) => setBedType(e.target.value as BedCategory | '')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
            >
              <option value="">Any Bed Category</option>
              <option value="General Ward">General Ward</option>
              <option value="ICU">ICU</option>
              <option value="Emergency Observation">Emergency Observation</option>
              <option value="Private Rooms">Private Rooms</option>
            </select>
          </div>
        </div>

        {/* Search Suggestions */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Quick Keywords:</span>
          {QUICK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuery(s)}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-4">
            <FilterToggle label="ICU Facility" checked={requireIcu} onChange={setRequireIcu} />
            <FilterToggle label="24/7 Emergency" checked={requireEmergency} onChange={setRequireEmergency} />
            <FilterToggle label="Ambulance" checked={requireAmbulance} onChange={setRequireAmbulance} />
            <FilterToggle label="Blood Bank" checked={requireBloodBank} onChange={setRequireBloodBank} />
            <FilterToggle label="Trauma Care" checked={requireTrauma} onChange={setRequireTrauma} />
            <FilterToggle label="Diagnostics" checked={requireDiagnostics} onChange={setRequireDiagnostics} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'relevance' | 'distance' | 'freshness')}
              aria-label="Sort results"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
            >
              <option value="relevance">{t.common.sortBy}: {t.common.relevance}</option>
              {origin && <option value="distance">{t.common.sortBy}: {t.common.distance}</option>}
              <option value="freshness">{t.common.sortBy}: {t.common.freshnessSort}</option>
            </select>

            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
              {(['ALL', 'GREEN', 'YELLOW', 'RED'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setFreshnessFilter(lvl)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    freshnessFilter === lvl
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lvl === 'ALL' ? 'All Freshness' : t.freshness[lvl]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Panel */}
      {comparedHospitals.length >= 2 && (
        <section className="rounded-lg border border-blue-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 bg-blue-50/50 px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0F4C81]">
              <Scale className="h-4 w-4" />
              <span>Side-by-Side Hospital Comparison ({comparedHospitals.length} selected)</span>
            </div>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Clear comparison
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Attribute</th>
                  {comparedHospitals.map((h) => (
                    <th key={h.hospital_id} className="px-4 py-2.5 font-semibold text-slate-900">
                      {h.hospital_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-600">Location &amp; Distance</td>
                  {comparedHospitals.map((h) => (
                    <td key={h.hospital_id} className="px-4 py-2.5 text-slate-800">
                      {h.area}, {h.city}
                      {typeof h.distance_km === 'number' && (
                        <span className="ml-1.5 font-mono text-[#0F4C81] font-semibold">· {h.distance_km} km</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-600">Published Capacity</td>
                  {comparedHospitals.map((h) => (
                    <td key={h.hospital_id} className="px-4 py-2.5 font-mono tabular-nums font-semibold">
                      ~{h.published_total_beds} beds
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-600">ICU Status</td>
                  {comparedHospitals.map((h) => (
                    <td key={h.hospital_id} className="px-4 py-2.5 font-mono tabular-nums font-semibold text-[#0F4C81]">
                      {formatBedCell(h.resources.find((r) => r.bed_type === 'ICU'))}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-600">Facilities</td>
                  {comparedHospitals.map((h) => (
                    <td key={h.hospital_id} className="px-4 py-2.5 text-slate-700">
                      {[
                        h.services?.emergency_available && '24/7 Emergency',
                        h.services?.ambulance_available && 'Ambulance',
                        h.services?.trauma_care && 'Trauma',
                        h.services?.diagnostic_facility && 'Diagnostics',
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Standard'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-600">Freshness &amp; Contact</td>
                  {comparedHospitals.map((h) => (
                    <td key={h.hospital_id} className="px-4 py-2.5 space-y-1">
                      <FreshnessIndicator freshness={h.overall_freshness} />
                      <div className="font-mono text-[#0F4C81]">{h.phone}</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Results Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          Showing <strong className="font-mono tabular-nums text-slate-900">{results.length}</strong> verified hospital
          {results.length === 1 ? '' : 's'} (ranked by rule-based filter match—never described as medically safest or best)
        </span>
        <span>Select 2–3 hospitals to compare side by side</span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-52 rounded-lg border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-900">No hospitals match the selected filters</p>
          <p className="mt-1 text-xs text-slate-600">
            Try clearing one or more facility checkboxes or selecting &ldquo;All Cities&rdquo;.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 rounded-md bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A63]"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {results.map((h) => {
            const gen = h.resources.find((r) => r.bed_type === 'General Ward');
            const icu = h.resources.find((r) => r.bed_type === 'ICU');
            const isSelected = compareIds.includes(h.hospital_id);

            return (
              <article
                key={h.hospital_id}
                className={`rounded-lg border bg-white p-5 transition-colors flex flex-col justify-between ${
                  isSelected ? 'border-[#0F4C81]' : 'border-slate-200'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{h.hospital_name}</h3>
                      <div className="mt-0.5 text-xs text-slate-600">
                        {h.address}
                        {typeof h.distance_km === 'number' && (
                          <span className="ml-2 font-mono font-semibold text-[#0F4C81]">
                            · {h.distance_km} {t.common.distanceAway}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <VerificationIndicator status={h.verification_status} />
                      <FreshnessIndicator freshness={h.overall_freshness} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <ReportingReliabilityBadge reliability={h.reliability} />
                    {h.official_website && (
                      <a
                        href={h.official_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F4C81] hover:underline"
                      >
                        <span>{t.common.officialWebsite}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <div className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">Specialties:</span>{' '}
                    {h.specialties.join(' · ') || 'General Care'}
                  </div>

                  <div className="grid grid-cols-3 gap-3 border-y border-slate-100 py-3">
                    <div>
                      <div className="text-xs text-slate-500">General Ward</div>
                      <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-slate-900">
                        {gen && gen.is_live_reported && gen.available_beds !== null
                          ? `${gen.available_beds} / ${gen.total_beds} avail`
                          : `~${gen ? gen.total_beds : 0} cap`}
                      </div>
                      {(!gen || !gen.is_live_reported) && (
                        <div className="text-[11px] text-slate-500">{t.common.callToConfirm}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">ICU Ward</div>
                      <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-[#0F4C81]">
                        {icu && icu.is_live_reported && icu.available_beds !== null
                          ? `${icu.available_beds} / ${icu.total_beds} avail`
                          : `~${icu ? icu.total_beds : 0} cap`}
                      </div>
                      {(!icu || !icu.is_live_reported) && (
                        <div className="text-[11px] text-slate-500">{t.common.callToConfirm}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Published Total</div>
                      <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-slate-900">
                        ~{h.published_total_beds} beds
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {h.services?.emergency_available ? '24/7 Emergency' : 'Standard'}
                      </div>
                    </div>
                  </div>

                  {h.match_reasons && h.match_reasons.length > 0 && (
                    <div className="flex items-start gap-2 text-xs text-slate-600">
                      <Info className="h-3.5 w-3.5 text-[#0D9488] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-800">Why this hospital matched: </span>
                        {h.match_reasons.join(' · ')}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={`tel:${h.phone}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F4C81] hover:underline font-mono"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span>{h.phone}</span>
                    </a>
                    {h.latitude !== null && h.longitude !== null && (
                      <a
                        href={buildDirectionsUrl(h.latitude, h.longitude, h.hospital_name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#0D9488] hover:underline"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        <span>{t.common.directions}</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleCompare(h.hospital_id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 text-[#0F4C81]" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                      <span>Compare</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectHospital(h.hospital_id)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#0F4C81] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0B3A63] transition-colors whitespace-nowrap"
                  >
                    <span>{t.common.viewDetails}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <DisclaimerBar />
    </div>
  );
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-[#0F4C81]"
      />
      <span>{label}</span>
    </label>
  );
}
