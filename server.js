const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const schedule = require("node-schedule");

const serviceAccount = require("./habititServiceKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore();
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


const port = process.env.PORT || 3000;



//New badge earned notifcations
app.post("/api/testNotification",async (req,res)=>{
    const {token} = req.body;
    const message = {
        token: token,
        notification: {
            title:"This is a test",
            body: "This is the notification.", 
        },
        data:{
          "extra_info": "This is extra info"
        }
    };
    try{
        const response = await admin.messaging().send(message);
        res.send(response);
    }catch(e){
        res.send(e);
    }
});

app.post("/api/sendBadgeNotification",async (req,res)=>{

  const {uid, badgeName, badgeDescription } = req.body;
  if (!uid || uid.trim() === "") {
    return res.status(400).send("Error: uid is required and must be non-empty.");
  }
  
  try {
    const userDoc = await db.collection("Users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).send("Error: User not found.");
    }
    
    const data = userDoc.data();
    const token = data?.token;
    if (!token || token.trim() === "") {
      return res.status(400).send("Error: User token not found.");
    } 

    const message = {
        token: token,
        notification: {
            title:`New Badge Earned!: ${badgeName}`,
            body: `You ${badgeDescription}`, 
        },
    };
        const response = await admin.messaging().send(message);
        res.send(response);
    }catch(e){
        res.send(e);
    }
});

function getTodayMillis() {
  const now = new Date();
  const normalized = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return normalized.getTime();
}

async function sendPendingHabitsNotifications() {
  const todayMillis = getTodayMillis();

  const usersSnapshot = await db.collection("Users").get();

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const token = userData.token;
    if (!token) continue;

    const habitsSnapshot = await db
      .collection("Users")
      .doc(userDoc.id)
      .collection("Habits")
      .get();

    const pendingHabits = [];
    habitsSnapshot.forEach((habitDoc) => {
      const habitData = habitDoc.data();
      if (!Array.isArray(habitData.completedDays) || !habitData.completedDays.includes(todayMillis)) {
        pendingHabits.push(habitData.name || habitDoc.id);
      }
    });

    if (pendingHabits.length > 0) {
      const message = {
        token: token,
        notification: {
          title: "Pending Habits Reminder",
          body: `You haven't completed: ${pendingHabits.join(', ')} today.`,
        },
      };

      try {
        const response = await admin.messaging().send(message);
        console.log(`Notification sent to user ${userDoc.id}: ${response}`);
      } catch (error) {
        console.error(`Error sending notification to user ${userDoc.id}:`, error);
      }
    }
  }
}


// incomplete habit reminders

schedule.scheduleJob("0 21 * * *", async function () {
    console.log("Running scheduled job to send incomplete habit notifications");

    sendPendingHabitsNotifications();

});

app.listen(port,'0.0.0.0' ,() => {
  console.log(`Notification server listening on port ${port}`);
});