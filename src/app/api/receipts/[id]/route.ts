import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAppContext } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { receiptPdf } from "@/server/pdf/documents";
import { getPayment } from "@/server/services/finance";
import { pdfResponse, schoolHeader } from "@/server/services/school";

/** Payment receipt (PDF). Families can download receipts of their own children only (RLS). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const [p, school] = await Promise.all([getPayment(ctx, id), schoolHeader(ctx)]);
    const bytes = await receiptPdf(school, {
      ...p,
      amount: Number(p.amount),
      allocations: (p.payment_allocations ?? [])
        .filter((a) => a.is_active || p.status === "reversed")
        .map((a) => ({ amount: Number(a.amount), invoice: a.invoice ? { number: a.invoice.number, total: Number(a.invoice.total), balance: Number(a.invoice.balance) } : null })),
    });
    return pdfResponse(bytes, `recu-${p.receipt_number}.pdf`);
  } catch (e) {
    return errorResponse(e);
  }
}
