import { db } from "@/lib/db";
import { AdminIntegrationsClient } from "@/components/AdminIntegrationsClient";
import { AdminSocialIntegrationsClient } from "@/components/AdminSocialIntegrationsClient";
import { AdminClientAccounts } from "@/components/AdminClientAccounts";

export default async function AdminIntegrationsPage() {
  const [config, clients, channels, socialConfig, socialAccounts] = await Promise.all([
    db.slackConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }),
    db.client.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.clientChannel.findMany(),
    db.socialConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }),
    db.socialAccount.findMany(),
  ]);

  const channelByClient = new Map(channels.map((c) => [c.clientId, c]));
  // Keyed by client+platform so a client with both accounts resolves each separately.
  const accountByKey = new Map(socialAccounts.map((a) => [`${a.clientId}:${a.platform}`, a]));
  const platformState = (clientId: string, platform: "INSTAGRAM" | "YOUTUBE") => {
    const a = accountByKey.get(`${clientId}:${platform}`);
    if (!a) return null;
    return {
      handle: a.handle,
      lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: a.lastSyncError,
    };
  };

  return (
    <>
      <AdminIntegrationsClient
        initialConfig={{
          connected: config.connected,
          webhookUrl: config.webhookUrl ?? "",
          defaultChannel: config.defaultChannel,
          weeklyDay: config.weeklyDay,
          weeklyTime: config.weeklyTime,
          autoWeekly: config.autoWeekly,
          autoContentCalendar: config.autoContentCalendar,
          autoUpload: config.autoUpload,
          autoDownload: config.autoDownload,
          autoLicense: config.autoLicense,
          autoSubmission: config.autoSubmission,
        }}
        clientRows={clients.map((c) => {
          const ch = channelByClient.get(c.id);
          return {
            id: c.id,
            name: c.name,
            channel: ch?.channel ?? "",
            autoPostSlack: ch?.autoPostSlack ?? false,
            autoPostDay: ch?.autoPostDay ?? 0,
            autoPostHour: ch?.autoPostHour ?? 21,
          };
        })}
      />
      <AdminClientAccounts
        rows={clients.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type.charAt(0) + c.type.slice(1).toLowerCase(),
          channel: channelByClient.get(c.id)?.channel ?? "",
          instagram: platformState(c.id, "INSTAGRAM"),
          youtube: platformState(c.id, "YOUTUBE"),
        }))}
      />
      <AdminSocialIntegrationsClient
        initialConfig={{
          youtubeApiKey: socialConfig.youtubeApiKey ?? "",
          weeklyDay: socialConfig.weeklyDay,
          weeklyTime: socialConfig.weeklyTime,
          autoWeekly: socialConfig.autoWeekly,
        }}
      />
    </>
  );
}
