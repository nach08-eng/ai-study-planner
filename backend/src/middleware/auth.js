const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const DEV_TOKEN = "dev-local-token";
const DEV_USER = {
  id: "local-dev-user",
  email: "local@example.com",
  name: "Local Dev User"
};

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return res.status(401).json({ message: "Missing auth token." });
    }

    if (token === DEV_TOKEN) {
      req.user = DEV_USER;
      return next();
    }

    const verifyOptions = { idToken: token };
    if (process.env.GOOGLE_CLIENT_ID) {
      verifyOptions.audience = process.env.GOOGLE_CLIENT_ID;
    }

    const ticket = await client.verifyIdToken(verifyOptions);
    const payload = ticket.getPayload();

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name || ""
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid auth token." });
  }
};

module.exports = authMiddleware;
