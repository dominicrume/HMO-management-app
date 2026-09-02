'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Bell, Link, ChevronRight, Loader2, AlertTriangle, X, Menu, Users, MoreVertical, Brain, FileText } from 'lucide-react';

import { Sidebar }      from '@/components/sidebar';
import LetterheadSwitcher, { type Brand } from '@/components/layout/LetterheadSwitcher';
import FormsPanel,      { type FormId }   from '@/components/layout/FormsPanel';
import PrintAllForms    from '@/components/layout/PrintAllForms';
import FormWorkspace    from '@/components/layout/FormWorkspace';
import AdminRecordModal from '@/components/modals/AdminRecordModal';
import AIBrainPanel     from '@/components/ai/AIBrainPanel';

import DashboardView    from '@/components/views/DashboardView';
import SessionsView     from '@/components/views/SessionsView';
import LedgerView       from '@/components/views/LedgerView';
import RiskView         from '@/components/views/RiskView';
import AuditView        from '@/components/views/AuditView';
import PrintView        from '@/components/views/PrintView';

import { createClient as createBrowserClient } from '@/lib/supabase/client';
import type { DbTenant, DbUser } from '@/types/database';

// ── Views that use the full-width layout (no forms panel) ──────────────────
// NOTE: 'ai-brain' is handled by its own case in renderCenter() below
const FULL_WIDTH_VIEWS = new Set(['dashboard', 'tenants', 'sessions', 'ledger', 'risk', 'audit', 'print', 'settings']);

