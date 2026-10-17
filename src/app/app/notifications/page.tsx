import { BellIcon, CheckCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { NotificationsList } from "@/features/dashboard/widgets";
import { NotificationPreferences } from "@/features/communication/preferences";
import { markNotificationsRead } from "@/features/navigation/actions";
import { requireContext } from "@/server/auth/session";
import { listNotifications, NOTIFICATION_TYPES, notificationPreferences } from "@/server/services/communication";

export const metadata: Metadata = { title: "Notifications" };

/** Defaults mirror private.channel_enabled() in the database. */
const EMAIL_DEFAULT = new Set([
  "attendance.absence",
  "report_card.published",
  "invoice.issued",
  "payment.received",
  "leave.reviewed",
  "announcement.urgent",
]);

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireContext();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [{ rows, total }, prefs] = await Promise.all([listNotifications(ctx, page), notificationPreferences(ctx)]);
  const values: Record<string, boolean> = {};
  for (const t of Object.keys(NOTIFICATION_TYPES)) {
    values[`${t}|in_app`] = true;
    values[`${t}|email`] = EMAIL_DEFAULT.has(t);
    values[`${t}|sms`] = false;
  }
  for (const p of prefs) values[`${p.type}|${p.channel}`] = p.enabled;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Centre de notifications et préférences de réception."
        actions={
          rows.some((r) => !r.read_at) && (
            <form
              action={async () => {
                "use server";
                await markNotificationsRead();
              }}
            >
              <Button type="submit" variant="outline">
                <CheckCheckIcon /> Tout marquer comme lu
              </Button>
            </form>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="pt-3">
            {rows.length ? (
              <NotificationsList items={rows} />
            ) : (
              <EmptyState icon={BellIcon} title="Aucune notification" className="my-4" />
            )}
            <Pagination page={page} pageSize={30} total={total} basePath="/app/notifications" params={{}} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Préférences</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationPreferences types={Object.entries(NOTIFICATION_TYPES)} values={values} />
            <p className="text-muted-foreground mt-3 text-xs">
              Les SMS sont envoyés uniquement si l&apos;établissement a configuré un prestataire et si votre numéro est
              renseigné.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
