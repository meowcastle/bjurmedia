import { db } from "@/lib/db";
import { AdminIntegrationsClient } from "@/components/AdminIntegrationsClient";

export default async function AdminIntegrationsPage() {
  const [config, clients, channels] = await Promise.all([
    db.slackConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }),
    db.client.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.clientChannel.findMany(),
  ]);

  const channelByClient = new Map(channels.map((c) => [c.clientId, c.channel]));

  return (
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
      }}
      clientRows={clients.map((c) => ({
        id: c.id,
        name: c.name,
        channel: channelByClient.get(c.id) ?? "",
      }))}
    />
  );
}
