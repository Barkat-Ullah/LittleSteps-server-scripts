import app from "./app";
import { config } from "./config";
import { initializeQueueSystem } from "./helpers/queue-manager/queueManager";

function main() {
  try {
    if (process.env.IS_WORKER === "true") {
      console.log("🚀 [Worker Mode] Starting Background Job Worker Process...");
      initializeQueueSystem();
      return;
    }

    console.log("🌐 [API Mode] Preparing Express Server...");
    const desiredPort = Number(config.port || 5000);

    const tryListen = (port: number) => {
      return new Promise<{ port: number }>((resolve, reject) => {
        const server = app.listen(port, () => {
          resolve({ port });
        });

        server.on("error", (err: any) => {
          reject(err);
        });
      });
    };

    tryListen(desiredPort)
      .then(async (result) => {
        console.log(`🚀 Server running on http://localhost:${result.port}`);
      })
      .catch(async (err: any) => {
        if (err?.code !== "EADDRINUSE") {
          throw err;
        }

        // If the preferred port is busy, automatically try the next few ports.
        for (let offset = 1; offset <= 20; offset++) {
          const port = desiredPort + offset;
          try {
            const result = await tryListen(port);
            console.warn(
              `⚠️ Port ${desiredPort} is in use; switched to ${result.port}`,
            );
            console.log(`🚀 Server running on http://localhost:${result.port}`);
            return;
          } catch (e: any) {
            if (e?.code !== "EADDRINUSE") {
              throw e;
            }
          }
        }

        // Final fallback: use ephemeral port (0 = OS chooses)
        try {
          const result = await tryListen(0);
          console.warn(
            `⚠️ Ports ${desiredPort}-${desiredPort + 20} are in use; switched to ${
              result.port
            }`,
          );
          console.log(`🚀 Server running on http://localhost:${result.port}`);
        } catch (e) {
          console.error("❗ Server startup error:", e);
          process.exit(1);
        }
      });
  } catch (error) {
    console.error("❗ Server startup error:", error);
    process.exit(1);
  }
}

main();
