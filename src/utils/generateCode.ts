export function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";

  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Insert hyphen in the middle (after 4th char)
  return result.slice(0, 4) + "-" + result.slice(4);
}
