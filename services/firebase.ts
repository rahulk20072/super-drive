import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCxWuxj9cTho_XNFjGpXR51jga2DxTN3qc",
  authDomain: "super-drive-3c18d.firebaseapp.com",
  projectId: "super-drive-3c18d",
  storageBucket: "super-drive-3c18d.firebasestorage.app",
  messagingSenderId: "103520567964",
  appId: "1:103520567964:web:a6286fadf606f1842ee359"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);