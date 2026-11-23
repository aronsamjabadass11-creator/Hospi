import { useState } from 'react';
import { LocateFixed, MapPin, X } from 'lucide-react';
import { TAMIL_NADU_ORIGINS } from '../shared/geo.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import type { DistanceOrigin } from '../shared/types.ts';

interface LocationOriginSelectorProps {
  origin: DistanceOrigin | null;
  onChangeOrigin: (origin: DistanceOrigin | null) => void;
}

export function LocationOriginSelector({ origin, onChangeOrigin }: LocationOriginSelectorProps) {
  const { t } = useLanguage();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const handleRequestGeolocation = () => {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('Browser geolocation is unavailable. Choose a city origin instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChangeOrigin({
          label: `My GPS (${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)})`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: 'geolocation',
        });
        setLocating(false);
      },
      () => {
        setGeoError('Location permission denied or unavailable. Select a manual city origin.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 6000 }
    );
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <MapPin className="h-4 w-4 text-[#0F4C81]" />
          <span>{t.common.selectOrigin}</span>
          <span className="font-normal text-slate-500">
            (calculates straight-line Haversine distance in km — no fabricated travel times)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={origin?.source === 'manual' ? origin.label : ''}
            onChange={(e) => {
              setGeoError(null);
              const found = TAMIL_NADU_ORIGINS.find((o) => o.label === e.target.value) || null;
              onChangeOrigin(found);
            }}
            aria-label="Select manual origin city"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#0F4C81] focus:outline-none"
          >
            <option value="">Manual city origin (optional)</option>
            {TAMIL_NADU_ORIGINS.map((o) => (
              <option key={o.label} value={o.label}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleRequestGeolocation}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#0F4C81] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0F4C81] hover:bg-blue-50 disabled:opacity-60 whitespace-nowrap"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            <span>{locating ? 'Locating...' : t.common.useMyLocation}</span>
          </button>

          {origin && (
            <button
              type="button"
              onClick={() => onChangeOrigin(null)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              title={t.common.clearLocation}
            >
              <X className="h-3.5 w-3.5" />
              <span>{t.common.clearLocation}</span>
            </button>
          )}
        </div>
      </div>

      {origin && (
        <div className="text-xs text-[#0F4C81] font-medium">
          Active origin: <span className="font-semibold">{origin.label}</span> (Lat {origin.lat.toFixed(4)}, Lng{' '}
          {origin.lng.toFixed(4)})
        </div>
      )}

      {geoError && <div className="text-xs text-amber-800">{geoError}</div>}
    </div>
  );
}
