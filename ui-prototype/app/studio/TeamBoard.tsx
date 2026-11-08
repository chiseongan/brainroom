"use client";

import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, LayoutGrid, Plus, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "./team-board.css";

type View = "overview" | "calendar" | "files" | "timeline" | "members";
type Status = "진행 중" | "검토 중" | "완료";
type ScheduleStatus = "예정" | "진행 중" | "완료";
type ScheduleEntry = { id: string; date: string; title: string; owner: string; part: string; status: ScheduleStatus };
type FileEntry = { id: string; title: string; owner: string; type: string; status: Status };
const STORAGE_KEY = "brainroom-umbrella-board-v1";
const ownerParts: Record<string, string> = { 지민: "기획", 민지: "디자인", 서연: "개발", 모두: "팀 일정", "내 공간": "담당 미정" };
const tabs: { id: View; label: string; icon: typeof CalendarDays }[] = [
  { id: "overview", label: "한눈에 보기", icon: LayoutGrid },
  { id: "calendar", label: "일정", icon: CalendarDays },
  { id: "files", label: "자료", icon: FileText },
  { id: "timeline", label: "타임라인", icon: Clock3 },
  { id: "members", label: "팀원 활동", icon: UsersRound },
];
// 하나의 예시 데이터를 요약과 상세에서 함께 사용합니다.
const exampleSchedule: ScheduleEntry[] = [
  { id: "schedule-example-1", date: "2026-11-10", title: "학생 인터뷰 정리", owner: "지민", part: "기획", status: "완료" },
  { id: "schedule-example-2", date: "2026-11-14", title: "우산 대여 화면 시안 완성", owner: "민지", part: "디자인", status: "진행 중" },
  { id: "schedule-example-3", date: "2026-11-20", title: "대여 위치 지도 구현", owner: "서연", part: "개발", status: "예정" },
  { id: "schedule-example-4", date: "2026-11-25", title: "팀 시연 및 피드백", owner: "모두", part: "팀 일정", status: "예정" },
];
const exampleFiles: FileEntry[] = [
  { id: "file-example-1", title: "서비스 기획서", owner: "지민", type: "기획 문서", status: "검토 중" },
  { id: "file-example-2", title: "우산 대여 화면 시안", owner: "민지", type: "Figma 디자인", status: "진행 중" },
  { id: "file-example-3", title: "대여 위치 지도", owner: "서연", type: "개발 화면", status: "진행 중" },
  { id: "file-example-4", title: "학생 인터뷰 정리", owner: "지민", type: "회의 문서", status: "완료" },
];
const activities = [
  { date: "11월 8일", time: "오전 11:20", who: "민지", part: "디자인", text: "우산 대여 화면 시안을 공유했어요.", color: "#5574c1" },
  { date: "11월 7일", time: "오후 4:10", who: "서연", part: "개발", text: "대여 위치 지도를 만들고 있어요.", color: "#91a0b4" },
  { date: "11월 6일", time: "오후 2:30", who: "지민", part: "기획", text: "학생 인터뷰 내용을 정리했어요.", color: "#3153c6" },
];
const members = [
  { who: "지민", part: "기획", color: "#3153c6" },
  { who: "서연", part: "개발", color: "#91a0b4" },
  { who: "민지", part: "디자인", color: "#5574c1" },
];
const weekday = ["일", "월", "화", "수", "목", "금", "토"];
const keyOf = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const dateLabel = (date: string) => { const [, month, day] = date.split("-"); return `${Number(month)}월 ${Number(day)}일`; };
const tone = (status: string) => status === "완료" ? "done" : status === "검토 중" ? "review" : status === "진행 중" ? "progress" : "planned";

