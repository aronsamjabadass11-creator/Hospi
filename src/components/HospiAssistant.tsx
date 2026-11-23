import { useState } from 'react';
import {
  ArrowRight,
  Bot,
  Droplets,
  ExternalLink,
  Info,
  Navigation,
  PhoneCall,
  Send,
  Sparkles,
} from 'lucide-react';
import { queryHospiAssistant } from '../lib/api.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { buildDirectionsUrl } from '../shared/geo.ts';
import type { DistanceOrigin, HospiAssistantResponse } from '../shared/types.ts';
import { FreshnessIndicator, VerificationIndicator } from './TrustIndicators.tsx';

interface HospiAssistantProps {
  origin: DistanceOrigin | null;
  onSelectHospital: (hospitalId: number) => void;
}

const SAMPLE_PROMPTS = [
  'ICU beds in Salem with 24/7 emergency',
  'Cardiology hospital in Coimbatore with ambulance',
  'O+ blood bank availability in Madurai',
  'சேலத்தில் அவசர சிகிச்சை மற்றும் ஐசியு',
];

export function HospiAssistant({ origin, onSelectHospital }: HospiAssistantProps) {
  const { language, t } = useLanguage();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HospiAssistantResponse | null>(null);

  const runSearch = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await queryHospiAssistant({
        query: trimmed,
        language,
        originLat: origin?.lat,
        originLng: origin?.lng,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process assistant search.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(input);
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#EAF2FA] text-[#0F4C81] shrink-0">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{t.common.assistantTitle}</h2>
            <p className="text-xs text-slate-600">
              Natural-language hospital resource discovery grounded strictly in verified HOSPIFIND SQLite records. Does not provide medical advice or diagnosis.
            </p>
          </div>
        </div>
        {result && (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
              result.mode === 'ai'
                ? 'border-blue-200 bg-blue-50 text-[#0F4C81]'
                : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            <span>{result.mode === 'ai' ? 'AI Filter Extraction' : 'Rule-Based Parser'}</span>
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.common.assistantPlaceholder}
          className="flex-1 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0F4C81] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B3A63] disabled:opacity-60 whitespace-nowrap"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{loading ? 'Searching...' : t.common.assistantSearchBtn}</span>
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-slate-500">Examples:</span>
        {SAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setInput(p);
              runSearch(p);
            }}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
          >
            {p}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      )}

      {result && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 space-y-1">
            <div className="font-semibold text-slate-900">{result.explanation}</div>
            <div className="text-[11px] text-slate-600">
              Extracted Criteria: <span className="font-mono text-[#0F4C81]">{result.extractedFilters.intent_summary}</span>
            </div>
            {result.fallbackReason && (
              <div className="text-[11px] text-slate-500">{result.fallbackReason}</div>
            )}
          </div>

          {result.hospitals.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {result.hospitals.slice(0, 4).map((h) => {
                const icu = h.resources.find((r) => r.bed_type === 'ICU');
                return (
                  <div
                    key={h.hospital_id}
                    className="rounded-md border border-slate-200 bg-white p-3.5 flex flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-slate-900">{h.hospital_name}</div>
                          <div className="text-xs text-slate-600">
                            {h.area}, {h.city}
                            {typeof h.distance_km === 'number' && (
                              <span className="ml-1.5 font-mono font-semibold text-[#0F4C81]">
                                · {h.distance_km} {t.common.distanceAway}
                              </span>
                            )}
                          </div>
                        </div>
                        <FreshnessIndicator freshness={h.overall_freshness} compact />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <VerificationIndicator status={h.verification_status} />
                        <span className="text-xs font-mono text-slate-700">
                          ICU:{' '}
                          {icu && icu.is_live_reported && icu.available_beds !== null
                            ? `${icu.available_beds}/${icu.total_beds} avail`
                            : `~${icu?.total_beds ?? 0} cap (unreported)`}
                        </span>
                      </div>

                      {h.match_reasons && h.match_reasons.length > 0 && (
                        <div className="flex items-start gap-1.5 text-[11px] text-slate-600">
                          <Info className="h-3.5 w-3.5 text-[#0D9488] shrink-0 mt-0.5" />
                          <span>{h.match_reasons.slice(0, 3).join(' · ')}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-3">
                        <a
                          href={`tel:${h.phone}`}
                          className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-[#0F4C81] hover:underline"
                        >
                          <PhoneCall className="h-3 w-3" />
                          <span>{h.phone}</span>
                        </a>
                        {h.latitude !== null && h.longitude !== null && (
                          <a
                            href={buildDirectionsUrl(h.latitude, h.longitude, h.hospital_name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#0D9488] hover:underline"
                          >
                            <Navigation className="h-3 w-3" />
                            <span>{t.common.directions}</span>
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectHospital(h.hospital_id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F4C81] hover:underline"
                      >
                        <span>{t.common.viewDetails}</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {result.bloodRecords.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50/40 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-900">
                <Droplets className="h-3.5 w-3.5 text-red-600" />
                <span>Matching Blood Bank Contacts (Call directly to confirm blood units)</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {result.bloodRecords.slice(0, 6).map((b) => (
                  <div
                    key={b.blood_bank_id}
                    className="rounded border border-slate-200 bg-white p-2.5 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{b.blood_bank_name}</div>
                      <div className="text-slate-600">
                        <span className="font-mono font-bold text-red-700">{b.blood_group}</span> · {b.availability_status}
                      </div>
                    </div>
                    <a
                      href={`tel:${b.contact_number}`}
                      className="text-xs font-mono font-semibold text-[#0F4C81] hover:underline shrink-0 inline-flex items-center gap-1"
                    >
                      <span>Call</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
