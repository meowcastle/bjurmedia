// One-shot bootstrap for a real deployment: creates a single staff/admin login with
// no demo data attached (unlike seed.ts, which is dev/demo-only and seeds fake
// clients). Run once against a fresh production database.
//
// Usage: npx tsx prisma/create-admin.ts "Full Name" you@example.com 'a-strong-password'

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const db = new PrismaClient();

async function main() {
  const [name, email, password] = process.argv.slice(2);

  if (!name || !email || !password) {
    console.error("Usage: npx tsx prisma/create-admin.ts \"Full Name\" you@example.com 'password'");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.error(`A user with email ${email} already exists (id: ${existing.id}).`);
    process.exit(1);
  }

  const user = await db.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      isAdmin: true,
      role: "OWNER",
    },
  });

  console.log(`Admin account created: ${user.email} (id: ${user.id})`);
  console.log(`Sign in at /admin/login.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
