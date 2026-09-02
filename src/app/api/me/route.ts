import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isManagerWhitelisted } from '@/lib/security/managers';

// GET /api/me
// Returns the current user's staff profile from the users table.
// Uses service-role client to bypass RLS, but verifies auth JWT first.
// Called by the dashboard to reliably get the user profile.

export async function GET() {
  try {
    const supabase = createClient();
    const svc      = createServiceClient();

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (!user || authErr) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use service client so RLS doesn't block the lookup
    let { data: dbUser, error } = await svc
      .from('users')
      .select('*')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If no row found by auth_id, check if a row exists with the same email.
    // If so, update its auth_id to link it.
    if (!dbUser && user.email) {
      const { data: byEmail, error: emailErr } = await svc
        .from('users')
        .select('*')
        .eq('email', user.email.toLowerCase())
        .maybeSingle();

      if (emailErr) {
        return NextResponse.json({ error: emailErr.message }, { status: 500 });
      }

      if (byEmail) {
        const { data: updated, error: updateErr } = await svc
          .from('users')
          .update({ auth_id: user.id })
          .eq('id', byEmail.id)
          .select()
          .single();

        if (updateErr) {
          return NextResponse.json({ error: `Failed to link auth ID: ${updateErr.message}` }, { status: 500 });
        }
        dbUser = updated;
      }
    }

    if (!dbUser) {
      return NextResponse.json({ error: 'NO_PROFILE', auth_id: user.id, email: user.email }, { status: 404 });
    }

    // Self-heal: whitelisted admin emails are always Managers. If the stored
    // role has drifted, repair it so every downstream permission check agrees.
    if (isManagerWhitelisted(dbUser.email) && dbUser.role !== 'Manager') {
      const { data: repaired, error: roleErr } = await svc
        .from('users')
        .update({ role: 'Manager' })
        .eq('id', dbUser.id)
        .select()
        .single();
      if (!roleErr && repaired) dbUser = repaired;
    }

    return NextResponse.json({ user: dbUser });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
