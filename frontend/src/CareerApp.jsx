import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const nav = ["dashboard", "planner", "progress", "chat"];
const hints = {
  interests: ["tech", "design", "business", "data", "marketing"],
  strengths: ["logic", "creativity", "communication", "leadership"],
  skills: ["Excel", "SQL", "Python", "React", "Figma"]
};

const emptyForm = { name: "", interests: ["tech"], strengths: ["logic"], skills: ["Excel"], studyTime: 90, goal: "" };

const api = async (path, opts = {}) => {
  const res = await fetch(`${API}${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
};

const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const lsGet = (k, d = "") => {
  try { return localStorage.getItem(k) || d; } catch { return d; }
};
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export default function CareerApp() {
  const [theme, setTheme] = useState(() => lsGet("acd-theme", "dark"));
  const [userId, setUserId] = useState(() => lsGet("acd-user-id", ""));
  const [ws, setWs] = useState(null);
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [career, setCareer] = useState("");
  const [chat, setChat] = useState("");
  const [text, setText] = useState("");

  useEffect(() => { document.documentElement.dataset.theme = theme; lsSet("acd-theme", theme); }, [theme]);
  useEffect(() => { if (!userId) return; (async () => {
    try { setLoading(true); const d = await api(`/dashboard/${userId}`); setWs(d); setCareer(d.plan?.careerTitle || d.profile?.selectedCareer || d.careers?.[0]?.title || ""); }
    catch (e) { setError(e.message); setUserId(""); lsSet("acd-user-id", ""); }
    finally { setLoading(false); }
  })(); }, [userId]);

  const profile = ws?.profile;
  const careers = ws?.careers || [];
  const skillGap = ws?.skillGap?.skillGap || [];
  const plan = ws?.plan?.days || [];
  const progress = ws?.progress || { completionPercentage: 0, streak: 0, completedTasks: 0, totalTasks: 0, weeklyProgress: [] };
  const today = ws?.dashboard?.todayTasks || [];
  const selectedCareer = career || ws?.plan?.careerTitle || careers[0]?.title || "";
  const note = useMemo(() => ws?.dashboard?.motivationalMessage || `You're ${progress.completionPercentage}% closer to becoming a ${selectedCareer}.`, [ws, progress.completionPercentage, selectedCareer]);

  const saveOnboarding = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const r = await api("/onboarding", { method: "POST", body: form });
      setUserId(r.user.id); lsSet("acd-user-id", r.user.id); setWs(r.dashboard);
      const c = await api("/generate-careers", { method: "POST", body: { userId: r.user.id, profile: r.user } });
      setWs((p) => ({ ...(p || {}), careers: c.careers })); if (c.careers?.[0]) await chooseCareer(c.careers[0].title, r.user.id, true);
    } catch (e2) { setError(e2.message); } finally { setLoading(false); }
  };

  const chooseCareer = async (title, id = userId, silent = false) => {
    if (!id || !title) return; setCareer(title); if (!silent) setLoading(true); setError("");
    try {
      const g = await api("/skill-gap", { method: "POST", body: { userId: id, careerTitle: title, currentSkills: profile?.skills || form.skills } });
      const p = await api("/generate-plan", { method: "POST", body: { userId: id, careerTitle: title, skillGap: g.skill_gap, dailyStudyTime: profile?.studyTime || form.studyTime } });
      setWs((cur) => ({ ...(cur || {}), skillGap: g, plan: { careerTitle: title, days: p.plan }, dashboard: p.dashboard.dashboard || p.dashboard, progress: p.dashboard.progress || cur?.progress, profile: p.dashboard.profile || cur?.profile, tasks: p.dashboard.tasks || cur?.tasks }));
      setView("dashboard"); setMsg(`Adaptive plan created for ${title}.`);
    } catch (e) { setError(e.message); } finally { if (!silent) setLoading(false); }
  };

  const toggleTask = async (task) => {
    try { const r = await api(`/tasks/${task.id}`, { method: "PATCH", body: { userId, completed: !task.completed } }); setWs(r.dashboard); }
    catch (e) { setError(e.message); }
  };

  const updatePlan = async (signal) => {
    setLoading(true); setError("");
    try { const r = await api("/update-plan", { method: "POST", body: { userId, signal, reason: signal === "easier" ? "User missed last 2 days." : "User finished quickly." } }); setWs(r.dashboard); setMsg(r.message); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const sendChat = async (e) => {
    e.preventDefault(); if (!chat.trim()) return;
    const prompt = chat.trim(); setText((t) => `${t}${t ? "\n" : ""}You: ${prompt}`); setChat("");
    try { const r = await api("/chat", { method: "POST", body: { userId, message: prompt } }); setText((t) => `${t}\nMentor: ${r.reply}`); setWs((cur) => ({ ...(cur || {}), chat: [...(cur?.chat || []), { role: "user", content: prompt }, { role: "assistant", content: r.reply }] })); }
    catch (e) { setError(e.message); }
  };

  const reset = async () => { try { await api(`/users/${userId}/reset`, { method: "POST" }); setUserId(""); lsSet("acd-user-id", ""); setWs(null); setCareer(""); } catch (e) { setError(e.message); } };

  if (!userId || !ws) return <Onboarding form={form} setForm={setForm} step={step} setStep={setStep} save={saveOnboarding} loading={loading} error={error} msg={msg} theme={theme} setTheme={setTheme} />;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,.18),_transparent_28%),linear-gradient(180deg,_#07111f,_#04070f)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col xl:flex-row">
        <aside className="border-b border-white/10 bg-slate-950/70 p-4 backdrop-blur-xl xl:w-[280px] xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[.4em] text-sky-300">AI Mentor</p><h1 className="mt-2 text-xl font-semibold">Planner</h1></div><button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[.3em]">{theme}</button></div>
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-slate-300">{profile?.name || "Anonymous Learner"}</p><h2 className="mt-1 text-lg font-semibold">{selectedCareer || "Select a career"}</h2><p className="mt-1 text-sm text-slate-400">{note}</p><div className="mt-4 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: `${progress.completionPercentage}%` }} /></div></div>
          <div className="mt-5 grid gap-2">{nav.map((n) => <button key={n} onClick={() => setView(n)} className={`rounded-2xl px-4 py-3 text-left text-sm ${view === n ? "bg-white text-slate-950" : "border border-white/10 bg-white/5 hover:bg-white/10"}`}>{n[0].toUpperCase() + n.slice(1)}</button>)}</div>
          <button onClick={reset} className="mt-5 w-full rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm">Reset workspace</button>
        </aside>
        <main className="flex-1 p-4 pb-10 xl:p-6">
          <header className="mb-5 rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs uppercase tracking-[.4em] text-sky-300">Adaptive dashboard</p><h2 className="mt-2 text-2xl font-semibold md:text-4xl">{selectedCareer || "AI Career Guidance & Adaptive Study Planner"}</h2><p className="mt-2 text-sm text-slate-300">{note}</p></div><div className="flex flex-wrap gap-3"><button onClick={() => setView("dashboard")} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">Dashboard</button><button onClick={() => chooseCareer(careers[0]?.title || selectedCareer)} className="rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-4 py-3 text-sm font-semibold text-white">Rebuild plan</button></div></div></header>
          {msg ? <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{msg}</div> : null}
          {error ? <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
          {view === "dashboard" && <Dashboard careers={careers} selected={selectedCareer} choose={chooseCareer} profile={profile} progress={progress} today={today} skillGap={skillGap} onGenerate={() => chooseCareer(careers[0]?.title || selectedCareer)} />}
          {view === "planner" && <Planner plan={plan} selected={selectedCareer} toggleTask={toggleTask} updatePlan={updatePlan} />}
          {view === "progress" && <Progress progress={progress} plan={plan} />}
          {view === "chat" && <Chat selected={selectedCareer} progress={progress} today={today} chat={ws.chat || []} transcript={text} input={chat} setInput={setChat} sendChat={sendChat} />}
        </main>
      </div>
    </div>
  );
}

