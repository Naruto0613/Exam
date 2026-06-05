import { auth } from '../firebase';
import { UserProfile } from '../types';
import { LogOut, GraduationCap, ShieldCheck, User } from 'lucide-react';

interface NavBarProps {
  userProfile: UserProfile | null;
}

export default function NavBar({ userProfile, onLogout }: NavBarProps & { onLogout: () => void }) {
  const handleSignOut = async () => {
    try {
      await auth.signOut();
      onLogout();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  const isAdminEmail = userProfile?.role === 'admin';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#1A1A1A] bg-[#F5F2ED]">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Logo and App Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center border-2 border-[#1A1A1A] bg-[#1A1A1A] text-[#F5F2ED]">
            <GraduationCap className="h-6 w-6" id="logo-icon" />
          </div>
          <div>
            <span className="font-serif text-2xl font-black tracking-tight text-[#1A1A1A] block leading-none">
              AURAEXAM
            </span>
            <span className="font-mono text-[9px] text-[#666] uppercase tracking-widest block mt-0.5">
              Аюулгүй Шалгалтын Платформ
            </span>
          </div>
        </div>

        {/* User Info & Actions */}
        {userProfile && (
          <div className="flex items-center gap-5">
            <div className="hidden sm:flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-sm text-[#1A1A1A]">
                  {userProfile.name}
                </span>
                
                {/* Admin or Student Badge */}
                {isAdminEmail ? (
                  <span className="inline-flex items-center gap-1 border border-[#1A1A1A] bg-[#1A1A1A] px-2 py-0.5 text-[10px] font-mono font-bold text-[#F5F2ED] uppercase tracking-wider">
                    <ShieldCheck className="h-3 w-3" />
                    Админ Багш
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 border border-[#1A1A1A] bg-transparent px-2 py-0.5 text-[10px] font-mono font-bold text-[#1A1A1A] uppercase tracking-wider">
                    <User className="h-3 w-3" />
                    Оюутан
                  </span>
                )}
              </div>
              <span className="font-mono text-[10px] text-[#666] mt-0.5">
                {userProfile.email}
              </span>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleSignOut}
              id="logout-btn"
              className="group flex h-10 items-center gap-2 border border-[#1A1A1A] bg-[#1A1A1A] text-[#F5F2ED] px-4 font-mono text-[11px] font-bold uppercase tracking-wider transition-all hover:bg-neutral-800 focus:outline-none cursor-pointer"
              title="Шалгалтын удирдлагаас гарах"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Гарах</span>
            </button>
          </div>
        )}

      </div>
    </header>
  );
}
