const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

if (!admin.apps.length) {
  const serviceAccountPath = path.join(
    __dirname,
    "enrollsmart-service-account.json"
  );

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Firebase service account file not found: ${serviceAccountPath}`
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8")
  );

  if (!serviceAccount.project_id) {
    throw new Error(
      "Firebase service account is missing project_id."
    );
  }

  console.log(
    "Firebase Admin project:",
    serviceAccount.project_id
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

module.exports = admin;