import { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { db } from "@db";
import { users, calls, rooms, roomParticipants } from "@db/schema";
import { eq } from "drizzle-orm";

export function setupSocket(server: HTTPServer) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const connectedUsers = new Map<number, string>();
  const userRooms = new Map<number, number>();

  io.on("connection", (socket) => {
    let userId: number;

    socket.on("register", async (id: number) => {
      userId = id;
      connectedUsers.set(id, socket.id);

      await db
        .update(users)
        .set({ status: "online" })
        .where(eq(users.id, id));

      io.emit("userStatus", { userId: id, status: "online" });
    });

    socket.on("disconnect", async () => {
      if (userId) {
        connectedUsers.delete(userId);

        // If user was in a room, mark them as left
        const roomId = userRooms.get(userId);
        if (roomId) {
          await db
            .update(roomParticipants)
            .set({ leftAt: new Date() })
            .where(eq(roomParticipants.userId, userId));

          userRooms.delete(userId);
          socket.leave(`room:${roomId}`);
          io.to(`room:${roomId}`).emit("user:left", { userId });
        }

        await db
          .update(users)
          .set({ status: "offline" })
          .where(eq(users.id, userId));

        io.emit("userStatus", { userId, status: "offline" });
      }
    });

    // Room Management
    socket.on("room:create", async ({ name }) => {
      const [room] = await db
        .insert(rooms)
        .values({
          name,
          createdBy: userId,
          isActive: true
        })
        .returning();

      await db.insert(roomParticipants).values({
        roomId: room.id,
        userId: userId
      });

      socket.join(`room:${room.id}`);
      userRooms.set(userId, room.id);
      socket.emit("room:created", room);
    });

    socket.on("room:join", async ({ roomId }) => {
      await db.insert(roomParticipants).values({
        roomId,
        userId
      });

      socket.join(`room:${roomId}`);
      userRooms.set(userId, roomId);
      io.to(`room:${roomId}`).emit("user:joined", { userId });
    });

    socket.on("room:leave", async ({ roomId }) => {
      await db
        .update(roomParticipants)
        .set({ leftAt: new Date() })
        .where(eq(roomParticipants.userId, userId));

      socket.leave(`room:${roomId}`);
      userRooms.delete(userId);
      io.to(`room:${roomId}`).emit("user:left", { userId });
    });

    // WebRTC Signaling for Group Calls
    socket.on("signal", ({ to, signal, roomId }) => {
      const toSocket = connectedUsers.get(to);
      if (toSocket) {
        io.to(toSocket).emit("signal", {
          from: userId,
          signal,
          roomId
        });
      }
    });

    // Call Events
    socket.on("call:start", async ({ roomId }) => {
      const [call] = await db.insert(calls).values({
        callerId: userId,
        receiverId: userId, // For group calls, caller and receiver are same
        roomId,
        status: "active",
        startTime: new Date()
      }).returning();

      io.to(`room:${roomId}`).emit("call:started", { callId: call.id });
    });

    socket.on("call:end", async ({ callId, roomId }) => {
      await db
        .update(calls)
        .set({
          status: "completed",
          endTime: new Date()
        })
        .where(eq(calls.id, callId));

      if (roomId) {
        io.to(`room:${roomId}`).emit("call:ended", { from: userId });
      }
    });
  });

  return io;
}