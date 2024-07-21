const {
  initializeApp
} = require('firebase-admin/app');
const {
  getFirestore
} = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();
const answersDB = db.collection("answers");


exports.insertUserAnswer = async (data) => {
  const userDocRef = answersDB.doc(data.userId);
  const userDocument = await userDocRef.get();
  if (userDocument.exists) {
    await userDocRef.update(data);
  } else {
    await userDocRef.set(data);
  }

  return data
}
exports.getUserAnswer = async (userId) => {
  const userDocument = await answersDB.doc(userId).get()
  return userDocument.exists ? userDocument.data() : false;
}