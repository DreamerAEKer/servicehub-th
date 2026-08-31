import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBbp2VzKL4CXBXvIvwibdgXztIjF1tOZ2g",
  authDomain: "dept-doc-vault.firebaseapp.com",
  projectId: "dept-doc-vault",
  storageBucket: "dept-doc-vault.firebasestorage.app",
  messagingSenderId: "705761139328",
  appId: "1:705761139328:web:0c276a96d2ebad98826465"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };
