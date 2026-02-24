import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  deleteDoc,
  updateDoc,
  onSnapshot, 
  serverTimestamp
} from 'firebase/firestore';
import { 
  Clock, 
  Plus, 
  CheckCircle, 
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  History,
  Trash2,
  Edit2,
  AlertTriangle
} from 'lucide-react';

// --- CONFIGURAZIONE FIREBASE ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const appId = import.meta.env.VITE_APP_ID || 'bordighera-domani-point';

// Inizializzazione Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const START_HOUR = 7;
const END_HOUR = 20;

const TIME_OPTIONS = [];
for (let h = START_HOUR; h <= END_HOUR; h++) {
  const hour = h.toString().padStart(2, '0');
  TIME_OPTIONS.push(`${hour}:00`);
  if (h < END_HOUR) TIME_OPTIONS.push(`${hour}:30`);
}

const INITIAL_COLLABORATORS = [
  "ALBANESE A.", "BALDASSARRE M.", "BASSI M.", "BERTAINA F.", "BONAVIA B.", 
  "BOZZARELLI M.", "DEBENEDETTI F.", "DI VITO M.", "GAZZANO G.", 
  "GUGLIELMI P.", "MANZONI A.", "MARIELLA M.", "MERLO A.", 
  "PIANTONI S.", "SCARINGELLA W.", "SILVESTRI S.", "TRUCCHI G.", "ZAGNI M."
].sort();

