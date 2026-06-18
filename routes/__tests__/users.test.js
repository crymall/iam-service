import { jest } from '@jest/globals';
import { faker } from '@faker-js/faker';

// 1. Mock Database
const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/db.js', () => ({
  default: {
    query: mockQuery,
  },
}));

// 2. Mock Middleware
// We bypass actual JWT checks to test the route logic directly.
// We assume the user is authenticated for these unit tests.
jest.unstable_mockModule('../../middleware/authorize.js', () => ({
  authenticateToken: (req, res, next) => next(),
  authorizePermissions: (permission) => (req, res, next) => next(),
}));

// 3. Mock Auth Router (Isolation)
// Prevents loading the auth routes and their dependencies
jest.unstable_mockModule('../auth.js', () => ({
  default: (req, res, next) => next(),
}));

// 4. Import app and supertest dynamically AFTER mocks are defined
const { default: app } = await import('../../app.js');
const request = (await import('supertest')).default;

describe('Users API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /users', () => {
    it('should return a list of users', async () => {
      const mockUsers = [
        { id: 1, username: faker.internet.userName(), email: faker.internet.email(), role: 'Admin' },
        { id: 2, username: faker.internet.userName(), email: faker.internet.email(), role: 'User' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockUsers });

      const res = await request(app).get('/users');

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2);
      expect(res.body.users[0]).toHaveProperty('username', mockUsers[0].username);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT u.id'));
    });

    it('should handle database errors', async () => {
      // Conditionally suppress console.error for the expected DB error
      const originalError = console.error;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation((err, ...args) => {
        if (err && err.message === 'DB Error') return;
        originalError.call(console, err, ...args);
      });

      mockQuery.mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app).get('/users');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'Database error');
      consoleSpy.mockRestore();
    });
  });

  describe('GET /users/:id', () => {
    it('should return a single user successfully', async () => {
      const mockUser = {
        id: 1,
        username: faker.internet.userName(),
        email: faker.internet.email(),
        role: 'Editor',
      };

      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [mockUser] });

      const res = await request(app).get('/users/1');

      expect(res.status).toBe(200);
      expect(res.body.user).toHaveProperty('username', mockUser.username);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE u.id = $1'), ['1']);
    });

    it('should return 404 if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const res = await request(app).get('/users/999');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });

    it('should handle database errors', async () => {
      const originalError = console.error;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation((err, ...args) => {
        if (err && err.message === 'DB Error') return;
        originalError.call(console, err, ...args);
      });

      mockQuery.mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app).get('/users/1');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Database error');
      consoleSpy.mockRestore();
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete a user successfully', async () => {
      const userId = 123;
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        })
      );

      // Mock 1: User lookup (Not Admin)
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ name: 'User' }],
      });

      // Mock 2: Delete operation
      mockQuery.mockResolvedValueOnce({});

      const res = await request(app).delete(`/users/${userId}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('User deleted successfully');
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/users/sync/${userId}`),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should return 403 when deleting an Admin', async () => {
      // Mock 1: User lookup (Is Admin)
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ name: 'Admin' }],
      });

      const res = await request(app).delete('/users/1');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Cannot delete an Admin user');
    });

    it('should return 404 if user not found', async () => {
      // Mock 1: User lookup (Not found)
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const res = await request(app).delete('/users/999');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });
  });

  describe('PATCH /users/:id/role', () => {
    it('should update user role successfully', async () => {
      const userId = 1;
      const newRoleId = 2;

      // Mock 1: Check user existence and current role (Not Admin)
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ name: 'User' }],
      });

      // Mock 2: Update query
      mockQuery.mockResolvedValueOnce({});

      const res = await request(app)
        .patch(`/users/${userId}/role`)
        .send({ roleId: newRoleId });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('User role updated');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should return 400 if roleId is missing', async () => {
      const res = await request(app).patch('/users/1/role').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('roleId is required');
    });

    it('should return 403 if trying to modify an Admin', async () => {
      // Mock 1: User lookup returns Admin role
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ name: 'Admin' }],
      });

      const res = await request(app)
        .patch('/users/1/role')
        .send({ roleId: 2 });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Cannot modify role of an Admin user');
      // Should not call update query
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return 404 if user not found', async () => {
      // Mock 1: User lookup returns no rows
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const res = await request(app)
        .patch('/users/999/role')
        .send({ roleId: 2 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });
  });
});