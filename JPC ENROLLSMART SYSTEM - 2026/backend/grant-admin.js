const admin = require("./firebaseAdmin");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  const email = (
    await ask("Ilagay ang eksaktong Google email mo: ")
  ).trim().toLowerCase();

  if (!email || !email.includes("@")) {
    throw new Error("Invalid email address.");
  }

  const user = await admin.auth().getUserByEmail(email);

  console.log("\nAccount na napili:");
  console.log("Email:", user.email);
  console.log("UID:", user.uid);
  console.log("Existing claims:", user.customClaims || {});

  const confirmation = await ask(
    "\nAdmin ba dapat ang account na ito? Type YES to confirm: "
  );

  if (confirmation.trim() !== "YES") {
    console.log("Cancelled. Walang binagong admin role.");
    return;
  }

  await admin.auth().setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    admin: true
  });

  console.log("\nAdmin claim successfully assigned.");
  console.log("Mag-sign out at mag-sign in muli upang ma-refresh ang token.");
}

main()
  .catch((error) => {
    console.error("Setup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
