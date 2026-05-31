import { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { Secret } from "jsonwebtoken";
import prisma from "../shared/prisma";
import { config } from "../config";
import { jwtHelpers } from "./jwtHelpers";
import { isTokenBlacklisted } from "../lib/redisConnection";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ExtendedWebSocket extends WebSocket {
  userId?: string;
  role?: "USER" | "ADMIN";
  isAlive?: boolean;
}

type IncomingMessage =
  | { event: "authenticate"; token: string }
  | {
      event: "message";
      receiverId: string;
      message: string;
      fileUrl?: string;
      fileName?: string;
    }
  | { event: "fetchChats"; receiverId: string }
  | { event: "onlineUsers" }
  | { event: "unReadMessages"; receiverId: string }
  | { event: "messageList" }
  | { event: "ping" };

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

export const onlineUsers = new Set<string>();
const userSockets = new Map<string, ExtendedWebSocket>();

const userSelect = {
  id: true,
  email: true,
  role: true,
  userDetails: {
    select: {
      firstName: true,
      lastName: true,
      files: true,
    },
  },
} as const;

const formatUser = (user: {
  id: string;
  email: string;
  role: string;
  userDetails: {
    firstName?: string | null;
    lastName?: string | null;
    files?: string | null;
  } | null;
}) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  fullName:
    [user.userDetails?.firstName, user.userDetails?.lastName]
      .filter(Boolean)
      .join(" ") || null,
  avatar: user.userDetails?.files ?? null,
});

