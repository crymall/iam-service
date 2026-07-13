import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: "Access Denied: No Token Provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Access Denied: Invalid Token" });
    }

    req.user = user; 
    next();
  });
};

// Machine-to-machine auth for the sync surface, matching the sub-apps'
// x-api-key convention (canteen's authenticateApiKey, netbook's ApiKeyAttribute).
export const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  const expected = process.env.MIDDEN_API_KEY || "dev_api_key";

  if (!apiKey || apiKey !== expected) {
    return res.status(401).json({ error: "Access Denied: Invalid API Key" });
  }

  next();
};

export const authorizePermissions = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const userPermissions = req.user.permissions || [];

    if (!userPermissions.includes(requiredPermission)) {
      return res.status(403).json({ 
        error: "Forbidden: You do not have permission to perform this action",
        required: requiredPermission
      });
    }

    next();
  };
};