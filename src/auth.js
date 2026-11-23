
const crypto = require('crypto');

// In-memory active session store: token -> { username, expiresAt }
const activeSessions = new Map();

const users = {
  student1: 'password123'
};

function loginUser(username, password) {
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(users, username)) {
    return false;
  }

  const expectedPassword = users[username];
  const bufExpected = Buffer.from(expectedPassword);
  const bufActual = Buffer.from(password);
  if (bufExpected.length !== bufActual.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufExpected, bufActual);
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  };
  activeSessions.set(token, session);
  return token;
}

function getSession(token) {
  if (!token || typeof token !== 'string') return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

function revokeSession(token) {
  activeSessions.delete(token);
}

module.exports = {
  loginUser,
  createSession,
  getSession,
  revokeSession,
  activeSessions,
  users
};


