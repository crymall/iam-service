import { registrationError, verificationError } from '../auth.js';

const VALID = {
  username: 'crymall',
  email: 'someone@example.com',
  password: 'correct-horse',
};

describe('registrationError', () => {
  it('accepts a complete registration', () => {
    expect(registrationError(VALID)).toBeNull();
  });

  it.each([undefined, '', '   ', 42])('rejects username %p', (username) => {
    expect(registrationError({ ...VALID, username })).toBe('A username is required.');
  });

  it('rejects a username longer than the column', () => {
    expect(registrationError({ ...VALID, username: 'x'.repeat(51) }))
      .toBe('A username may be at most 50 characters.');
  });

  it.each([undefined, '', 'not-an-email', 'missing@tld', '@example.com'])(
    'rejects email %p',
    (email) => {
      expect(registrationError({ ...VALID, email }))
        .toBe('A valid email address is required.');
    },
  );

  it.each([undefined, '', 'short'])('rejects password %p', (password) => {
    expect(registrationError({ ...VALID, password }))
      .toBe('A password of at least 8 characters is required.');
  });

  it('checks username before email so the first fault is the one reported', () => {
    expect(registrationError({ username: '', email: 'bad', password: 'x' }))
      .toBe('A username is required.');
  });
});

describe('verificationError', () => {
  it('accepts a token and a code', () => {
    expect(verificationError({ tempToken: 'jwt.token.here', code: '481920' })).toBeNull();
  });

  it.each([undefined, '', '   ', 5])('rejects tempToken %p', (tempToken) => {
    expect(verificationError({ tempToken, code: '481920' })).toBe('Missing temporary token');
  });

  it.each([undefined, '', '   '])('rejects code %p', (code) => {
    expect(verificationError({ tempToken: 'jwt.token.here', code }))
      .toBe('A verification code is required.');
  });
});
