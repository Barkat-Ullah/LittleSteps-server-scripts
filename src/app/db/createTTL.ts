import { config } from "../../config";
import { MongoClient } from "mongodb";

export async function createMongoTTLIndex() {

  const dbUrl = config.db_url;
  if (!dbUrl) return;

  try {
    
    const client = new MongoClient(dbUrl, {
      directConnection: true 
    });
    
    await client.connect();
    
    const db = client.db();
    const collection = db.collection("PendingOtpSession");

    await collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 25 * 60, name: "otp_session_ttl" }
    );

    console.log("🧹 MongoDB TTL Index for PendingOtpSession verified/created successfully.");
    await client.close();
  } catch (error) {
    console.error("🚨 Failed to create MongoDB TTL index:", error);
  }
}