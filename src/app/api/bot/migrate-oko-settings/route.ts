import { NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export async function POST() {
  try {
    console.log('🔧 Starting Oko Saurona & SMS settings migration...');

    // Check current schema
    const schemaCheck = await db.all(sql`PRAGMA table_info(bot_settings)`);
    const existingColumns = schemaCheck.map((col: any) => col.name);
    console.log('Existing columns:', existingColumns.length);

    const columnsToAdd = [
      { name: 'oko_check_frequency_seconds', type: 'INTEGER', default: '5' },
      { name: 'oko_account_drawdown_percent', type: 'REAL', default: '50.0' },
      { name: 'oko_account_drawdown_checks', type: 'INTEGER', default: '3' },
      { name: 'oko_capitulation_ban_duration_hours', type: 'INTEGER', default: '6' },
      { name: 'oko_capitulation_checks', type: 'INTEGER', default: '1' },
      { name: 'sms_alerts_enabled', type: 'INTEGER', default: '0' },
      { name: 'alert_phone_number', type: 'TEXT', default: 'NULL' },
      { name: 'twilio_account_sid', type: 'TEXT', default: 'NULL' },
      { name: 'twilio_auth_token', type: 'TEXT', default: 'NULL' },
      { name: 'twilio_phone_number', type: 'TEXT', default: 'NULL' },
    ];

    const added = [];
    const skipped = [];

    for (const column of columnsToAdd) {
      if (existingColumns.includes(column.name)) {
        skipped.push(column.name);
        console.log(`⏭️ Skipped ${column.name} (already exists)`);
        continue;
      }

      try {
        const defaultClause = column.default === 'NULL' 
          ? '' 
          : ` DEFAULT ${column.default} NOT NULL`;
        
        await db.run(sql.raw(
          `ALTER TABLE bot_settings ADD COLUMN ${column.name} ${column.type}${defaultClause}`
        ));
        
        added.push(column.name);
        console.log(`✅ Added ${column.name}`);
      } catch (e: any) {
        if (e.message?.includes('duplicate column')) {
          skipped.push(column.name);
          console.log(`⏭️ Skipped ${column.name} (duplicate)`);
        } else {
          throw e;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Migration completed: ${added.length} added, ${skipped.length} skipped`,
      added,
      skipped
    });
  } catch (error: any) {
    console.error('❌ Migration error:', error);

    return NextResponse.json({ 
      success: false, 
      error: 'Migration failed: ' + error.message 
    }, { status: 500 });
  }
}