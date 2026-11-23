import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  PhoneCall,
  ShieldAlert,
  ShieldCheck,
  Siren,
  XCircle,
} from 'lucide-react';
import { formatTimestamp } from '../shared/freshness.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import type {
  FreshnessResult,
  HospitalSummary,
  ReportingReliabilitySummary,
  VerificationStatus,
} from '../shared/types.ts';

export function FreshnessIndicator({
  freshness,
  compact = false,
}: {
  freshness: FreshnessResult;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const styles = {
    GREEN: {
      wrap: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      Icon: CheckCircle2,
      text: t.freshness.GREEN,
    },
    YELLOW: {
      wrap: 'bg-amber-50 text-amber-800 border-amber-200',
      Icon: Clock,
      text: t.freshness.YELLOW,
    },
    RED: {
      wrap: 'bg-red-50 text-red-800 border-red-200',
      Icon: AlertTriangle,
      text: t.freshness.RED,
    },
    UNKNOWN: {
      wrap: 'bg-slate-100 text-slate-700 border-slate-200',
      Icon: HelpCircle,
      text: t.freshness.UNKNOWN,
    },
  }[freshness.level];

  const Icon = styles.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${styles.wrap}`}
      title={freshness.description}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{styles.text}</span>
      {!compact && <span className="font-mono tabular-nums opacity-80">· {freshness.relativeTime}</span>}
    </span>
  );
}

export function VerificationIndicator({ status }: { status: VerificationStatus }) {
  const { t } = useLanguage();
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-[#0F4C81] whitespace-nowrap shrink-0">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span>{t.verification.verified}</span>
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 whitespace-nowrap shrink-0">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{t.verification.rejected}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap shrink-0">
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      <span>{t.verification.pending}</span>
    </span>
  );
}

export function ReportingReliabilityBadge({ reliability }: { reliability?: ReportingReliabilitySummary }) {
  if (!reliability) return null;
  const colorMap: Record<ReportingReliabilitySummary['status_label'], string> = {
    'Consistent Reporting': 'bg-emerald-50 text-emerald-800 border-emerald-200',
    'Intermittent Reporting': 'bg-amber-50 text-amber-800 border-amber-200',
    'Overdue / Low Reporting': 'bg-red-50 text-red-800 border-red-200',
    'No Shift Reports Yet': 'bg-slate-100 text-slate-600 border-slate-200',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${colorMap[reliability.status_label]}`}
      title="Administrative shift reporting reliability (does not represent clinical quality or medical safety)"
    >
      <span>Reporting: {reliability.status_label}</span>
      {reliability.compliance_rate !== null && (
        <span className="font-mono tabular-nums">({reliability.compliance_rate}%)</span>
      )}
    </span>
  );
}

export function TrustEngineBreakdown({ hospital }: { hospital: HospitalSummary }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Resource Freshness &amp; Trust Engine</h4>
          <div className="text-[11px] text-slate-500">Directory Source: {hospital.data_source}</div>
        </div>
        <FreshnessIndicator freshness={hospital.overall_freshness} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <div className="text-xs font-medium text-slate-500">1. Hospital Directory Identity</div>
          <div className="mt-1">
            <VerificationIndicator status={hospital.verification_status} />
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {hospital.verification_status === 'verified'
              ? 'Name, address, phone, and coordinates verified from public hospital/district records.'
              : 'Facility identity verification is pending review.'}
          </p>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-500">2. Hospital-Reported Live Beds</div>
          <div className="mt-1 text-xs font-medium text-slate-900 font-mono tabular-nums">
            {hospital.latest_update ? formatTimestamp(hospital.latest_update) : 'No live shift report yet'}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {hospital.latest_updated_by
              ? `Updated by: ${hospital.latest_updated_by}`
              : 'Live bed occupancy is unreported until submitted by hospital desk.'}
          </p>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-500">3. Independent Confirmation</div>
          <div className="mt-1 text-xs font-semibold text-slate-900">
            {hospital.independent_confirmation
              ? 'Audited by Trust Desk'
              : 'Call Hospital Desk to Confirm'}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {hospital.independent_confirmation_note ||
              `Published capacity (~${hospital.published_total_beds} beds) does not guarantee live vacancy. Call ${hospital.phone}.`}
          </p>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-500">4. Reporting Reliability</div>
          <div className="mt-1">
            <ReportingReliabilityBadge reliability={hospital.reliability} />
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {hospital.reliability && hospital.reliability.completed_reports > 0
              ? `${hospital.reliability.completed_reports}/${hospital.reliability.expected_reports} shift cycles logged · Avg delay: ${hospital.reliability.avg_delay_minutes ?? 0}m.`
              : 'Measures shift reporting frequency only—not clinical care quality.'}
          </p>
        </div>
      </div>

      {(hospital.overall_freshness.requiresWarning || hospital.verification_status !== 'verified') && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
          <span>
            {hospital.verification_status !== 'verified'
              ? 'Warning: This hospital registration is pending review. '
              : ''}
            {hospital.overall_freshness.requiresWarning
              ? `${hospital.overall_freshness.description} Confirm directly at ${hospital.phone} before travel.`
              : ''}
          </span>
        </div>
      )}
    </div>
  );
}

export function SimulatedDataNotice({ onOpenEmergency }: { onOpenEmergency?: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="font-semibold text-[#0F4C81] shrink-0">TAMIL NADU VERIFIED DIRECTORY</span>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span className="truncate sm:whitespace-normal">{t.emergency.directoryNotice}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onOpenEmergency && (
          <button
            type="button"
            onClick={onOpenEmergency}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 whitespace-nowrap"
          >
            <Siren className="h-3.5 w-3.5" />
            <span>{t.emergency.locator}</span>
          </button>
        )}
        <a
          href="tel:112"
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 transition-colors whitespace-nowrap"
        >
          <PhoneCall className="h-3.5 w-3.5" />
          <span>{t.emergency.helpline}</span>
        </a>
      </div>
    </div>
  );
}

export function DisclaimerBar() {
  const { t } = useLanguage();
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 flex items-start gap-2.5">
      <ShieldAlert className="h-4 w-4 text-[#0F4C81] shrink-0 mt-0.5" />
      <span>{t.emergency.disclaimer}</span>
    </div>
  );
}

export function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm & Save',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg space-y-4">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{message}</p>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A63]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
