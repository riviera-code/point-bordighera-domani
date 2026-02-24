import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';

// Configurazione Firebase tramite import.meta.env
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Inizializzazione Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Percorso richiesto: artifacts/[appId]/public/data/shifts
const SHIFTS_PATH = `artifacts/${firebaseConfig.appId}/public/data/shifts`;

function App() {
  const [user, setUser] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Autenticazione Anonima
    signInAnonymously(auth).catch((error) => {
      console.error("Errore auth anonima:", error);
    });

    onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    // 2. Real-time listener su Firestore
    const q = query(collection(db, SHIFTS_PATH));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const shiftsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setShifts(shiftsData);
      setLoading(false);
    }, (error) => {
      console.error("Errore Firestore listener:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <header className="max-w-4xl mx-auto mb-8">
        <h1 className="text-3xl font-bold text-blue-800">Bordighera Domani</h1>
        <p className="text-gray-600">Gestione Turni Volontari Point</p>
        {user && (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded mt-2 inline-block">
            Accesso Verificato (ID: {user.uid.substring(0, 8)}...)
          </span>
        )}
      </header>

      <main className="max-w-4xl mx-auto">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
          </div>
        ) : (
          <div className="grid gap-4">
            {shifts.length === 0 ? (
              <div className="bg-white p-6 rounded-lg shadow border text-center">
                <p>Nessun turno programmato al momento.</p>
              </div>
            ) : (
              shifts.map((shift) => (
                <div key={shift.id} className="bg-white p-4 rounded-lg shadow border hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-lg">{shift.volunteerName || 'Posto Libero'}</h3>
                    <span className="text-sm text-gray-500">{shift.timeSlot}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
