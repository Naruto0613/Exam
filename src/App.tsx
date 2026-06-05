import { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { UserProfile, UserRole } from './types';
import Login from './components/Login';
import NavBar from './components/NavBar';
import AdminDashboard from './components/AdminDashboard';
import StudentDashboard from './components/StudentDashboard';
import { motion } from 'motion/react';
import { GraduationCap } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Common Admin check matching our exact security specs
  const isAdminEmail = (emailStr: string): boolean => {
    const trimmed = emailStr.trim().toLowerCase();
    return trimmed === 'teacheradmin@exam.mn' || trimmed === 'adminnaba@exam.mn' || trimmed === 'naranbadrakh1013@gmail.com';
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setCurrentUser(user);
        
        // Fetch or create user profile on login state change
        const userDocRef = doc(db, 'users', user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            setProfile({
              uid: data.uid,
              name: data.name,
              email: data.email,
              role: data.role as UserRole,
              createdAt: data.createdAt?.toDate() || new Date(data.createdAt),
            });
          } else {
            // Profile fallback if profile was missing (for safety)
            const calculatedRole: UserRole = isAdminEmail(user.email || '') ? 'admin' : 'student';
            const calculatedName = calculatedRole === 'admin' 
              ? (user.email === 'teacheradmin@exam.mn' ? 'Teacher Admin' : (user.email === 'naranbadrakh1013@gmail.com' ? 'Naran Badrakh (Admin)' : 'Admin Naba')) 
              : (user.displayName || 'Student User');

            const newProfile: UserProfile = {
              uid: user.uid,
              name: calculatedName,
              email: user.email || '',
              role: calculatedRole,
              createdAt: new Date(),
            };

            // Write missing profile to Firestore
            await setDoc(userDocRef, {
              uid: newProfile.uid,
              name: newProfile.name,
              email: newProfile.email,
              role: newProfile.role,
              createdAt: newProfile.createdAt,
            });

            setProfile(newProfile);
          }
        } catch (err) {
          console.error('Error fetching student profile snapshot:', err);
          
          // Network offline / permission deny fallback (synthesize client-side)
          const calculatedRole: UserRole = isAdminEmail(user.email || '') ? 'admin' : 'student';
          const calculatedName = calculatedRole === 'admin' 
            ? (user.email === 'teacheradmin@exam.mn' ? 'Teacher Admin' : (user.email === 'naranbadrakh1013@gmail.com' ? 'Naran Badrakh (Admin)' : 'Admin Naba')) 
            : (user.displayName || 'Student User');

          setProfile({
            uid: user.uid,
            name: calculatedName,
            email: user.email || '',
            role: calculatedRole,
            createdAt: new Date(),
          });
        }
      } else {
        setCurrentUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleLogout = () => {
    setCurrentUser(null);
    setProfile(null);
  };

  const handleAuthSuccess = (newProfile: UserProfile) => {
    setProfile(newProfile);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F2ED] text-[#1A1A1A]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 animate-pulse items-center justify-center border-2 border-[#1A1A1A] bg-[#1A1A1A] text-[#F5F2ED] shadow-sm">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-tight">AURAEXAM</h1>
          <p className="font-mono text-[10px] text-neutral-500 uppercase tracking-widest animate-pulse">
            Шалгалтын орчинг тохируулж байна...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F2ED] text-[#1A1A1A] select-none">
      
      {/* Dynamic Header */}
      <NavBar userProfile={profile} onLogout={handleLogout} />

      <main className="flex flex-1 flex-col">
        {!profile ? (
          /* Authentication Screen */
          <Login onAuthSuccess={handleAuthSuccess} />
        ) : profile.role === 'admin' ? (
          /* Teacher Dashboard */
          <AdminDashboard currentAdmin={profile} />
        ) : (
          /* Student Dashboard */
          <StudentDashboard currentStudent={profile} />
        )}
      </main>

      <footer className="w-full border-t border-[#D1CDC7] bg-[#F5F2ED] py-6 text-center font-sans text-[11px] text-[#666] select-text">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-mono tracking-wider uppercase text-[10px]">СИСТЕМИЙН ТӨЛӨВ: АЮУЛГҮЙ БӨГӨӨД ХЭВИЙН</span>
          <p className="font-serif italic font-medium">
            &copy; 2026 AuraExam Аюулгүй Шалгалтын Платформ. Бүх оюутны болон сургалтын мэдээлэл Cloud Firestore-д хадгалагдсан.
          </p>
        </div>
      </footer>
    </div>
  );
}
