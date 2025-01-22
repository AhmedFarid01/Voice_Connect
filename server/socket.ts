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

    socket.on("call:end", async ({ callId }) => {
      try {
        if (!callId) {
          socket.emit("call:error", { message: "Invalid call ID" });
          return;
        }

        // First find the call to ensure it exists and get its data
        const [existingCall] = await db
          .select()
          .from(calls)
          .where(eq(calls.id, callId))
          .limit(1);

        if (!existingCall) {
          socket.emit("call:error", { message: "Call not found" });
          return;
        }

        // Update the call status
        const [updatedCall] = await db
          .update(calls)
          .set({
            status: "completed",
            endTime: new Date()
          })
          .where(eq(calls.id, callId))
          .returning();

        // Handle room-based calls
        if (updatedCall.roomId) {
          io.to(`room:${updatedCall.roomId}`).emit("call:ended", { callId });
        } else {
          // Handle direct calls
          const receiverSocket = connectedUsers.get(updatedCall.receiverId);
          if (receiverSocket) {
            io.to(receiverSocket).emit("call:ended", { callId });
          }
        }

        socket.emit("call:ended", { callId }); // Notify the caller
      } catch (error) {
        console.error("Error ending call:", error);
        socket.emit("call:error", { message: "Failed to end call" });
      }
    });

    // Room Management
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

        // Check if room exists
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

    // WebRTC Signaling
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
    socket.on("call:start", async ({ receiverId }) => {
      try {
        if (!userId) {
          socket.emit("call:error", { message: "User not registered" });
          return;
        }

        if (!receiverId || typeof receiverId !== 'number') {
          socket.emit("call:error", { message: "Invalid receiver ID" });
          return;
        }

        // Check if receiver exists
        const [receiver] = await db
          .select()
          .from(users)
          .where(eq(users.id, receiverId))
          .limit(1);

        if (!receiver) {
          socket.emit("call:error", { message: "Receiver not found" });
          return;
        }

        const [call] = await db.insert(calls).values({
          callerId: userId,
          receiverId,
          status: "active",
          startTime: new Date()
        }).returning();

        const toSocket = connectedUsers.get(receiverId);
        if (toSocket) {
          io.to(toSocket).emit("call:incoming", { callId: call.id, from: userId });
        }

        socket.emit("call:started", { callId: call.id });
      } catch (error) {
        console.error("Error starting call:", error);
        socket.emit("call:error", { message: "Failed to start call" });
      }
    });
  });

  return io;
}