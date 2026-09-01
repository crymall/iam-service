const POSITIVE_INTEGER = /^\d+$/;

export const numericParam = (name) => (req, res, next, value) =>
  POSITIVE_INTEGER.test(value)
    ? next()
    : res.status(400).json({ error: `${name} must be a number.` });