function Onboarding({ form, setForm, step, setStep, save, loading, error, msg, theme, setTheme }) {
  const canNext = (step === 0 && form.name.trim()) || (step === 1 && form.interests.length) || (step === 2 && form.skills.length);
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,.24),_transparent_30%),linear-gradient(180deg,_#07111f,_#04070f)] px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.4em] text-sky-300">AI Mentor</p><h1 className="mt-2 text-3xl font-semibold md:text-5xl">AI Career Guidance & Adaptive Study Planner</h1></div><button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[.3em]">{theme}</button></div>
        <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl md:p-8">
            <div className="flex items-center justify-between"><div><p className="text-sm uppercase tracking-[.35em] text-emerald-300">Step {step + 1} of 3</p><h2 className="mt-2 text-2xl font-semibold">{["Basics","Strengths","Skills"][step]}</h2></div><span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs">1-2 hours/day</span></div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {step === 0 && <>
                <Field label="Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="Your name" />
                <Field label="Goal" value={form.goal} onChange={(v) => setForm((p) => ({ ...p, goal: v }))} placeholder="Become a data analyst..." />
                <TagField label="Interests" values={form.interests} setValues={(v) => setForm((p) => ({ ...p, interests: v }))} hints={hints.interests} />
              </>}
              {step === 1 && <TagField label="Strengths" values={form.strengths} setValues={(v) => setForm((p) => ({ ...p, strengths: v }))} hints={hints.strengths} />}
              {step === 2 && <>
                <TagField label="Current skills" values={form.skills} setValues={(v) => setForm((p) => ({ ...p, skills: v }))} hints={hints.skills} />
                <Field label={`Study time: ${Math.floor(form.studyTime / 60)}h ${form.studyTime % 60}m`} type="range" min="60" max="120" value={form.studyTime} onChange={(v) => setForm((p) => ({ ...p, studyTime: Number(v) }))} />
              </>}
            </div>
            <div className="mt-8 flex gap-3"><button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm disabled:opacity-40">Back</button>{step < 2 ? <button type="button" disabled={!canNext} onClick={() => setStep((s) => Math.min(2, s + 1))} className="rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Continue</button> : <button type="submit" disabled={loading || !canNext} className="rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{loading ? "Saving..." : "Build my plan"}</button>}</div>
            {error ? <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
            {msg ? <p className="mt-3 text-sm text-emerald-200">{msg}</p> : null}
          </div>
          <div className="space-y-4">
            <Card title="What it does" body="Suggests 2-3 career paths, identifies skill gaps, builds a 1-2 hour adaptive study plan, tracks progress, and offers AI mentor chat." />
            <Card title="How it works" body="Your onboarding is stored. The backend returns structured JSON for careers, skill gaps, study plans, updates, and chat replies." />
            <Card title="Result" body="You get a real dashboard, a planner you can complete, and a mentor that updates when your pace changes." />
          </div>
        </form>
      </div>
    </div>
  );
}

