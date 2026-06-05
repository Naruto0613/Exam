import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Exam, ExamSubject, ExamType, Question, MCQuestion, WrittenQuestion, Submission, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, Award, BookOpen, AlertCircle, FileText, CheckCircle2, 
  ArrowRight, ShieldCheck, Play, HelpCircle, GraduationCap, RefreshCw 
} from 'lucide-react';

interface StudentDashboardProps {
  currentStudent: UserProfile;
}

export default function StudentDashboard({ currentStudent }: StudentDashboardProps) {
  const [activeSubject, setActiveSubject] = useState<ExamSubject | 'all'>('all');
  const [activeSection, setActiveSection] = useState<'available' | 'results'>('available');

  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Active testing state
  const [takingExam, setTakingExam] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<{ [questionId: string]: string | number }>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionCompleted, setSubmissionCompleted] = useState<{
    score: number;
    maxScore: number;
    type: ExamType;
  } | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Time tracker for dynamic scheduling locks
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    // Keep currentTime fresh every 10 seconds to unlock papers fluidly
    const timer = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Exams in Real-time
  useEffect(() => {
    const examsCol = collection(db, 'exams');
    const unsubscribe = onSnapshot(examsCol, (snapshot) => {
      const examsList: Exam[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        examsList.push({
          id: doc.id,
          title: data.title,
          subject: data.subject,
          type: data.type,
          availableAt: data.availableAt?.toDate() || new Date(data.availableAt),
          questions: data.questions || [],
          creatorId: data.creatorId,
          createdAt: data.createdAt?.toDate() || new Date(data.createdAt),
        });
      });
      setExams(examsList);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to exams:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Fetch student Submissions in Real-time
  useEffect(() => {
    const submissionsCol = collection(db, 'submissions');
    // Security enforcer query - filtered by active student ID as required by rules
    const q = query(submissionsCol, where('studentId', '==', currentStudent.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const submissionsList: Submission[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        submissionsList.push({
          id: doc.id,
          examId: data.examId,
          examTitle: data.examTitle,
          subject: data.subject,
          examType: data.examType,
          studentId: data.studentId,
          studentName: data.studentName,
          studentEmail: data.studentEmail,
          answers: data.answers || {},
          score: data.score,
          maxScore: data.maxScore,
          status: data.status,
          submittedAt: data.submittedAt?.toDate() || new Date(data.submittedAt),
          feedback: data.feedback,
          gradedBy: data.gradedBy,
          gradedAt: data.gradedAt?.toDate() || undefined,
        });
      });
      setSubmissions(submissionsList);
    }, (error) => {
      console.error('Error listening to student submissions:', error);
    });

    return unsubscribe;
  }, [currentStudent.uid]);

  // Handler for starting an available test
  const handleStartExam = (exam: Exam) => {
    setErrorMsg(null);
    setSubmissionCompleted(null);
    
    // Safety check availability
    const isReady = new Date(exam.availableAt) <= currentTime;
    if (!isReady) {
      setErrorMsg('Энэ шалгалтын материал зарлагдсан хугацаа хүртэл түгжигдсэн байна.');
      return;
    }

    // Check if already completed
    const alreadyTaken = submissions.some(sub => sub.examId === exam.id);
    if (alreadyTaken) {
      setErrorMsg('Та энэ шалгалтын хариултыг аль хэдийн илгээсэн байна.');
      return;
    }

    setTakingExam(exam);
    setAnswers({});
  };

  // Select option in MC question
  const handleSelectMCOption = (qId: string, optIndex: number) => {
    setAnswers({
      ...answers,
      [qId]: optIndex
    });
  };

  // Text entry in Written question
  const handleWriteAnswerText = (qId: string, text: string) => {
    setAnswers({
      ...answers,
      [qId]: text
    });
  };

  // Submit assessmentanswers
  const handleSubmitExamBooklet = async () => {
    if (!takingExam) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    const questions = takingExam.questions;
    const answeredCount = Object.keys(answers).length;

    if (answeredCount < questions.length) {
      if (!window.confirm(`Анхааруулга: Та нийт ${questions.length} асуултоос ердөө ${answeredCount} асуултад хариулсан байна. Илгээхдээ итгэлтэй байна уу?`)) {
        setIsSubmitting(false);
        return;
      }
    }

    // Process grading
    let computedScore = 0;
    const maxScore = questions.length;
    let finalStatus: 'submitted' | 'graded' = 'submitted';

    if (takingExam.type === 'multiple-choice') {
      // Auto upgrade score
      questions.forEach((q) => {
        const mcQ = q as MCQuestion;
        const studentSelected = answers[q.id];
        if (studentSelected !== undefined && Number(studentSelected) === mcQ.correctIndex) {
          computedScore += 1;
        }
      });
      finalStatus = 'graded'; // MC is graded instantly!
    } else {
      // Written exam holds 0 initial score awaiting manual grading
      computedScore = 0;
      finalStatus = 'submitted';
    }

    const submissionId = `sub_${takingExam.id}_${currentStudent.uid}`;
    
    // Construction of the submission payload matching variables
    const newSubmissionPayload = {
      id: submissionId,
      examId: takingExam.id,
      examTitle: takingExam.title,
      subject: takingExam.subject,
      examType: takingExam.type,
      studentId: currentStudent.uid,
      studentName: currentStudent.name,
      studentEmail: currentStudent.email,
      answers: answers,
      score: computedScore,
      maxScore: maxScore,
      status: finalStatus,
      submittedAt: new Date(), // using local constructed date
    };

    try {
      const subDocRef = doc(db, 'submissions', submissionId);
      
      // Force exact schema keys and order matching firestore.rules
      await setDoc(subDocRef, {
        id: newSubmissionPayload.id,
        examId: newSubmissionPayload.examId,
        examTitle: newSubmissionPayload.examTitle,
        subject: newSubmissionPayload.subject,
        examType: newSubmissionPayload.examType,
        studentId: newSubmissionPayload.studentId,
        studentName: newSubmissionPayload.studentName,
        studentEmail: newSubmissionPayload.studentEmail,
        answers: newSubmissionPayload.answers,
        score: newSubmissionPayload.score,
        maxScore: newSubmissionPayload.maxScore,
        status: newSubmissionPayload.status,
        submittedAt: serverTimestamp(), // Temporal security check
      });

      setSubmissionCompleted({
        score: computedScore,
        maxScore: maxScore,
        type: takingExam.type
      });

      if (takingExam.type === 'multiple-choice') {
        setSuccessMsg(`Шалгалт дууслаа! Та ${computedScore}/${maxScore} оноо авлаа.`);
      } else {
        setSuccessMsg(`Таны бичгийн шалгалтын хариулт амжилттай илгээгдлээ. Багшийн үнэлгээг хүлээнэ үү.`);
      }

      setTakingExam(null);
    } catch (err: any) {
      console.error('Submission write error:', err);
      try {
        handleFirestoreError(err, OperationType.CREATE, `submissions/${submissionId}`);
      } catch (wrappedErr: any) {
        setErrorMsg(`Failed to submit answers: ${wrappedErr.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper date rendering
  const formatTimestamp = (ts: any) => {
    if (!ts) return 'N/A';
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toLocaleString();
    }
    return new Date(ts).toLocaleString();
  };

  const getSubjectColor = (sub: ExamSubject) => {
    return sub === 'history' 
      ? 'bg-[#FFF9EB] text-[#6E4E00] border-[#D1CDC7] font-mono' 
      : 'bg-[#EDF8F4] text-[#004D27] border-[#D1CDC7] font-mono';
  };

  // Filtering Exams parameters
  const filteredExams = exams.filter((exam) => {
    if (activeSubject !== 'all' && exam.subject !== activeSubject) return false;
    return true;
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 bg-[#F5F2ED] min-h-screen text-[#1A1A1A]">
      
      {/* Editorial Header Block */}
      <div className="border-b-2 border-[#1A1A1A] pb-6 mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="font-mono text-[10px] text-[#666] uppercase tracking-[0.2em] block mb-1">
            ОЮУТНЫ ХЯНАЛТЫН ТАЛБАР
          </span>
          <h1 className="font-serif text-4xl font-extrabold tracking-tight text-[#1A1A1A]">
            Оюутны Шалгалтын Хэсэг
          </h1>
          <p className="mt-2 font-serif italic text-sm text-[#444] max-w-2xl leading-relaxed">
            Тавтай морил, Оюутан <strong className="font-sans font-bold text-[#1A1A1A]">{currentStudent.name}</strong>. Эндээс та өөрийн товлогдсон шалгалтууд, идэвхтэй сорил болон үнэлэгдсэн шалгалтын түүхээ харах боломжтой.
          </p>
        </div>
        <div className="font-mono text-[11px] text-[#1A1A1A] border-t md:border-t-0 md:border-l border-[#D1CDC7] pt-3 md:pt-0 md:pl-4">
          <p className="uppercase tracking-widest text-[#666] text-[9px] font-bold">Одоогийн цаг</p>
          <div className="text-sm font-bold mt-1 tracking-tight select-text">
            {currentTime.toLocaleTimeString()}
          </div>
          <div className="text-[10px] text-[#666] italic mt-0.5 select-text">
            {currentTime.toLocaleDateString('mn-MN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {errorMsg && (
        <div className="mb-6 border-l-4 border-red-700 bg-white p-4 text-xs font-mono text-red-800 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-700" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 border-l-4 border-[#12622F] bg-white p-4 text-xs font-mono text-[#12622F] flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#12622F]" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* COMPLETED EXAM STATUS SCREEN SPLASH */}
      {submissionCompleted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="border border-[#1A1A1A] bg-white p-6 mb-8 relative"
        >
          <div className="max-w-2xl">
            <h3 className="font-serif text-xl font-bold text-[#1A1A1A] flex items-center gap-2">
              <Award className="h-6 w-6 text-[#1A1A1A]" />
              <span>Шалгалт Амжилттай Дууслаа</span>
            </h3>
            
            {submissionCompleted.type === 'multiple-choice' ? (
              <div className="mt-4 space-y-3">
                <p className="font-serif text-sm text-[#444] leading-relaxed">
                  Таны хариултууд автоматаар шалгагдаж, дүн тавигдлаа.
                </p>
                <div className="inline-flex items-center gap-3 bg-[#F5F2ED] px-4 py-3 border border-[#1A1A1A] mt-2">
                  <span className="font-mono text-[10px] text-[#666] uppercase tracking-wider font-bold block leading-none">Таны авсан оноо:</span>
                  <span className="font-serif text-2xl font-black text-[#1A1A1A] leading-none">
                    {submissionCompleted.score} / {submissionCompleted.maxScore}
                  </span>
                  <span className="text-[#1A1A1A] font-serif text-xs font-semibold">оноо</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 font-serif text-sm text-[#444] leading-relaxed">
                Таны бичгийн шалгалтын хариултууд амжилттай хүлээн авагдлаа. Багш таны материалыг удахгүй засаж үнэлэх бөгөөд "Миний Гүйцэтгэлийн Түүх" цэснээс дүнгээ харах боломжтой.
              </p>
            )}

            <button
              onClick={() => setSubmissionCompleted(null)}
              className="mt-6 border border-[#1A1A1A] bg-[#1A1A1A] text-[#F5F2ED] px-5 py-2 font-mono text-[10px] uppercase font-bold tracking-wider hover:bg-neutral-800 cursor-pointer"
            >
              Хяналтын самбар руу буцах
            </button>
          </div>
        </motion.div>
      )}

      {/* ACTIVE TEST WORKSPACE VIEW */}
      {takingExam && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-2 border-[#1A1A1A] bg-white p-6 md:p-10 mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b-2 border-[#1A1A1A] pb-5 mb-6 gap-4">
            <div>
              <span className={`inline-flex px-2.5 py-0.5 text-[9px] font-mono font-bold border uppercase tracking-widest ${getSubjectColor(takingExam.subject)}`}>
                {takingExam.subject}
              </span>
              <h3 className="font-serif text-2xl font-black text-[#1A1A1A] mt-2 select-none">
                Шалгалт: {takingExam.title}
              </h3>
              <p className="font-mono text-[10px] text-[#666] uppercase tracking-widest mt-0.5">
                Хэлбэр: {takingExam.type === 'multiple-choice' ? 'Сонгох асуулт (Автомат дүн)' : 'Бичих асуулт (Багш засах)'}
              </p>
            </div>
            
            <button
              onClick={() => {
                if (window.confirm('Шалгалтыг орхих уу? Таны хариултууд хадгалагдахгүй болохыг анхаарна уу.')) {
                  setTakingExam(null);
                }
              }}
              className="font-mono text-xs uppercase tracking-wider border border-[#1A1A1A] px-3 py-1.5 text-[#1A1A1A] hover:bg-red-50 hover:text-red-700 transition-colors shrink-0 self-start cursor-pointer"
            >
              Шалгалтыг орхих
            </button>
          </div>

          {/* Test Questions mapper */}
          <div className="space-y-8 select-none">
            {takingExam.questions.map((q, index) => (
              <div key={q.id} className="p-6 border border-[#1A1A1A] bg-[#F5F2ED] space-y-4">
                <span className="inline-flex h-7 w-7 items-center justify-center border border-[#1A1A1A] bg-[#1A1A1A] font-mono text-xs font-bold text-[#F5F2ED]">
                  {index + 1}
                </span>

                <h4 className="font-serif text-lg font-bold text-[#1A1A1A] select-none leading-relaxed">
                  {q.text}
                </h4>

                {/* Multiple choice controls */}
                {takingExam.type === 'multiple-choice' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    {(q as MCQuestion).options.map((opt, optIndex) => {
                      const isSelected = answers[q.id] === optIndex;
                      return (
                        <button
                          key={optIndex}
                          type="button"
                          onClick={() => handleSelectMCOption(q.id, optIndex)}
                          className={`w-full flex items-center gap-3 p-3.5 text-left transition-all border cursor-pointer ${
                            isSelected
                              ? 'border-[#1A1A1A] bg-[#1A1A1A] text-[#F5F2ED] font-semibold'
                              : 'border-[#1A1A1A] bg-white hover:bg-[#F5F2ED] text-[#1A1A1A]'
                          }`}
                        >
                          <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center border font-mono text-[9px] font-bold ${
                            isSelected ? 'bg-white text-[#1A1A1A]' : 'bg-[#F2EDF5] text-[#1A1A1A]'
                          }`}>
                            {String.fromCharCode(65 + optIndex)}
                          </span>
                          <span className="font-sans text-xs sm:text-sm select-none">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Written essay feedback text area */}
                {takingExam.type === 'written' && (
                  <div className="mt-4">
                    <textarea
                      value={(answers[q.id] as string) || ''}
                      onChange={(e) => handleWriteAnswerText(q.id, e.target.value)}
                      placeholder="Нийтлэлийнхээ хариултыг дэлгэрэнгүй бичнэ үү. Тодорхой байж, түүхэн баримтууд эсвэл нийгэм судлалын агуулгыг дурдаж болно..."
                      rows={8}
                      className="block w-full border border-[#1A1A1A] bg-white py-3 px-4 font-serif text-sm focus:outline-none placeholder-neutral-500 select-all leading-relaxed"
                    />
                  </div>
                )}

              </div>
            ))}
          </div>

          {/* Test Action drawer */}
          <div className="border border-[#1A1A1A] bg-[#F5F2ED] p-5 mt-10 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="font-mono text-xs uppercase tracking-widest text-[#1A1A1A]">
              Шалгалтын явц: <strong className="text-black">{Object.keys(answers).length}</strong> / <strong className="text-black">{takingExam.questions.length}</strong> Хариулсан
            </div>
            
            <button
              onClick={handleSubmitExamBooklet}
              disabled={isSubmitting}
              id="submit-sheet-btn"
              className="inline-flex items-center gap-2 border border-[#1A1A1A] bg-[#1A1A1A] px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-[#F5F2ED] hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span>Шалгалтын материалыг илгээх</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

        </motion.div>
      )}

      {/* DASHBOARD SECTIONS SWITCH TAB */}
      {!takingExam && (
        <div className="space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#1A1A1A] pb-3 gap-4">
            
            {/* Quick sections tabs */}
            <div className="flex space-x-6">
              <button
                onClick={() => { setActiveSection('available'); setErrorMsg(null); setSuccessMsg(null); }}
                id="sec-available"
                className={`pb-3 font-mono text-[11px] font-bold uppercase tracking-widest transition-colors relative ${
                  activeSection === 'available' ? 'text-[#1A1A1A]' : 'text-[#666] hover:text-[#1A1A1A]'
                }`}
              >
                <span>Зарлагдсан Шалгалтууд</span>
                {activeSection === 'available' && (
                  <motion.div layoutId="studentTabLine" className="absolute bottom-0 inset-x-0 h-0.5 bg-[#1A1A1A]" />
                )}
              </button>

              <button
                onClick={() => { setActiveSection('results'); setErrorMsg(null); setSuccessMsg(null); }}
                id="sec-results"
                className={`pb-3 font-mono text-[11px] font-bold uppercase tracking-widest transition-colors relative ${
                  activeSection === 'results' ? 'text-[#1A1A1A]' : 'text-[#666] hover:text-[#1A1A1A]'
                }`}
              >
                <span>Миний Гүйцэтгэлийн Түүх ({submissions.length})</span>
                {activeSection === 'results' && (
                  <motion.div layoutId="studentTabLine" className="absolute bottom-0 inset-x-0 h-0.5 bg-[#1A1A1A]" />
                )}
              </button>
            </div>

            {/* Subject Filters (history, Social Studies) */}
            {activeSection === 'available' && (
              <div className="flex items-center gap-2 bg-white p-1 border border-[#1A1A1A]">
                <button
                  onClick={() => setActiveSubject('all')}
                  className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider font-semibold select-none cursor-pointer ${
                    activeSubject === 'all' ? 'bg-[#1A1A1A] text-white' : 'text-[#666] hover:text-[#1A1A1A]'
                  }`}
                >
                  Бүх хичээл
                </button>
                <div className="h-3 w-px bg-[#D1CDC7]" />
                <button
                  onClick={() => setActiveSubject('history')}
                  className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider font-semibold select-none cursor-pointer ${
                    activeSubject === 'history' ? 'bg-[#1A1A1A] text-white' : 'text-[#666] hover:text-[#1A1A1A]'
                  }`}
                >
                  Түүх
                </button>
                <div className="h-3 w-px bg-[#D1CDC7]" />
                <button
                  onClick={() => setActiveSubject('Social Studies')}
                  className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider font-semibold select-none cursor-pointer ${
                    activeSubject === 'Social Studies' ? 'bg-[#1A1A1A] text-white' : 'text-[#666] hover:text-[#1A1A1A]'
                  }`}
                >
                  Нийгэм Судлал
                </button>
              </div>
            )}
          </div>

          {/* RENDER AVAILABLE ASSESSMENTS SECTION */}
          {activeSection === 'available' && (
            <div>
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1A1A1A] border-t-transparent" />
                </div>
              ) : filteredExams.length === 0 ? (
                <div className="text-center py-16 bg-white border border-[#1A1A1A] flex flex-col items-center">
                  <BookOpen className="h-10 w-10 text-[#1A1A1A] mb-3" />
                  <h4 className="font-serif text-lg font-bold text-[#1A1A1A]">Зарлагдсан шалгалт байхгүй байна</h4>
                  <p className="font-serif italic text-xs text-[#666] mt-1 max-w-xs">
                    Багш нар одоогоор ямар нэгэн шалгалтын материал үүсгээгүй байна. Дараа дахин шалгана уу.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredExams.map((exam) => {
                    const scheduledDate = new Date(exam.availableAt);
                    const isReleased = scheduledDate <= currentTime;
                    const takenSubmission = submissions.find(s => s.examId === exam.id);
                    const hasSubmitted = !!takenSubmission;

                    return (
                      <div key={exam.id} className="flex flex-col border border-[#1A1A1A] bg-white p-6 relative justify-between">
                        
                        <div>
                          {/* Card Headers */}
                          <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#D1CDC7]">
                            <span className={`px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider border ${getSubjectColor(exam.subject)}`}>
                              {exam.subject === 'history' ? 'ТҮҮХ' : 'НИЙГЭМ СУДЛАЛ'}
                            </span>
                            <span className="font-mono text-[9px] uppercase tracking-wider text-[#666]">
                              {exam.type === 'multiple-choice' ? 'Сонгох хэлбэр' : 'Бичих хэлбэр'}
                            </span>
                          </div>

                          <h3 className="font-serif text-xl font-bold text-[#1A1A1A] block tracking-tight line-clamp-2 min-h-[3.5rem]">
                            {exam.title}
                          </h3>

                          {/* Timing Details */}
                          <div className="mt-4 space-y-2 text-[#444] font-serif text-xs min-h-[3.5rem]">
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-mono text-[10px] text-[#666] uppercase">ЭХЛЭХ ЦАГ:</span>
                              <span className="italic font-medium">{formatTimestamp(exam.availableAt)}</span>
                            </div>
                            
                            {/* Status flags */}
                            {!isReleased && (
                              <div className="font-mono text-[9px] font-bold text-red-700 uppercase tracking-widest bg-[#FFF2F2] border border-red-200 px-2 py-1 flex items-center gap-1 mt-1">
                                <Clock className="h-3 w-3 animate-pulse" />
                                <span>Шалгалт товлогдсон (Түгжээтэй)</span>
                              </div>
                            )}

                            {isReleased && !hasSubmitted && (
                              <div className="font-mono text-[9px] font-bold text-[#12622F] uppercase tracking-widest bg-[#EEF9F3] border border-[#12622F] px-2 py-1 flex items-center gap-1 mt-1">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Шалгалт идэвхтэй - Орох боломжтой</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons controls at footer */}
                        <div className="border-t border-[#D1CDC7] pt-4 mt-6 flex justify-between items-center">
                          <span className="font-mono text-[10px] uppercase font-bold text-[#666]">
                            {exam.questions.length} асуулттай
                          </span>

                          {hasSubmitted ? (
                            <div className="inline-flex items-center gap-1 border border-[#12622F] bg-[#EEF9F3] px-3 py-1 font-mono text-[10px] uppercase font-bold text-[#12622F]">
                              <Check className="h-3 w-3" id="checkmark" />
                              <span>Илгээсэн</span>
                            </div>
                          ) : !isReleased ? (
                            <button
                              disabled
                              className="inline-flex items-center gap-1 bg-[#D1CDC7] px-3 py-1.5 font-mono text-[10px] uppercase font-bold text-[#666] cursor-not-allowed"
                            >
                              <span>Хугацаа болоогүй</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartExam(exam)}
                              id={`start-test-${exam.id}`}
                              className="inline-flex items-center gap-1 border border-[#1A1A1A] bg-[#1A1A1A] px-4.5 py-1.5 font-mono text-[10px] uppercase font-bold text-[#F5F2ED] hover:bg-neutral-800 transition-colors cursor-pointer"
                            >
                              <span>Шалгалтад орох</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* RENDER GRADED HISTORY SECTION */}
          {activeSection === 'results' && (
            <div>
              {submissions.length === 0 ? (
                <div className="text-center py-16 bg-white border border-[#1A1A1A] flex flex-col items-center">
                  <Award className="h-10 w-10 text-[#1A1A1A] mb-3" />
                  <h4 className="font-serif text-lg font-bold text-[#1A1A1A]">Ирүүлсэн сорил байхгүй байна</h4>
                  <p className="font-serif italic text-xs text-[#666] mt-1 max-w-sm">
                    Та одоогоор ямар нэгэн шалгалтын материал илгээгээгүй байна. "Зарлагдсан Шалгалтууд" цэс рүү орно уу.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {submissions.map((sub) => {
                    const isGraded = sub.status === 'graded';
                    return (
                      <div key={sub.id} className="border border-[#1A1A1A] bg-white p-6 relative">
                        <div className="sm:flex sm:items-start sm:justify-between gap-6 pb-4 border-b border-[#D1CDC7]">
                          <div className="space-y-2">
                            <span className={`px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider border ${getSubjectColor(sub.subject)}`}>
                              {sub.subject === 'history' ? 'ТҮҮХ' : 'НИЙГЭМ СУДЛАЛ'}
                            </span>
                            <h3 className="font-serif text-2xl font-bold text-[#1A1A1A] tracking-tight block max-w-xl">
                              {sub.examTitle}
                            </h3>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-[#666] block">
                              Шалгалтын хэлбэр: <strong className="text-black font-bold">{sub.examType === 'multiple-choice' ? 'Сонгох хэлбэр' : 'Бичих хэлбэр'}</strong>
                            </span>
                          </div>

                          <div className="mt-4 sm:mt-0 text-left sm:text-right shrink-0 font-mono text-xs">
                            <div className="flex sm:justify-end items-center gap-1.5">
                              {isGraded ? (
                                <>
                                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                                  <span className="font-bold text-emerald-800 uppercase text-[10px] tracking-wider">Үнэлэгдсэн</span>
                                </>
                              ) : (
                                <>
                                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                  <span className="font-bold text-amber-850 uppercase text-[10px] tracking-wider">Үнэлгээ хүлээж буй</span>
                                </>
                              )}
                            </div>

                            <p className="font-serif text-3xl font-black text-[#1A1A1A] mt-2">
                              {sub.score} / {sub.maxScore} <span className="font-sans text-xs font-normal text-[#666]">оноо</span>
                            </p>
                            <span className="font-mono text-[9px] text-[#666] uppercase block mt-1">
                              Хүлээлгэн өгсөн: {formatTimestamp(sub.submittedAt)}
                            </span>
                          </div>
                        </div>

                        {/* Admin Feedback Box */}
                        {isGraded && sub.feedback && (
                          <div className="mt-4 bg-[#F5F2ED] p-4 border border-[#D1CDC7]">
                            <span className="font-mono text-[9px] uppercase font-bold tracking-widest text-[#666] block mb-2">
                              БАГШИЙН САНАЛ СЭТГЭГДЭЛ, ЗӨВЛӨМЖ:
                            </span>
                            <blockquote className="font-serif text-sm text-[#1A1A1A] italic leading-relaxed select-text border-l-2 border-[#1A1A1A] pl-4">
                              "{sub.feedback}"
                            </blockquote>
                            <p className="font-mono text-[9px] text-[#666] tracking-wider text-right mt-3 font-bold uppercase">
                              Багш үнэлсэн {sub.gradedAt ? `(${formatTimestamp(sub.gradedAt)})` : ''}
                            </p>
                          </div>
                        )}

                        {!isGraded && sub.examType === 'written' && (
                          <div className="mt-4 bg-[#FFF9EB] p-3 border border-[#D1CDC7] font-serif text-xs text-[#6E4E00] flex items-center gap-2 leading-relaxed">
                            <AlertCircle className="h-4 w-4 shrink-0 text-[#6E4E00]" />
                            <span>Таны хариулт хуудас архивлагдсан байна. Багш таны бичсэн эссэтэй танилцаж, үнэлгээ өгсний дараа санал зөвлөмж доор харагдах болно.</span>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      )}

    </div>
  );
}

// Inner small check to satisfy typescript compile
function Check({ className, id }: { className?: string, id?: string }) {
  return (
    <svg className={className} id={id} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
