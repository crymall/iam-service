// Pushes user lifecycle events to every downstream sub-app (canteen, netbook,
// and any future service implementing the POST /users { username, iam_id } /
// DELETE /users/sync/:id contract). Failures are logged and swallowed: sub-app
// sync must never block an IAM operation, and the sync-users backfill script
// in midden-infra reconciles any misses.

const subAppUrls = () =>
  (process.env.USER_SYNC_API_URLS || "")
    .split(",")
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter(Boolean);

export const syncUserToSubApps = async (user) => {
  for (const baseUrl of subAppUrls()) {
    try {
      const response = await fetch(`${baseUrl}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.MIDDEN_API_KEY,
        },
        body: JSON.stringify({
          username: user.username,
          iam_id: user.id,
        }),
      });

      if (!response.ok) {
        console.error(
          `Failed to sync user to ${baseUrl}:`,
          await response.text(),
        );
      }
    } catch (err) {
      console.error(`Error syncing user to ${baseUrl}:`, err);
    }
  }
};

export const syncUserDeletionToSubApps = async (userId) => {
  for (const baseUrl of subAppUrls()) {
    try {
      const response = await fetch(`${baseUrl}/users/sync/${userId}`, {
        method: "DELETE",
        headers: {
          "x-api-key": process.env.MIDDEN_API_KEY,
        },
      });

      // 404 means the sub-app never had this user — nothing to clean up.
      if (!response.ok && response.status !== 404) {
        console.error(
          `Failed to sync user deletion to ${baseUrl}:`,
          await response.text(),
        );
      }
    } catch (err) {
      console.error(`Error syncing user deletion to ${baseUrl}:`, err);
    }
  }
};