const HOURS_GRID = [];
for (let h = START_HOUR; h < END_HOUR; h++) {
  HOURS_GRID.push(`${h.toString().padStart(2, '0')}:00`);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState([]);
  const [dbVolunteers, setDbVolunteers] = useState([]);
  const [isPointOpen, setIsPointOpen] = useState(false);
  
  const [modalMode, setModalMode] = useState(null); 
  const [selectedVolunteer, setSelectedVolunteer] = useState(null);
  const [notification, setNotification] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [newVolunteerInput, setNewVolunteerInput] = useState('');
  
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
  });

  const [formData, setFormData] = useState({
    mode: 'single',
    date: new Date().toISOString().split('T')[0],
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '12:00'
  });

  const allVolunteers = useMemo(() => {
    const combined = [...new Set([...INITIAL_COLLABORATORS, ...dbVolunteers])];
    return combined.sort();
  }, [dbVolunteers]);

  // Auth
  useEffect(() => {
    signInAnonymously(auth).catch(e => console.error("Auth error:", e));
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Fetching
  useEffect(() => {
    if (!user) return;
    
    const shiftsCol = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
    const unsubShifts = onSnapshot(shiftsCol, (snap) => {
      setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const volCol = collection(db, 'artifacts', appId, 'public', 'data', 'volunteers');
    const unsubVols = onSnapshot(volCol, (snap) => {
      setDbVolunteers(snap.docs.map(d => d.data().name).filter(n => !!n));
    });

    const statusDoc = doc(db, 'artifacts', appId, 'public', 'data', 'status', 'current');
    const unsubStatus = onSnapshot(statusDoc, (snap) => {
      if (snap.exists()) setIsPointOpen(snap.data().isOpen);
    });

    return () => { unsubShifts(); unsubVols(); unsubStatus(); };
  }, [user]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentWeekStart]);

  const getPresencesForHour = (dateStr, hourStartStr) => {
    const hourInt = parseInt(hourStartStr.split(':')[0]);
    const hourEndStr = `${(hourInt + 1).toString().padStart(2, '0')}:00`;
    return shifts.filter(s => s.date === dateStr && s.startTime < hourEndStr && s.endTime > hourStartStr);
  };

  const showMsg = (text, type = 'info') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSaveShift = async () => {
    if (!selectedVolunteer) return;
    if (formData.endTime <= formData.startTime) {
      showMsg("L'orario di fine deve essere dopo l'inizio.", "warning");
      return;
    }

    const shiftsCol = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
    
    if (!INITIAL_COLLABORATORS.includes(selectedVolunteer) && !dbVolunteers.includes(selectedVolunteer)) {
      const volRef = doc(db, 'artifacts', appId, 'public', 'data', 'volunteers', selectedVolunteer.replace(/\s+/g, '_').toLowerCase());
      await setDoc(volRef, { name: selectedVolunteer });
    }

    let datesToSave = [];
    if (formData.mode === 'single') datesToSave.push(formData.date);
    else if (formData.mode === 'current_week' || formData.mode === 'next_week') {
      const baseDate = new Date();
      const day = baseDate.getDay();
      const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1) + (formData.mode === 'next_week' ? 7 : 0);
      const monday = new Date(baseDate.setDate(diff));
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        datesToSave.push(d.toISOString().split('T')[0]);
      }
    } else if (formData.mode === 'range') {
      let start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      while (start <= end) {
        datesToSave.push(new Date(start).toISOString().split('T')[0]);
        start.setDate(start.getDate() + 1);
      }
    }

    try {
      if (editingShift) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', editingShift.id), {
          date: formData.date,
          startTime: formData.startTime,
          endTime: formData.endTime,
          updatedAt: serverTimestamp()
        });
        showMsg("Turno aggiornato.", "success");
      } else {
        for (const d of datesToSave) {
          await addDoc(shiftsCol, {
            date: d,
            startTime: formData.startTime,
            endTime: formData.endTime,
            volunteerName: selectedVolunteer,
            createdAt: serverTimestamp()
          });
        }
        showMsg("Disponibilità salvata.", "success");
      }
      setModalMode('dashboard');
      setEditingShift(null);
    } catch (e) { console.error(e); }
  };

  const deleteShift = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', id));
      showMsg("Turno rimosso.", "success");
    } catch (e) { console.error(e); }
  };

  const navigateWeek = (weeks) => {
    setCurrentWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + (weeks * 7));
      return next;
    });
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white">
      <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      
      {notification && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[110] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300 ${
          notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-amber-500 text-white'
        }`}>
          {notification.type === 'warning' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
          <span className="font-bold text-sm uppercase tracking-wider">{notification.text}</span>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-20 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="https://bordigheradomani.it/img/logo.png" alt="Logo" className="h-12" />
            <div className="hidden sm:block">
              <h1 className="text-lg font-black text-blue-900 leading-none">Gestione Point</h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Lista Civica</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <button 
              onClick={() => setModalMode('identity')}
              className="bg-blue-600 text-white px-5 py-3 rounded-2xl font-black text-sm shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95"
            >
              <Plus className="w-4 h-4" /> 
              <span>Disponibilità</span>
            </button>
            <div 
              className={`h-12 w-12 rounded-full flex items-center justify-center border-2 transition-all cursor-pointer shadow-sm ${isPointOpen ? 'bg-green-50 border-green-500 text-green-600' : 'bg-red-50 border-red-500 text-red-600'}`} 
              onClick={async () => {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'status', 'current'), { isOpen: !isPointOpen, updatedAt: serverTimestamp() }, { merge: true });
              }}
            >
              {isPointOpen ? <CheckCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        
        {/* NAVIGAZIONE */}
        <div className="flex items-center justify-center gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto">
          <button onClick={() => navigateWeek(-1)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"><ChevronLeft /></button>
          <div className="flex-1 text-center min-w-[180px]">
            <p className="font-black text-blue-900 text-sm uppercase">
              {weekDays[0].toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} - {weekDays[6].toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          <button onClick={() => navigateWeek(1)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"><ChevronRight /></button>
        </div>

        {/* CALENDARIO */}
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[80px_repeat(7,1fr)] bg-white sticky top-0 z-10 border-b border-slate-100">
                <div className="p-4"></div>
                {weekDays.map((day, i) => (
                  <div key={i} className="p-4 text-center">
                    <p className="text-[10px] uppercase font-black tracking-widest text-blue-400">
                      {day.toLocaleDateString('it-IT', { weekday: 'short' })}
                    </p>
                    <p className="text-xl font-black text-blue-600">{day.getDate()}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col">
                {HOURS_GRID.map((hourSlot) => (
                  <div key={hourSlot} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-slate-50 min-h-[75px]">
                    <div className="flex items-center justify-center text-[11px] font-black text-slate-300 p-4">{hourSlot}</div>
                    {weekDays.map((day, dayIdx) => {
                      const dateStr = day.toISOString().split('T')[0];
                      const activeShifts = getPresencesForHour(dateStr, hourSlot);
                      const isOverlap = activeShifts.length > 1;
                      const hasPresence = activeShifts.length > 0;
                      return (
                        <div key={dayIdx} className={`p-1 flex items-center justify-center border-l border-slate-50 transition-all ${hasPresence ? '' : 'bg-slate-50/[0.1]'}`}>
                          {hasPresence && (
                            <div className={`w-full h-full rounded-2xl flex flex-col items-center justify-center text-center p-2 shadow-sm ${isOverlap ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'}`}>
                              {activeShifts.map((s) => (
                                <div key={s.id} className="w-full">
                                  <p className="text-[10px] font-black uppercase tracking-tighter leading-none">{s.volunteerName}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* MODALI */}
      {modalMode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative">
            
            <button onClick={() => setModalMode(null)} className="absolute right-6 top-6 p-3 hover:bg-slate-100 rounded-full text-slate-300 z-50 transition-colors"><X className="w-8 h-8" /></button>

            {/* IDENTIFICAZIONE */}
            {modalMode === 'identity' && (
              <div className="p-8 md:p-12 overflow-y-auto">
                <h3 className="text-3xl font-black text-blue-900 uppercase tracking-widest italic text-center mb-10">Chi sei?</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
                  {allVolunteers.map(v => (
                    <button 
                      key={v}
                      onClick={() => { setSelectedVolunteer(v); setModalMode('dashboard'); }}
                      className="p-5 text-left rounded-[20px] border border-slate-100 hover:border-blue-200 hover:bg-blue-50/20 transition-all font-black text-[14px] text-slate-800 shadow-sm"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div className="w-full bg-slate-50/50 p-8 rounded-[40px] border border-slate-100">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-3 ml-2">Nuovo Collaboratore</p>
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      placeholder="NOME COGNOME"
                      className="flex-1 px-8 py-5 rounded-3xl border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-xl text-slate-800 bg-white"
                      value={newVolunteerInput}
                      onChange={(e) => setNewVolunteerInput(e.target.value.toUpperCase())}
                    />
                    <button 
                      disabled={!newVolunteerInput}
                      onClick={() => { setSelectedVolunteer(newVolunteerInput); setModalMode('dashboard'); }}
                      className="bg-blue-600 text-white px-10 py-5 rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-blue-200 hover:bg-blue-700 disabled:opacity-30 transition-all"
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* DASHBOARD */}
            {modalMode === 'dashboard' && (
              <div className="p-12 flex flex-col items-center justify-center space-y-8 text-center">
                <div>
                  <p className="text-slate-300 text-[10px] uppercase font-black tracking-widest mb-2">Benvenuto</p>
                  <h3 className="text-5xl font-black text-blue-900 italic tracking-tighter uppercase">{selectedVolunteer}</h3>
                </div>
                <div className="w-full space-y-4 pt-8">
                  <button onClick={() => { setEditingShift(null); setModalMode('form'); }} className="w-full bg-blue-600 text-white p-10 rounded-[40px] flex items-center gap-6 shadow-2xl hover:bg-blue-700 transition-all active:scale-95 text-left">
                    <div className="h-16 w-16 bg-white/20 rounded-2xl flex items-center justify-center"><Plus className="w-8 h-8" /></div>
                    <div>
                      <p className="text-xl font-black uppercase tracking-tight">Nuovo Orario</p>
                      <p className="text-sm opacity-70 font-bold">Aggiungi disponibilità</p>
                    </div>
                  </button>
                  <button onClick={() => setModalMode('manage')} className="w-full bg-[#0d121f] text-white p-10 rounded-[40px] flex items-center gap-6 shadow-2xl hover:bg-[#161d31] transition-all active:scale-95 text-left">
                    <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center"><History className="w-8 h-8" /></div>
                    <div>
                      <p className="text-xl font-black uppercase tracking-tight">I miei turni</p>
                      <p className="text-sm opacity-50 font-bold">Modifica o elimina</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* FORM INSERIMENTO */}
            {modalMode === 'form' && (
              <div className="p-12 overflow-y-auto">
                <h3 className="text-4xl font-black text-blue-900 uppercase italic tracking-tighter mb-8">Pianifica</h3>
                <div className="space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {['single', 'current_week', 'next_week', 'range'].map(m => (
                      <button 
                        key={m}
                        onClick={() => setFormData({...formData, mode: m})}
                        className={`p-4 rounded-xl border-2 font-black uppercase text-[10px] transition-all ${formData.mode === m ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-50 bg-slate-50 text-slate-400'}`}
                      >
                        {m.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-6">
                    {(formData.mode === 'single' || editingShift) && (
                      <input type="date" className="w-full p-6 rounded-3xl border-2 border-slate-100 font-bold text-blue-900 text-xl" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                    )}
                    {formData.mode === 'range' && (
                      <div className="grid grid-cols-2 gap-4">
                        <input type="date" className="w-full p-6 rounded-3xl border-2 border-slate-100 font-bold text-blue-900" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                        <input type="date" className="w-full p-6 rounded-3xl border-2 border-slate-100 font-bold text-blue-900" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Dalle</label>
                        <select className="w-full p-6 rounded-3xl border-2 border-slate-100 font-black text-2xl text-blue-900 bg-white" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})}>
                          {TIME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">Alle</label>
                        <select className="w-full p-6 rounded-3xl border-2 border-slate-100 font-black text-2xl text-blue-900 bg-white" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})}>
                          {TIME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setModalMode('dashboard')} className="flex-1 py-6 font-black text-slate-300 uppercase tracking-widest">Annulla</button>
                    <button onClick={handleSaveShift} className="flex-[2] bg-green-600 text-white py-6 rounded-3xl font-black uppercase tracking-widest shadow-xl">
                      {editingShift ? 'Aggiorna' : 'Conferma'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* GESTIONE TURNI */}
            {modalMode === 'manage' && (
              <div className="p-10 flex flex-col h-full">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-blue-900 uppercase italic">I tuoi turni</h3>
                  <button onClick={() => setModalMode('dashboard')} className="bg-slate-100 px-6 py-3 rounded-2xl font-black text-[10px] uppercase">Indietro</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3">
                  {shifts.filter(s => s.volunteerName === selectedVolunteer).sort((a,b) => b.date.localeCompare(a.date)).map(s => (
                    <div key={s.id} className="bg-slate-50 p-6 rounded-[28px] flex items-center justify-between border border-slate-100">
                      <div>
                        <p className="text-xs text-slate-400 font-black uppercase">{s.date}</p>
                        <p className="text-lg font-black text-slate-800">{s.startTime} — {s.endTime}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingShift(s); setFormData({...formData, date: s.date, startTime: s.startTime, endTime: s.endTime}); setModalMode('form'); }} className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Edit2 className="w-5 h-5" /></button>
                        <button onClick={() => deleteShift(s.id)} className="p-3 bg-red-50 text-red-600 rounded-xl"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      <footer className="max-w-7xl mx-auto px-4 mt-12 text-center text-slate-200 text-[10px] py-12 border-t border-slate-200/50 uppercase tracking-[0.3em] font-black">
        <p>Bordighera Domani - Point Elettorale 2026</p>
      </footer>
    </div>
  );
}