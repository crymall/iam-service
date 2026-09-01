import { roleChangeError } from '../users.js';

describe('roleChangeError', () => {
  it('accepts a numeric role id', () => {
    expect(roleChangeError({ roleId: 2 })).toBeNull();
    expect(roleChangeError({ roleId: '2' })).toBeNull();
  });

  it.each([undefined, null, 0, -1, 'Admin', ''])('rejects %p', (roleId) => {
    expect(roleChangeError({ roleId })).toBe('roleId is required');
  });
});
