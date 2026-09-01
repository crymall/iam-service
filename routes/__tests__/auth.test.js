import { jest } from '@jest/globals';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';

// 1. Mock the database configuration
// We mock the default export of db.js to intercept query calls
const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/db.js', () => ({
  default: {
    query: mockQuery,
  },
}));

// 2. Mock Nodemailer to prevent sending real emails
const mockSendMail = jest.fn();
jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn().mockReturnValue({
      sendMail: mockSendMail,
    }),
  },
}));

// 3. Mock Users Router to isolate Auth testing
// This prevents errors if the users route has dependencies we haven't mocked
jest.unstable_mockModule('../users.js', () => ({
  default: (req, res, next) => next(),
}));

// 4. Import app and supertest dynamically AFTER mocks are defined
const { default: app } = await import('../../app.js');
const request = (await import('supertest')).default;

describe('Auth API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test_secret';
    process.env.EMAIL_USER = 'test@example.com';
    // Unset by default so register tests don't attempt real sub-app pushes;
    // the push test below opts in with its own value and fetch mock.
    delete process.env.USER_SYNC_API_URLS;
  });

  describe('POST /register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        username: faker.internet.userName(),
        email: faker.internet.email(),
        password: faker.internet.password(),
      };

      // Mock 1: Role lookup (SELECT id FROM roles...)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] });
      
      // Mock 2: User insertion (INSERT INTO users...)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, username: userData.username, email: userData.email }],
      });

      const res = await request(app).post('/register').send(userData);

      expect(res.status).toBe(201);
      expect(res.body.user).toHaveProperty('username', userData.username);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should assign Viewer role to new user', async () => {
      const userData = {
        username: faker.internet.userName(),
        email: faker.internet.email(),
        password: faker.internet.password(),
      };
      const viewerRoleId = 3;

      // Mock 1: Role lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: viewerRoleId }] });
      
      // Mock 2: User insertion
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, username: userData.username, email: userData.email }],
      });

      await request(app).post('/register').send(userData);
      
      expect(mockQuery.mock.calls[1][0].values[3]).toBe(viewerRoleId);
    });

    it('should push the new user to every configured sub-app', async () => {
      process.env.USER_SYNC_API_URLS = 'http://canteen.test,http://netbook.test';
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({}),
        })
      );

      const userData = {
        username: faker.internet.userName(),
        email: faker.internet.email(),
        password: faker.internet.password(),
      };
      const newUserId = faker.string.uuid();

      // Mock 1: Role lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] });

      // Mock 2: User insertion
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: newUserId, username: userData.username, email: userData.email }],
      });

      const res = await request(app).post('/register').send(userData);

      expect(res.status).toBe(201);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      for (const baseUrl of ['http://canteen.test', 'http://netbook.test']) {
        expect(global.fetch).toHaveBeenCalledWith(
          `${baseUrl}/users`,
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ username: userData.username, iam_id: newUserId }),
          })
        );
      }
    });

    it('should still register when a sub-app push fails', async () => {
      process.env.USER_SYNC_API_URLS = 'http://canteen.test';
      const originalError = console.error;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation((msg, ...args) => {
        if (typeof msg === 'string' && msg.startsWith('Error syncing user to')) return;
        originalError.call(console, msg, ...args);
      });
      global.fetch = jest.fn(() => Promise.reject(new Error('sub-app down')));

      const userData = {
        username: faker.internet.userName(),
        email: faker.internet.email(),
        password: faker.internet.password(),
      };

      // Mock 1: Role lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] });

      // Mock 2: User insertion
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: faker.string.uuid(), username: userData.username, email: userData.email }],
      });

      const res = await request(app).post('/register').send(userData);

      expect(res.status).toBe(201);
      consoleSpy.mockRestore();
    });

    it('should return 409 if user already exists', async () => {
      // Conditionally suppress console.error only for the expected error
      const originalError = console.error;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation((err, ...args) => {
        if (err && err.code === '23505') return;
        originalError.call(console, err, ...args);
      });

      const userData = {
        username: faker.internet.userName(),
        email: faker.internet.email(),
        password: faker.internet.password(),
      };

      // Mock 1: Role lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] });
      
      // Mock 2: User insertion failure (Postgres unique violation code 23505)
      const err = new Error('Duplicate');
      err.code = '23505';
      mockQuery.mockRejectedValueOnce(err);

      const res = await request(app).post('/register').send(userData);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/);

      consoleSpy.mockRestore();
    });
  });

  describe('POST /login', () => {
    it('should login successfully and send 2FA code', async () => {
      const password = faker.internet.password();
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = {
        id: 1,
        username: faker.internet.userName(),
        email: faker.internet.email(),
        password_hash: hashedPassword,
      };

      // Mock 1: Find user by username
      mockQuery.mockResolvedValueOnce({ rows: [user] });
      
      // Mock 2: Insert verification code
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post('/login').send({
        username: user.username,
        password: password,
      });

      expect(res.status).toBe(200);
      expect(mockSendMail).toHaveBeenCalled();
      expect(res.body.message).toContain('Verification code sent');
      expect(res.body.temp_token).toBeDefined();
    });

    it('should fail with invalid credentials', async () => {
      const password = faker.internet.password();
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = {
        id: 1,
        username: faker.internet.userName(),
        password_hash: hashedPassword,
      };

      // Mock 1: Find user
      mockQuery.mockResolvedValueOnce({ rows: [user] });

      const res = await request(app).post('/login').send({
        username: user.username,
        password: 'wrongpassword',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /verify-2fa', () => {
    it('should verify code and return JWT token', async () => {
      const userId = 1;
      const code = '123456';
      const jwt = (await import('jsonwebtoken')).default;
      const tempToken = jwt.sign({ id: userId, purpose: '2fa' }, 'test_secret');

      // Mock 1: Check code validity
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ code }] });
      
      // Mock 2: Delete used code
      mockQuery.mockResolvedValueOnce({});
      
      // Mock 3: Get full user details for JWT
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          username: 'testuser',
          role: 'Editor',
          permissions: ['read', 'write'],
        }],
      });

      const res = await request(app).post('/verify-2fa').send({ tempToken, code });

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toMatch(/token=/);
      expect(res.body.user.role).toBe('Editor');
    });

    it('should set a 30-day cookie when rememberMe is true', async () => {
      const userId = 1;
      const code = '123456';
      const jwt = (await import('jsonwebtoken')).default;
      const tempToken = jwt.sign({ id: userId, purpose: '2fa' }, 'test_secret');

      // Mock 1: Check code validity
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ code }] });
      
      // Mock 2: Delete used code
      mockQuery.mockResolvedValueOnce({});
      
      // Mock 3: Get full user details for JWT
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          username: 'testuser',
          role: 'Editor',
          permissions: ['read', 'write'],
        }],
      });

      const res = await request(app).post('/verify-2fa').send({ tempToken, code, rememberMe: true });

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toMatch(/Max-Age=2592000/); // 30 days in seconds
    });

    it('should fail with invalid or expired verification code', async () => {
      const userId = 1;
      const jwt = (await import('jsonwebtoken')).default;
      const tempToken = jwt.sign({ id: userId, purpose: '2fa' }, 'test_secret');

      // Mock 1: Check code (returns no rows)
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const res = await request(app).post('/verify-2fa').send({ tempToken, code: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid or expired code');
    });

    it('should fail if temporary token is missing', async () => {
      const res = await request(app).post('/verify-2fa').send({ code: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing temporary token');
    });

    it('should fail if temporary token is invalid', async () => {
      const res = await request(app).post('/verify-2fa').send({ tempToken: 'invalid.token.here', code: '123456' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired temporary token');
    });
  });

  describe('GET /verify', () => {
    it('should return 200 and user data if valid token cookie is provided', async () => {
      const jwt = (await import('jsonwebtoken')).default;
      const token = jwt.sign(
        { id: 1, username: 'testuser', role: 'Editor', permissions: ['read'] },
        'test_secret'
      );

      const res = await request(app)
        .get('/verify')
        .set('Cookie', [`token=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('testuser');
      expect(res.body.user.role).toBe('Editor');
    });

    it('should return 401 if no token is provided', async () => {
      const res = await request(app).get('/verify');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /logout', () => {
    it('should clear the token cookie', async () => {
      const res = await request(app).post('/logout');
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toMatch(/token=;/);
    });
  });
});