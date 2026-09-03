import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Здоров-чек API */
export async function GET() {
  return NextResponse.json({ ok: true, app: 'prompter-studio' });
}
