
const users = {
  student1: 'password123'
};

function loginUser(username, password) {
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(users, username) && users[username] === password;
}

module.exports = { loginUser, users };

