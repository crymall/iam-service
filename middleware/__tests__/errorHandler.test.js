import { jest } from '@jest/globals';
import { errorHandler } from '../errorHandler.js';

describe('errorHandler', () => {
  let req;
  let res;
  let next;
  let consoleSpy;

  beforeEach(() => {
    req = { method: 'POST', originalUrl: '/register' };
    res = { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => consoleSpy.mockRestore());

  const handle = (err) => errorHandler(err, req, res, next);

  it('answers 500 for an error carrying no status and no pg code', () => {
    handle(new Error('boom'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
  });

  it.each([
    ['22001', 400, 'Bad Request'],
    ['22P02', 400, 'Bad Request'],
    ['23502', 400, 'Bad Request'],
    ['23503', 409, 'Conflict'],
    ['23505', 409, 'Conflict'],
  ])('maps postgres %s to %i', (code, status, message) => {
    handle(Object.assign(new Error('pg'), { code }));
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: message });
  });

  it('honours a status set upstream, which is how body-parser 400s arrive', () => {
    handle(Object.assign(new SyntaxError('Unexpected token'), { status: 400 }));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Bad Request' });
  });

  it('never puts a password hash or an email on the wire', () => {
    handle(Object.assign(new Error('duplicate key value violates "users_email_key"'), {
      code: '23505',
      detail: 'Key (email)=(someone@example.com) already exists.',
    }));
    expect(res.json).toHaveBeenCalledWith({ error: 'Conflict' });
  });

  it('delegates to express once a response has started', () => {
    res.headersSent = true;
    const err = new Error('too late');
    handle(err);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
