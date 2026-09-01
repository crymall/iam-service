const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidParam = (name) => (req, res, next, value) =>
  UUID_SHAPE.test(value)
    ? next()
    : res.status(400).json({ error: `${name} must be a user id.` });
