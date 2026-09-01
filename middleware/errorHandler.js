const STATUS_BY_POSTGRES_CODE = {
  "22001": 400,
  "22P02": 400,
  "23502": 400,
  "23503": 409,
  "23505": 409,
};

const MESSAGE_BY_STATUS = {
  400: "Bad Request",
  404: "Not Found",
  409: "Conflict",
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status ?? STATUS_BY_POSTGRES_CODE[err.code] ?? 500;
  console.error(`${req.method} ${req.originalUrl} -> ${status}`, err);

  res
    .status(status)
    .json({ error: MESSAGE_BY_STATUS[status] ?? "Internal Server Error" });
};
