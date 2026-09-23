export const prerender = true;

// This file is no longer needed as load function moved to +page.server.js
// Keeping it for compatibility, but the server will handle the data loading
export async function load({ data }) {
  // Pass through the data from +page.server.js
  return data;
}
