import { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { db } from "@db";
import { users, calls } from "@db/schema";
import { eq } from "drizzle-orm";

export function setupSocket(server: HTTPServer) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const connectedUsers = new Map<number, string>();

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

    socket.on("call:start", async ({ receiverId }) => {
      try {
        if (!userId) {
          socket.emit("call:error", { message: "User not registered" });
          return;
        }

        // Get caller's username
        const [caller] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!caller) {
          socket.emit("call:error", { message: "Caller not found" });
          return;
        }

        const [call] = await db
          .insert(calls)
          .values({
            callerId: userId,
            receiverId,
            status: "pending",
            startTime: new Date()
          })
          .returning();

        const receiverSocket = connectedUsers.get(receiverId);
        if (receiverSocket) {
          // Send incoming call notification with caller's username
          io.to(receiverSocket).emit("call:incoming", {
            callId: call.id,
            from: userId,
            username: caller.username
          });
        }

        socket.emit("call:started", { callId: call.id });
      } catch (error) {
        console.error("Error starting call:", error);
        socket.emit("call:error", { message: "Failed to start call" });
      }
    });

    socket.on("call:accept", async ({ callId }) => {
      try {
        await db
          .update(calls)
          .set({ status: "active" })
          .where(eq(calls.id, callId));

        const [call] = await db
          .select()
          .from(calls)
          .where(eq(calls.id, callId))
          .limit(1);

        if (call) {
          const callerSocket = connectedUsers.get(call.callerId);
          if (callerSocket) {
            io.to(callerSocket).emit("call:accepted", { callId });
          }
        }
      } catch (error) {
        console.error("Error accepting call:", error);
        socket.emit("call:error", { message: "Failed to accept call" });
      }
    });

    socket.on("call:reject", async ({ callId }) => {
      try {
        await db
          .update(calls)
          .set({
            status: "rejected",
            endTime: new Date()
          })
          .where(eq(calls.id, callId));

        const [call] = await db
          .select()
          .from(calls)
          .where(eq(calls.id, callId))
          .limit(1);

        if (call) {
          const callerSocket = connectedUsers.get(call.callerId);
          if (callerSocket) {
            io.to(callerSocket).emit("call:rejected", { callId });
          }
        }
      } catch (error) {
        console.error("Error rejecting call:", error);
        socket.emit("call:error", { message: "Failed to reject call" });
      }
    });

    socket.on("disconnect", async () => {
      if (userId) {
        connectedUsers.delete(userId);

        await db
          .update(users)
          .set({ status: "offline" })
          .where(eq(users.id, userId));

        io.emit("userStatus", { userId, status: "offline" });
      }
    });

    socket.on("call:end", async ({ callId }) => {
      try {
        if (!callId) {
          socket.emit("call:error", { message: "Invalid call ID" });
          return;
        }

        const [existingCall] = await db
          .select()
          .from(calls)
          .where(eq(calls.id, callId))
          .limit(1);

        if (!existingCall) {
          socket.emit("call:error", { message: "Call not found" });
          return;
        }

        const [updatedCall] = await db
          .update(calls)
          .set({
            status: "completed",
            endTime: new Date()
          })
          .where(eq(calls.id, callId))
          .returning();

        if (updatedCall.roomId) {
          io.to(`room:${updatedCall.roomId}`).emit("call:ended", { callId });
        } else {
          const receiverSocket = connectedUsers.get(updatedCall.receiverId);
          if (receiverSocket) {
            io.to(receiverSocket).emit("call:ended", { callId });
          }
        }

        socket.emit("call:ended", { callId });
      } catch (error) {
        console.error("Error ending call:", error);
        socket.emit("call:error", { message: "Failed to end call" });
      }
    });

    socket.on("room:create", async ({ name }) => {
      try {
        const [room] = await db
          .insert(rooms)
          .values({
            name,
            createdBy: userId,
            isActive: true
          })
          .returning();

        if (!userId) {
          socket.emit("room:error", { message: "User not registered" });
          return;
        }

        await db.insert(roomParticipants).values({
          roomId: room.id,
          userId: userId
        });

        socket.join(`room:${room.id}`);
        userRooms.set(userId, room.id);
        socket.emit("room:created", room);
      } catch (error) {
        console.error("Error creating room:", error);
        socket.emit("room:error", { message: "Failed to create room" });
      }
    });

    socket.on("room:join", async ({ roomId }) => {
      try {
        if (!userId) {
          socket.emit("room:error", { message: "User not registered" });
          return;
        }

        const [room] = await db
          .select()
          .from(rooms)
          .where(eq(rooms.id, roomId))
          .limit(1);

        if (!room) {
          socket.emit("room:error", { message: "Room not found" });
          return;
        }

        await db.insert(roomParticipants).values({
          roomId,
          userId: userId,
          joinedAt: new Date()
        });

        socket.join(`room:${roomId}`);
        userRooms.set(userId, roomId);
        io.to(`room:${roomId}`).emit("user:joined", { userId });
      } catch (error) {
        console.error("Error joining room:", error);
        socket.emit("room:error", { message: "Failed to join room" });
      }
    });

    socket.on("room:leave", async ({ roomId }) => {
      try {
        if (!userId) {
          socket.emit("room:error", { message: "User not registered" });
          return;
        }

        await db
          .update(roomParticipants)
          .set({ leftAt: new Date() })
          .where(eq(roomParticipants.userId, userId));

        socket.leave(`room:${roomId}`);
        userRooms.delete(userId);
        io.to(`room:${roomId}`).emit("user:left", { userId });
      } catch (error) {
        console.error("Error leaving room:", error);
        socket.emit("room:error", { message: "Failed to leave room" });
      }
    });

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
  });

  return io;
}