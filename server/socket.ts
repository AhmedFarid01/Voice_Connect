import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import { db } from "@db";
import { users, broadcasts } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import {
  bindNotifications,
  trackUserSocket,
  untrackUserSocket,
  notifyFollowersOfLive,
} from "./notifications";

interface SessionData {
  userId?: number;
  username?: string;
}

export function setupSocket(server: HTTPServer): Server {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  bindNotifications(io);

  // Boot reconciliation: any broadcast still flagged isLive at startup is a
  // zombie — the host process can't have survived a server restart, and our
  // in-memory hostBySocket / viewersByBroadcast maps are empty. Wipe them.
  db
    .update(broadcasts)
    .set({ isLive: false, endedAt: new Date() })
    .where(eq(broadcasts.isLive, true))
    .then((res) => {
      const count = (res as unknown as { count?: number })?.count;
      if (count) console.log(`[socket] reconciled ${count} stale live broadcast(s) on startup`);
    })
    .catch((err) => console.error("[socket] live broadcast reconciliation failed", err));

  // socketId -> { userId, username }
  const sessions = new Map<string, SessionData>();
  // broadcastId -> host socketId
  const hostBySocket = new Map<number, string>();
  // broadcastId -> Set<viewer socketIds>
  const viewersByBroadcast = new Map<number, Set<string>>();

  io.on("connection", (socket: Socket) => {
    sessions.set(socket.id, {});

    socket.on("auth", async ({ userId }: { userId: number }) => {
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (u) {
        sessions.set(socket.id, { userId: u.id, username: u.username });
        trackUserSocket(u.id, socket.id);
        await db.update(users).set({ status: "online" }).where(eq(users.id, u.id));
        io.emit("user:status", { userId: u.id, status: "online" });
      }
    });

    // ── Live broadcast: host side ───────────────────────────────────────
    socket.on("live:host:start", async ({ broadcastId }: { broadcastId: number }) => {
      const sess = sessions.get(socket.id);
      if (!sess?.userId) return;

      const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId)).limit(1);
      if (!b || b.hostId !== sess.userId) {
        socket.emit("live:error", { message: "Not the host" });
        return;
      }

      socket.join(`live:${broadcastId}`);
      hostBySocket.set(broadcastId, socket.id);
      const existingViewers = viewersByBroadcast.get(broadcastId) ?? new Set<string>();
      viewersByBroadcast.set(broadcastId, existingViewers);

      await db
        .update(broadcasts)
        .set({ isLive: true, viewerCount: existingViewers.size })
        .where(eq(broadcasts.id, broadcastId));

      io.emit("broadcast:started", {
        broadcastId,
        hostId: sess.userId,
        title: b.title,
      });

      socket.emit("live:host:ready", { broadcastId });

      // Anyone who joined while we were still warming up: trigger an offer now.
      Array.from(existingViewers).forEach((viewerSocketId) => {
        const viewerSess = sessions.get(viewerSocketId);
        socket.emit("live:viewer:joined", {
          viewerId: viewerSocketId,
          username: viewerSess?.username,
        });
      });

      // Fan out a 'live' notification to all followers.
      notifyFollowersOfLive(sess.userId, broadcastId, b.title).catch((err) =>
        console.error("notifyFollowersOfLive", err),
      );
    });

    // viewer asks to join → host gets notified to create an offer
    socket.on("live:viewer:join", async ({ broadcastId }: { broadcastId: number }) => {
      const sess = sessions.get(socket.id);
      if (!sess?.userId) return;

      const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId)).limit(1);
      if (!b) {
        socket.emit("live:error", { message: "Broadcast not found" });
        return;
      }
      if (b.endedAt) {
        socket.emit("broadcast:ended", { broadcastId });
        return;
      }

      // If the row says it's live but our in-memory map has no host socket
      // (or the recorded socket is no longer connected), it's a zombie.
      // Mark it ended and tell the viewer.
      let hostSocketId = hostBySocket.get(broadcastId);
      if (hostSocketId && !io.sockets.sockets.get(hostSocketId)) {
        hostBySocket.delete(broadcastId);
        viewersByBroadcast.delete(broadcastId);
        hostSocketId = undefined;
      }

      if (b.isLive && !hostSocketId) {
        await db
          .update(broadcasts)
          .set({ isLive: false, endedAt: new Date() })
          .where(eq(broadcasts.id, broadcastId));
        socket.emit("broadcast:ended", { broadcastId });
        return;
      }

      socket.join(`live:${broadcastId}`);
      const viewers = viewersByBroadcast.get(broadcastId) ?? new Set<string>();
      viewers.add(socket.id);
      viewersByBroadcast.set(broadcastId, viewers);

      await db
        .update(broadcasts)
        .set({ viewerCount: viewers.size })
        .where(eq(broadcasts.id, broadcastId));

      io.to(`live:${broadcastId}`).emit("live:viewers", { count: viewers.size });

      if (hostSocketId) {
        io.to(hostSocketId).emit("live:viewer:joined", {
          viewerId: socket.id,
          username: sess.username,
        });
      } else {
        // Host hasn't connected yet — they'll catch us on live:host:start.
        socket.emit("live:waiting-host", { broadcastId });
      }
    });

    socket.on("live:viewer:leave", async ({ broadcastId }: { broadcastId: number }) => {
      socket.leave(`live:${broadcastId}`);
      const viewers = viewersByBroadcast.get(broadcastId);
      if (viewers) {
        viewers.delete(socket.id);
        await db
          .update(broadcasts)
          .set({ viewerCount: viewers.size })
          .where(eq(broadcasts.id, broadcastId));
        io.to(`live:${broadcastId}`).emit("live:viewers", { count: viewers.size });
      }
      const hostSocketId = hostBySocket.get(broadcastId);
      if (hostSocketId) {
        io.to(hostSocketId).emit("live:viewer:left", { viewerId: socket.id });
      }
    });

    // WebRTC signaling: host ↔ specific viewer
    socket.on("live:signal", ({ to, signal, broadcastId }: { to: string; signal: any; broadcastId: number }) => {
      io.to(to).emit("live:signal", {
        from: socket.id,
        signal,
        broadcastId,
      });
    });

    // Live chat in broadcast room
    socket.on("live:chat", async ({ broadcastId, message }: { broadcastId: number; message: string }) => {
      const sess = sessions.get(socket.id);
      if (!sess?.userId || !message?.trim()) return;
      io.to(`live:${broadcastId}`).emit("live:chat", {
        userId: sess.userId,
        username: sess.username,
        message: message.slice(0, 300),
        ts: Date.now(),
      });
    });

    // Floating emoji reactions during live broadcasts.
    socket.on(
      "live:reaction",
      ({ broadcastId, emoji }: { broadcastId: number; emoji: string }) => {
        const sess = sessions.get(socket.id);
        if (!sess?.userId) return;
        if (!emoji || typeof emoji !== "string") return;
        // Hard cap per emoji length so it can't be abused as a chat channel.
        const safe = emoji.slice(0, 8);
        io.to(`live:${broadcastId}`).emit("live:reaction", {
          userId: sess.userId,
          emoji: safe,
          ts: Date.now(),
        });
      },
    );

    socket.on("live:host:end", async ({ broadcastId }: { broadcastId: number }) => {
      const sess = sessions.get(socket.id);
      if (!sess?.userId) return;
      const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId)).limit(1);
      if (!b || b.hostId !== sess.userId) return;

      await db
        .update(broadcasts)
        .set({ isLive: false, endedAt: new Date() })
        .where(eq(broadcasts.id, broadcastId));

      io.to(`live:${broadcastId}`).emit("broadcast:ended", { broadcastId });
      hostBySocket.delete(broadcastId);
      viewersByBroadcast.delete(broadcastId);
    });

    socket.on("disconnect", async () => {
      const sess = sessions.get(socket.id);

      // If host, end every broadcast they own
      const hostEntries = Array.from(hostBySocket.entries());
      for (const [bid, hostSid] of hostEntries) {
        if (hostSid === socket.id) {
          await db
            .update(broadcasts)
            .set({ isLive: false, endedAt: new Date() })
            .where(eq(broadcasts.id, bid));
          io.to(`live:${bid}`).emit("broadcast:ended", { broadcastId: bid });
          hostBySocket.delete(bid);
          viewersByBroadcast.delete(bid);
        }
      }

      // If viewer, decrement counts
      const viewerEntries = Array.from(viewersByBroadcast.entries());
      for (const [bid, viewers] of viewerEntries) {
        if (viewers.delete(socket.id)) {
          await db
            .update(broadcasts)
            .set({ viewerCount: viewers.size })
            .where(eq(broadcasts.id, bid));
          io.to(`live:${bid}`).emit("live:viewers", { count: viewers.size });
          const hostSid = hostBySocket.get(bid);
          if (hostSid) io.to(hostSid).emit("live:viewer:left", { viewerId: socket.id });
        }
      }

      if (sess?.userId) {
        untrackUserSocket(sess.userId, socket.id);
        await db.update(users).set({ status: "offline" }).where(eq(users.id, sess.userId));
        io.emit("user:status", { userId: sess.userId, status: "offline" });
      }
      sessions.delete(socket.id);
    });
  });

  return io;
}
