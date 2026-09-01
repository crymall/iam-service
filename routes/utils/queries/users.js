export const usersForSyncQuery = () => ({
  text: "SELECT id, username FROM users ORDER BY username ASC",
  values: [],
});

export const usersWithRolesQuery = () => ({
  text: `
        SELECT u.id, u.username, u.email, r.name as role 
        FROM users u 
        JOIN roles r ON u.role_id = r.id 
        ORDER BY u.id ASC;
      `,
  values: [],
});

export const userWithRoleQuery = (userId) => ({
  text: `
        SELECT u.id, u.username, u.email, r.name as role 
        FROM users u 
        JOIN roles r ON u.role_id = r.id 
        WHERE u.id = $1;
      `,
  values: [userId],
});

export const userRoleNameQuery = (userId) => ({
  text: `SELECT r.name FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1`,
  values: [userId],
});

export const deleteUserQuery = (userId) => ({
  text: "DELETE FROM users WHERE id = $1",
  values: [userId],
});

export const updateUserRoleQuery = (userId, roleId) => ({
  text: "UPDATE users SET role_id = $1 WHERE id = $2",
  values: [roleId, userId],
});
