# Secure Exam App: Security & Access Control Specification

This document details the Zero-Trust security design and Attribute-Based Access Control (ABAC) rules for the full-stack Exam platform.

## 1. Core Data Invariants

1. **Identity & Role Rigor**: 
   - A user's profile cannot be read by another user unless that reader is a verified administrator.
   - User profiles cannot write their own roles. Roles are strictly authenticated or verified. Administrators are bootstrapped via hardcoded emails: `teacheradmin@exam.mn` and `adminnaba@exam.mn`.
   
2. **Exam Sanctity**:
   - Only validated administrators can create, update, or remove exam papers.
   - Students can only read/list exams whose `availableAt` timestamp is at or before the current request time (`request.time`).
   - Exams have immutable properties like `id`, `creatorId`, and `createdAt` which cannot be modified after initial creation.

3. **Submission Integrity**:
   - Students can only create a submission with `studentId` matching their current authenticated `request.auth.uid`.
   - Access to a submission (for reading) is strictly limited to the submitting student and administrators.
   - Submissions cannot be updated by students after initial submission (`status` is locked at `'submitted'`). Only administrators can transit `status` from `'submitted'` to `'graded'`, modifying only the `score`, `feedback`, `gradedBy`, `gradedAt`, and `status` fields.
   - Submissions must refer to a valid and existing exam ID.

---

## 2. The "Dirty Dozen" Threat Payloads

Here are twelve vectors designed to execute privilege escalation, unauthorized reads, or state tampering. Our Firestore rules must reject all of them with a `PERMISSION_DENIED` status.

### Threat 1: Self-Promoted Admin Role
* **Target Path**: `/users/attacker_uid`
* **Payload**: `{"uid": "attacker_uid", "name": "Eve", "email": "eve@gmail.com", "role": "admin", "createdAt": "request.time"}`
* **Attack**: Attacker attempts to register/update their profile role as `admin`.

### Threat 2: Student Overwrites Another's Profile
* **Target Path**: `/users/victim_uid`
* **Payload**: `{"uid": "victim_uid", "name": "Hacked Student", "role": "student"}`
* **Attack**: Attacker attempts to write or overwrite profile data of another student.

### Threat 3: Student Creating a New Exam Paper
* **Target Path**: `/exams/history_exam_1`
* **Payload**: `{"id": "history_exam_1", "title": "Free A+", "subject": "history", "type": "multiple-choice", "availableAt": "request.time", "questions": [], "creatorId": "attacker_uid", "createdAt": "request.time"}`
* **Attack**: A standard student account attempts to publish a new exam record.

### Threat 4: Unauthorized Exam Post-Dating Read
* **Target Path**: `/exams/future_exam_hidden`
* **Query**: Reading an exam where `availableAt > request.time`.
* **Attack**: Student attempts to fetch questions for an exam that is scheduled for next week to cheat.

### Threat 5: Submission Spoofing (Impersonating another Student)
* **Target Path**: `/submissions/exam_1_victim`
* **Payload**: `{"id": "exam_1_victim", "examId": "exam_1", "studentId": "victim_uid", "studentName": "Bob", "studentEmail": "bob@exam.mn", "answers": {}, "score": 100, "maxScore": 100, "status": "submitted"}`
* **Attack**: Attacker submits mock answers in the name of another student (`victim_uid`).

### Threat 6: Self-Grading Answers (Direct Score Injection)
* **Target Path**: `/submissions/exam_1_attacker`
* **Payload**: `{"id": "exam_1_attacker", "examId": "exam_1", "studentId": "attacker_uid", "answers": {"q1": "A"}, "score": 100, "maxScore": 10, "status": "graded"}`
* **Attack**: A student submits their written answers and injects a perfect check score and marking status as `graded` manually.

### Threat 7: Exam Deletion by Student
* **Target Path**: `/exams/history_exam_1`
* **Operation**: `DELETE`
* **Attack**: Standard student attempts to destroy/delete an active history exam to cancel the test.

### Threat 8: Query Scraping / Read Blanket
* **Target Path**: `/submissions`
* **Operation**: `LIST` (without owner or key filters)
* **Attack**: Student sends blanket query requesting all other students' submitted answers.

### Threat 9: Submission Update After Deadline / Tampering Graded Submissions
* **Target Path**: `/submissions/exam_1_attacker`
* **Payload**: Student attempts to write and change answers after the grade is published by the teacher.

### Threat 10: ID Poisoning via Oversized ID
* **Target Path**: `/exams/<10KB_junk_character_string>`
* **Attack**: Denial of wallet attack trying to write documents with heavy bloated keys.

### Threat 11: Non-Standard Subject Injection
* **Target Path**: `/exams/cheated_subject`
* **Payload**: `{"id": "cheated_subject", "title": "Maths", "subject": "advanced_astronomy"...}`
* **Attack**: Trying to bypass subject constraints (only history and Social Studies allowed).

### Threat 12: Anonymous Write Bypass
* **Target Path**: `/submissions/anon_post`
* **Attack**: Unauthenticated client attempting to submit answers.

---

## 3. Mock Rules Test Runner Outline (`firestore.rules.test.ts`)

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// Test setup verifying that the above attacks fail securely
describe('Firestore security boundaries', () => {
  it('blocks student role escalation (Threat 1)', async () => {
    const testEnv = await initializeTestEnvironment({ projectId: "plexiform-music-77k72" });
    const aliceDb = testEnv.authenticatedContext('student_alice', { email: 'alice@student.com', email_verified: true }).firestore();
    
    await assertFails(
      aliceDb.collection('users').doc('student_alice').set({
        uid: 'student_alice',
        name: 'Alice',
        email: 'alice@student.com',
        role: 'admin', // Attack
        createdAt: new Date()
      })
    );
  });
});
```
