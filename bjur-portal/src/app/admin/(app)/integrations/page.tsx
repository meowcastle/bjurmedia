import { db } from "@/lib/db";
import { AdminIntegrationsClient } from "@/components/AdminIntegrationsClient";
import { AdminSocialIntegrationsClient } from "@/components/AdminSocialIntegrationsClient";

export default async function AdminIntegrationsPage() {
  const [config, clients, channels, socialConfig] = await Promise.all([
    db.slackConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }),
    db.client.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.clientChannel.findMany(),
    db.socialConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }),
  ]);

  const channelByClient = new Map(channels.map((c) => [c.clientId, c.channel]));

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
          autoUpload: config.autoUpload,
          autoDownload: config.autoDownload,
          autoLicense: config.autoLicense,
          autoSubmission: config.autoSubmission,
        }}
        clientRows={clients.map((c) => ({
          id: c.id,
          name: c.name,
          channel: channelByClient.get(c.id) ?? "",
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