const chatSelect = {
  id: true,
  message: true,
  fileUrl: true,
  fileName: true,
  isRead: true,
  createdAt: true,
  sender: { select: userSelect },
  receiver: { select: userSelect },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sendToSocket(ws: WebSocket, event: string, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

function sendError(ws: WebSocket, message: string) {
  sendToSocket(ws, "error", { message });
}

function broadcastToAll(wss: WebSocketServer, message: object) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

async function getOrCreateRoom(senderId: string, receiverId: string) {
  const existing = await prisma.room.findFirst({
    where: {
      OR: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    },
  });

  return (
    existing ??
    (await prisma.room.create({ data: { senderId, receiverId } }))
  );
}

async function markRoomAsRead(roomId: string, receiverId: string) {
  await prisma.chat.updateMany({
    where: { roomId, receiverId, isRead: false },
    data: { isRead: true },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup WebSocket
// ─────────────────────────────────────────────────────────────────────────────

export async function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server });

  // ── Heartbeat — dead connection detect ────────────────────────────────
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as ExtendedWebSocket;
      if (!ws.isAlive) {
        // Cleanup
        if (ws.userId) {
          onlineUsers.delete(ws.userId);
          userSockets.delete(ws.userId);
          broadcastToAll(wss, {
            event: "userStatus",
            data: { userId: ws.userId, isOnline: false },
          });
        }
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on("close", () => clearInterval(heartbeatInterval));

  wss.on("connection", (ws: ExtendedWebSocket) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (raw: Buffer) => {
      let parsedData: IncomingMessage;

      try {
        parsedData = JSON.parse(raw.toString());
      } catch {
        sendError(ws, "Invalid JSON");
        return;
      }

      if (parsedData.event === "ping") {
        sendToSocket(ws, "pong", null);
        return;
      }

      if (parsedData.event !== "authenticate" && !ws.userId) {
        sendError(ws, "Unauthorized: please authenticate first");
        return;
      }

      try {
        switch (parsedData.event) {

          // ── Authenticate ─────────────────────────────────────────────────
          case "authenticate": {
            const { token } = parsedData;
            const rawToken = token.replace(/^bearer /i, "").trim();

            // JWT verify 
            let decoded: any;
            try {
              decoded = jwtHelpers.verifyToken(
                rawToken,
                config.jwt.jwt_secret as Secret,
              );
            } catch {
              sendError(ws, "Invalid or expired token");
              ws.close();
              return;
            }

            if (!decoded?.id) {
              sendError(ws, "Invalid token payload");
              ws.close();
              return;
            }

            const blacklisted = await isTokenBlacklisted(rawToken).catch(() => false);
            if (blacklisted) {
              sendError(ws, "Token has been invalidated");
              ws.close();
              return;
            }
            const user = await prisma.user.findUnique({
              where: { id: decoded.id },
              select: { id: true, role: true, status: true, isDeleted: true },
            });

            if (!user || user.isDeleted) {
              sendError(ws, "User not found");
              ws.close();
              return;
            }

            if (user.status === "SUSPENDED") {
              sendError(ws, "Your account has been suspended");
              ws.close();
              return;
            }

            ws.userId = user.id;
            ws.role = user.role as "USER" | "ADMIN";
            ws.isAlive = true;

            onlineUsers.add(ws.userId);
            userSockets.set(ws.userId, ws);

            sendToSocket(ws, "authenticated", { userId: ws.userId });

            broadcastToAll(wss, {
              event: "userStatus",
              data: { userId: ws.userId, isOnline: true },
            });
            break;
          }

          // ── Send Message ─────────────────────────────────────────────────
          case "message": {
            const { receiverId, message, fileUrl, fileName } = parsedData;

            if (!message?.trim() && !fileUrl) {
              sendError(ws, "Message or file is required");
              return;
            }

            const receiver = await prisma.user.findUnique({
              where: { id: receiverId },
              select: { id: true },
            });

            if (!receiver) {
              sendError(ws, "Receiver not found");
              return;
            }

            const room = await getOrCreateRoom(ws.userId!, receiverId);

            const chat = await prisma.chat.create({
              data: {
                senderId: ws.userId!,
                receiverId,
                roomId: room.id,
                message: message?.trim() ?? "",
                fileUrl,
                fileName,
              },
              select: chatSelect,
            });

            // ✅ Response format 
            const formattedChat = {
              ...chat,
              sender: formatUser(chat.sender),
              receiver: formatUser(chat.receiver),
            };

            const receiverSocket = userSockets.get(receiverId);
            if (receiverSocket) {
              sendToSocket(receiverSocket, "message", formattedChat);
            }

            // Sender
            sendToSocket(ws, "message", formattedChat);
            break;
          }

          // ── Fetch Chat History ───────────────────────────────────────────
          case "fetchChats": {
            const { receiverId } = parsedData;

            const room = await prisma.room.findFirst({
              where: {
                OR: [
                  { senderId: ws.userId!, receiverId },
                  { senderId: receiverId, receiverId: ws.userId! },
                ],
              },
            });

            if (!room) {
              sendToSocket(ws, "fetchChats", []);
              return;
            }

            const [chats] = await Promise.all([
              prisma.chat.findMany({
                where: { roomId: room.id },
                orderBy: { createdAt: "asc" },
                select: chatSelect,
              }),
              markRoomAsRead(room.id, ws.userId!),
            ]);

            const formattedChats = chats.map((chat) => ({
              ...chat,
              sender: formatUser(chat.sender),
              receiver: formatUser(chat.receiver),
            }));

            sendToSocket(ws, "fetchChats", formattedChats);
            break;
          }

          // ── Online Users ─────────────────────────────────────────────────
          case "onlineUsers": {
            const users = await prisma.user.findMany({
              where: { id: { in: Array.from(onlineUsers) } },
              select: userSelect,
            });

            sendToSocket(ws, "onlineUsers", users.map(formatUser));
            break;
          }

          // ── Unread Messages ──────────────────────────────────────────────
          case "unReadMessages": {
            const { receiverId } = parsedData;

            const room = await prisma.room.findFirst({
              where: {
                OR: [
                  { senderId: ws.userId!, receiverId },
                  { senderId: receiverId, receiverId: ws.userId! },
                ],
              },
            });

            if (!room) {
              sendToSocket(ws, "unReadMessages", { messages: [], count: 0 });
              return;
            }

            const unreadMessages = await prisma.chat.findMany({
              where: { roomId: room.id, isRead: false, receiverId: ws.userId! },
              select: chatSelect,
            });

            sendToSocket(ws, "unReadMessages", {
              messages: unreadMessages.map((chat) => ({
                ...chat,
                sender: formatUser(chat.sender),
                receiver: formatUser(chat.receiver),
              })),
              count: unreadMessages.length,
            });
            break;
          }

          // ── Message List (conversation sidebar) ─────────────────────────
          case "messageList": {
            const rooms = await prisma.room.findMany({
              where: {
                OR: [
                  { senderId: ws.userId! },
                  { receiverId: ws.userId! },
                ],
              },
              include: {
                // last message
                chat: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: chatSelect,
                },
                // sender info
                sender: { select: userSelect },
                // receiver info
                receiver: { select: userSelect },
              },
              orderBy: { updatedAt: "desc" },
            });

            const messageList = rooms.map((room) => {
              const isCurrentUserSender = room.senderId === ws.userId;
              const otherUser = isCurrentUserSender ? room.receiver : room.sender;
              const lastMessage = room.chat[0] ?? null;

              return {
                roomId: room.id,
                user: formatUser(otherUser),
                lastMessage: lastMessage
                  ? {
                      ...lastMessage,
                      sender: formatUser(lastMessage.sender),
                      receiver: formatUser(lastMessage.receiver),
                    }
                  : null,
                isOnline: onlineUsers.has(otherUser.id),
              };
            });

            sendToSocket(ws, "messageList", messageList);
            break;
          }

          default:
            sendError(ws, `Unknown event: ${(parsedData as any).event}`);
        }
      } catch (error) {
        console.error("WebSocket handler error:", error);
        sendError(ws, "Internal server error");
      }
    });

    // ── Disconnect ────────────────────────────────────────────────────────
    ws.on("close", () => {
      if (ws.userId) {
        onlineUsers.delete(ws.userId);
        userSockets.delete(ws.userId);

        broadcastToAll(wss, {
          event: "userStatus",
          data: { userId: ws.userId, isOnline: false },
        });
      }
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err.message);
    });
  });

  return wss;
}