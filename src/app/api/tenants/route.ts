import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isManagerWhitelisted } from '@/lib/security/managers';

// GET /api/tenants
// Returns tenants scoped by the calling user's role:
//   Manager       → all tenants
//   SupportWorker → only assigned tenants
// Uses the service client for the fetch and applies role-based scoping in code.
//
// Resilience: user resolution matches /api/me — auth_id lookup first, then an
// email-fallback that self-links auth_id. Whitelisted admin emails are always
// treated as Managers and their stored role is repaired if it has drifted.
// Without this, a whitelisted admin whose users row was created with a
// non-Manager role would silently see an empty list even though /api/stats
// (service client, no role filter) reports the real tenant count.

export async function GET() {
  try {
    const supabase = createClient();
    const svc      = createServiceClient();

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (!user || authErr) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 1) Resolve the DB user by auth_id, then by email (auto-linking auth_id).
    let { data: dbUser, error: userErr } = await svc
      .from('users')
      .select('id, email, role, is_active')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (userErr) throw new Error(userErr.message);

    if (!dbUser && user.email) {
      const { data: byEmail, error: emailErr } = await svc
        .from('users')
        .select('id, email, role, is_active')
        .eq('email', user.email.toLowerCase())
        .maybeSingle();

      if (emailErr) throw new Error(emailErr.message);

      if (byEmail) {
        await svc.from('users').update({ auth_id: user.id }).eq('id', byEmail.id);
        dbUser = byEmail;
      }
    }

    if (!dbUser) {
      return NextResponse.json({ error: 'NO_PROFILE' }, { status: 404 });
    }

    if (!dbUser.is_active) {
      return NextResponse.json({ error: 'Account deactivated' }, { status: 403 });
    }

    // 2) Whitelisted admins are always Managers. Repair the stored role too so
    //    every other API (RLS, permission checks) agrees from now on.
    let effectiveRole = dbUser.role;
    if (isManagerWhitelisted(dbUser.email) && dbUser.role !== 'Manager') {
      await svc.from('users').update({ role: 'Manager' }).eq('id', dbUser.id);
      effectiveRole = 'Manager';
    }

    // 3) Role-scoped fetch.
    let tenants;

    if (effectiveRole === 'Manager') {
      const { data, error } = await svc
        .from('tenants')
        .select('*')
        .order('full_name');
      if (error) throw new Error(error.message);
      tenants = data;
    } else if (effectiveRole === 'SupportWorker') {
      const { data: assignments, error: assignErr } = await svc
        .from('worker_tenant_assignments')
        .select('tenant_id')
        .eq('worker_id', dbUser.id);
      if (assignErr) throw new Error(assignErr.message);

      const tenantIds = (assignments ?? []).map((a) => a.tenant_id);
      if (tenantIds.length === 0) {
        return NextResponse.json({ tenants: [], role: effectiveRole });
      }

      const { data, error } = await svc
        .from('tenants')
        .select('*')
        .in('id', tenantIds)
        .order('full_name');
      if (error) throw new Error(error.message);
      tenants = data;
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ tenants: tenants ?? [], role: effectiveRole });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
