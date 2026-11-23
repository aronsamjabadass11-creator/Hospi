import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  BedDouble,
  Building2,
  Droplets,
  Globe,
  Home,
  Lock,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  Search,
  ShieldCheck,
  Siren,
  X,
} from 'lucide-react';
import {
  fetchCurrentUser,
  fetchFreshnessSettings,
  fetchOverview,
  getStoredToken,
  searchHospitals,
  setStoredToken,
} from './lib/api.ts';
import { useLanguage } from './i18n/LanguageContext.tsx';
import { DEFAULT_FRESHNESS_THRESHOLDS, type FreshnessThresholds } from './shared/freshness.ts';
import type { AuthUser, DistanceOrigin, HospitalSummary, OverviewStats } from './shared/types.ts';
import { SimulatedDataNotice } from './components/TrustIndicators.tsx';
import { HomeDashboard, type ModuleKey } from './pages/HomeDashboard.tsx';
import { HospitalSearch } from './pages/HospitalSearch.tsx';
import { HospitalDetails } from './pages/HospitalDetails.tsx';
import { BedAvailability } from './pages/BedAvailability.tsx';
import { BloodBankPage } from './pages/BloodBankPage.tsx';
import { EmergencyServices } from './pages/EmergencyServices.tsx';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard.tsx';
import { HospitalAdmin } from './pages/HospitalAdmin.tsx';
import { VerificationCentre } from './pages/VerificationCentre.tsx';

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [activeModule, setActiveModule] = useState<ModuleKey>('home');
  const [selectedHospitalId, setSelectedHospitalId] = useState<number>(1);
  const [searchPreset, setSearchPreset] = useState<{
    city?: string;
    requireIcu?: boolean;
    query?: string;
  } | null>(null);

  const [thresholds, setThresholds] = useState<FreshnessThresholds>(DEFAULT_FRESHNESS_THRESHOLDS);
  const [origin, setOrigin] = useState<DistanceOrigin | null>(null);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [hospitals, setHospitals] = useState<HospitalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);

  const NAV_ITEMS: Array<{ key: ModuleKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'home', label: t.nav.home, icon: Home },
    { key: 'search', label: t.nav.search, icon: Search },
    { key: 'details', label: t.nav.details, icon: Building2 },
    { key: 'beds', label: t.nav.beds, icon: BedDouble },
    { key: 'blood', label: t.nav.blood, icon: Droplets },
    { key: 'emergency', label: t.nav.emergency, icon: Siren },
    { key: 'analytics', label: t.nav.analytics, icon: BarChart3 },
    { key: 'admin', label: t.nav.admin, icon: Lock },
    { key: 'verification', label: t.nav.verification, icon: ShieldCheck },
  ];

  // Hydrate persisted freshness thresholds on startup
  useEffect(() => {
    fetchFreshnessSettings()
      .then((res) => setThresholds(res.thresholds))
      .catch(() => {
        // fallback to default
      });
  }, []);

  const loadPlatformData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, hospRes] = await Promise.all([
        fetchOverview(thresholds),
        searchHospitals(
          origin ? { originLat: origin.lat, originLng: origin.lng } : {},
          thresholds
        ),
      ]);
      setOverview(ov);
      setHospitals(hospRes.hospitals);
      if (hospRes.hospitals.length > 0 && !hospRes.hospitals.some((h) => h.hospital_id === selectedHospitalId)) {
        setSelectedHospitalId(hospRes.hospitals[0].hospital_id);
      }
    } catch (err) {
      console.error('Platform data fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [thresholds, origin, selectedHospitalId]);

  useEffect(() => {
    loadPlatformData();
  }, [loadPlatformData, refreshTrigger]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    fetchCurrentUser()
      .then((res) => setAuthUser(res.user))
      .catch(() => {
        setStoredToken(null);
        setAuthUser(null);
      });
  }, []);

  const handleNavigate = (
    module: ModuleKey,
    preset?: { city?: string; requireIcu?: boolean; query?: string }
  ) => {
    if (preset) {
      setSearchPreset({ ...preset });
    }
    setActiveModule(module);
    setMobileMenuOpen(false);
  };

  const handleSelectHospital = (hospitalId: number) => {
    setSelectedHospitalId(hospitalId);
    setActiveModule('details');
    setMobileMenuOpen(false);
  };

  const handleDataUpdated = () => {
    setRefreshTrigger((n) => n + 1);
  };

  const activeNav = NAV_ITEMS.find((n) => n.key === activeModule) || NAV_ITEMS[0];
  const cities = overview?.cities || ['Salem', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Chennai', 'Erode'];
  const specialties = overview?.specialties || [];

  return (
    <div className="min-h-screen flex bg-[#F4F7FA] text-slate-900">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white transition-all duration-200 ${
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-64'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0F4C81] text-white font-bold text-sm shrink-0">
              H+
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="text-base font-bold tracking-tight text-slate-900 leading-none truncate">
                  HOSPIFIND
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 truncate">{t.brandSubtitle}</div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3 overflow-y-auto" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.key;
            return (
              <button
                key={item.key}
                type="button"
                title={item.label}
                onClick={() => handleNavigate(item.key)}
                className={`w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#EAF2FA] text-[#0F4C81] font-semibold'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                } ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#0F4C81]' : 'text-slate-400'}`} />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="border-t border-slate-200 p-4 text-xs text-slate-600 space-y-1.5">
            <div className="font-semibold text-slate-800 truncate">
              {authUser ? `${t.common.signedInAs}: ${authUser.display_name}` : t.common.publicView}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {authUser
                ? authUser.role === 'super_admin'
                  ? 'Role: Central Super Admin'
                  : `Hospital: ${authUser.hospital_name}`
                : t.common.readOnly}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-64 flex-col bg-white border-r border-slate-200">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <span className="font-bold text-slate-900">HOSPIFIND</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleNavigate(item.key)}
                    className={`w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                      isActive ? 'bg-[#EAF2FA] text-[#0F4C81] font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-64'
        }`}
      >
        {/* Top Context Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 truncate">
              <span className="font-medium text-slate-800">HOSPIFIND</span>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-[#0F4C81] truncate">{activeNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Language Switcher */}
            <div className="inline-flex items-center rounded-md border border-slate-300 bg-slate-50 p-0.5 text-xs">
              <Globe className="h-3.5 w-3.5 text-slate-500 ml-1.5 mr-1" />
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`rounded px-2 py-1 font-semibold transition-colors ${
                  language === 'en' ? 'bg-white text-[#0F4C81] shadow-xs' : 'text-slate-600'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('ta')}
                className={`rounded px-2 py-1 font-semibold transition-colors ${
                  language === 'ta' ? 'bg-white text-[#0F4C81] shadow-xs' : 'text-slate-600'
                }`}
              >
                தமிழ்
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleNavigate('admin')}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              {authUser ? t.common.adminWorkspace : t.common.adminLogin}
            </button>
          </div>
        </header>

        <SimulatedDataNotice onOpenEmergency={() => setEmergencyModalOpen(true)} />

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeModule === 'home' && (
            <HomeDashboard
              overview={overview}
              hospitals={hospitals}
              loading={loading}
              origin={origin}
              onChangeOrigin={setOrigin}
              onNavigate={handleNavigate}
              onSelectHospital={handleSelectHospital}
            />
          )}

          {activeModule === 'search' && (
            <HospitalSearch
              cities={cities}
              specialties={specialties}
              thresholds={thresholds}
              origin={origin}
              onChangeOrigin={setOrigin}
              preset={searchPreset}
              onSelectHospital={handleSelectHospital}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeModule === 'details' && (
            <HospitalDetails
              hospitalId={selectedHospitalId}
              hospitals={hospitals}
              thresholds={thresholds}
              origin={origin}
              onChangeHospital={setSelectedHospitalId}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeModule === 'beds' && (
            <BedAvailability
              hospitals={hospitals}
              cities={cities}
              onSelectHospital={handleSelectHospital}
            />
          )}

          {activeModule === 'blood' && (
            <BloodBankPage
              cities={cities}
              thresholds={thresholds}
              onSelectHospital={handleSelectHospital}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeModule === 'emergency' && (
            <EmergencyServices
              cities={cities}
              thresholds={thresholds}
              origin={origin}
              onChangeOrigin={setOrigin}
              onSelectHospital={handleSelectHospital}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeModule === 'analytics' && (
            <AnalyticsDashboard
              thresholds={thresholds}
              onSelectHospital={handleSelectHospital}
              onNavigateAdmin={() => handleNavigate('admin')}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeModule === 'admin' && (
            <HospitalAdmin
              authUser={authUser}
              thresholds={thresholds}
              onAuthChange={setAuthUser}
              onDataUpdated={handleDataUpdated}
              onNavigateVerification={() => handleNavigate('verification')}
            />
          )}

          {activeModule === 'verification' && (
            <VerificationCentre
              authUser={authUser}
              hospitals={hospitals}
              thresholds={thresholds}
              onUpdateThresholds={setThresholds}
              onSelectHospital={handleSelectHospital}
              onNavigateAdminLogin={() => handleNavigate('admin')}
              onDataUpdated={handleDataUpdated}
              refreshTrigger={refreshTrigger}
            />
          )}
        </main>

        <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <div>
            HOSPIFIND — Intelligent Hospital Resource Discovery &amp; Coordination System · &ldquo;{t.tagline}&rdquo;
          </div>
          <div>{t.emergency.disclaimer}</div>
        </footer>
      </div>

      {/* Persistent Quick Emergency Modal */}
      {emergencyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-red-700">
                <Siren className="h-5 w-5 shrink-0" />
                <h2 className="text-base font-bold text-red-950">Emergency Access &amp; Helpline</h2>
              </div>
              <button
                type="button"
                onClick={() => setEmergencyModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-700"
                aria-label="Close emergency modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">{t.emergency.disclaimer}</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <a
                href="tel:112"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700"
              >
                <PhoneCall className="h-4 w-4" />
                <span>{t.emergency.dial112}</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  setEmergencyModalOpen(false);
                  handleNavigate('emergency');
                }}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#0F4C81] bg-white px-4 py-3 text-sm font-semibold text-[#0F4C81] hover:bg-blue-50"
              >
                <Siren className="h-4 w-4" />
                <span>{t.emergency.locator}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
