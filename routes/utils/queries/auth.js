export const roleIdByNameQuery = (name) => ({
  text: "SELECT id FROM roles WHERE name = $1",
  values: [name],
});

export const insertUserQuery = ({ username, email, passwordHash, roleId }) => ({
  text: "INSERT INTO users (username, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id, username, email",
  values: [username, email, passwordHash, roleId],
});

export const userByUsernameQuery = (username) => ({
  text: "SELECT * FROM users WHERE username = $1",
  values: [username],
});

export const insertVerificationCodeQuery = (userId, code, expiresAt) => ({
  text: "INSERT INTO verification_codes (user_id, code, expires_at) VALUES ($1, $2, $3)",
  values: [userId, code, expiresAt],
});

export const activeVerificationCodeQuery = (userId, code) => ({
  text: "SELECT * FROM verification_codes WHERE user_id = $1 AND code = $2 AND expires_at > NOW()",
  values: [userId, code],
});

export const deleteVerificationCodesQuery = (userId) => ({
  text: "DELETE FROM verification_codes WHERE user_id = $1",
  values: [userId],
});

export const userWithPermissionsQuery = (userId) => ({
  text: `
        SELECT u.id, u.username, u.email, r.name as role, ARRAY_AGG(p.slug) as permissions
        FROM users u
        JOIN roles r ON u.role_id = r.id
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        WHERE u.id = $1
        GROUP BY u.id, r.name
      `,
  values: [userId],
});
