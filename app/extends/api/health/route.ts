import { registerExtensions } from '@extends/bootstrap';
import { NextResponse } from 'next/server';

export async function GET() {
  registerExtensions();
  return NextResponse.json({ ok: true, layer: 'extends' });
}