export default function DashboardPage() {
  const router     = useRouter();
  const searchParams = useSearchParams();

  const [activeBrand,    setActiveBrand]    = useState<Brand>('mattys_place');
  const [activeNav,      setActiveNav]      = useState('personal');

  const [activeTenant,   setActiveTenant]   = useState<DbTenant | null>(null);
  const [activeForm,     setActiveForm]     = useState<FormId>('personal');
  const [tenantSearch,   setTenantSearch]   = useState('');
  const [tenants,        setTenants]        = useState<DbTenant[]>([]);
  const [currentUser,    setCurrentUser]    = useState<DbUser | null>(null);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [error,          setError]          = useState('');
  const [unpaidCount,    setUnpaidCount]    = useState(0);
  const [unpaidTotal,    setUnpaidTotal]    = useState(0);
  const [notifOpen,      setNotifOpen]      = useState(false);
  const [unpaidItems,    setUnpaidItems]    = useState<{ id: string; amount_due: number; amount_paid: number; tenant_id: string }[]>([]);
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [tenantPanelOpen, setTenantPanelOpen] = useState(false);
  const [isPrintingAll, setIsPrintingAll]     = useState(false);
  const [adminModal,     setAdminModal]     = useState<DbTenant | null>(null);
  const [urlParamsApplied, setUrlParamsApplied] = useState(false);
  const [rightPanelTab,  setRightPanelTab]  = useState<'forms'|'ai'>('forms');
  const [mobileTab,      setMobileTab]      = useState<'editor' | 'forms' | 'ai'>('editor');

  const supabase = createBrowserClient();

  // ── Load current user + tenants via server APIs (bypasses RLS correctly) ──

  const loadData = useCallback(async () => {
    setLoadingTenants(true);
    setError('');

    try {
      // 1. Verify auth via browser client (sets cookie, redirects if needed)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // 2. Load user profile via server API (service-role = reliable, no RLS block)
      const meRes = await fetch('/api/me');
      if (meRes.status === 401) { router.push('/login'); return; }

      if (meRes.status === 404) {
        // No users row — first-time Manager setup
        const setupRes = await fetch('/api/setup', { method: 'POST' });
        if (setupRes.ok) {
          loadData(); // Retry after setup creates the Manager row
          return;
        }
        const setupJson = await setupRes.json();
        throw new Error(setupJson.error ?? 'Account setup failed. Contact your administrator.');
      }

      if (!meRes.ok) {
        const meJson = await meRes.json().catch(() => ({}));
        throw new Error(meJson.error ?? 'Failed to load user profile');
      }

      const { user: dbUser } = await meRes.json();
      setCurrentUser(dbUser as DbUser);

      // 3. Load tenants via server API (applies correct role-based scoping server-side)
      const tenantsRes = await fetch('/api/tenants');
      if (!tenantsRes.ok) {
        const tj = await tenantsRes.json().catch(() => ({}));
        throw new Error(tj.error ?? 'Failed to load tenants');
      }
      const { tenants: tenantRows } = await tenantsRes.json();
      const rows = (tenantRows ?? []) as DbTenant[];
      setTenants(rows);

      // Sync selected tenant after refresh
      setActiveTenant((prev) => {
        if (!prev && rows.length > 0) return rows[0];
        if (prev) return rows.find((r) => r.id === prev.id) ?? prev;
        return prev;
      });

      // 4. Load unpaid charges via server API (RLS on service_charges also requires assignment check)
      try {
        const chargesRes = await fetch('/api/charges?unpaid=true');
        if (chargesRes.ok) {
          const { charges: cdata } = await chargesRes.json();
          const chargeList = (cdata ?? []) as { id: string; amount_due: number; amount_paid: number; tenant_id: string }[];
          setUnpaidCount(chargeList.length);
          setUnpaidTotal(chargeList.reduce((s, c) => s + (c.amount_due - c.amount_paid), 0));
          setUnpaidItems(chargeList);
        }
      } catch { /* non-fatal — dashboard widgets degrade gracefully */ }

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoadingTenants(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  // ── Apply URL params (?tenant=, ?form=) once tenants have loaded ──────────
  useEffect(() => {
    if (urlParamsApplied || loadingTenants || tenants.length === 0) return;
    const tenantParam = searchParams.get('tenant');
    const formParam   = searchParams.get('form') as FormId | null;
    if (tenantParam) {
      const found = tenants.find((t) => t.id === tenantParam);
      if (found) {
        setActiveTenant(found);
        setActiveNav(`tenant:${found.id}`);
      }
    }
    if (formParam) {
      setActiveForm(formParam);
      setActiveNav(formParam);
    }
    setUrlParamsApplied(true);
  }, [tenants, loadingTenants, searchParams, urlParamsApplied]);

  // Real-time tenant updates
  useEffect(() => {
    const channel = supabase
      .channel('tenants-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, loadData]);

  // ── Print Lifecycle listener ────────────────────────────────────────
  useEffect(() => {
    const handleAfterPrint = () => {
      setIsPrintingAll(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  // ── Navigation handler ────────────────────────────────────────────────

  const handleNavigate = useCallback((id: string) => {
    if (id === 'intake') {
      router.push('/intake/new');
      return;
    }
    
    if (id === 'ai') {
      if (activeTenant) {
        setActiveNav(`tenant:${activeTenant.id}`);
        setRightPanelTab('ai');
        setMobileTab('ai');
      } else {
        setActiveNav('ai');
      }
      return;
    }

    setActiveNav(id);
    setMobileTab('editor');
    
    if (!FULL_WIDTH_VIEWS.has(id)) {
      if (id.startsWith('tenant:')) {
        // If clicking a tenant and not explicitly asking for a form, default to personal
        setActiveForm('personal');
        setRightPanelTab('forms');
      } else {
        setActiveForm(id as FormId);
      }
    } else if (id === 'tenants') {
      setTenantPanelOpen(true);
    }
  }, [router, activeTenant]);

  const handleSignOut = () => {
    // Local scope clears the browser session synchronously — no server
    // round-trip — so the redirect fires immediately instead of waiting
    // seconds for Supabase's global sign-out call. The server-side session
    // is invalidated in the background; if it fails, the token expires soon.
    void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    void supabase.auth.signOut().catch(() => {});
    window.location.href = '/login';
  };

  const handlePrintAllForms = () => {
    setIsPrintingAll(true);
    setTimeout(() => {
      window.print();
    }, 800);
  };

  // ── Filtered tenant list ─────────────────────────────────────────────

  const searchQ = tenantSearch.toLowerCase();
  const filteredTenants = tenants.filter((t) =>
    (t.full_name ?? '').toLowerCase().includes(searchQ) ||
    (t.room_number ?? '').toLowerCase().includes(searchQ)
  );

  const activeCount = tenants.filter((t) => t.status === 'active').length;
  const isFullWidth = FULL_WIDTH_VIEWS.has(activeNav);

  // ── Center view renderer ─────────────────────────────────────────────

  const ViewFallback = () => (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
    </div>
  );

  const renderCenter = () => {
    switch (activeNav) {
      case 'dashboard':
      case 'tenants':
        return (
          <Suspense fallback={<ViewFallback />}>
            <DashboardView
              tenants={tenants}
              currentUser={currentUser}
              onNavigate={handleNavigate}
              onNewIntake={() => router.push('/intake/new')}
            />
          </Suspense>
        );

      case 'ai':
        return (
          <main className="flex-1 overflow-hidden bg-white flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-amber/10 flex items-center justify-center">
                <Brain className="w-8 h-8 text-amber" />
              </div>
              <div>
                <p className="text-navy font-bold text-sm mb-1">Select a Tenant to use the AI Brain</p>
                <p className="text-slate-400 text-xs">Choose a tenant from the list on the left to load their context into the AI Brain.</p>
              </div>
            </div>
          </main>
        );
      case 'sessions':
        return (
          <Suspense fallback={<ViewFallback />}>
            <SessionsView
              activeTenant={activeTenant}
              currentUser={currentUser}
              tenants={tenants}
            />
          </Suspense>
        );
      case 'ledger':
        return (
          <Suspense fallback={<ViewFallback />}>
            <LedgerView
              activeTenant={activeTenant}
              currentUser={currentUser}
              tenants={tenants}
              onRefresh={loadData}
            />
          </Suspense>
        );
      case 'risk':
        return (
          <Suspense fallback={<ViewFallback />}>
            <RiskView activeTenant={activeTenant} tenants={tenants} />
          </Suspense>
        );
      case 'audit':
        return (
          <Suspense fallback={<ViewFallback />}>
            <AuditView activeTenant={activeTenant} />
          </Suspense>
        );
      case 'print':
        return (
          <Suspense fallback={<ViewFallback />}>
            <PrintView tenants={tenants} activeTenant={activeTenant} />
          </Suspense>
        );
      case 'settings':
        return (
          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-lg font-black text-navy mb-1">Settings</h2>
              <p className="text-xs text-slate-400 mb-8">Account and system configuration for Matty&apos;s Place.</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                <div className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy">Signed in as</p>
                    <p className="text-xs text-slate-400 mt-0.5">{currentUser?.full_name ?? '—'} · {currentUser?.email ?? ''}</p>
                  </div>
                  <span className="text-xxs font-black uppercase px-2 py-1 bg-amber/20 text-amber-dark rounded-lg">
                    {currentUser?.role ?? 'Manager'}
                  </span>
                </div>
                <div className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy">Organisation</p>
                    <p className="text-xs text-slate-400 mt-0.5">Matty&apos;s Place — Birmingham HMO</p>
                  </div>
                </div>
                <div className="px-6 py-4">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </main>
        );
      default:
        // Any form nav — show the form workspace + forms panel
        // Viewport Optimization: Desktop gets side-by-side, mobile gets forms panel at the top (or hidden)
        return (
          <div className={`flex-1 min-w-0 flex flex-col min-h-0 ${isPrintingAll ? 'print:hidden' : ''}`}>
            {/* Mobile Viewport Segmented Tab Switcher */}
            <div className="xl:hidden no-print px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMobileTab('editor')}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-black py-2 rounded-lg transition-all ${
                    mobileTab === 'editor' ? 'bg-white shadow-sm text-navy' : 'text-slate-500 hover:text-navy'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Editor
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTab('forms')}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-black py-2 rounded-lg transition-all ${
                    mobileTab === 'forms' ? 'bg-white shadow-sm text-navy' : 'text-slate-500 hover:text-navy'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Forms Library
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTab('ai')}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-black py-2 rounded-lg transition-all ${
                    mobileTab === 'ai' ? 'bg-navy shadow-sm text-white' : 'text-slate-500 hover:text-navy'
                  }`}
                >
                  <Brain className="w-3.5 h-3.5" />
                  AI Brain
                </button>
              </div>
            </div>

            {/* Split layout: side-by-side on desktop (xl), tab-switched on mobile */}
            <div className="flex-1 flex flex-col xl:flex-row min-h-0 overflow-hidden">
              <div className={`flex-1 overflow-y-auto min-w-0 ${mobileTab === 'editor' ? 'block' : 'hidden xl:block'}`}>
                <FormWorkspace
                  brand={activeBrand}
                  activeForm={activeForm}
                  activeTenant={activeTenant?.full_name ?? 'No tenant selected'}
                  activeTenantObj={activeTenant}
                  workerId={currentUser?.id}
                  onSaved={loadData}
                />
              </div>
              <div className={`no-print w-full xl:w-[320px] flex-shrink-0 border-t xl:border-t-0 xl:border-l border-slate-200 bg-white flex-col flex-1 xl:h-full min-h-0 ${mobileTab !== 'editor' ? 'flex' : 'hidden xl:flex'}`}>
                <FormsPanel
                  activeTab={mobileTab === 'editor' ? rightPanelTab : (mobileTab as 'forms' | 'ai')}
                  onTabChange={(tab) => {
                    setRightPanelTab(tab);
                    setMobileTab(tab);
                  }}
                  workerId={currentUser?.id}
                  activeForm={activeForm}
                  onSelectForm={(id) => {
                    setActiveForm(id);
                    setMobileTab('editor'); // Automatically focus back to editor once form is selected!
                  }}
                  tenant={activeTenant}
                  onPrintAll={handlePrintAllForms}
                />
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-cream font-sans">

      {/* ── Mobile sidebar overlay ── */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ${
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ── Sidebar — collapsible on mobile ── */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transition-transform duration-300 lg:relative lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar
          activeView={activeNav as import('@/components/sidebar').SidebarView}
          onNavigate={(id) => { handleNavigate(id); setSidebarOpen(false); }}
          userRole={currentUser?.role === 'SupportWorker' ? 'SupportWorker' : 'Manager'}
          onSignOut={handleSignOut}
          userName={currentUser?.full_name ?? ''}
          tenantCount={tenants.length}
          riskCount={tenants.filter((t) => t.status === 'missing').length}
        />
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">

        {/* ── Dark system status bar — always visible ───────────────── */}
        <div className="no-print bg-navy flex items-center justify-between px-5 py-1.5 flex-shrink-0">
          <span className="text-xxs font-mono font-semibold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            System Status: Operational
          </span>
          <span className="text-xxs font-mono font-bold text-slate-500 uppercase tracking-widest">
            Official Use Only — Restricted Access
          </span>
          <span className="text-xxs font-mono font-semibold text-slate-500 uppercase tracking-widest">
            V2.9.1
          </span>
        </div>

        {/* ── Top header — V2.5.0 style ────────────────────────────── */}
        <header className="no-print h-12 bg-white border-b border-slate-200 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 z-10 flex-shrink-0">

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-4 h-4 text-slate-600" />
          </button>

          {/* Mobile tenant panel toggle */}
          <button
            type="button"
            onClick={() => setTenantPanelOpen((v) => !v)}
            className="lg:hidden w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center flex-shrink-0"
            aria-label="Toggle tenant list"
          >
            <Users className="w-4 h-4 text-slate-600" />
          </button>

          {/* Global search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Global search records, forms, or documents…"
              value={tenantSearch}
              onChange={(e) => setTenantSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-1.5
                         text-xs placeholder-slate-400 focus:outline-none focus:ring-2
                         focus:ring-amber/50 focus:border-amber transition-all"
            />
          </div>

          {/* Entity switcher */}
          <LetterheadSwitcher value={activeBrand} onChange={setActiveBrand} />

          {/* New intake */}
          <button
            type="button"
            onClick={() => router.push('/intake/new')}
            className="w-8 h-8 rounded-lg bg-navy text-white flex items-center justify-center
                       font-black text-lg hover:bg-navy/80 transition-colors flex-shrink-0"
            title="New tenant intake"
          >
            +
          </button>

          {/* Notifications bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Notifications"
              className="relative w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200
                         flex items-center justify-center transition-colors"
            >
              <Bell className="w-4 h-4 text-slate-500" />
              {unpaidCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber border-2 border-white" />
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-10 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="text-xs font-bold text-navy flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5" /> Notifications
                  </span>
                  <button type="button" onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-navy">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {unpaidCount === 0 ? (
                  <p className="px-4 py-6 text-xs text-slate-400 text-center">All caught up!</p>
                ) : (
                  <>
                    <div className="px-4 py-3 bg-amber/10 border-b border-amber/20">
                      <p className="text-xs font-bold text-amber-dark">
                        {unpaidCount} unpaid service charge{unpaidCount !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xxs text-slate-500 mt-0.5">Total outstanding: £{unpaidTotal.toFixed(2)}</p>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                      {unpaidItems.slice(0, 10).map((c) => {
                        const t = tenants.find((ten) => ten.id === c.tenant_id);
                        return (
                          <div key={c.id} className="px-4 py-2.5 flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-navy">{t?.full_name ?? 'Unknown'}</p>
                              <p className="text-xxs text-slate-400">{t?.room_number ?? ''}</p>
                            </div>
                            <span className="text-xs font-black text-red-500 font-mono">
                              £{(c.amount_due - c.amount_paid).toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-4 py-3 border-t border-slate-100">
                      <button type="button" onClick={() => { setNotifOpen(false); handleNavigate('ledger'); }}
                        className="w-full text-xs text-amber font-bold hover:text-amber-dark text-center">
                        View full ledger →
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* ── Three-panel body ─────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Tenant list — always visible ────────────────────────────── */}
          <aside className={`
            no-print bg-white border-r border-slate-200 flex flex-col overflow-hidden
            fixed inset-y-0 left-0 z-30 w-72 transition-transform duration-300
            lg:relative lg:translate-x-0 lg:w-60 lg:min-w-[240px]
            ${tenantPanelOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}>
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-navy">Tenants</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xxs bg-amber/20 text-amber-dark font-black px-2 py-0.5 rounded-full">
                    {activeCount} Active
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push('/intake/new')}
                    title="Add new tenant"
                    className="w-5 h-5 rounded-full bg-amber/20 hover:bg-amber text-amber-dark hover:text-navy flex items-center justify-center transition-colors font-black text-sm"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                <input
                  type="text"
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3
                             text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber/50"
                />
              </div>
            </div>

            {error && (
              <div className="m-3 flex flex-col gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xxs text-red-600">{error}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch('/api/setup', { method: 'POST' });
                      loadData();
                    }}
                    className="text-xxs font-bold text-amber-dark underline"
                  >
                    Setup Account
                  </button>
                  <button type="button" onClick={loadData} className="text-xxs font-bold text-red-600 underline">
                    Retry
                  </button>
                  <button type="button" onClick={handleSignOut} className="text-xxs font-bold text-red-600 underline">
                    Sign out
                  </button>
                </div>
              </div>
            )}

            {loadingTenants ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
              </div>
            ) : (
              <ul className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {filteredTenants.length === 0 ? (
                  <li className="px-4 py-6 text-center text-xs text-slate-400">
                    {tenantSearch ? 'No matches.' : (
                      <span>
                        No tenants yet.{' '}
                        <button type="button" onClick={() => router.push('/intake/new')} className="text-amber font-semibold">
                          Start intake →
                        </button>
                      </span>
                    )}
                  </li>
                ) : filteredTenants.map((tenant) => {
                  const isActive  = tenant.id === activeTenant?.id;
                  const nameStr   = tenant.full_name ?? '';
                  const initials  = nameStr
                    ? nameStr.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
                    : '?';
                  const isManager = currentUser?.role === 'Manager';

                  return (
                    <li key={tenant.id} className="relative group">
                      <button
                        type="button"
                        aria-label={`Select tenant ${tenant.full_name}`}
                        onClick={() => {
                          setActiveTenant(tenant);
                          // Only navigate to forms view if selecting a tenant from the global dashboard view.
                          // Otherwise, stay in the current view (e.g. Ledger) to see that tenant's specific data.
                          if (activeNav === 'dashboard' || activeNav === 'tenants') {
                            setActiveNav(activeForm);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all
                          ${isActive
                            ? 'bg-amber/10 border-l-2 border-amber'
                            : 'hover:bg-slate-50 border-l-2 border-transparent'
                          }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center
                          text-xxs font-black flex-shrink-0 relative
                          ${isActive ? 'bg-navy text-amber' : 'bg-slate-200 text-slate-500'}`}>
                          {initials}
                          {tenant.status === 'missing' && (
                            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate ${isActive ? 'text-navy' : 'text-slate-700'}`}>
                            {tenant.full_name}
                          </p>
                          <p className="text-xxs text-slate-400 truncate">
                            {tenant.room_number} ·{' '}
                            <span className={
                              tenant.status === 'active'   ? 'text-emerald-600' :
                              tenant.status === 'missing'  ? 'text-red-500 font-bold' :
                              tenant.status === 'inactive' ? 'text-amber-dark' : 'text-slate-400'
                            }>
                              {tenant.status}
                            </span>
                          </p>
                        </div>
                        {isActive && <ChevronRight className="w-3.5 h-3.5 text-amber flex-shrink-0" />}
                      </button>

                      {/* Manager-only admin context button */}
                      {isManager && (
                        <button
                          type="button"
                          title="Admin record management"
                          onClick={(e) => { e.stopPropagation(); setAdminModal(tenant); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md
                                     bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500
                                     flex items-center justify-center transition-all
                                     opacity-0 group-hover:opacity-100"
                          aria-label={`Admin options for ${tenant.full_name}`}
                        >
                          <MoreVertical className="w-3 h-3" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Stats footer */}
            <div className="border-t border-slate-100 px-4 py-3 grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-lg px-2 py-2 text-center">
                <p className="text-sm font-black text-navy">{tenants.length}</p>
                <p className="text-xxs text-slate-400 uppercase font-semibold">Total</p>
              </div>
              <div className="bg-amber/10 rounded-lg px-2 py-2 text-center">
                <button
                  type="button"
                  onClick={() => handleNavigate('ledger')}
                  className="w-full"
                >
                  <p className="text-sm font-black text-amber-dark">
                    £{unpaidTotal.toFixed(0)}
                  </p>
                  <p className="text-xxs text-slate-400 uppercase font-semibold">Owed</p>
                </button>
              </div>
            </div>
          </aside>

          {/* Mobile tenant panel overlay */}
          <div
            className={`fixed inset-0 bg-black/30 z-20 lg:hidden transition-opacity duration-300 ${
              tenantPanelOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setTenantPanelOpen(false)}
          />

          {/* ── Main content area — switches by activeNav ──────────────── */}
          {renderCenter()}

          {/* ── Hidden Print All Forms View ────────────────────────── */}
          {isPrintingAll && activeTenant && (
            <div className="hidden print:block absolute inset-0 bg-white z-50 print-all-overlay">
              <PrintAllForms tenant={activeTenant} brand={activeBrand} />
            </div>
          )}

        </div>
      </div>

      {/* ── Admin Record Modal — Manager only ───────────────────────── */}
      {adminModal && (
        <AdminRecordModal
          tenant={adminModal}
          onClose={() => setAdminModal(null)}
          onComplete={(action) => {
            setAdminModal(null);
            if (action === 'deleted') {
              // Remove tenant from list immediately
              setTenants((prev) => prev.filter((t) => t.id !== adminModal.id));
              if (activeTenant?.id === adminModal.id) setActiveTenant(null);
            }
            // Refresh data to get updated status
            loadData();
          }}
        />
      )}
    </div>
  );
}
