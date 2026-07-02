import { Response } from 'express';

const clients = new Map<string, Set<Response>>();
let heartbeatStarted = false;

export const addSSEClient = (userId: string, res: Response) => {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
};

export const removeSSEClient = (userId: string, res: Response) => {
  clients.get(userId)?.delete(res);
  if (clients.get(userId)?.size === 0) clients.delete(userId);
};

export const sendSSEToUser = (userId: string, event: string, data: any) => {
  clients.get(userId)?.forEach(res => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
};

const startGlobalHeartbeat = () => {
  if (heartbeatStarted) {
    return;
  }

  heartbeatStarted = true;

  setInterval(() => {
    let activeCount = 0;

    clients.forEach((connections, userId) => {
      connections.forEach(res => {
        try {
          res.write(`: ping\n\n`);
          activeCount++;
        } catch {
          connections.delete(res);
          if (connections.size === 0) clients.delete(userId);
        }
      });
    });
  }, 20000);
};

startGlobalHeartbeat();
