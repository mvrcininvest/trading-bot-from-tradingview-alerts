import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate ID parameter exists and is valid
    if (!id || isNaN(parseInt(id)) || parseInt(id) <= 0) {
      return NextResponse.json({
        error: "Valid positive integer ID is required",
        code: "INVALID_ID"
      }, { status: 400 });
    }

    const alertId = parseInt(id);

    // Check if alert exists before deletion
    const existingAlert = await db.select()
      .from(alerts)
      .where(eq(alerts.id, alertId))
      .limit(1);

    if (existingAlert.length === 0) {
      return NextResponse.json({
        error: "Alert not found",
        code: "ALERT_NOT_FOUND"
      }, { status: 404 });
    }

    // Delete the alert record
    const deleted = await db.delete(alerts)
      .where(eq(alerts.id, alertId))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({
        error: "Failed to delete alert",
        code: "DELETE_FAILED"
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Alert deleted successfully",
      deletedId: alertId
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE alert error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + error,
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}