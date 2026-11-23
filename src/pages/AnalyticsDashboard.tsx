import { useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Building2,
  Droplets,
  History,
  TrendingUp,
} from 'lucide-react';
import { fetchAnalytics } from '../lib/api.ts';
import { formatTimestamp, type FreshnessThresholds } from '../shared/freshness.ts';
import type { AnalyticsData, BedCategory } from '../shared/types.ts';

interface AnalyticsDashboardProps {
  thresholds: FreshnessThresholds;
  onSelectHospital: (hospitalId: number) => void;
  onNavigateAdmin: () => void;
  refreshTrigger: number;
}

const TRACKED_WARDS: BedCategory[] = ['ICU', 'General Ward', 'Emergency Observation'];
const WARD_COLORS: Record<string, string> = {
  ICU: '#0F4C81',
  'General Ward': '#0D9488',
  'Emergency Observation': '#D97706',
};

export function AnalyticsDashboard({
  thresholds,
  onSelectHospital,
  onNavigateAdmin,
  refreshTrigger,
}: AnalyticsDashboardProps) {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAnalytics(period, thresholds)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load analytics.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, thresholds, refreshTrigger]);

  const buckets = Array.from(new Set(data?.occupancy_trends.map((t) => t.bucket) || [])).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Historical Resource Analytics &amp; Reporting Trends</h1>
          <p className="mt-1 text-sm text-slate-600">
            Aggregates real administrator shift reports, city-wise reporting coverage, and blood bank reporting logs from SQLite.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
          {(['daily', 'weekly', 'monthly'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                period === p ? 'bg-white text-[#0F4C81] shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Explicit Historical vs Live Notice */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-950">
        <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
        <span>
          <strong>Historical Records Only:</strong> Charts and summaries below reflect past shift reports and audit logs stored in HOSPIFIND. They do <strong>not</strong> represent current live bed availability or guaranteed capacity.
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {loading && !data ? (
        <div className="space-y-4">
          <div className="h-56 rounded-lg border border-slate-200 bg-white animate-pulse" />
          <div className="h-56 rounded-lg border border-slate-200 bg-white animate-pulse" />
        </div>
      ) : data ? (
        <>
          {/* Summary KPI Row */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Shift Bed Reports"
              value={data.total_shift_reports}
              sub="Logged across ward categories"
              icon={<TrendingUp className="h-4 w-4 text-[#0F4C81]" />}
            />
            <StatCard
              label="Total Audit Log Events"
              value={data.total_audit_updates}
              sub="Profile, bed, service & blood updates"
              icon={<History className="h-4 w-4 text-[#0D9488]" />}
            />
            <StatCard
              label="Tamil Nadu Cities Covered"
              value={data.city_stats.length}
              sub="Verified hospital directory clusters"
              icon={<Building2 className="h-4 w-4 text-[#0F4C81]" />}
            />
            <StatCard
              label="Blood Bank Reporting"
              value={data.blood_bank_summary.hospitals_reporting}
              sub={`${data.blood_bank_summary.total_updates} blood inventory updates`}
              icon={<Droplets className="h-4 w-4 text-red-600" />}
            />
          </section>

          {/* Ward Occupancy Trend Chart (Truthful Empty State if no shift history) */}
          <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Ward Occupancy Trend ({period.charAt(0).toUpperCase() + period.slice(1)})
                </h2>
                <p className="text-xs text-slate-500">
                  Average reported occupancy % by ward category (ICU, General Ward, Emergency Observation).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                {TRACKED_WARDS.map((w) => (
                  <span key={w} className="inline-flex items-center gap-1.5 text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: WARD_COLORS[w] }} />
                    <span>{w}</span>
                  </span>
                ))}
              </div>
            </div>

            {!data.has_shift_history ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-center space-y-2.5">
                <BarChart3 className="h-8 w-8 text-slate-400 mx-auto" />
                <div className="text-sm font-semibold text-slate-900">
                  Insufficient Shift History Recorded Yet
                </div>
                <p className="text-xs text-slate-600 max-w-lg mx-auto">
                  HOSPIFIND never fabricates historical occupancy curves. Trends appear automatically here once hospital administrators submit Morning, Afternoon, or Night shift bed reports.
                </p>
                <button
                  type="button"
                  onClick={onNavigateAdmin}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A63]"
                >
                  Open Hospital Admin to Submit a Shift Report
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[520px] space-y-4">
                  <svg viewBox="0 0 720 220" className="w-full h-56 overflow-visible">
                    {/* Horizontal grid lines */}
                    {[0, 25, 50, 75, 100].map((pct) => {
                      const y = 180 - (pct / 100) * 150;
                      return (
                        <g key={pct}>
                          <line x1="45" y1={y} x2="700" y2={y} stroke="#E2E8F0" strokeWidth="1" />
                          <text x="38" y={y + 4} textAnchor="end" fontSize="10" fill="#64748B" fontFamily="monospace">
                            {pct}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Grouped bars per time bucket */}
                    {buckets.map((b, bIdx) => {
                      const groupWidth = Math.min(110, 620 / Math.max(1, buckets.length));
                      const startX = 60 + bIdx * groupWidth;
                      const barW = Math.min(20, (groupWidth - 16) / 3);

                      return (
                        <g key={b}>
                          {TRACKED_WARDS.map((ward, wIdx) => {
                            const point = data.occupancy_trends.find((t) => t.bucket === b && t.bed_type === ward);
                            const pct = point ? point.avg_occupancy_pct : 0;
                            const barH = (pct / 100) * 150;
                            const x = startX + wIdx * (barW + 3);
                            const y = 180 - barH;
                            return (
                              <g key={ward}>
                                <rect
                                  x={x}
                                  y={y}
                                  width={barW}
                                  height={Math.max(2, barH)}
                                  rx="2"
                                  fill={point ? WARD_COLORS[ward] : '#E2E8F0'}
                                >
                                  <title>
                                    {point
                                      ? `${b} · ${ward}: ${pct}% occupied (avg ${point.avg_available_beds} avail, ${point.report_count} reports)`
                                      : `${b} · ${ward}: No report`}
                                  </title>
                                </rect>
                              </g>
                            );
                          })}
                          <text
                            x={startX + (barW * 3) / 2}
                            y="200"
                            textAnchor="middle"
                            fontSize="10"
                            fill="#475569"
                            fontFamily="monospace"
                          >
                            {b}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            )}
          </section>

          {/* City-wise Reporting Stats + Blood Bank Summary */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-3.5">
                <h2 className="text-base font-semibold text-slate-900">City-wise Reporting Statistics</h2>
                <p className="text-xs text-slate-500">
                  Real verified directory capacity compared with live reporting adoption per city.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="px-5 py-2.5">City</th>
                      <th className="px-3 py-2.5 text-right">Hospitals</th>
                      <th className="px-3 py-2.5 text-right">Live Reporting</th>
                      <th className="px-3 py-2.5 text-right">Published Beds</th>
                      <th className="px-3 py-2.5 text-right">Shift Reports</th>
                      <th className="px-5 py-2.5">Latest Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.city_stats.map((cs) => (
                      <tr key={cs.city}>
                        <td className="px-5 py-2.5 font-semibold text-slate-900">{cs.city}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {cs.verified_hospitals}/{cs.total_hospitals}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-[#0F4C81]">
                          {cs.live_reporting_hospitals}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          ~{cs.total_published_beds}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {cs.shift_reports_count}
                        </td>
                        <td className="px-5 py-2.5 font-mono text-slate-500">
                          {cs.latest_update ? formatTimestamp(cs.latest_update) : 'Awaiting first report'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Blood Bank Reporting Summary</h2>
                <p className="text-xs text-slate-500">
                  Distribution of reported group statuses across registered hospital blood desks.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-lg font-bold font-mono tabular-nums text-emerald-800">
                    {data.blood_bank_summary.reported_available_entries}
                  </div>
                  <div className="text-[11px] text-emerald-700">Reported Avail.</div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="text-lg font-bold font-mono tabular-nums text-amber-800">
                    {data.blood_bank_summary.contact_to_confirm_entries}
                  </div>
                  <div className="text-[11px] text-amber-700">Contact to Confirm</div>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <div className="text-lg font-bold font-mono tabular-nums text-red-800">
                    {data.blood_bank_summary.reported_unavailable_entries}
                  </div>
                  <div className="text-[11px] text-red-700">Unavailable</div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-700">Recent Blood Bank Updates</div>
                {data.blood_bank_summary.recent_logs.length === 0 ? (
                  <div className="text-xs text-slate-500 py-2">
                    No blood bank status updates logged by hospital administrators yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {data.blood_bank_summary.recent_logs.map((log) => (
                      <div key={log.update_id} className="rounded border border-slate-100 bg-slate-50 p-2 text-xs">
                        <div className="font-semibold text-slate-900">{log.hospital_name}</div>
                        <div className="text-[#0F4C81]">{log.new_value}</div>
                        <div className="text-[11px] font-mono text-slate-500">{formatTimestamp(log.timestamp)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Hospital Update Frequency Leaderboard */}
          <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-base font-semibold text-slate-900">Hospital Update Frequency &amp; Reporting Reliability</h2>
              <p className="text-xs text-slate-500">
                Administrative reporting cadence across all registered hospitals (does not measure medical care quality).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-2.5">Hospital</th>
                    <th className="px-4 py-2.5">City</th>
                    <th className="px-4 py-2.5 text-right">Audit Updates</th>
                    <th className="px-4 py-2.5 text-right">Shift Bed Entries</th>
                    <th className="px-4 py-2.5">Reporting Reliability</th>
                    <th className="px-5 py-2.5">Last Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.hospital_frequency.map((item) => (
                    <tr
                      key={item.hospital_id}
                      onClick={() => onSelectHospital(item.hospital_id)}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-5 py-2.5 font-semibold text-[#0F4C81] hover:underline">
                        {item.hospital_name}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{item.city}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{item.total_updates}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{item.shift_reports_count}</td>
                      <td className="px-4 py-2.5 text-slate-700">{item.reliability_label}</td>
                      <td className="px-5 py-2.5 font-mono text-slate-500">
                        {item.last_updated ? formatTimestamp(item.last_updated) : 'Unreported'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}
