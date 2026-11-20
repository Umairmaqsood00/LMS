import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Field, Form, Message } from '../components';

const newQuestion = () => ({ QuestionText: '', Marks: 1, Options: ['', '', '', ''], Correct: 'A' });
export function QuizForm({ courseId, refresh }) {
  const [questions, setQuestions] = useState([newQuestion()]);
  function update(index, key, value) { setQuestions(questions.map((q, i) => i === index ? { ...q, [key]: value } : q)); }
  return <Form label="Create quiz" onSubmit={async body => {
    const result = await api(`/courses/${courseId}/quizzes`, { method: 'POST', body: { ...body, Questions: questions } });
    setQuestions([newQuestion()]); await refresh(); return result;
  }}>
    <Field label="Quiz title" name="Title" maxLength={150} required />
    <div className="row"><Field label="Time limit (minutes)" name="TimeLimitMin" type="number" min={1} max={180} defaultValue={10} required /><Field label="Passing marks" name="PassingMarks" type="number" min={0} defaultValue={1} required /></div>
    {questions.map((q, i) => <div className="question" key={i}><h3>Question {i + 1}</h3>
      <Field label="Question text" value={q.QuestionText} onChange={e => update(i, 'QuestionText', e.target.value)} maxLength={500} required />
      <Field label="Marks" type="number" min={1} max={100} value={q.Marks} onChange={e => update(i, 'Marks', e.target.value)} required />
      {q.Options.map((option, j) => <Field key={j} label={`Option ${'ABCD'[j]}`} value={option} maxLength={300} required onChange={e => update(i, 'Options', q.Options.map((o, k) => k === j ? e.target.value : o))} />)}
      <Field label="Correct answer"><select value={q.Correct} onChange={e => update(i, 'Correct', e.target.value)}>{['A', 'B', 'C', 'D'].map(label => <option key={label}>{label}</option>)}</select></Field>
      {questions.length > 1 && <button type="button" className="secondary" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>Remove question</button>}
    </div>)}
    <button type="button" className="secondary" disabled={questions.length >= 30} onClick={() => setQuestions([...questions, newQuestion()])}>Add question</button>
  </Form>;
}

export default function Quiz({ quiz, done }) {
  const [answers, setAnswers] = useState({}), [seconds, setSeconds] = useState(quiz.RemainingSeconds);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState(null);
  const selected = useRef({}), sending = useRef(false);
  const deadline = useRef(Date.now() + quiz.RemainingSeconds * 1000);
  async function submit() {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const Answers = Object.entries(selected.current).map(([QuestionID, OptionLabel]) => ({ QuestionID: Number(QuestionID), OptionLabel }));
      setResult(await api(`/attempts/${quiz.AttemptID}/submit`, { method: 'POST', body: { Answers } }));
    } catch (e) { setError(e.message); sending.current = false; }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)); setSeconds(remaining);
      if (remaining === 0) { clearInterval(timer); submit(); }
    }, 500);
    return () => clearInterval(timer);
  }, []);
  if (result) return <section className="panel"><h2>Quiz result</h2><p className="score">{result.Score} / {result.TotalMarks}</p><p>{result.Passed ? 'Passed' : 'Not passed'} · Passing marks: {result.PassingMarks}</p><button onClick={done}>Back to course</button></section>;
  return <section className="panel"><h2>{quiz.Title}</h2><p className="timer" aria-live="off">Time remaining: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p><p className="muted">Unanswered questions receive zero marks. The quiz submits automatically when time ends.</p>
    <form onSubmit={e => { e.preventDefault(); submit(); }}><fieldset disabled={busy || seconds === 0}>
      {quiz.questions.map((q, i) => <div className="question" key={q.QuestionID}><h3>{i + 1}. {q.QuestionText} <small>({q.Marks} marks)</small></h3>
        {quiz.options.filter(o => o.QuestionID === q.QuestionID).map(o => <label className="radio" key={o.OptionLabel}><input type="radio" name={`q${q.QuestionID}`} checked={answers[q.QuestionID] === o.OptionLabel} onChange={() => { const updated = { ...answers, [q.QuestionID]: o.OptionLabel }; selected.current = updated; setAnswers(updated); }} /> {o.OptionLabel}. {o.OptionText}</label>)}
      </div>)}<button>{busy ? 'Submitting…' : 'Submit quiz'}</button>
    </fieldset></form><Message error={error} />{error && seconds === 0 && <button onClick={done}>Back to course</button>}
  </section>;
}
