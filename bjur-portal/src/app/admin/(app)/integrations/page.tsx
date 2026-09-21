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
          workspace: config.workspace,
          webhookUrl: config.webhookUrl ?? "",
          defaultChannel: config.defaultChannel,
          autoUpload: config.autoUpload,
          autoDownload: config.autoDownload,
          autoSubmission: config.autoSubmission,
        }}
        clientRows={clients.map((c) => ({
          id: c.id,
          name: c.name,
          accentColor: c.accentColor,
          channel: channelByClient.get(c.id)?.channel ?? "",
          // The handles, not a count: "@57nyc · @57NYCtv" answers "which account is this
          // posting as", which is the question anyone actually has here.
          accounts: socialAccounts
            .filter((a) => a.clientId === c.id && a.handle)
            .map((a) => a.handle)
            .join(" · "),
          autoCaption: c.autoCaption,
        }))}
      />
      <AdminClientAccounts
        rows={clients.map((c) => ({
          id: c.id,
          name: c.name,
          channel: channelByClient.get(c.id)?.channel ?? "",
          accentColor: c.accentColor,
          logoUrl: c.logoUrl,
          instagram: platformState(c.id, "INSTAGRAM"),
          youtube: platformState(c.id, "YOUTUBE"),
        }))}
      />
      <AdminSocialIntegrationsClient
        initialConfig={{
          youtubeApiKey: socialConfig.youtubeApiKey ?? "",
        }}
      />
    </>
  );
}
