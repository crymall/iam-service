import express from "express";
import pool from "../config/db.js";
import {
  authenticateApiKey,
  authenticateToken,
  authorizePermissions,
} from "../middleware/authorize.js";
import { syncUserDeletionToSubApps } from "../services/userSync.js";
import {
  usersForSyncQuery,
  usersWithRolesQuery,
  userWithRoleQuery,
  userRoleNameQuery,
  deleteUserQuery,
  updateUserRoleQuery,
} from "./utils/queries/users.js";
import { numericParam } from "./utils/validation/params.js";
import { roleChangeError } from "./utils/validation/users.js";

const usersRouter = express.Router();

usersRouter.param("id", numericParam("id"));

// Machine-readable user list for the sync-users backfill script in
// midden-infra. Registered before /:id so "sync" isn't captured as an id.
usersRouter.get("/sync", authenticateApiKey, async (req, res, next) => {
  try {
    const result = await pool.query(usersForSyncQuery());
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

usersRouter.get(
  "/",
  authenticateToken,
  async (req, res, next) => {
    try {
      const result = await pool.query(usersWithRolesQuery());
      res.json({ users: result.rows });
    } catch (err) {
      next(err);
    }
  },
);

usersRouter.get(
  "/:id",
  authenticateToken,
  async (req, res, next) => {
    const userId = req.params.id;

    try {
      const result = await pool.query(userWithRoleQuery(userId));

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ user: result.rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

usersRouter.delete(
  "/:id",
  authenticateToken,
  authorizePermissions("write:users"),
  async (req, res, next) => {
    const userId = req.params.id;

    try {
      const userRes = await pool.query(userRoleNameQuery(userId));

      if (userRes.rowCount === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      if (userRes.rows[0].name === "Admin") {
        return res.status(403).json({ error: "Cannot delete an Admin user" });
      }

      await pool.query(deleteUserQuery(userId));

      await syncUserDeletionToSubApps(userId);

      res.json({ message: "User deleted successfully" });
    } catch (err) {
      next(err);
    }
  },
);

usersRouter.patch(
  "/:id/role",
  authenticateToken,
  authorizePermissions("write:users"),
  async (req, res, next) => {
    const payloadError = roleChangeError(req.body);
    if (payloadError) {
      return res.status(400).json({ error: payloadError });
    }

    const { roleId } = req.body;
    const userId = req.params.id;

    try {
      const userRes = await pool.query(userRoleNameQuery(userId));

      if (userRes.rowCount === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      if (userRes.rows[0].name === "Admin") {
        return res.status(403).json({ error: "Cannot modify role of an Admin user" });
      }

      await pool.query(updateUserRoleQuery(userId, roleId));

      res.json({ message: "User role updated" });
    } catch (err) {
      next(err);
    }
  },
);

export default usersRouter;
