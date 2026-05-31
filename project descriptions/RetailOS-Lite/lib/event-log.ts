import type { Role } from "@prisma/client";

export type EventActor = {
  actorId?: string;
  actorRole?: Role | string;
  actorType: "user" | "system" | "worker";
};

export function userEventActor(user: { id: string; role: Role | string }): EventActor {
  return {
    actorId: user.id,
    actorRole: user.role,
    actorType: "user",
  };
}
