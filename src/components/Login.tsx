import React, { useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Lock, Mail, User, ShieldAlert, GraduationCap, ArrowRight, Eye, EyeOff, LogIn } from 'lucide-react';
import { UserProfile, UserRole } from '../types';

interface LoginProps {
  onAuthSuccess: (profile: UserProfile) => void;
}

export default function Login({ onAuthSuccess }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Common Admin check
  const isAdminEmail = (emailStr: string): boolean => {
    const trimmed = emailStr.trim().toLowerCase();
    return trimmed === 'teacheradmin@exam.mn' || trimmed === 'adminnaba@exam.mn' || trimmed === 'naranbadrakh1013@gmail.com';
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setErrorCode(null);
    setIsSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      const targetEmail = user.email || '';

      const userRole: UserRole = isAdminEmail(targetEmail) ? 'admin' : 'student';

      const userProfile: UserProfile = {
        uid: user.uid,
        name: user.displayName || (userRole === 'admin' ? 'Teacher Admin' : 'Student'),
        email: targetEmail,
        role: userRole,
        createdAt: new Date(),
      };

      const userDocRef = doc(db, 'users', user.uid);
      try {
        const userDocSnap = await getDoc(userDocRef);
        if (!userDocSnap.exists()) {
          await setDoc(userDocRef, {
            uid: userProfile.uid,
            name: userProfile.name,
            email: userProfile.email,
            role: userProfile.role,
            createdAt: userProfile.createdAt,
          });
        } else {
          const data = userDocSnap.data();
          userProfile.name = data.name || userProfile.name;
          userProfile.role = data.role as UserRole || userProfile.role;
        }
      } catch (dbErr) {
        console.warn('Firestore profile setup failed, using memory fallback:', dbErr);
      }

      onAuthSuccess(userProfile);
    } catch (err: any) {
      console.error('Google Auth error code:', err.code, err);
      setErrorCode(err.code || null);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Google нэвтрэх цонх холболт дуусахаас өмнө хаагдсан байна.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Google нэвтрэлт амжилтгүй боллоо. Хэрэв асуудал гарсаар байвал имэйл хаягаар нэвтрэнэ үү.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Энэхүү домайн (Domain) нь таны Firebase төсөлд зөвшөөрөгдөөгүй байна. Google нэвтрэлтийг ашиглахын тулд домайныг зөвшөөрөгдсөн жагсаалтад нэмнэ үү.');
      } else {
        setError(err.message || 'Google нэвтрэлтийн явцад алдаа гарлаа.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorCode(null);
    setIsSubmitting(true);

    const targetEmail = email.trim();
    const targetName = name.trim();

    if (!targetEmail || !password) {
      setError('Шаардлагатай талбаруудыг бүрэн бөглөнө үү.');
      setIsSubmitting(false);
      return;
    }

    if (isSignUp && !targetName) {
      setError('Бүртгүүлэхийн тулд бүтэн нэрээ оруулна уу.');
      setIsSubmitting(false);
      return;
    }

    try {
      if (isSignUp) {
        // Enforce role assignment boundaries on client matching security rules
        const userRole: UserRole = isAdminEmail(targetEmail) ? 'admin' : 'student';

        // 1. Firebase Auth Sign Up
        const userCredential = await createUserWithEmailAndPassword(auth, targetEmail, password);
        const user = userCredential.user;

        // 2. Create User Profile
        const userProfile: UserProfile = {
          uid: user.uid,
          name: userRole === 'admin' ? `${targetName} (Admin)` : targetName,
          email: targetEmail,
          role: userRole,
          createdAt: new Date(),
        };

        const userDocRef = doc(db, 'users', user.uid);
        try {
          await setDoc(userDocRef, {
            uid: userProfile.uid,
            name: userProfile.name,
            email: userProfile.email,
            role: userProfile.role,
            createdAt: userProfile.createdAt,
          });
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.CREATE, `users/${user.uid}`);
        }

        onAuthSuccess(userProfile);
      } else {
        // 1. Firebase Auth Log In
        const userCredential = await signInWithEmailAndPassword(auth, targetEmail, password);
        const user = userCredential.user;

        // 2. Fetch User Profile
        const userDocRef = doc(db, 'users', user.uid);
        let userProfile: UserProfile;

        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            userProfile = {
              uid: data.uid,
              name: data.name,
              email: data.email,
              role: data.role as UserRole,
              createdAt: data.createdAt?.toDate() || new Date(),
            };
          } else {
            // Profile fallback if profile was missing (for safety)
            const userRole: UserRole = isAdminEmail(targetEmail) ? 'admin' : 'student';
            userProfile = {
              uid: user.uid,
              name: userRole === 'admin' ? 'Teacher Admin' : (user.displayName || 'Student'),
              email: targetEmail,
              role: userRole,
              createdAt: new Date(),
            };
            await setDoc(userDocRef, {
              uid: userProfile.uid,
              name: userProfile.name,
              email: userProfile.email,
              role: userProfile.role,
              createdAt: userProfile.createdAt,
            });
          }
        } catch (dbErr) {
          // If we had a permissions issue, try writing first
          const userRole: UserRole = isAdminEmail(targetEmail) ? 'admin' : 'student';
          userProfile = {
            uid: user.uid,
            name: userRole === 'admin' ? 'Teacher Admin' : 'Student',
            email: targetEmail,
            role: userRole,
            createdAt: new Date(),
          };
          onAuthSuccess(userProfile);
          setIsSubmitting(false);
          return;
        }

        onAuthSuccess(userProfile);
      }
    } catch (err: any) {
      console.error('Firebase Auth error code:', err.code, err);
      setErrorCode(err.code || null);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Имэйл эсвэл нууц үгээр нэвтрэх боломжгүй байна. Google-ээр нэвтрэх хэсгийг ашиглана уу.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Энэ имэйл хаяг аль хэдийн бүртгэгдсэн байна. Нэвтрэх хэсгийг сонгоно уу.');
      } else if (err.code === 'auth/weak-password') {
        setError('Нууц үг сул байна. Хамгийн багадаа 6 тэмдэгт ашиглана уу.');
      } else if (err.code === 'auth/invalid-credential') {
        setError('Имэйл эсвэл нууц үг буруу байна. Шалгаад дахин оролдоно уу.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Сүлжээний алдаа гарлаа. Офлайн төлөв болон интернетийн холболтоо шалгана уу.');
      } else {
        setError(err.message || 'Бүртгэл хийхэд алдаа гарлаа.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-[#F5F2ED]">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md space-y-8"
      >
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center border-2 border-[#1A1A1A] bg-[#1A1A1A] text-[#F5F2ED] mb-4">
            <GraduationCap className="h-9 w-9" />
          </div>
          <h1 className="font-serif text-4xl font-extrabold tracking-tight text-[#1A1A1A]">
            {isSignUp ? 'Бүртгэл Үүсгэх' : 'Системд Нэвтрэх'}
          </h1>
          <p className="mt-2 font-mono text-[10px] text-[#666] uppercase tracking-widest">
            СУРГАЛТЫН ХӨТӨЛБӨРИЙН ҮНЭЛГЭЭ & ШАЛГАЛТЫН АЛБА
          </p>
        </div>

        {/* Demo Credentials Helper Card */}
        <div className="border border-[#1A1A1A] bg-white p-5">
          <div className="flex gap-3">
            <ShieldAlert className="h-5 w-5 text-[#1A1A1A] shrink-0 mt-0.5" />
            <div className="text-xs text-[#1A1A1A] space-y-2">
              <span className="font-serif font-bold text-sm block tracking-tight">
                Сургуулийн Захиргааны Эрхүүд
              </span>
              <p className="font-sans leading-relaxed text-[#444]">
                Багшийн хяналтын самбарт хандахын тулд доор орох хаягуудыг ашиглан нэвтрэх эсвэл бүртгүүлнэ үү:
              </p>
              <div className="font-mono bg-[#F5F2ED] border border-[#D1CDC7] px-3 py-2 text-[11px] font-semibold text-[#1A1A1A] leading-relaxed">
                • teacheradmin@exam.mn<br />
                • adminnaba@exam.mn
              </div>
              <p className="font-serif italic text-neutral-500 text-[11px]">
                Санамж: Тэдгээрээс бусад хаягаар бүртгүүлэхэд оюутны эрхээр системд бүртгэгдэнэ.
              </p>
            </div>
          </div>
        </div>

        {/* Card containing login/signup form */}
        <div className="border border-[#1A1A1A] bg-white p-6 sm:p-8">
          
          {/* Google Single Sign-On */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 border border-[#1A1A1A] bg-white text-[#1A1A1A] px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-[#F5F2ED] disabled:opacity-50 transition-colors cursor-pointer mb-5"
          >
            <LogIn className="h-4 w-4" />
            <span>Google Хаягаар Нэвтрэх</span>
          </button>

          <div className="relative flex py-2 items-center mb-5">
            <div className="flex-grow border-t border-[#D1CDC7]"></div>
            <span className="flex-shrink mx-4 font-mono text-[9px] text-[#666] uppercase tracking-wider">эсвэл өөрийн бүртгэлээр</span>
            <div className="flex-grow border-t border-[#D1CDC7]"></div>
          </div>

          <form className="space-y-5" onSubmit={handleAuth}>
            {error && (
              <div className="space-y-3 font-sans">
                <div className="border border-[#1A1A1A] bg-[#FFF2F2] p-4 text-xs font-mono text-[#A10000] leading-relaxed">
                  {error}
                </div>

                {/* Highly helpful troubleshooting guidelines for operation-not-allowed */}
                {errorCode === 'auth/operation-not-allowed' && (
                  <div className="border border-[#D1CDC7] bg-[#FFF9EB] p-4 text-xs text-[#6E4E00] space-y-2 leading-relaxed">
                    <p className="font-bold font-serif text-sm">⚠️ Firebase Тохиргооны Заавар (Багшид зориулсан):</p>
                    <p className="font-sans">Энэ алдаа нь таны Firebase төсөлд нэвтрэх аргуудыг идэвхжүүлээгүй үед гардаг. Холболтоо дараах алхмаар идэвхжүүлнэ үү:</p>
                    <ol className="list-decimal pl-5 space-y-1 font-sans">
                      <li>Firebase Консол (<a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold text-[#1A1A1A]">https://console.firebase.google.com/</a>) руу орно</li>
                      <li>Өөрийн төслийг (<strong>examsite-28213</strong>) сонгоно</li>
                      <li>Зүүн талын цэснээс <strong>Build &gt; Authentication</strong> хэсэг рүү нэвтэрч <strong>Sign-in method</strong> табыг сонгоно</li>
                      <li><strong>Email/Password</strong> болон <strong>Google</strong> нэвтрэлтийн аргуудыг <strong>Enable</strong> болгон идэвхжүүлээд хадгална уу</li>
                    </ol>
                  </div>
                )}

                {/* Highly helpful troubleshooting guidelines for unauthorized-domain */}
                {errorCode === 'auth/unauthorized-domain' && (
                  <div className="border border-[#D1CDC7] bg-[#FFF9EB] p-4 text-xs text-[#6E4E00] space-y-2 leading-relaxed">
                    <p className="font-bold font-serif text-sm">⚠️ Зөвшөөрөгдөөгүй Домайн (Unauthorized Domain) Алдааг Засах Заавар:</p>
                    <p className="font-sans">Энэхүү апп ажиллаж буй хаяг (domain) таны Firebase төслийн зөвшөөрөгдсөн жагсаалтад бүртгэгдээгүй байна. Дараах алхмаар хялбархан шийднэ үү:</p>
                    <ol className="list-decimal pl-5 space-y-1 font-sans">
                      <li>Firebase Консол (<a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold text-[#1A1A1A]">https://console.firebase.google.com/</a>) руу орно</li>
                      <li>Өөрийн төслийг (<strong>examsite-28213</strong>) сонгоно</li>
                      <li>Зүүн талын цэснээс <strong>Build &gt; Authentication</strong> хэсэг рүү нэвтэрч <strong>Settings</strong> табыг сонгоно</li>
                      <li>Дэд цэснээс <strong>Authorized domains</strong> хэсгийг сонгоно</li>
                      <li><strong>Add domain</strong> товч дээр дарж дараах хоёр хаягийг тус бүр нэмээрэй:
                        <ul className="list-disc pl-5 mt-1 font-mono text-[11px] font-bold text-red-700 bg-neutral-100 p-2 border border-[#D1CDC7] select-all space-y-1">
                          <li>ais-dev-s7awhqd6p47jev5yroca6s-75661498175.asia-northeast1.run.app</li>
                          <li>ais-pre-s7awhqd6p47jev5yroca6s-75661498175.asia-northeast1.run.app</li>
                          {window.location.hostname && window.location.hostname !== 'localhost' &&
                           window.location.hostname !== 'ais-dev-s7awhqd6p47jev5yroca6s-75661498175.asia-northeast1.run.app' &&
                           window.location.hostname !== 'ais-pre-s7awhqd6p47jev5yroca6s-75661498175.asia-northeast1.run.app' && (
                            <li>{window.location.hostname}</li>
                          )}
                        </ul>
                      </li>
                      <li>Нэмсний дараа энэ хуудсыг дахин шинэчилж Google-ээр нэвтэрнэ үү.</li>
                    </ol>
                  </div>
                )}

                {/* Switch to signup mode easily for invalid-credential */}
                {errorCode === 'auth/invalid-credential' && (
                  <div className="border border-[#D1CDC7] bg-[#EEF9F3] p-4 text-xs text-[#12622F] space-y-2 leading-relaxed">
                    <p className="font-bold font-serif text-sm">💡 Шинэ хэрэглэгч үү?</p>
                    <p className="font-sans">Хэрэв та урьд нь бүртгэл үүсгээгүй бол дараах товчийг дарж шинээр бүртгэл үүсгэн нэвтэрнэ үү:</p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(true);
                        setError(null);
                        setErrorCode(null);
                      }}
                      className="border border-[#12622F] bg-white px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#12622F] hover:bg-[#EEF9F3] transition-colors cursor-pointer"
                    >
                      Шинэ Бүртгэл Үүсгэх Хэсэг рүү шилжих
                    </button>
                  </div>
                )}

                {/* Switch to login mode automatically for email-already-in-use */}
                {errorCode === 'auth/email-already-in-use' && (
                  <div className="border border-[#D1CDC7] bg-[#EEF9F3] p-4 text-xs text-[#12622F] space-y-2 leading-relaxed">
                    <p className="font-bold font-serif text-sm">💡 Таны имэйл хаяг аль хэдийн бүртгэгдсэн байна!</p>
                    <p className="font-sans">Тус хаягаар бүртгэл үүссэн байгаа тул та доорх товчийг дарж шууд нэвтрэх хэсэг рүү шилжинэ үү:</p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(false);
                        setError(null);
                        setErrorCode(null);
                      }}
                      className="border border-[#12622F] bg-white px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#12622F] hover:bg-[#EEF9F3] transition-colors cursor-pointer"
                    >
                      Нэвтрэх Хэсэг рүү Шилжих
                    </button>
                  </div>
                )}
              </div>
            )}

            {isSignUp && (
              <div className="space-y-1.5">
                <label htmlFor="name-input" className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                  Бүүрэн Нэр
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <User className="h-4.5 w-4.5 text-[#1A1A1A]" />
                  </div>
                  <input
                    type="text"
                    id="name-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Жань: Наран Бадрах"
                    required={isSignUp}
                    className="block w-full border border-[#1A1A1A] py-2.5 pl-10 pr-3 font-sans text-sm bg-[#F5F2ED] placeholder-neutral-500 focus:outline-none focus:bg-white text-[#1A1A1A]"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email-input" className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                Имэйл Хаяг
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-4.5 w-4.5 text-[#1A1A1A]" />
                </div>
                <input
                  type="email"
                  id="email-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@exam.mn"
                  required
                  className="block w-full border border-[#1A1A1A] py-2.5 pl-10 pr-3 font-sans text-sm bg-[#F5F2ED] placeholder-neutral-500 focus:outline-none focus:bg-white text-[#1A1A1A]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password-input" className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                Нууц Үг
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-4.5 w-4.5 text-[#1A1A1A]" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Хамгийн багадаа 6 тэмдэгт"
                  required
                  className="block w-full border border-[#1A1A1A] py-2.5 pl-10 pr-10 font-sans text-sm bg-[#F5F2ED] placeholder-neutral-500 focus:outline-none focus:bg-white text-[#1A1A1A]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#1A1A1A] hover:opacity-80"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              id="auth-submit-btn"
              className="flex w-full items-center justify-center gap-2 border border-[#1A1A1A] bg-[#1A1A1A] text-[#F5F2ED] px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span>{isSignUp ? 'Бүртгэл Үүсгэх' : 'Системд Нэвтрэх'}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Mode Switch Button */}
          <div className="mt-8 flex flex-col items-center justify-center border-t border-[#D1CDC7] pt-5 text-center">
            <p className="font-serif italic text-xs text-[#666]">
              {isSignUp ? 'Та аль хэдийн бүртгэлтэй юу?' : 'Анх удаа шалгалт өгөх гэж байна уу?'}
            </p>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setErrorCode(null);
              }}
              className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A] border-b-2 border-[#1A1A1A] pb-0.5 hover:opacity-80 focus:outline-none"
            >
              {isSignUp ? 'Бүртгэлтэй эрхээрээ нэвтрэх' : 'Шинэ бүртгэл үүсгэх'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
