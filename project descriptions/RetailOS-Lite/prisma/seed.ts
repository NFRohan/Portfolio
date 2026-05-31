import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo123", 10);

  const rep = await prisma.user.upsert({
    where: { email: "rep@demo.com" },
    update: {},
    create: {
      email: "rep@demo.com",
      name: "Ayesha Rahman",
      passwordHash,
      role: "REP",
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@demo.com" },
    update: {},
    create: {
      email: "supervisor@demo.com",
      name: "Karim Supervisor",
      passwordHash,
      role: "SUPERVISOR",
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      email: "admin@demo.com",
      name: "RetailOS Admin",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Seeded:", { rep: rep.email, supervisor: supervisor.email, admin: admin.email });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
