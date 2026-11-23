import { useEffect, useState } from 'react';
import { ArrowRight, Navigation, PhoneCall, Siren } from 'lucide-react';
import { searchHospitals } from '../lib/api.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { buildDirectionsUrl } from '../shared/geo.ts';
import type { FreshnessThresholds } from '../shared/freshness.ts';
import type { DistanceOrigin, HospitalSummary } from '../shared/types.ts';
import { DisclaimerBar, FreshnessIndicator, VerificationIndicator } from '../components/TrustIndicators.tsx';
import { LocationOriginSelector } from '../components/LocationOriginSelector.tsx';

interface EmergencyServicesProps {
  cities: string[];
  thresholds: FreshnessThresholds;
  origin: DistanceOrigin | null;
  onChangeOrigin: (origin: DistanceOrigin | null) => void;
  onSelectHospital: (hospitalId: number) => void;
  refreshTrigger: number;
}

export function EmergencyServices({
  cities,
  thresholds,
  origin,
  onChangeOrigin,
  onSelectHospital,
  refreshTrigger,
}: EmergencyServicesProps) {
  const { t } = useLanguage();
  const [city, setCity] = useState('All');
  const [emergency24x7, setEmergency24x7] = useState(true);
  const [icu, setIcu] = useState(false);
  const [trauma, setTrauma] = useState(false);
  const [surgery, setSurgery] = useState(false);
  const [ambulance, setAmbulance] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [criticalCare, setCriticalCare] = useState(false);

  const [hospitals, setHospitals] = useState<HospitalSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchHospitals(
      {
        city,
        require_emergency: emergency24x7,
        require_icu: icu,
        require_trauma: trauma,
        require_surgery: surgery,
        require_ambulance: ambulance,
        require_diagnostics: diagnostics,
        require_critical_care: criticalCare,
        originLat: origin?.lat,
        originLng: origin?.lng,
        sort_by: origin ? 'distance' : 'relevance',
      },
      thresholds
    )
      .then((res) => {
        if (!cancelled) setHospitals(res.hospitals);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [city, emergency24x7, icu, trauma, surgery, ambulance, diagnostics, criticalCare, origin, thresholds, refreshTrigger]);

  return (
    <div className="space-y-6">
      {/* India 112 Banner */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <Siren className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-lg font-bold text-red-950">
              Emergency Services Locator — {t.emergency.helpline}
            </h1>
            <p className="mt-0.5 text-xs text-red-900">{t.emergency.disclaimer}</p>
          </div>
        </div>
        <a
          href="tel:112"
          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 whitespace-nowrap"
        >
          <PhoneCall className="h-4 w-4" />
          <span>{t.emergency.dial112}</span>
        </a>
      </section>

      <LocationOriginSelector origin={origin} onChangeOrigin={onChangeOrigin} />

      {/* Capability Filters */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">Filter by Emergency &amp; Critical Capabilities</h2>
          <div className="w-48">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              aria-label="Filter emergency hospitals by city"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#0F4C81] focus:outline-none"
            >
              <option value="All">{t.common.allCities}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ToggleBtn active={emergency24x7} onClick={() => setEmergency24x7(!emergency24x7)} label="24/7 Emergency Services" />
          <ToggleBtn active={icu} onClick={() => setIcu(!icu)} label="ICU Ward" />
          <ToggleBtn active={trauma} onClick={() => setTrauma(!trauma)} label="Trauma Care" />
          <ToggleBtn active={surgery} onClick={() => setSurgery(!surgery)} label="Emergency Surgery" />
          <ToggleBtn active={ambulance} onClick={() => setAmbulance(!ambulance)} label="Ambulance Services" />
          <ToggleBtn active={diagnostics} onClick={() => setDiagnostics(!diagnostics)} label="Diagnostic Imaging" />
          <ToggleBtn active={criticalCare} onClick={() => setCriticalCare(!criticalCare)} label="Critical Care" />
        </div>
      </section>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-lg border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : hospitals.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">
          No hospitals match the selected combination of emergency facilities.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {hospitals.map((h) => {
            const icuRes = h.resources.find((r) => r.bed_type === 'ICU');
            const obsRes = h.resources.find((r) => r.bed_type === 'Emergency Observation');
            const caps = [
              h.services?.emergency_available && '24/7 Emergency',
              h.services?.trauma_care && 'Trauma Care',
              h.services?.emergency_surgery && 'Emergency Surgery',
              h.services?.ambulance_available && 'Ambulance',
              h.services?.diagnostic_facility && 'Diagnostic Imaging',
              h.services?.critical_care && 'Critical Care',
            ].filter(Boolean);

            return (
              <article key={h.hospital_id} className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{h.hospital_name}</h3>
                      <div className="text-xs text-slate-600">
                        {h.address}
                        {typeof h.distance_km === 'number' && (
                          <span className="ml-2 font-mono font-semibold text-[#0F4C81]">
                            · {h.distance_km} {t.common.distanceAway}
                          </span>
                        )}
                      </div>
                    </div>
                    <FreshnessIndicator freshness={h.overall_freshness} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <VerificationIndicator status={h.verification_status} />
                  </div>

                  <div className="text-xs text-slate-700">
                    <span className="font-semibold text-slate-900">Reported Capabilities: </span>
                    {caps.join(' · ') || 'Standard Emergency'}
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <div className="text-slate-500">ICU Ward</div>
                      <div className="text-sm font-bold font-mono tabular-nums text-[#0F4C81]">
                        {icuRes && icuRes.is_live_reported && icuRes.available_beds !== null
                          ? `${icuRes.available_beds} / ${icuRes.total_beds} avail`
                          : `~${icuRes ? icuRes.total_beds : 0} cap · Call`}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Emergency Observation</div>
                      <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                        {obsRes && obsRes.is_live_reported && obsRes.available_beds !== null
                          ? `${obsRes.available_beds} / ${obsRes.total_beds} avail`
                          : `~${obsRes ? obsRes.total_beds : 0} cap · Call`}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <a
                      href={`tel:${h.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      <span className="font-mono">Call {h.phone}</span>
                    </a>
                    {h.latitude !== null && h.longitude !== null && (
                      <a
                        href={buildDirectionsUrl(h.latitude, h.longitude, h.hospital_name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#0F4C81] hover:bg-slate-50"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        <span>{t.common.directions}</span>
                      </a>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectHospital(h.hospital_id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F4C81] hover:underline whitespace-nowrap"
                  >
                    <span>Full Profile</span>
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

function ToggleBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
        active
          ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}
