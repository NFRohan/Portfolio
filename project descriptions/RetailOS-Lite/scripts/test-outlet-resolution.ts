import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { submitOutletSelection } from "../lib/outlets";

const prisma = new PrismaClient();

async function main() {
  const suffix = Date.now().toString(36);
  const rep = await prisma.user.findFirstOrThrow({ where: { role: "REP" } });
  const outlet = await prisma.outlet.create({
    data: {
      name: `RBAC Test Outlet ${suffix}`,
      normalizedName: `rbac test outlet ${suffix}`,
      code: `RBAC-${suffix}`.toUpperCase(),
      latitude: 23.7501,
      longitude: 90.3901,
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
    },
  });

  try {
    const resolution = await submitOutletSelection({
      repId: rep.id,
      submittedName: outlet.name,
      submittedLat: outlet.latitude,
      submittedLng: outlet.longitude,
      selectedOutletId: outlet.id,
      forceNewOutlet: true,
    });

    assert.equal(resolution.created, false, "selected outlet must not create a new outlet");
    assert.equal(resolution.outlet.id, outlet.id, "selected outlet id should win over forceNewOutlet");
    assert.equal(resolution.outletSubmission?.matchedOutletId, outlet.id);
    assert.equal(resolution.outletSubmission?.createdOutletId, null);

    console.log("Outlet resolution regression passed.");
  } finally {
    await prisma.outletSubmission.deleteMany({
      where: {
        OR: [{ matchedOutletId: outlet.id }, { createdOutletId: outlet.id }],
      },
    });
    await prisma.outlet.delete({ where: { id: outlet.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
