import type { Server as IOServer } from "socket.io";
import { db } from "@db";
import { notifications, follows, users } from "@db/schema";
import { eq } from "drizzle-orm";

export type NotificationType = "follow" | "like" | "comment" | "live";

interface CreateArgs {
  userId: number;
  actorId?: number | null;
  type: NotificationType;
  videoId?: number | null;
  broadcastId?: number | null;
  content?: string | null;
}

let ioRef: IOServer | null = null;
// userId -> Set<socketId>. Populated by socket.ts on auth/disconnect.
const userSockets = new Map<number, Set<string>>();

export function bindNotifications(io: IOServer) {
  ioRef = io;
}

export function trackUserSocket(userId: number, socketId: string) {
  let set = userSockets.get(userId);
  if (!set) {
    set = new Set();
    userSockets.set(userId, set);
  }
  set.add(socketId);
}

export function untrackUserSocket(userId: number, socketId: string) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userSockets.delete(userId);
}

function emitToUser(userId: number, event: string, payload: unknown) {
  if (!ioRef) return;
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return;
  Array.from(sockets).forEach((sid) => ioRef!.to(sid).emit(event, payload));
}

export async function createNotification(args: CreateArgs) {
  if (args.userId === args.actorId) return null; // never notify yourself
  const [n] = await db
    .insert(notifications)
    .values({
      userId: args.userId,
      actorId: args.actorId ?? null,
      type: args.type,
      videoId: args.videoId ?? null,
      broadcastId: args.broadcastId ?? null,
      content: args.content ?? null,
    })
    .returning();
  emitToUser(args.userId, "notification:new", n);
  return n;
}

// Fan out a 'live' notification to all followers of the host.
export async function notifyFollowersOfLive(hostId: number, broadcastId: number, title: string) {
  const followers = await db
    .select({ id: follows.followerId })
    .from(follows)
    .where(eq(follows.followingId, hostId));

  const [host] = await db.select().from(users).where(eq(users.id, hostId)).limit(1);
  const display = host?.displayName || host?.username || "Someone";

  await Promise.all(
    followers.map((f) =>
      createNotification({
        userId: f.id,
        actorId: hostId,
        type: "live",
        broadcastId,
        content: `${display} is live: ${title}`,
      }),
    ),
  );
}