export default function TeamBoard({ onBack }: { onBack: () => void }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const storageReadable = useRef(true);
  const [view, setView] = useState<View>("overview");
  const [month, setMonth] = useState({ year: 2026, month: 10 });
  const [selected, setSelected] = useState("2026-11-14");
  const [filter, setFilter] = useState<"전체" | Status>("전체");
  const [query, setQuery] = useState("");
  const [addedSchedule, setAddedSchedule] = useState<ScheduleEntry[]>([]);
  const [addedFiles, setAddedFiles] = useState<FileEntry[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showFileForm, setShowFileForm] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleOwner, setScheduleOwner] = useState("지민");
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus>("예정");
  const [fileTitle, setFileTitle] = useState("");
  const [fileOwner, setFileOwner] = useState("지민");
  const [fileStatus, setFileStatus] = useState<Status>("진행 중");
  const [formError, setFormError] = useState("");
  useEffect(() => { backRef.current?.focus(); }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.schedule)) setAddedSchedule(data.schedule.filter((item: ScheduleEntry) => item && typeof item.id === "string" && typeof item.date === "string" && typeof item.title === "string" && typeof item.owner === "string" && typeof item.part === "string" && ["예정", "진행 중", "완료"].includes(item.status)));
        if (Array.isArray(data.files)) setAddedFiles(data.files.filter((item: FileEntry) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.owner === "string" && typeof item.type === "string" && ["진행 중", "검토 중", "완료"].includes(item.status)));
      }
    } catch { storageReadable.current = false; setStorageFailed(true); }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady || !storageReadable.current) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ schedule: addedSchedule, files: addedFiles })); setStorageFailed(false); }
    catch { setStorageFailed(true); }
  }, [storageReady, addedSchedule, addedFiles]);
  const schedule = useMemo(() => [...exampleSchedule, ...addedSchedule].sort((a, b) => a.date.localeCompare(b.date)), [addedSchedule]);
  const files = useMemo(() => [...exampleFiles, ...addedFiles], [addedFiles]);

  function addSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = scheduleTitle.trim();
    if (!title) { setFormError("일정 이름을 입력해 주세요."); return; }
    setAddedSchedule(current => [...current, { id: crypto.randomUUID(), date: selected, title, owner: scheduleOwner, part: ownerParts[scheduleOwner], status: scheduleStatus }]);
    setScheduleTitle(""); setScheduleOwner("지민"); setScheduleStatus("예정"); setFormError(""); setShowScheduleForm(false);
  }
  function addFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = fileTitle.trim();
    if (!title) { setFormError("자료 이름을 입력해 주세요."); return; }
    setAddedFiles(current => [...current, { id: crypto.randomUUID(), title, owner: fileOwner, type: ownerParts[fileOwner], status: fileStatus }]);
    setFileTitle(""); setFileOwner("지민"); setFileStatus("진행 중"); setFilter("전체"); setQuery(""); setFormError(""); setShowFileForm(false);
  }

  function openView(next: View) {
    setView(next);
    setShowScheduleForm(false); setShowFileForm(false); setFormError("");
    if (boardRef.current) boardRef.current.scrollTop = 0;
  }
  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(month.year, month.month + delta, 1));
    const year = d.getUTCFullYear(), nextMonth = d.getUTCMonth();
    setMonth({ year, month: nextMonth });
    setSelected(keyOf(year, nextMonth, 1));
  }
  const firstDay = new Date(Date.UTC(month.year, month.month, 1)).getUTCDay();
  const days = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((firstDay + days) / 7) * 7;
  const selectedEvents = schedule.filter(event => event.date === selected);
  const filteredFiles = useMemo(() => files.filter(file =>
    (filter === "전체" || file.status === filter) &&
    `${file.title} ${file.owner} ${file.type}`.toLowerCase().includes(query.trim().toLowerCase())
  ), [files, filter, query]);
  const todayCount = schedule.filter(event => event.date >= "2026-11-08" && event.status !== "완료").length;
  const reviewCount = files.filter(file => file.status === "검토 중").length;
  const summary = [
    { id: "calendar" as View, title: "가까운 일정", kicker: "SCHEDULE", icon: CalendarDays, number: `${todayCount}개`, description: "예정된 일정", lines: schedule.filter(s => s.date >= "2026-11-08" && s.status !== "완료").slice(0, 2).map(s => `${dateLabel(s.date)}  ·  ${s.title}`), action: "달력 보기" },
    { id: "files" as View, title: "함께 만드는 자료", kicker: "FILES", icon: FileText, number: `${files.length}개`, description: `전체 자료 · 검토 중 ${reviewCount}개`, lines: files.slice(0, 2).map(f => `${f.title}  ·  ${f.status}`), action: "자료 보기" },
    { id: "timeline" as View, title: "최근 팀 활동", kicker: "TIMELINE", icon: Clock3, number: `${activities.length}건`, description: "공유된 최근 기록", lines: activities.slice(0, 2).map(a => `${a.who}  ·  ${a.text}`), action: "타임라인 보기" },
    { id: "members" as View, title: "팀원별 기록", kicker: "TEAM", icon: UsersRound, number: `${members.length}명`, description: "함께하는 팀원", lines: members.map(m => `${m.who} · ${m.part}`).slice(0, 2), action: "팀원 활동 보기" },
  ];

  return (
    <div ref={boardRef} className="shared-board" aria-label="팀 공유 보드">
      <div className="board-shell">
        <div className="board-topline">
          <button ref={backRef} type="button" className="board-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> 팀 공간으로</button>
          <span className="board-note">예시 프로젝트 · {storageFailed ? "브라우저 저장에 실패했어요" : "이 브라우저에만 저장돼요"}</span>
        </div>
        <div className="board-layout">
          <nav className="board-tabs" aria-label="공유 보드 메뉴">
            <div className="board-nav-title"><span /> TEAM BOARD</div>
            {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className="board-tab" aria-current={view === id ? "page" : undefined} onClick={() => openView(id)}><Icon size={17} aria-hidden="true" /><span>{label}</span></button>)}
          </nav>
          <div className="board-main">
            {view === "overview" && <>
              <header className="board-hero"><div><span className="board-eyebrow">예시 프로젝트</span><h1>캠퍼스 우산 대여<span>.</span></h1><p>교내 우산 대여 위치와 반납 장소를 알려주는 서비스예요.</p></div><div className="board-orbit" aria-hidden="true"><i /><i /><b /></div></header>
              <div className="board-overview">{summary.map(({ id, title, kicker, icon: Icon, number, description, lines, action }) => <button type="button" className="summary-card" key={id} onClick={() => openView(id)}><div className="summary-head"><div><span className="summary-kicker">{kicker}</span><h2>{title}</h2></div><span className="summary-icon"><Icon size={18} /></span></div><div className="summary-count"><strong className="summary-number">{number}</strong><span className="summary-description">{description}</span></div><div className="summary-list">{lines.map((line, i) => <span key={i}>{line}</span>)}</div><span className="summary-action">{action} <ArrowRight size={15} /></span></button>)}</div>
            </>}
            {view === "calendar" && <section className="board-detail" aria-labelledby="calendar-title"><div className="detail-header"><div><span className="board-eyebrow">우리 팀 일정</span><h1 id="calendar-title">일정<span>.</span></h1><p className="detail-subtitle">날짜를 선택해 그날의 일정을 확인해요.</p></div></div><div className="calendar-layout"><div className="calendar"><div className="calendar-toolbar"><h2>{month.year}년 {month.month + 1}월</h2><div className="calendar-nav"><button type="button" aria-label="이전 달" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></button><button type="button" aria-label="다음 달" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></button></div></div><div className="calendar-grid">{weekday.map(day => <span className="calendar-weekday" key={day}>{day}</span>)}{Array.from({ length: totalCells }, (_, i) => { const day = i - firstDay + 1; if (day < 1 || day > days) return <span className="calendar-cell outside" key={i} aria-hidden="true" />; const date = keyOf(month.year, month.month, day); const count = schedule.filter(event => event.date === date).length; return <button className={`calendar-cell ${selected === date ? "is-selected" : ""} ${count ? "has-events" : ""}`} type="button" key={date} aria-pressed={selected === date} aria-label={`${month.year}년 ${month.month + 1}월 ${day}일 ${weekday[(firstDay + day - 1) % 7]}요일, 일정 ${count}개`} onClick={() => { setSelected(date); setShowScheduleForm(false); setFormError(""); }}><span>{day}</span>{count > 0 && <i className="calendar-dot" />}</button>; })}</div><p className="calendar-help"><i /> 점이 있는 날에는 일정이 있어요</p></div><aside className="day-panel" aria-live="polite"><span className="summary-kicker">선택한 날짜</span><h2>{dateLabel(selected)}</h2><p>{selectedEvents.length ? `일정 ${selectedEvents.length}개` : "등록된 일정이 없어요."}</p>{selectedEvents.map(event => <article className="day-item" key={event.id}><span className="status-pill" data-status={tone(event.status)}>{event.status}</span><h3>{event.title}</h3><p>{event.owner} · {event.part}</p></article>)}<button type="button" className="board-add-button" onClick={() => { setShowScheduleForm(true); setFormError(""); }}><Plus size={16} aria-hidden="true" /> 일정 추가</button>{showScheduleForm && <form className="board-entry-form" onSubmit={addSchedule}><div className="board-form-header"><h3>{dateLabel(selected)} 일정 추가</h3><p>선택한 날짜에 일정을 추가해요.</p></div><div className="board-form-fields"><label className="board-form-field"><span>일정 이름</span><input value={scheduleTitle} onChange={e => { setScheduleTitle(e.target.value); setFormError(""); }} placeholder="예: 팀 회의" maxLength={80} required autoFocus /></label><label className="board-form-field"><span>담당자</span><select value={scheduleOwner} onChange={e => setScheduleOwner(e.target.value)}>{Object.keys(ownerParts).map(owner => <option key={owner} value={owner}>{owner}</option>)}</select></label><label className="board-form-field"><span>상태</span><select value={scheduleStatus} onChange={e => setScheduleStatus(e.target.value as ScheduleStatus)}>{(["예정", "진행 중", "완료"] as const).map(status => <option key={status}>{status}</option>)}</select></label></div>{formError && <p className="board-form-error" role="alert">{formError}</p>}<div className="board-form-actions"><button type="button" className="board-form-cancel" onClick={() => { setShowScheduleForm(false); setFormError(""); }}>취소</button><button type="submit" className="board-form-submit">일정 저장</button></div></form>}</aside></div></section>}
            {view === "files" && <section className="board-detail" aria-labelledby="files-title"><div className="detail-header"><div><span className="board-eyebrow">팀의 문서와 화면</span><h1 id="files-title">함께 만드는 자료<span>.</span></h1><p className="detail-subtitle">상태별로 모아보고 필요한 자료를 찾아보세요.</p></div><span className="detail-count">전체 {files.length}개</span></div><div className="board-add-row"><button type="button" className="board-add-button" onClick={() => { setShowFileForm(true); setFormError(""); }}><Plus size={16} aria-hidden="true" /> 자료 추가</button></div>{showFileForm && <form className="board-entry-form" onSubmit={addFile}><div className="board-form-header"><h2>자료 추가</h2><p>팀에서 함께 볼 자료의 정보를 입력해요.</p></div><div className="board-form-fields"><label className="board-form-field"><span>자료 이름</span><input value={fileTitle} onChange={e => { setFileTitle(e.target.value); setFormError(""); }} placeholder="예: 서비스 기획서" maxLength={80} required autoFocus /></label><label className="board-form-field"><span>담당자</span><select value={fileOwner} onChange={e => setFileOwner(e.target.value)}>{Object.keys(ownerParts).map(owner => <option key={owner} value={owner}>{owner}</option>)}</select></label><label className="board-form-field"><span>상태</span><select value={fileStatus} onChange={e => setFileStatus(e.target.value as Status)}>{(["진행 중", "검토 중", "완료"] as const).map(status => <option key={status}>{status}</option>)}</select></label></div>{formError && <p className="board-form-error" role="alert">{formError}</p>}<div className="board-form-actions"><button type="button" className="board-form-cancel" onClick={() => { setShowFileForm(false); setFormError(""); }}>취소</button><button type="submit" className="board-form-submit">자료 저장</button></div></form>}<div className="resource-toolbar"><div className="status-filters" aria-label="자료 상태 선택">{(["전체", "진행 중", "검토 중", "완료"] as const).map(status => <button type="button" className="filter-button" key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status} <span>{status === "전체" ? files.length : files.filter(f => f.status === status).length}</span></button>)}</div><label className="board-search"><Search size={16} /><span className="sr-only">자료 검색</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="자료나 담당자 검색" /></label></div><div className="resource-list" aria-live="polite">{filteredFiles.length ? filteredFiles.map(file => <article className="resource-row" key={file.id}><span className="resource-icon"><FileText size={18}/></span><div><h2>{file.title}</h2><p>{file.owner} · {file.type}</p></div><span className="status-pill" data-status={tone(file.status)}>{file.status}</span></article>) : <p className="empty-state">조건에 맞는 자료가 없어요.</p>}</div></section>}
            {view === "timeline" && <section className="board-detail" aria-labelledby="timeline-title"><div className="detail-header"><div><span className="board-eyebrow">팀의 새 소식</span><h1 id="timeline-title">타임라인<span>.</span></h1><p className="detail-subtitle">팀원들이 공유한 기록을 시간순으로 살펴봐요.</p></div><span className="detail-count">최근 {activities.length}건</span></div><div className="board-list">{activities.map(a => <article className="board-list-row" key={a.text}><span className="member-dot" style={{ background: a.color }} /><div><p className="row-meta">{a.date} · {a.time}</p><h2>{a.who} <small>· {a.part}</small></h2><p>{a.text}</p></div></article>)}</div></section>}
            {view === "members" && <section className="board-detail" aria-labelledby="members-title"><div className="detail-header"><div><span className="board-eyebrow">함께한 기록</span><h1 id="members-title">팀원 활동<span>.</span></h1><p className="detail-subtitle">팀원별로 최근 공유한 내용을 살펴봐요.</p></div><span className="detail-count">{members.length}명</span></div><div className="board-list">{members.map(member => { const personActivities = activities.filter(a => a.who === member.who); return <article className="board-list-row member-row" key={member.who}><span className="member-dot" style={{ background: member.color }} /><div><h2>{member.who} <small>· {member.part}</small></h2><p>{personActivities[0]?.text ?? "아직 공유한 기록이 없어요."}</p></div><span className="member-count">최근 기록 {personActivities.length}건</span></article>; })}</div><p className="member-note">기록 수는 예시이며 팀원의 기여를 점수나 순위로 평가하지 않아요.</p></section>}
            <footer className="board-foot"><span>● &nbsp; {storageFailed ? "저장하지 못했어요. 브라우저 저장 설정을 확인해 주세요." : "예시 프로젝트 · 추가한 내용은 이 브라우저에만 저장되며 팀원과 공유되지 않아요."}</span><span>BRAINROOM &nbsp; / &nbsp; TEAM BOARD</span></footer>
          </div>
        </div>
      </div>
    </div>
  );
}
