import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, getDocs, doc, setDoc, deleteDoc, updateDoc, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore';
import { Exam, ExamSubject, ExamType, Question, MCQuestion, WrittenQuestion, Submission, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Calendar, ClipboardList, Users, Award, BookOpen, Clock, 
  CheckCircle2, AlertCircle, Trash2, Check, FileText, Send, ChevronRight,
  GraduationCap
} from 'lucide-react';

interface AdminDashboardProps {
  currentAdmin: UserProfile;
}

export default function AdminDashboard({ currentAdmin }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'exams' | 'students' | 'submissions'>('exams');
  
  // Real datasets
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);

  // Loading states
  const [loadingExams, setLoadingExams] = useState<boolean>(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState<boolean>(true);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(true);

  // Creator Engine State
  const [isCreatingExam, setIsCreatingExam] = useState<boolean>(false);
  const [examTitle, setExamTitle] = useState<string>('');
  const [examSubject, setExamSubject] = useState<ExamSubject>('history');
  const [examType, setExamType] = useState<ExamType>('multiple-choice');
  const [examAvailableDate, setExamAvailableDate] = useState<string>(''); // datetime-local format
  const [creatorQuestions, setCreatorQuestions] = useState<Question[]>([]);

  // Selected Submission for Grading Panel
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null);
  const [gradeScore, setGradeScore] = useState<number>(0);
  const [gradeFeedback, setGradeFeedback] = useState<string>('');
  const [isSubmittingGrade, setIsSubmittingGrade] = useState<boolean>(false);

  // Success/Error notification states
  const [notification, setNotification] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Show a notification
  const triggerNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // Real-time listener for Exams
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
      setLoadingExams(false);
    }, (error) => {
      console.error('Error fetching exams:', error);
      setLoadingExams(false);
    });

    return unsubscribe;
  }, []);

  // Real-time listener for Submissions
  useEffect(() => {
    const submissionsCol = collection(db, 'submissions');
    const unsubscribe = onSnapshot(submissionsCol, (snapshot) => {
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
      setLoadingSubmissions(false);
    }, (error) => {
      console.error('Error fetching submissions:', error);
      setLoadingSubmissions(false);
    });

    return unsubscribe;
  }, []);

  // Real-time listener for Registered Users (categorized as students in our system)
  useEffect(() => {
    const usersCol = collection(db, 'users');
    const unsubscribe = onSnapshot(usersCol, (snapshot) => {
      const studentsList: UserProfile[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.role === 'student' && data.email !== 'teacheradmin@exam.mn' && data.email !== 'adminnaba@exam.mn') {
          studentsList.push({
            uid: doc.id,
            name: data.name,
            email: data.email,
            role: data.role,
            createdAt: data.createdAt?.toDate() || new Date(data.createdAt),
          });
        }
      });
      setStudents(studentsList);
      setLoadingStudents(false);
    }, (error) => {
      console.error('Error fetching students:', error);
      setLoadingStudents(false);
    });

    return unsubscribe;
  }, []);

  // Initialize a blank question depending on Selected Exam Type
  const handleAddNewQuestionToCreator = () => {
    const randomId = Math.random().toString(36).substring(2, 9);
    if (examType === 'multiple-choice') {
      const newMc: MCQuestion = {
        id: randomId,
        text: '',
        options: ['', '', '', ''],
        correctIndex: 0
      };
      setCreatorQuestions([...creatorQuestions, newMc]);
    } else {
      const newWritten: WrittenQuestion = {
        id: randomId,
        text: ''
      };
      setCreatorQuestions([...creatorQuestions, newWritten]);
    }
  };

  // Update specific question values in Creator Array
  const handleUpdateQuestion = (index: number, updatedFields: Partial<Question>) => {
    const copy = [...creatorQuestions];
    copy[index] = { ...copy[index], ...updatedFields } as Question;
    setCreatorQuestions(copy);
  };

  // Update specific MC question options key state
  const handleUpdateOption = (qIndex: number, optIndex: number, textValue: string) => {
    const copy = [...creatorQuestions];
    const targetQ = copy[qIndex] as MCQuestion;
    const optCopy = [...targetQ.options];
    optCopy[optIndex] = textValue;
    copy[qIndex] = { ...targetQ, options: optCopy };
    setCreatorQuestions(copy);
  };

  const handleRemoveQuestionFromCreator = (index: number) => {
    const copy = [...creatorQuestions];
    copy.splice(index, 1);
    setCreatorQuestions(copy);
  };

  // Exam Form Reset
  const resetExamCreatorState = () => {
    setExamTitle('');
    setExamSubject('history');
    setExamType('multiple-choice');
    setExamAvailableDate('');
    setCreatorQuestions([]);
    setIsCreatingExam(false);
  };

  // Submit Exam Creation payload to Firestore
  const handleSaveExamPaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTitle.trim()) {
      triggerNotification('error', 'Exam Title belongs to required fields.');
      return;
    }
    if (!examAvailableDate) {
      triggerNotification('error', 'Please define the schedule/available date.');
      return;
    }
    if (creatorQuestions.length === 0) {
      triggerNotification('error', 'Please design at least one question before publishing.');
      return;
    }

    // Secondary deep check for MC choices
    if (examType === 'multiple-choice') {
      for (let i = 0; i < creatorQuestions.length; i++) {
        const mc = creatorQuestions[i] as MCQuestion;
        if (!mc.text.trim()) {
          triggerNotification('error', `Question ${i + 1} has no question text.`);
          return;
        }
        if (mc.options.some(opt => !opt.trim())) {
          triggerNotification('error', `Question ${i + 1} has empty options fields.`);
          return;
        }
      }
    } else {
      for (let i = 0; i < creatorQuestions.length; i++) {
        const w = creatorQuestions[i] as WrittenQuestion;
        if (!w.text.trim()) {
          triggerNotification('error', `Question ${i + 1} has no question prompt.`);
          return;
        }
      }
    }

    const examId = 'exam_' + Math.random().toString(36).substring(2, 11);
    const parsedAvailableAt = new Date(examAvailableDate);

    // Assembly
    const newExamPayload = {
      id: examId,
      title: examTitle.trim(),
      subject: examSubject,
      type: examType,
      availableAt: parsedAvailableAt,
      questions: creatorQuestions,
      creatorId: currentAdmin.uid,
      createdAt: new Date(), // Using exact constructor instance
    };

    try {
      const examDocRef = doc(db, 'exams', examId);
      // Wait, let's enforce that timestamps match our rules.
      // Our rules require: `request.resource.data.createdAt == request.time`
      // In JS, to make it match request.time perfectly for create, we should pass serverTimestamp() for createdAt.
      // But wait! Is there any problem reading it back immediately locally? No, because our real-time listener will fetch it.
      // But let's construct the object precisely for setDoc:
      await setDoc(examDocRef, {
        id: newExamPayload.id,
        title: newExamPayload.title,
        subject: newExamPayload.subject,
        type: newExamPayload.type,
        availableAt: newExamPayload.availableAt,
        questions: newExamPayload.questions,
        creatorId: newExamPayload.creatorId,
        createdAt: serverTimestamp(), // Secure server-sync
      });

      triggerNotification('success', `Exam "${newExamPayload.title}" published securely.`);
      resetExamCreatorState();
    } catch (err: any) {
      console.error('Failed to create exam:', err);
      try {
        handleFirestoreError(err, OperationType.CREATE, `exams/${examId}`);
      } catch (wrappedErr: any) {
        triggerNotification('error', `Security Denied: ${wrappedErr.message}`);
      }
    }
  };

  // Delete an Exam
  const handleDeleteExam = async (examId: string, examTitleStr: string) => {
    if (!window.confirm(`Are you sure you want to delete "${examTitleStr}"? This will lock students from accessing it.`)) return;
    
    try {
      await deleteDoc(doc(db, 'exams', examId));
      triggerNotification('success', `Exam "${examTitleStr}" deleted successfully.`);
    } catch (err: any) {
      console.error('Delete exam error:', err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `exams/${examId}`);
      } catch (wrappedErr: any) {
        triggerNotification('error', `Action unauthorized: ${wrappedErr.message}`);
      }
    }
  };

  // Open Grading Panel
  const handleOpenGradingWorkspace = (submission: Submission) => {
    setGradingSubmission(submission);
    setGradeScore(submission.score || 0);
    setGradeFeedback(submission.feedback || '');
  };

  // Submit written grade update
  const handlePublishGrade = async () => {
    if (!gradingSubmission) return;
    setIsSubmittingGrade(true);

    if (gradeScore < 0 || gradeScore > gradingSubmission.maxScore) {
      triggerNotification('error', `Score must be between 0 and ${gradingSubmission.maxScore} (Max Points).`);
      setIsSubmittingGrade(false);
      return;
    }

    try {
      const submissionDocRef = doc(db, 'submissions', gradingSubmission.id);
      
      // Update payload fields restricted by rules
      // Rules allow updates to: 'status', 'feedback', 'score', 'gradedBy', 'gradedAt'
      await updateDoc(submissionDocRef, {
        status: 'graded',
        score: Number(gradeScore),
        feedback: gradeFeedback.trim(),
        gradedBy: currentAdmin.uid,
        gradedAt: serverTimestamp(), // Secure temporal synchronization
      });

      triggerNotification('success', `Feedback and score submitted for ${gradingSubmission.studentName}.`);
      setGradingSubmission(null);
    } catch (err: any) {
      console.error('Grading submit error:', err);
      try {
        handleFirestoreError(err, OperationType.UPDATE, `submissions/${gradingSubmission.id}`);
      } catch (wrappedErr: any) {
        triggerNotification('error', `Grading failed: ${wrappedErr.message}`);
      }
    } finally {
      setIsSubmittingGrade(false);
    }
  };

  // Helper date parsing
  const formatTimestamp = (ts: any) => {
    if (!ts) return 'Pending Date';
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

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 bg-[#F5F2ED] min-h-screen text-[#1A1A1A]">
      
      {/* Banner / Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed right-4 top-20 z-50 flex items-center gap-2 border p-4 shadow-md rounded-none font-mono text-xs ${
              notification.type === 'success' 
                ? 'bg-[#EEF9F3] border-[#12622F] text-[#12622F]' 
                : 'bg-[#FFF2F2] border-red-700 text-red-900'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span className="font-mono tracking-tight font-bold">{notification.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editorial Header Block */}
      <div className="border-b-2 border-[#1A1A1A] pb-6 mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="font-mono text-[10px] text-[#666] uppercase tracking-[0.2em] block mb-1">
            БАГШИЙН УДИРДЛАГЫН ТАВЦАН
          </span>
          <h1 className="font-serif text-4xl font-extrabold tracking-tight text-[#1A1A1A]">
            Багшийн Удирдлагын Хянах Самбар
          </h1>
          <p className="mt-2 font-serif italic text-sm text-[#444] max-w-2xl leading-relaxed">
            Тавтай морил, Администратор <strong className="font-sans font-bold text-[#1A1A1A]">{currentAdmin.email}</strong>. Эндээс та шалгалтын материал бэлтгэх, оюутнуудын ирүүлсэн сорилыг засаж үнэлэх, дүнгийн бүртгэлийг баталгаажуулах боломжтой.
          </p>
        </div>
        {!isCreatingExam && !gradingSubmission && (
          <button
            onClick={() => {
              setIsCreatingExam(true);
              handleAddNewQuestionToCreator(); // Start with one blank question
            }}
            id="create-exam-btn"
            className="inline-flex items-center gap-2 border border-[#1A1A1A] bg-[#1A1A1A] px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-[#F5F2ED] hover:bg-neutral-800 transition-colors cursor-pointer self-start rounded-none"
          >
            <Plus className="h-4 w-4" />
            <span>Шинэ Шалгалт Үүсгэх</span>
          </button>
        )}
      </div>

      {/* Tabs list */}
      {!isCreatingExam && !gradingSubmission && (
        <div className="mb-6 border-b border-[#1A1A1A]">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => { setActiveTab('exams'); setSelectedStudent(null); }}
              id="tab-exams"
              className={`flex items-center gap-2 pb-4 font-mono text-[11px] font-bold uppercase tracking-widest transition-colors relative cursor-pointer ${
                activeTab === 'exams'
                  ? 'text-[#1A1A1A]'
                  : 'text-[#666] hover:text-[#1A1A1A]'
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              <span>Шалгалтын Жагсаалт ({exams.length})</span>
              {activeTab === 'exams' && (
                <motion.div layoutId="adminTabLine" className="absolute bottom-0 inset-x-0 h-0.5 bg-[#1A1A1A]" />
              )}
            </button>

            <button
              onClick={() => { setActiveTab('students'); setSelectedStudent(null); }}
              id="tab-students"
              className={`flex items-center gap-2 pb-4 font-mono text-[11px] font-bold uppercase tracking-widest transition-colors relative cursor-pointer ${
                activeTab === 'students'
                  ? 'text-[#1A1A1A]'
                  : 'text-[#666] hover:text-[#1A1A1A]'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Бүртгэлтэй Оюутнууд ({students.length})</span>
              {activeTab === 'students' && (
                <motion.div layoutId="adminTabLine" className="absolute bottom-0 inset-x-0 h-0.5 bg-[#1A1A1A]" />
              )}
            </button>

            <button
              onClick={() => { setActiveTab('submissions'); setSelectedStudent(null); }}
              id="tab-submissions"
              className={`flex items-center gap-2 pb-4 font-mono text-[11px] font-bold uppercase tracking-widest transition-colors relative cursor-pointer ${
                activeTab === 'submissions'
                  ? 'text-[#1A1A1A]'
                  : 'text-[#666] hover:text-[#1A1A1A]'
              }`}
            >
              <Award className="h-4 w-4" />
              <span>Хүлээн Авсан Шалгалтууд ({submissions.length})</span>
              {activeTab === 'submissions' && (
                <motion.div layoutId="adminTabLine" className="absolute bottom-0 inset-x-0 h-0.5 bg-[#1A1A1A]" />
              )}
            </button>
          </nav>
        </div>
      )}

      {/* RENDER ACTIVE TAB CODES */}
      <div className="space-y-6">
        
        {/* EXAM CREATION FORM workspace */}
        {isCreatingExam && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-2 border-[#1A1A1A] bg-white p-6 sm:p-8"
          >
            <div className="flex items-center justify-between border-b-2 border-[#1A1A1A] pb-5 mb-6">
              <div>
                <span className="font-mono text-xs font-semibold text-[#1A1A1A] uppercase tracking-widest block mb-1">
                  Шалгалт Боловсруулах Хэсэг
                </span>
                <h3 className="font-serif text-2xl font-black text-[#1A1A1A]">
                  Шинэ Шалгалтын Матерал Бэлтгэх
                </h3>
              </div>
              <button
                type="button"
                onClick={resetExamCreatorState}
                className="font-mono text-xs font-bold uppercase tracking-wider text-[#666] hover:text-[#1A1A1A] border border-[#D1CDC7] px-3 py-1 bg-[#F5F2ED] cursor-pointer"
              >
                Цуцлаад Гарах
              </button>
            </div>

            <form onSubmit={handleSaveExamPaper} className="space-y-6">
              
              {/* Grid configs */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="exam-title-input" className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                    Шалгалтын Нэр
                  </label>
                  <input
                    type="text"
                    id="exam-title-input"
                    placeholder="Жнь: Монголын Түүх - Эзэнт Гүрний Үе сорил"
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    required
                    className="block w-full border border-[#1A1A1A] py-2.5 px-3 font-serif text-sm placeholder-neutral-500 focus:outline-none bg-white rounded-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="exam-subject-select" className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                    Хичээлийн Чиглэл
                  </label>
                  <select
                    id="exam-subject-select"
                    value={examSubject}
                    onChange={(e) => setExamSubject(e.target.value as ExamSubject)}
                    className="block w-full border border-[#1A1A1A] py-2.5 px-3 font-mono text-xs focus:outline-none bg-white rounded-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%25203-3%22%20stroke%3D%22%25236b7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-10"
                  >
                    <option value="history">Түүх</option>
                    <option value="Social Studies">Нийгэм Судлал</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="exam-type-select" className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                    Шалгалтын Хэлбэр
                  </label>
                  <select
                    id="exam-type-select"
                    value={examType}
                    onChange={(e) => {
                      setExamType(e.target.value as ExamType);
                      setCreatorQuestions([]); // Clear to match structure
                    }}
                    className="block w-full border border-[#1A1A1A] py-2.5 px-3 font-mono text-xs focus:outline-none bg-white rounded-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%25203-3%22%20stroke%3D%22%25236b7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-10"
                  >
                    <option value="multiple-choice">Сонгох асуулттай (Автоматаар засагдах)</option>
                    <option value="written">Бичих асуулттай (Багш засах)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="exam-available-input" className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                    Шалгалт Эхлэх Огноо & Цаг
                  </label>
                  <input
                    type="datetime-local"
                    id="exam-available-input"
                    value={examAvailableDate}
                    onChange={(e) => setExamAvailableDate(e.target.value)}
                    required
                    className="block w-full border border-[#1A1A1A] py-2.5 px-3 font-mono text-xs focus:outline-none bg-white rounded-none"
                  />
                  <span className="font-serif italic text-xs text-[#666] block">
                    * Оюутнууд энэ шалгалтыг зөвхөн товлосон цагаас эхлэн өгөх боломжтой.
                  </span>
                </div>
              </div>

              {/* QUESTIONS SECTION */}
              <div className="border-t-2 border-[#1A1A1A] pt-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#D1CDC7]">
                  <div>
                    <h4 className="font-serif text-lg font-bold text-[#1A1A1A]">
                      Шалгалтын Асуултууд ({creatorQuestions.length})
                    </h4>
                    <p className="font-serif italic text-xs text-[#666]">
                      Доорх хэсэгт тодорхой, ойлгомжтой асуултуудаа оруулна уу.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddNewQuestionToCreator}
                    className="inline-flex items-center gap-1.5 border border-[#1A1A1A] bg-white text-[#1A1A1A] px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider hover:bg-[#F5F2ED] cursor-pointer rounded-none"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Асуулт Нэмэх</span>
                  </button>
                </div>

                {creatorQuestions.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-[#1A1A1A] bg-[#F5F2ED]">
                    <p className="font-serif italic text-sm text-[#666]">Асуулт нэмэгдээгүй байна. Дээрх \"Асуулт Нэмэх\" товчийг дарна уу.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {creatorQuestions.map((q, qIndex) => (
                      <div key={q.id} className="p-5 border border-[#1A1A1A] bg-[#F5F2ED] space-y-4 rounded-none">
                        
                        {/* Title line */}
                        <div className="flex items-start justify-between gap-4">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center border border-[#1A1A1A] bg-[#1A1A1A] font-mono text-xs font-bold text-white">
                            {qIndex + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestionFromCreator(qIndex)}
                            className="text-xs font-mono font-bold uppercase tracking-wider text-red-700 hover:text-red-900 border border-transparent hover:border-red-200 hover:bg-white px-2 py-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5 inline mr-1" />
                            <span>Устгах</span>
                          </button>
                        </div>

                        {/* Question Text */}
                        <div className="space-y-1.5">
                          <label className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                            Асуултын Текст
                          </label>
                          <textarea
                            value={q.text}
                            onChange={(e) => handleUpdateQuestion(qIndex, { text: e.target.value })}
                            placeholder="Жнь: Чингис хаан хэдэн онд Их Монгол Улсыг байгуулсан бэ?"
                            rows={2}
                            required
                            className="block w-full border border-[#1A1A1A] py-2 px-3 font-serif text-sm focus:outline-none bg-white rounded-none placeholder-neutral-400"
                          />
                        </div>

                        {/* If Multiple Choice, render Options Inputs */}
                        {examType === 'multiple-choice' && (
                          <div className="space-y-3 pt-2">
                            <label className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                              Хариултын Сонголтууд & Зөв Хариултын Тэмдэглэгээ (Зөв хариултын дугуйг сонгоно уу)
                            </label>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {(q as MCQuestion).options.map((opt, optIndex) => (
                                <div key={optIndex} className="flex items-center gap-2 bg-white p-2.5 border border-[#1A1A1A]">
                                  <input
                                    type="radio"
                                    name={`correct_${q.id}`}
                                    checked={(q as MCQuestion).correctIndex === optIndex}
                                    onChange={() => handleUpdateQuestion(qIndex, { correctIndex: optIndex })}
                                    className="h-4 w-4 border-[#1A1A1A] text-black focus:ring-0 shrink-0 cursor-pointer"
                                    title="Mark as correct answer"
                                  />
                                  <span className="font-mono text-xs font-bold text-[#1A1A1A] shrink-0">
                                    Сонголт {String.fromCharCode(65 + optIndex)}:
                                  </span>
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => handleUpdateOption(qIndex, optIndex, e.target.value)}
                                    placeholder="Сонголтын текстийг оруулна уу"
                                    required
                                    className="block w-full border-none p-1 font-sans text-xs focus:outline-none focus:ring-0 text-[#1A1A1A]"
                                  />
                                </div>
                              ))}
                            </div>
                            <span className="font-serif italic text-xs text-[#666] block">
                              * Зөв хариултыг дугуй дээр дарж сонгон уу.
                            </span>
                          </div>
                        )}

                        {examType === 'written' && (
                          <div className="font-serif text-xs text-[#004D27] bg-[#EDF8F4] p-3 border border-[#D1CDC7] flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span>Бичгийн шалгалтын тохиргоо: Оюутнуудад түүхэн үзэл бодол, дүн шинжилгээг дэлгэрэнгүй бичих талбар харагдах болно.</span>
                          </div>
                        )}

                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 border-t-2 border-[#1A1A1A] pt-6">
                <button
                  type="button"
                  onClick={resetExamCreatorState}
                  className="border border-[#1A1A1A] bg-white px-5 py-2.5 font-mono text-[10px] uppercase font-bold tracking-widest text-[#1A1A1A] hover:bg-[#F5F2ED] cursor-pointer rounded-none"
                >
                  Нооргийг устгах
                </button>
                <button
                  type="submit"
                  id="save-exam-paper-btn"
                  className="border border-[#1A1A1A] bg-[#1A1A1A] px-6 py-2.5 font-mono text-[10px] uppercase font-bold tracking-widest text-white hover:bg-neutral-800 cursor-pointer rounded-none"
                >
                  <Send className="h-3.5 w-3.5 inline mr-1" />
                  <span>Шалгалтыг Нийтлэх</span>
                </button>
              </div>

            </form>
          </motion.div>
        )}

        {/* GRADING WORKSPACE FOR WRITTEN ASSESSMENTS */}
        {gradingSubmission && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-2 border-[#1A1A1A] bg-white p-6 md:p-8"
          >
            <div className="flex items-center justify-between border-b-2 border-[#1A1A1A] pb-5 mb-6">
              <div>
                <span className="font-mono text-xs font-semibold text-[#1A1A1A] uppercase tracking-widest block mb-1">
                  Шалгалтын Хуудас Засах / Үнэлэх Хэсэг
                </span>
                <h3 className="font-serif text-2xl font-black text-[#1A1A1A]">
                  Бичгийн Шалгалтын Үнэлгээ: {gradingSubmission.studentName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGradingSubmission(null)}
                className="font-mono text-xs font-bold uppercase tracking-wider text-[#666] hover:text-[#1A1A1A] border border-[#D1CDC7] px-3 py-1 bg-[#F5F2ED] cursor-pointer"
              >
                Хаагаад Буцах
              </button>
            </div>

            {/* Context bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#F5F2ED] p-5 border border-[#1A1A1A] mb-6 font-serif text-sm">
              <div>
                <span className="text-[#666] block uppercase font-mono text-[9px] font-bold tracking-widest mb-1">Шалгалтын Нэр</span>
                <span className="font-bold text-[#1A1A1A] text-sm block">{gradingSubmission.examTitle}</span>
              </div>
              <div>
                <span className="text-[#666] block uppercase font-mono text-[9px] font-bold tracking-widest mb-1">Чиглэл</span>
                <span className="font-bold text-[#1A1A1A] text-sm block">{gradingSubmission.subject === 'history' ? 'Түүх' : 'Нийгэм Судлал'}</span>
              </div>
              <div>
                <span className="text-[#666] block uppercase font-mono text-[9px] font-bold tracking-widest mb-1">Ирүүлсэн Хүн</span>
                <span className="font-bold text-red-950 block text-sm">{gradingSubmission.studentName}</span>
                <span className="text-xs font-mono block text-neutral-500 mt-0.5 leading-none">{gradingSubmission.studentEmail}</span>
              </div>
              <div>
                <span className="text-[#666] block uppercase font-mono text-[9px] font-bold tracking-widest mb-1">Хүлээлгэн өгсөн цаг</span>
                <span className="font-mono text-xs text-[#1A1A1A] font-semibold">{formatTimestamp(gradingSubmission.submittedAt)}</span>
              </div>
            </div>

            {/* Questions Answer comparative grid */}
            <div className="space-y-6 mb-8 select-none">
              <h4 className="font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-widest pb-1 border-b border-[#D1CDC7]">
                Оюутны Хариулт & Шалгалтын Асуултууд
              </h4>

              {/* To retrieve questions belonging to this exam, look up local exam or display list */}
              {(() => {
                const correspondingExam = exams.find(e => e.id === gradingSubmission.examId);
                const originalQuestions = correspondingExam?.questions || [];

                return (
                  <div className="space-y-5">
                    {/* Iterate over questions */}
                    {Object.entries(gradingSubmission.answers).map(([qId, answerText], index) => {
                      const matchedQ = originalQuestions.find(q => q.id === qId);
                      const questionText = matchedQ ? matchedQ.text : `Question ${index + 1}`;

                      return (
                        <div key={qId} className="border border-[#1A1A1A] p-5 bg-white space-y-3">
                          <span className="inline-flex h-7 w-7 items-center justify-center border border-[#1A1A1A] bg-[#1A1A1A] font-mono text-xs font-bold text-white">
                            {index + 1}
                          </span>
                          <blockquote className="border-l-4 border-[#1A1A1A] pl-4 py-2 bg-[#F5F2ED] text-[#1A1A1A] text-sm font-serif italic">
                            "{questionText}"
                          </blockquote>
                          <div>
                            <span className="font-mono text-[9px] font-bold text-[#666] uppercase tracking-widest block mb-1">
                              Оюутны Хариултын Текст:
                            </span>
                            <div className="bg-[#FFF9EA] p-4 border border-[#D1CDC7] font-serif text-sm text-[#1A1A1A] whitespace-pre-wrap leading-relaxed select-text font-medium">
                              {answerText ? String(answerText) : <span className="text-neutral-400 italic">Энэ асуултад хариулт ирүүлээгүй байна.</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Marking Controls */}
            <div className="border border-[#1A1A1A] bg-[#F5F2ED] p-6 rounded-none">
              <h4 className="font-serif text-lg font-bold text-[#1A1A1A] mb-4 uppercase tracking-tight">
                Үнэлгээний туслах хүснэгт
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Numeric score */}
                <div className="space-y-1.5 md:col-span-1">
                  <label htmlFor="grade-score-input" className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                    Авах ёстой оноо / Нийт оноо
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      id="grade-score-input"
                      value={gradeScore}
                      min={0}
                      max={gradingSubmission.maxScore}
                      onChange={(e) => setGradeScore(Number(e.target.value))}
                      className="block w-24 border border-[#1A1A1A] py-2 px-3 font-mono text-sm leading-6 focus:outline-none bg-white font-bold text-[#1A1A1A] rounded-none"
                    />
                    <span className="font-serif text-[#1A1A1A] text-sm font-bold">
                      нийт {gradingSubmission.maxScore} онооноос
                    </span>
                  </div>
                  <span className="font-serif italic text-xs text-[#666] block">
                    Оюутны гүйцэтгэлд өгөхийг хүссэн оноогоо засаж оруулна уу.
                  </span>
                </div>

                {/* Text feedback */}
                <div className="space-y-1.5 md:col-span-2">
                  <label htmlFor="grade-feedback-textarea" className="block font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                    Материалын талаарх сэтгэгдэл & Зөвлөмж
                  </label>
                  <textarea
                    id="grade-feedback-textarea"
                    placeholder="Оюутны хариултын агуулга, дүн шинжилгээний гүн болон сургалтын хөтөлбөрт нийцсэн байдалд өгөх зөвлөмж сэтгэгдлээ энд бичнэ үү."
                    value={gradeFeedback}
                    onChange={(e) => setGradeFeedback(e.target.value)}
                    rows={4}
                    className="block w-full border border-[#1A1A1A] py-2 px-3 font-serif text-sm focus:outline-none bg-white placeholder-neutral-500 rounded-none leading-relaxed"
                  />
                </div>

              </div>

              {/* Controls */}
              <div className="flex justify-end gap-3 mt-6 border-t border-[#D1CDC7] pt-4">
                <button
                  type="button"
                  onClick={() => setGradingSubmission(null)}
                  className="border border-[#1A1A1A] bg-white px-5 py-2 font-mono text-[10px] uppercase font-bold tracking-widest text-[#1A1A1A] hover:bg-[#F5F2ED] cursor-pointer rounded-none"
                >
                  Өөрчлөлтийг цуцлах
                </button>
                <button
                  onClick={handlePublishGrade}
                  id="submit-grade-btn"
                  disabled={isSubmittingGrade}
                  className="inline-flex items-center gap-1.5 border border-[#1A1A1A] bg-[#1A1A1A] text-white px-5 py-2 font-mono text-[10px] uppercase font-bold tracking-widest hover:bg-neutral-800 disabled:opacity-50 cursor-pointer rounded-none"
                >
                  {isSubmittingGrade ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Дүн болон Санал Илгээх</span>
                    </>
                  )}
                </button>
              </div>

            </div>

          </motion.div>
        )}

        {/* TAB 1: EXAM REGISTRY PANEL */}
        {activeTab === 'exams' && !isCreatingExam && !gradingSubmission && (
          <div>
            {loadingExams ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1A1A1A] border-t-transparent" />
              </div>
            ) : exams.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-[#1A1A1A] bg-white">
                <ClipboardList className="h-12 w-12 text-[#666] mx-auto mb-4" />
                <h3 className="font-serif text-lg font-bold text-[#1A1A1A]">
                  Шалгалтын материал үүсгээгүй байна
                </h3>
                <p className="font-serif italic text-sm text-[#444] mt-1 max-w-sm mx-auto">
                  Firestore мэдээллийн санд одоогоор асуулга байхгүй байна. Шинээр сургалтын сорил бэлтгэхийн тулд доорхийг дарна уу.
                </p>
                <button
                  onClick={() => {
                    setIsCreatingExam(true);
                    handleAddNewQuestionToCreator();
                  }}
                  id="create-first-exam-btn"
                  className="mt-4 inline-flex items-center gap-1.5 border border-[#1A1A1A] bg-[#1A1A1A] text-white px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest hover:bg-neutral-800 cursor-pointer rounded-none"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Анхны шалгалт бэлтгэх</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {exams.map((exam) => (
                  <div key={exam.id} className="flex flex-col border border-[#1A1A1A] bg-white p-5 hover:bg-[#F5F2ED] transition-colors duration-150">
                    
                    {/* Header tags */}
                    <div className="flex items-center justify-between mb-3.5">
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase font-mono border tracking-wider ${getSubjectColor(exam.subject)}`}>
                        {exam.subject === 'history' ? 'ТҮҮХ' : 'НИЙГЭМ СУДЛАЛ'}
                      </span>
                      <span className="font-mono text-[9px] font-bold text-[#1A1A1A] uppercase tracking-wider bg-white px-2 py-0.5 border border-[#1A1A1A]">
                        {exam.type === 'multiple-choice' ? 'Сонгох хэлбэр' : 'Бичих хэлбэр'}
                      </span>
                    </div>

                    <h3 className="font-serif text-lg font-black text-[#1A1A1A] line-clamp-2 block leading-tight">
                      {exam.title}
                    </h3>

                    {/* Timeline stats */}
                    <div className="mt-4 space-y-2 text-[#444] font-serif text-xs flex-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-[#666] shrink-0" />
                        <span>Товлосон огноо: <strong className="font-sans text-xs underline decoration-[#D1CDC7] font-bold text-[#1A1A1A]">{formatTimestamp(exam.availableAt)}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-[#666] shrink-0" />
                        <span>Асуултын тоо: <strong className="font-mono text-xs text-[#1A1A1A]">{exam.questions?.length || 0}</strong> ширхэг</span>
                      </div>
                    </div>

                    {/* Footer Controls */}
                    <div className="border-t border-[#D1CDC7] pt-4 mt-5 flex items-center justify-between">
                      <span className="font-mono text-[9px] text-neutral-500">
                        ИД: {exam.id.slice(0, 8)}...
                      </span>
                      <button
                        onClick={() => handleDeleteExam(exam.id, exam.title)}
                        className="text-xs font-mono font-bold uppercase tracking-wider text-red-700 hover:text-red-900 border border-[#D1CDC7] bg-white hover:bg-neutral-50 hover:border-red-700 px-3 py-1.5 transition-all cursor-pointer rounded-none"
                        id={`delete-exam-${exam.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 inline mr-1" />
                        <span>Шалгалтыг устгах</span>
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: COORDINATED STUDENTS LIST */}
        {activeTab === 'students' && !isCreatingExam && !gradingSubmission && (
          <div>
            {loadingStudents ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1A1A1A] border-t-transparent" />
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-14 border border-dashed border-[#1A1A1A] bg-white">
                <Users className="h-11 w-11 text-[#666] mx-auto mb-3" />
                <h3 className="font-serif text-[15px] font-bold text-[#1A1A1A]">Бүртгүүлсэн оюутан байхгүй байна</h3>
                <p className="font-serif italic text-xs text-[#666] mt-1">Оюутнууд системд бүртгүүлж нэвтэрсний дараа энд харагдана.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Students selector rail */}
                <div className="md:col-span-1 border border-[#1A1A1A] bg-white p-4 space-y-3">
                  <h3 className="font-mono text-[10px] font-bold text-[#666] uppercase tracking-widest px-1 pb-1 border-b border-[#D1CDC7]">
                    Оюутнуудын Жагсаалт
                  </h3>
                  <div className="space-y-2">
                    {students.map((student) => {
                      const stSubmissions = submissions.filter(s => s.studentId === student.uid);
                      const gradedCount = stSubmissions.filter(s => s.status === 'graded').length;
                      const isActive = selectedStudent?.uid === student.uid;
                      
                      return (
                        <button
                          key={student.uid}
                          onClick={() => setSelectedStudent(student)}
                          className={`w-full flex items-center justify-between p-3 border text-left font-sans transition-all cursor-pointer rounded-none relative z-10 ${
                            isActive
                              ? 'border-[#1A1A1A] bg-[#FFF9EA] text-[#1A1A1A]'
                              : 'border-[#D1CDC7] hover:bg-[#F5F2ED] text-[#1A1A1A]'
                          }`}
                        >
                          <div>
                            <span className="font-bold block text-sm font-serif">{student.name}</span>
                            <span className="font-mono text-[9px] text-[#666] block mt-0.5">{student.email}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="inline-block border border-[#1A1A1A] bg-white px-1.5 py-0.5 text-[9px] font-bold text-[#1A1A1A] font-mono uppercase tracking-wide">
                              {stSubmissions.length} СОРИЛ
                            </span>
                            {stSubmissions.length > 0 && (
                              <span className="text-[10px] font-serif font-bold italic text-neutral-600 block mt-1">
                                {gradedCount}/{stSubmissions.length} Зассан
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Student specific history and scorecards report card */}
                <div className="md:col-span-2 space-y-4">
                  {selectedStudent ? (
                    <div className="border border-[#1A1A1A] bg-white p-5 sm:p-6">
                      
                      <div className="border-b-2 border-[#1A1A1A] pb-4 mb-5 select-text">
                        <span className="font-mono text-[9px] font-bold text-[#666] uppercase tracking-widest block mb-0.5">
                          Оюутны Бүртгэлийн Мэдээлэл
                        </span>
                        <h4 className="font-serif text-xl font-black text-[#1A1A1A]">{selectedStudent.name}</h4>
                        <p className="font-mono text-xs text-neutral-600 mt-0.5">{selectedStudent.email}</p>
                        <p className="font-serif italic text-xs text-[#666] mt-2">
                          Бүртгүүлсэн огноо: {formatTimestamp(selectedStudent.createdAt)}
                        </p>
                      </div>

                      {/* Scorecards */}
                      {(() => {
                        const sSubmissions = submissions.filter(sub => sub.studentId === selectedStudent.uid);
                        
                        if (sSubmissions.length === 0) {
                          return (
                            <div className="text-center py-10">
                              <p className="font-serif italic text-sm text-[#666]">Энэ оюутан одоогоор ямар нэгэн шалгалт өгөөгүй байна.</p>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-4">
                            <h5 className="font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-widest pb-1 border-b border-[#D1CDC7]">
                              Бөглөсөн шалгалтын хуудас ({sSubmissions.length})
                            </h5>

                            <div className="space-y-3">
                              {sSubmissions.map((sub) => {
                                const isGraded = sub.status === 'graded';
                                return (
                                  <div key={sub.id} className="p-4 border border-[#1A1A1A] bg-[#F5F2ED]">
                                    <div className="sm:flex sm:items-center sm:justify-between gap-4">
                                      <div>
                                        <span className={`px-2 py-0.5 text-[9px] font-bold border font-mono tracking-wider uppercase ${getSubjectColor(sub.subject)}`}>
                                          {sub.subject === 'history' ? 'ТҮҮХ' : 'НИЙГЭМ СУДЛАЛ'}
                                        </span>
                                        <h6 className="font-serif text-base font-bold text-[#1A1A1A] mt-2">{sub.examTitle}</h6>
                                        <span className="font-mono text-xs text-[#666] uppercase tracking-wide block mt-1">Хэлбэр: {sub.examType === 'multiple-choice' ? 'Сонгох хэлбэр' : 'Бичих хэлбэр'}</span>
                                      </div>
                                      
                                      <div className="mt-3 sm:mt-0 text-left sm:text-right shrink-0">
                                        <div className="flex sm:justify-end items-center gap-1.5">
                                          <span className={`inline-block h-2 w-2 rounded-none border border-[#1A1A1A] ${isGraded ? 'bg-[#004D27]' : 'bg-amber-500'}`} />
                                          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#1A1A1A]">
                                            {isGraded ? 'ЗАСАЖ ИЛГЭЭСЭН' : 'ҮНЭЛГЭЭ ХҮЛЭЭЖ БУЙ'}
                                          </span>
                                        </div>

                                        <p className="text-red-950 font-serif text-base font-extrabold mt-1.5">
                                          Оноо: {sub.score} / {sub.maxScore}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Feedback details if graded */}
                                    {isGraded && sub.feedback && (
                                      <div className="mt-3 bg-white p-3 border border-[#D1CDC7]">
                                        <span className="font-mono text-[9px] uppercase font-bold tracking-widest text-[#666] block mb-1">
                                          Багшийн Санал Сэтгэгдэл:
                                        </span>
                                        <span className="font-serif text-xs text-[#1A1A1A] block italic leading-relaxed select-text">
                                          "{sub.feedback}"
                                        </span>
                                      </div>
                                    )}

                                    {!isGraded && sub.examType === 'written' && (
                                      <div className="mt-4 flex justify-end">
                                        <button
                                          onClick={() => handleOpenGradingWorkspace(sub)}
                                          className="inline-flex items-center gap-1.5 border border-[#1A1A1A] bg-[#1A1A1A] text-white px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-800 cursor-pointer rounded-none"
                                        >
                                          <span>Одоо Үнэлэх</span>
                                          <ChevronRight className="h-3 w-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                    </div>
                  ) : (
                    <div className="text-center py-16 border border-dashed border-[#1A1A1A] bg-[#F5F2ED] flex flex-col items-center justify-center">
                      <GraduationCap className="h-10 w-10 text-[#666] mb-3" />
                      <p className="font-serif italic text-sm text-[#444] px-4">
                        Зүүн талын жагсаалтаас оюутныг сонгон бүртгэлийг шалгах, сорилын гүйцэтгэл, дэлгэрэнгүй түүхтэй танилцана уу.
                      </p>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

        {/* TAB 3: ANSWER BOOKLET SUBMISSIONS */}
        {activeTab === 'submissions' && !isCreatingExam && !gradingSubmission && (
          <div>
            {loadingSubmissions ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1A1A1A] border-t-transparent" />
              </div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-14 border border-dashed border-[#1A1A1A] bg-white">
                <FileText className="h-11 w-11 text-[#666] mx-auto mb-3" />
                <h3 className="font-serif text-[15px] font-bold text-[#1A1A1A]">Ирүүлсэн сорил байхгүй байна</h3>
                <p className="font-serif italic text-xs text-[#666] mt-1">Оюутнууд сорил бөглөж дуусаад хүлээлгэн өгөхөд хариултууд энд бодит хугацаанд харагдах болно.</p>
              </div>
            ) : (
              <div className="border border-[#1A1A1A] bg-white overflow-hidden rounded-none">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[#1A1A1A] table-auto font-serif text-sm">
                    <thead className="bg-[#F5F2ED] block lg:table-header-group">
                      <tr className="block lg:table-row border-b-2 border-[#1A1A1A]">
                        <th scope="col" className="px-6 py-3.5 text-left font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider block lg:table-cell justify-between">
                          Шалгалтын мэдээлэл
                        </th>
                        <th scope="col" className="px-6 py-3.5 text-left font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider block lg:table-cell">
                          Оюутны нэр
                        </th>
                        <th scope="col" className="px-6 py-3.5 text-left font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider block lg:table-cell">
                          Хэлбэр
                        </th>
                        <th scope="col" className="px-6 py-3.5 text-left font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider block lg:table-cell">
                          Төлөв & Оноо
                        </th>
                        <th scope="col" className="px-6 py-3.5 text-right font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider block lg:table-cell">
                          Үйлдэл
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D1CDC7] bg-white block lg:table-row-group">
                      {submissions.map((sub) => {
                        const isGraded = sub.status === 'graded';
                        return (
                          <tr key={sub.id} className="block lg:table-row hover:bg-[#FFF9EA] transition-colors duration-100">
                            
                            {/* Exam detail */}
                            <td className="px-6 py-4 block lg:table-cell">
                              <div>
                                <span className={`inline-block px-2 py-0.5 text-[8px] font-bold border tracking-wider uppercase mb-1.5 font-mono ${getSubjectColor(sub.subject)}`}>
                                  {sub.subject === 'history' ? 'ТҮҮХ' : 'НИЙГЭМ СУДЛАЛ'}
                                </span>
                                <span className="font-bold text-[#1A1A1A] block text-base leading-snug">
                                  {sub.examTitle}
                                </span>
                                <span className="font-mono text-[10px] text-neutral-500 block mt-1">
                                  {formatTimestamp(sub.submittedAt)}
                                </span>
                              </div>
                            </td>

                            {/* Student name */}
                            <td className="px-6 py-4 block lg:table-cell">
                              <div className="select-text">
                                <span className="font-bold text-[#1A1A1A] block text-sm leading-none">
                                  {sub.studentName}
                                </span>
                                <span className="font-mono text-[10px] text-[#666] block mt-1">
                                  {sub.studentEmail}
                                </span>
                              </div>
                            </td>

                            {/* Type */}
                            <td className="px-6 py-4 block lg:table-cell">
                              <span className="inline-block border border-[#1A1A1A] bg-white px-2 py-0.5 text-xs font-mono font-bold text-[#1A1A1A] uppercase tracking-wider">
                                {sub.examType === 'multiple-choice' ? 'Сонгох хэлбэр' : 'Бичих хэлбэр'}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4 block lg:table-cell">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`inline-block h-2 w-2 rounded-none border border-[#1A1A1A] ${isGraded ? 'bg-[#004D27]' : 'bg-amber-500'}`} />
                                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#1A1A1A]">
                                    {isGraded ? 'ҮНЭЛЭГДСЭН' : 'ҮНЭЛЭГДЭЭГҮЙ'}
                                  </span>
                                </div>
                                <span className="text-xs text-red-950 font-bold block mt-0.5">
                                  Оноо: {sub.score} / {sub.maxScore}
                                </span>
                              </div>
                            </td>

                            {/* Action */}
                            <td className="px-6 py-4 text-right block lg:table-cell">
                              {sub.examType === 'written' ? (
                                <button
                                  onClick={() => handleOpenGradingWorkspace(sub)}
                                  className="inline-flex items-center gap-1.5 border border-[#1A1A1A] bg-white text-[#1A1A1A] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-[#F5F2ED] cursor-pointer rounded-none"
                                >
                                  <span>{isGraded ? 'Харах / Засах' : 'Материал Засах'}</span>
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <span className="font-serif italic text-xs text-neutral-500">Автоматаар засагдсан</span>
                              )}
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
