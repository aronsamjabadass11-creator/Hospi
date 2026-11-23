import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { ExternalLink, Layers, MapPin, Navigation, Phone } from 'lucide-react';
import { buildDirectionsUrl, calculateHaversineKm } from '../shared/geo.ts';
import type { DistanceOrigin, HospitalSummary } from '../shared/types.ts';
import { FreshnessIndicator } from './TrustIndicators.tsx';

interface HospitalMapProps {
  hospitals: HospitalSummary[];
  selectedHospitalId?: number | null;
  origin?: DistanceOrigin | null;
  onSelectHospital?: (hospitalId: number) => void;
  heightClass?: string;
}

export function HospitalMap({
  hospitals,
  selectedHospitalId,
  origin = null,
  onSelectHospital,
  heightClass = 'h-80',
}: HospitalMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [tileError, setTileError] = useState(false);
  const [clusterByCity, setClusterByCity] = useState(false);

  const mappableHospitals = hospitals.filter(
    (h) => typeof h.latitude === 'number' && typeof h.longitude === 'number'
  );

  // Build city cluster summary
  const cityClusters = new Map<
    string,
    { city: string; latSum: number; lngSum: number; count: number; hospitals: HospitalSummary[] }
  >();
  for (const h of mappableHospitals) {
    const existing = cityClusters.get(h.city);
    if (existing) {
      existing.latSum += h.latitude!;
      existing.lngSum += h.longitude!;
      existing.count += 1;
      existing.hospitals.push(h);
    } else {
      cityClusters.set(h.city, {
        city: h.city,
        latSum: h.latitude!,
        lngSum: h.longitude!,
        count: 1,
        hospitals: [h],
      });
    }
  }

  useEffect(() => {
    if (!containerRef.current || mappableHospitals.length === 0 || tileError) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const first = mappableHospitals[0];
    const centerLat = selectedHospitalId
      ? mappableHospitals.find((h) => h.hospital_id === selectedHospitalId)?.latitude ?? first.latitude!
      : origin
      ? origin.lat
      : first.latitude!;
    const centerLng = selectedHospitalId
      ? mappableHospitals.find((h) => h.hospital_id === selectedHospitalId)?.longitude ?? first.longitude!
      : origin
      ? origin.lng
      : first.longitude!;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom: mappableHospitals.length === 1 ? 14 : 7,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    });

    let errorCount = 0;
    tileLayer.on('tileerror', () => {
      errorCount += 1;
      if (errorCount >= 4) {
        setTileError(true);
      }
    });
    tileLayer.addTo(map);

    const bounds: [number, number][] = [];

    if (origin) {
      bounds.push([origin.lat, origin.lng]);
      const originMarker = L.circleMarker([origin.lat, origin.lng], {
        radius: 9,
        fillColor: '#0F4C81',
        color: '#FFFFFF',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(map);
      originMarker.bindPopup(
        `<div style="font-size:12px;"><strong>Selected Origin</strong><br/>${escapeHtml(origin.label)}</div>`
      );
    }

    if (clusterByCity && cityClusters.size > 1 && !selectedHospitalId) {
      for (const cluster of cityClusters.values()) {
        const cLat = cluster.latSum / cluster.count;
        const cLng = cluster.lngSum / cluster.count;
        bounds.push([cLat, cLng]);

        const clusterIcon = L.divIcon({
          className: 'hospifind-cluster-icon',
          html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#0F4C81;color:#fff;font-weight:700;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,0.25);">${cluster.count}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([cLat, cLng], { icon: clusterIcon }).addTo(map);
        const listHtml = cluster.hospitals
          .map((h) => `<li>${escapeHtml(h.hospital_name)}</li>`)
          .join('');
        const popupEl = document.createElement('div');
        popupEl.className = 'text-xs space-y-1 min-w-[200px]';
        popupEl.innerHTML = `
          <div style="font-weight:700;color:#0F172A;font-size:13px;">${escapeHtml(cluster.city)} Cluster (${cluster.count} hospitals)</div>
          <ul style="margin:4px 0 0 14px;padding:0;color:#334155;">${listHtml}</ul>
        `;
        const zoomBtn = document.createElement('button');
        zoomBtn.type = 'button';
        zoomBtn.textContent = 'Expand Hospitals in View';
        zoomBtn.style.cssText =
          'margin-top:6px;width:100%;padding:5px 8px;background:#0D9488;color:#fff;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;';
        zoomBtn.onclick = () => {
          setClusterByCity(false);
          map.setView([cLat, cLng], 12);
        };
        popupEl.appendChild(zoomBtn);
        marker.bindPopup(popupEl);
      }
    } else {
      for (const h of mappableHospitals) {
        const lat = h.latitude!;
        const lng = h.longitude!;
        bounds.push([lat, lng]);

        const color =
          h.overall_freshness.level === 'GREEN'
            ? '#16A34A'
            : h.overall_freshness.level === 'YELLOW'
            ? '#D97706'
            : h.overall_freshness.level === 'RED'
            ? '#DC2626'
            : '#64748B';

        const icu = h.resources.find((r) => r.bed_type === 'ICU');
        const gen = h.resources.find((r) => r.bed_type === 'General Ward');

        const icuLabel =
          icu && icu.is_live_reported && icu.available_beds !== null
            ? `${icu.available_beds} avail / ${icu.total_beds}`
            : `~${icu ? icu.total_beds : 0} cap (call to confirm)`;
        const genLabel =
          gen && gen.is_live_reported && gen.available_beds !== null
            ? `${gen.available_beds} avail / ${gen.total_beds}`
            : `~${gen ? gen.total_beds : 0} cap (call to confirm)`;

        const distKm =
          typeof h.distance_km === 'number'
            ? h.distance_km
            : origin
            ? calculateHaversineKm(origin.lat, origin.lng, lat, lng)
            : null;

        const directionsHref = buildDirectionsUrl(lat, lng, h.hospital_name);

        const marker = L.circleMarker([lat, lng], {
          radius: selectedHospitalId === h.hospital_id ? 10 : 8,
          fillColor: color,
          color: '#FFFFFF',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(map);

        const popupEl = document.createElement('div');
        popupEl.className = 'text-xs space-y-1 min-w-[230px]';
        popupEl.innerHTML = `
          <div style="font-weight:700;color:#0F172A;font-size:13px;">${escapeHtml(h.hospital_name)}</div>
          <div style="color:#475569;">${escapeHtml(h.area)}, ${escapeHtml(h.city)}${distKm !== null ? ` · <strong style="color:#0F4C81;">${distKm} km away</strong>` : ''}</div>
          <div style="color:#334155;">${escapeHtml(h.address)}</div>
          <div style="font-family:monospace;color:#0F4C81;font-weight:600;">${escapeHtml(h.phone)}</div>
          <div style="padding-top:4px;border-top:1px solid #E2E8F0;color:#334155;">
            ICU: <strong>${escapeHtml(icuLabel)}</strong><br/>
            General: <strong>${escapeHtml(genLabel)}</strong>
          </div>
          <div style="color:#64748B;">Freshness: <strong>${escapeHtml(h.overall_freshness.label)}</strong> (${escapeHtml(h.overall_freshness.relativeTime)})</div>
          <div style="margin-top:6px;display:flex;gap:6px;">
            <a href="${escapeHtml(directionsHref)}" target="_blank" rel="noopener noreferrer" style="flex:1;text-align:center;padding:5px 8px;background:#F1F5F9;color:#0F4C81;border:1px solid #CBD5E1;border-radius:4px;font-size:11px;font-weight:600;text-decoration:none;">Directions ↗</a>
          </div>
        `;

        if (onSelectHospital) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'View Hospital Profile';
          btn.style.cssText =
            'margin-top:6px;width:100%;padding:5px 8px;background:#0F4C81;color:#fff;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;';
          btn.onclick = () => onSelectHospital(h.hospital_id);
          popupEl.appendChild(btn);
        }

        marker.bindPopup(popupEl);
        if (selectedHospitalId === h.hospital_id) {
          marker.openPopup();
        }
      }
    }

    if (bounds.length > 1 && !selectedHospitalId) {
      map.fitBounds(bounds, { padding: [32, 32] });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [hospitals, selectedHospitalId, tileError, clusterByCity, origin]);

  if (mappableHospitals.length === 0 || tileError) {
    return (
      <div className={`rounded-lg border border-slate-200 bg-slate-50 p-4 overflow-y-auto ${heightClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MapPin className="h-4 w-4 text-[#0F4C81]" />
            <span>
              {tileError
                ? 'Interactive Map Offline Fallback — Verified Hospital Coordinates'
                : 'Hospital Coordinate Directory'}
            </span>
          </div>
          <span className="text-xs text-slate-500">Real coordinates · No fabricated travel times</span>
        </div>

        {mappableHospitals.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No geographic coordinates recorded for the selected hospital records.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {mappableHospitals.map((h) => {
              const distKm =
                typeof h.distance_km === 'number'
                  ? h.distance_km
                  : origin
                  ? calculateHaversineKm(origin.lat, origin.lng, h.latitude!, h.longitude!)
                  : null;
              return (
                <div
                  key={h.hospital_id}
                  className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{h.hospital_name}</div>
                    <div className="text-xs text-slate-600">
                      {h.area}, {h.city}
                      {distKm !== null && (
                        <span className="ml-1.5 font-mono font-semibold text-[#0F4C81]">· {distKm} km</span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                      Lat {h.latitude?.toFixed(4)}, Lng {h.longitude?.toFixed(4)}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <FreshnessIndicator freshness={h.overall_freshness} compact />
                      <a
                        href={`tel:${h.phone}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#0F4C81] hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        <span className="font-mono">{h.phone}</span>
                      </a>
                      <a
                        href={buildDirectionsUrl(h.latitude!, h.longitude!, h.hospital_name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#0D9488] hover:underline"
                      >
                        <Navigation className="h-3 w-3" />
                        <span>Directions</span>
                      </a>
                    </div>
                  </div>
                  {onSelectHospital && (
                    <button
                      type="button"
                      onClick={() => onSelectHospital(h.hospital_id)}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
                    >
                      <span>Open</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-slate-700">
          <MapPin className="h-3.5 w-3.5 text-[#0F4C81]" />
          <span className="font-medium">
            {origin ? `Origin: ${origin.label}` : 'Tamil Nadu Hospital Map'}
          </span>
        </div>
        {cityClusters.size > 1 && !selectedHospitalId && (
          <button
            type="button"
            onClick={() => setClusterByCity((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              clusterByCity
                ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-3 w-3" />
            <span>{clusterByCity ? 'Show Individual Pins' : 'Cluster by City'}</span>
          </button>
        )}
      </div>

      <div ref={containerRef} className={`w-full ${heightClass}`} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span>
          Markers colored by freshness (Green: Current, Amber: Reverify, Red: Outdated, Grey: Unreported).
        </span>
        <span className="font-mono tabular-nums">{mappableHospitals.length} locations plotted</span>
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
