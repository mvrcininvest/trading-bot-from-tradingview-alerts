import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts, botActions, botPositions, botLogs } from '@/db/schema';
import { lt, sql } from 'drizzle-orm';

export async function DELETE(request: NextRequest) {
  try {
    // Find the maximum ID in the alerts table
    const maxIdResult = await db
      .select({ maxId: sql<number | null>`MAX(${alerts.id})` })
      .from(alerts);

    const maxId = maxIdResult[0]?.maxId;

    // If no alerts exist, return success with 0 deleted
    if (maxId === null) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: 'Usunięto 0 alertów, zachowano ostatni'
      }, { status: 200 });
    }

    // Count alerts to be deleted
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(alerts)
      .where(lt(alerts.id, maxId));
    
    const deletedCount = countResult[0]?.count || 0;

    // Delete related records from child tables first (to avoid foreign key constraint)
    // Delete from bot_logs where alertId < maxId
    await db
      .delete(botLogs)
      .where(lt(botLogs.alertId, maxId));

    // Delete from bot_actions where alertId < maxId
    await db
      .delete(botActions)
      .where(lt(botActions.alertId, maxId));

    // Delete from bot_positions where alertId < maxId
    await db
      .delete(botPositions)
      .where(lt(botPositions.alertId, maxId));

    // Now delete alerts WHERE id < maxId (keeps only the alert with highest ID)
    await db
      .delete(alerts)
      .where(lt(alerts.id, maxId));

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      message: `Usunięto ${deletedCount} alertów, zachowano ostatni`
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error))
    }, { status: 500 });
  }
}