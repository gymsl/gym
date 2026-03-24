import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCRJY8RgiRBfcgCYp5gzOWayxpSvZorqEM",
  authDomain: "anansjad-36103.firebaseapp.com",
  projectId: "anansjad-36103",
  storageBucket: "anansjad-36103.firebasestorage.app",
  messagingSenderId: "977739189320",
  appId: "1:977739189320:web:c4027190d45cd1258b9c7d",
  measurementId: "G-D62PX5HSVL"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
