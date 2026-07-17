// One-shot cleanup: deletes every Asset row for a project (and its moved media +
// derived proxy/thumb files), but leaves the Project row and its inbox folder in
// place so the same source files can be re-dropped and re-ingested cleanly.
//
// Usage: npx tsx prisma/clear-project-assets.ts <clientUsername> <projectTitle>

import { rm } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { MEDIA_ROOT, DERIVED_ROOT } from "../src/lib/media";

const db = new PrismaClient();

async function main() {
  const [clientUsername, projectTitle] = process.argv.slice(2);
  if (!clientUsername || !projectTitle) {
    console.error("Usage: npx tsx prisma/clear-project-assets.ts <clientUsername> <projectTitle>");
    process.exit(1);
  }

  const project = await db.project.findFirst({
    where: { title: projectTitle, client: { username: clientUsername } },
    include: { assets: true, client: true },
  });
  if (!project) {
    console.error(`No project "${projectTitle}" found for client "${clientUsername}".`);
    process.exit(1);
  }

  console.log(`Clearing ${project.assets.length} asset(s) from "${project.title}" (${project.client.name})...`);

  for (const asset of project.assets) {
    await rm(path.join(MEDIA_ROOT, asset.relPath), { force: true });
    await rm(path.join(DERIVED_ROOT, asset.id), { recursive: true, force: true });
  }

  const { count } = await db.asset.deleteMany({ where: { projectId: project.id } });
  await db.project.update({ where: { id: project.id }, data: { status: "DRAFT", deliveredAt: null } });

  console.log(`Deleted ${count} asset record(s) and their files. Project reset to DRAFT — ready for a fresh drop.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
