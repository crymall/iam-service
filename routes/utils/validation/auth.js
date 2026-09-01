const MIN_PASSWORD_LENGTH = 8;
const USERNAME_COLUMN_WIDTH = 50;
const EMAIL_COLUMN_WIDTH = 255;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const registrationError = ({ username, email, password }) => {
  if (typeof username !== "string" || username.trim() === "") {
    return "A username is required.";
  }
  if (username.trim().length > USERNAME_COLUMN_WIDTH) {
    return `A username may be at most ${USERNAME_COLUMN_WIDTH} characters.`;
  }
  if (typeof email !== "string" || !EMAIL_SHAPE.test(email)) {
    return "A valid email address is required.";
  }
  if (email.length > EMAIL_COLUMN_WIDTH) {
    return `An email address may be at most ${EMAIL_COLUMN_WIDTH} characters.`;
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `A password of at least ${MIN_PASSWORD_LENGTH} characters is required.`;
  }
  return null;
};

export const verificationError = ({ tempToken, code }) => {
  if (typeof tempToken !== "string" || tempToken.trim() === "") {
    return "Missing temporary token";
  }
  if (typeof code !== "string" || code.trim() === "") {
    return "A verification code is required.";
  }
  return null;
};
