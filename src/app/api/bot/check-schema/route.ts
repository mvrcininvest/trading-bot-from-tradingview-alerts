import { NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    // Get table schema from SQLite
    const result = await db.all(sql`PRAGMA table_info(bot_settings)`);
    
    const columnNames = result.map((col: any) => col.name);
    
    return NextResponse.json({ 
      success: true,
      totalColumns: columnNames.length,
      columnNames: columnNames.sort()
    });
  } catch (error: any) {
    console.error('Schema check error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}