const Field = ({ label, value, onChange, placeholder, type = "text", min, max }) => (
  <label className="rounded-3xl border border-white/10 bg-white/5 p-4"><span className="text-sm font-medium">{label}</span>{type === "range" ? <input className="mt-3 w-full accent-sky-400" type="range" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} /> : <input className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm outline-none placeholder:text-slate-500" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}</label>
);

function TagField({ label, values, setValues, hints }) {
  const [input, setInput] = useState("");
  const add = (v) => { const t = v.trim(); if (!t) return; setValues(toggle(values, t)); setInput(""); };
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium">{label}</span><span className="text-xs text-slate-400">{values.length} selected</span></div><div className="mt-3 flex flex-wrap gap-2">{values.map((v) => <button key={v} type="button" onClick={() => setValues(values.filter((x) => x !== v))} className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs">{v} x</button>)}</div><div className="mt-4 flex gap-2"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), add(input))} className="min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm outline-none placeholder:text-slate-500" placeholder={`Add ${label.toLowerCase()}...`} /><button type="button" onClick={() => add(input)} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950">Add</button></div><div className="mt-4 flex flex-wrap gap-2">{hints.map((h) => <button key={h} type="button" onClick={() => setValues(toggle(values, h))} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">+ {h}</button>)}</div></div>
  );
}

