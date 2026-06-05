export type UserRole = 'admin' | 'student';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

export interface MCQuestion {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
}

export interface WrittenQuestion {
  id: string;
  text: string;
}

export type Question = MCQuestion | WrittenQuestion;

export type ExamSubject = 'history' | 'Social Studies';
export type ExamType = 'multiple-choice' | 'written';

export interface Exam {
  id: string;
  title: string;
  subject: ExamSubject;
  type: ExamType;
  availableAt: Date; // date/time it becomes available
  questions: Question[];
  creatorId: string;
  createdAt: Date;
}

export interface Submission {
  id: string;
  examId: string;
  examTitle: string;
  subject: ExamSubject;
  examType: ExamType;
  studentId: string;
  studentName: string;
  studentEmail: string;
  answers: { [questionId: string]: string | number }; // question index or ID mapped to answer (string for written, number for multiple-choice)
  score: number;
  maxScore: number;
  status: 'submitted' | 'graded';
  submittedAt: Date;
  feedback?: string;
  gradedBy?: string;
  gradedAt?: Date;
}
