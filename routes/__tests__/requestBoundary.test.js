import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/db.js', () => ({
  default: { query: mockQuery },
}));

jest.unstable_mockModule('../../middleware/authorize.js', () => ({
  authenticateToken: (req, res, next) => next(),
  authenticateApiKey: (req, res, next) => next(),
  authorizePermissions: () => (req, res, next) => next(),
}));

const { default: app } = await import('../../app.js');
const request = (await import('supertest')).default;

const REAL_SHAPED_USER_ID = '11111111-1111-4111-8111-111111111111';

const expectJsonError = (res, status) => {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(typeof res.body.error).toBe('string');
};

describe('the request boundary', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.clearAllMocks();
  });

  it.each(['notanid', '1', 'c9f23723-296b'])(
    'answers a malformed user id %p with 400 before reaching the database',
    async (id) => {
      expectJsonError(await request(app).get(`/users/${id}`), 400);
      expect(mockQuery).not.toHaveBeenCalled();
    },
  );

  it('lets a uuid through to the query, since iam user ids are uuids', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: REAL_SHAPED_USER_ID, username: 'crymall', email: 'someone@example.com' }],
    });

    const res = await request(app).get(`/users/${REAL_SHAPED_USER_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('someone@example.com');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ values: [REAL_SHAPED_USER_ID] }),
    );
  });

  it('answers a malformed JSON body as JSON rather than HTML', async () => {
    const res = await request(app)
      .post('/login')
      .set('Content-Type', 'application/json')
      .send('malformed-json');
    expectJsonError(res, 400);
  });

  it.each([
    [{}],
    [{ username: 'crymall' }],
    [{ username: 'crymall', email: 'not-an-email', password: 'correct-horse' }],
    [{ username: 'crymall', email: 'a@b.co', password: 'short' }],
  ])('answers POST /register %j with 400 before hashing or querying', async (body) => {
    expectJsonError(await request(app).post('/register').send(body), 400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('answers PATCH /users/:id/role with no roleId as 400', async () => {
    const res = await request(app).patch(`/users/${REAL_SHAPED_USER_ID}/role`).send({});
    expectJsonError(res, 400);
    expect(res.body.error).toBe('roleId is required');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('answers an unmapped database error as a 500 with no stack trace', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));
    const res = await request(app).get('/users');
    expectJsonError(res, 500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
    expect(res.text).not.toMatch(/at .*\.js:\d+/);
  });

  it('keeps the duplicate-account message, which the generic handler would flatten', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));

    const res = await request(app).post('/register').send({
      username: 'crymall',
      email: 'someone@example.com',
      password: 'correct-horse',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/);
  });
});