const Card = ({ title, body }) => <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{body}</p></div>;

const Shell = ({ title, children }) => <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">{title ? <div className="mb-4"><h2 className="text-xl font-semibold text-white">{title}</h2></div> : null}{children}</section>;

function Dashboard({ careers, selected, choose, profile, progress, today, skillGap, onGenerate }) {
  return <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><div className="space-y-5"><div className="grid gap-4 md:grid-cols-3"><Metric label="Completion" value={`${progress.completionPercentage}%`} /><Metric label="Streak" value={`${progress.streak} days`} /><Metric label="Done" value={`${progress.completedTasks}/${progress.totalTasks}`} /></div><Shell title="Today's tasks"><div className="grid gap-3 md:grid-cols-3">{today.map((t) => <div key={t.id} className={`rounded-2xl border px-4 py-3 text-sm ${t.completed ? "border-emerald-400/20 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}>{t.text}</div>)}</div></Shell><Shell title="Career recommendations"><div className="grid gap-4 lg:grid-cols-3">{careers.map((c) => <button key={c.title} onClick={() => choose(c.title)} className={`rounded-[24px] border p-4 text-left ${c.title === selected ? "border-sky-400/30 bg-sky-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}><h3 className="text-lg font-semibold">{c.title}</h3><p className="mt-2 text-sm text-slate-300">{c.reason}</p><p className="mt-4 text-xs uppercase tracking-[.35em] text-sky-300">{c.duration}</p></button>)}</div><button onClick={onGenerate} className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm">Refresh suggestions</button></Shell></div><div className="space-y-5"><Shell title="Motivation"><p className="text-sm text-slate-300">{profile?.goal ? `Goal: ${profile.goal}` : "Add a goal to personalize the plan."}</p><p className="mt-3 text-lg font-medium">{progress.completionPercentage >= 70 ? "You're ready for harder work." : progress.completionPercentage >= 35 ? "Good momentum. Stay consistent." : "Build the habit first."}</p></Shell><Shell title="Skill gaps">{skillGap.map((s) => <div key={s.skill} className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><div><p className="font-medium">{s.skill}</p><p className="text-xs text-slate-400">{s.level}</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs">Priority {s.priority}</span></div>)}{!skillGap.length ? <p className="text-sm text-slate-400">Choose a career to see required skills.</p> : null}</Shell><Shell title="Profile"><p className="text-sm text-slate-300">Interests: {(profile?.interests || []).join(", ") || "Not set"}</p><p className="mt-2 text-sm text-slate-300">Strengths: {(profile?.strengths || []).join(", ") || "Not set"}</p><p className="mt-2 text-sm text-slate-300">Skills: {(profile?.skills || []).join(", ") || "Not set"}</p></Shell></div></div>;
}

function Planner({ plan, selected, toggleTask, updatePlan }) {
  return <div className="space-y-5"><div className="flex flex-wrap gap-2"><Metric label="Career" value={selected || "Not selected"} /><Metric label="Days" value={`${plan.length}`} /><button onClick={() => updatePlan("easier")} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">Missed tasks</button><button onClick={() => updatePlan("harder")} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">Finished fast</button></div><Shell title="Study plan">{plan.map((day) => <div key={day.day} className="mb-4 rounded-[24px] border border-white/10 bg-white/5 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[.35em] text-sky-300">Day {day.day}</p><h3 className="mt-1 text-lg font-semibold">{day.topic}</h3></div><div className="text-xs text-slate-400">{day.tasks.filter((t) => t.completed).length}/{day.tasks.length} done</div></div><div className="mt-4 grid gap-3 md:grid-cols-3"><Mini label="Practice" value={day.practiceTask} /><Mini label="Project" value={day.miniProject} /><Mini label="Focus" value={day.topic} /></div><div className="mt-4 grid gap-2">{day.tasks.map((t) => <button key={t.id} onClick={() => toggleTask(t)} className={`rounded-2xl border px-4 py-3 text-left text-sm ${t.completed ? "border-emerald-400/20 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>{t.text}</button>)}</div></div>)}{!plan.length ? <p className="text-sm text-slate-400">Generate a plan from Dashboard first.</p> : null}</Shell></div>;
}

function Progress({ progress, plan }) {
  return <div className="space-y-5"><div className="grid gap-4 md:grid-cols-4"><Metric label="Completion" value={`${progress.completionPercentage}%`} /><Metric label="Streak" value={`${progress.streak} days`} /><Metric label="Done" value={`${progress.completedTasks}`} /><Metric label="Total" value={`${progress.totalTasks}`} /></div><Shell title="Weekly progress">{progress.weeklyProgress.map((d) => <div key={d.day} className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4"><div className="mb-2 flex items-center justify-between text-sm"><span>Day {d.day}</span><span>{d.percentage}%</span></div><div className="h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: `${d.percentage}%` }} /></div></div>)}{!progress.weeklyProgress.length ? <p className="text-sm text-slate-400">Complete a few tasks to see progress.</p> : null}</Shell><Shell title="Plan summary"><p className="text-sm text-slate-300">{plan.length ? `You have ${plan.length} study days in your current plan.` : "No active plan yet."}</p></Shell></div>;
}

function Chat({ selected, progress, today, chat, transcript, input, setInput, sendChat }) {
  const list = chat.length ? chat : transcript.split("\n").filter(Boolean).map((line) => ({ role: line.startsWith("You:") ? "user" : "assistant", content: line.replace(/^You:\s?/, "").replace(/^Mentor:\s?/, "") }));
  return <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]"><Shell title="Mentor context"><p className="text-sm text-slate-300">Career: {selected || "Not selected"}</p><p className="mt-2 text-sm text-slate-300">Completion: {progress.completionPercentage}%</p><p className="mt-2 text-sm text-slate-300">Today's tasks: {today.length}</p><p className="mt-4 text-sm text-slate-400">Try asking what to study today, how to learn SQL joins, or whether you are ready for interviews.</p></Shell><Shell title="Chat"><div className="flex h-[520px] flex-col"><div className="flex-1 space-y-3 overflow-y-auto pr-2">{list.length ? list.map((m, i) => <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-[24px] px-4 py-3 text-sm leading-6 ${m.role === "user" ? "bg-gradient-to-r from-sky-500 to-emerald-500 text-white" : "border border-white/10 bg-white/5 text-slate-100"}`}>{m.content}</div></div>) : <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">Start a conversation with your mentor.</div>}</div><form onSubmit={sendChat} className="mt-4 flex gap-3"><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question..." className="flex-1 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm outline-none" /><button type="submit" className="rounded-2xl bg-gradient-to-r from-sky-500 to-emerald-500 px-5 py-3 text-sm font-semibold text-white">Send</button></form></div></Shell></div>;
}

const Metric = ({ label, value }) => <div className="rounded-[24px] border border-white/10 bg-white/5 p-5"><p className="text-sm text-slate-300">{label}</p><p className="mt-3 text-3xl font-semibold text-white">{value}</p></div>;
const Mini = ({ label, value }) => <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[.35em] text-slate-400">{label}</p><p className="mt-2 text-sm text-white">{value}</p></div>;
