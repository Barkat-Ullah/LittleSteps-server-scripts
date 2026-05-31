import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { mailQueue, otpQueue } from "../queue";

const serverAdapter = new ExpressAdapter();

// All queues you want to monitor
const queues = [new BullMQAdapter(otpQueue), new BullMQAdapter(mailQueue)];

createBullBoard({ queues, serverAdapter });

export const bullBoardBasePath = "/admin/queues";
serverAdapter.setBasePath(bullBoardBasePath);

export const bullBoard = serverAdapter.getRouter();
