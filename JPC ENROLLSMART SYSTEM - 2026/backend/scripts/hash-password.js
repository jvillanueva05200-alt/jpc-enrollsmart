 const bcrypt = require("bcryptjs");

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.js <password>");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log("\nAdd this line to your .env file:\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
