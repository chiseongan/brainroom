"use client";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, FileText, Lightbulb, Link2, Plus, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import TeamBoard from "./TeamBoard";

// 담당 파트는 화면 시안을 위한 예시이며 계정 접근 권한(role)과 별개입니다.
type Person = { name: string; color: string; part: string; tags: string[]; entries: { kind: string; title: string; detail: string }[] };
const members: Person[] = [
  { name: "지민", color: "#3153c6", part: "기획", tags: ["회의 정리", "프로젝트 목표"], entries: [{ kind: "RESEARCH", title: "학생 인터뷰 정리", detail: "비 오는 날 우산을 빌리기 어려웠던 경험을 모았어요." }, { kind: "NOTE", title: "이번 주 회의 내용", detail: "우산 대여 화면과 대여 위치 지도를 먼저 만들기로 했어요." }, { kind: "IDEA", title: "우산 대여소 한눈에 보기", detail: "가까운 교내 대여소를 쉽게 찾을 수 있으면 좋겠어요." }] },
  { name: "서연", color: "#92a0b3", part: "개발", tags: ["GitHub", "개발 변경사항"], entries: [{ kind: "RESEARCH", title: "대여 위치 지도 참고 자료", detail: "교내 대여소 위치를 표시할 때 참고한 자료예요." }, { kind: "NOTE", title: "대여 위치 지도 화면 추가", detail: "교내 우산 대여 위치를 지도에서 볼 수 있게 만들었어요." }, { kind: "IDEA", title: "개발 내용을 쉽게 공유하기", detail: "다른 팀원도 변경사항을 쉽게 이해할 수 있게 정리해요." }] },
  { name: "민지", color: "#5574c1", part: "디자인", tags: ["화면 디자인", "사용자 경험"], entries: [{ kind: "RESEARCH", title: "우산 대여 화면 레퍼런스", detail: "대여소를 쉽게 찾는 화면을 고민하며 모은 자료예요." }, { kind: "NOTE", title: "대여 위치는 찾기 쉽게", detail: "사용자가 가까운 대여소를 쉽게 찾도록 고려했어요." }, { kind: "IDEA", title: "지도에서 대여소 살펴보기", detail: "대여 가능한 우산과 반납 위치를 함께 보여주는 아이디어예요." }] },
  { name: "내 공간", color: "#7b8ea7", part: "담당 미정", tags: ["나의 메모", "나의 아이디어"], entries: [{ kind: "RESEARCH", title: "한곳에 모은 나의 자료", detail: "내 공간에 저장한 참고 자료의 예시예요." }, { kind: "NOTE", title: "다시 보고 싶은 작은 생각", detail: "다음 아이디어를 위해 남긴 메모 예시예요." }, { kind: "IDEA", title: "팀과 나누고 싶은 생각", detail: "공용 테이블에 가져갈 아이디어 예시예요." }] },
];
const kindLabel: Record<string, string> = { RESEARCH: "자료", NOTE: "메모", IDEA: "아이디어" };
const tabLabel: Record<string, string> = { All: "전체", Research: "자료", Notes: "메모", Ideas: "아이디어" };
type Phase = "hall" | "entering" | "room" | "leaving";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("hall");
  const [person, setPerson] = useState<Person>(members[0]);
  const [target, setTarget] = useState(0);
  const [activeTab, setActiveTab] = useState("All");
  const [showAbout, setShowAbout] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showDetail, setShowDetail] = useState<"figma" | "github" | "ai" | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [origin, setOrigin] = useState({ x: 23, y: 36 });
  const sceneRef = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const orbitAngle = useRef(0);
  const orbitPointer = useRef(false);
  const orbitFocus = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inviteButtonRef = useRef<HTMLButtonElement>(null);
  const closeInviteRef = useRef<HTMLButtonElement>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const boardTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const sync = () => setReducedMotion(media.matches); sync(); media.addEventListener("change", sync); return () => { media.removeEventListener("change", sync); timers.current.forEach(clearTimeout); }; }, []);
  useEffect(() => {
    if (!showInvite) return;
    closeInviteRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setShowInvite(false); inviteButtonRef.current?.focus(); }
      if (event.key === "Tab") {
        const controls = Array.from(closeInviteRef.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showInvite]);
  useEffect(() => {
    if (!showDetail) return;
    detailCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setShowDetail(null); detailTriggerRef.current?.focus(); }
      if (event.key === "Tab") {
        const controls = Array.from(detailCloseRef.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showDetail]);
  useEffect(() => {
    const scene = sceneRef.current;
    const row = scene?.querySelector<HTMLElement>(".door-row");
    const doors = row ? Array.from(row.querySelectorAll<HTMLButtonElement>(".door")) : [];
    const table = scene?.querySelector<HTMLElement>(".table-label");
    if (!scene || !row || !table || doors.length !== members.length) return;

    // Render the same aligned path statically for people who prefer less motion.
    const prefersReduced = reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const initialAngles = [-135, -45, 135, 45].map(degrees => degrees * Math.PI / 180);
    let frame = 0;
    let lastTime: number | null = null;
    let width = 0, height = 0, tableRadius = 0;
    const measure = () => {
      width = scene.clientWidth;
      height = scene.clientHeight;
      tableRadius = table.offsetHeight / 2;
    };
    const draw = () => {
      // Leave room for labels and the focus ring at the viewport edges.
      const labelHalf = Math.max(...doors.map(door => door.offsetWidth / 2));
      const outerX = Math.max(0, Math.min(width * .43, width / 2 - labelHalf - 8));
      const innerX = Math.min(outerX - 12, tableRadius + 52);
      const outerY = Math.max(tableRadius + 100, Math.min(height * .33, height * .55 - 200, height * .45 - 65));
      const innerY = Math.min(outerY - 24, tableRadius + 62);
      doors.forEach((door, i) => {
        const radiusX = innerX + (outerX - innerX) * i / 3;
        const radiusY = innerY + (outerY - innerY) * i / 3;
        scene.style.setProperty(`--orbit-${i}-x`, `${radiusX.toFixed(2)}px`);
        scene.style.setProperty(`--orbit-${i}-y`, `${radiusY.toFixed(2)}px`);
        const angle = initialAngles[i] + orbitAngle.current;
        // Keep the caption on the outside of the orbit, away from the table.
        door.dataset.upper = String(Math.sin(angle) < 0);
        const marker = door.querySelector<HTMLElement>(".door-circle");
        if (marker) door.style.setProperty("--marker-y", `${marker.offsetTop + marker.offsetHeight / 2}px`);
        door.style.setProperty("--orbit-x", `${(Math.cos(angle) * radiusX).toFixed(2)}px`);
        door.style.setProperty("--orbit-y", `${(Math.sin(angle) * radiusY).toFixed(2)}px`);
      });
    };
    measure();
    draw();
    row.classList.add("orbit-ready");
    const observer = new ResizeObserver(() => { measure(); draw(); });
    observer.observe(scene);
    observer.observe(table);
    const resetClock = () => { lastTime = null; };
    document.addEventListener("visibilitychange", resetClock);

    const tick = (now: number) => {
      const paused = prefersReduced || document.hidden || phase !== "hall" || showTable || showInvite || orbitPointer.current || orbitFocus.current;
      if (paused) lastTime = null;
      else {
        if (lastTime !== null) orbitAngle.current = (orbitAngle.current + (now - lastTime) * (2 * Math.PI / 120000)) % (2 * Math.PI);
        lastTime = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("visibilitychange", resetClock); };
  }, [phase, showTable, showInvite, reducedMotion]);
  function enterRoom(index: number) { if (busy.current || phase !== "hall") return; const bounds=sceneRef.current?.getBoundingClientRect(); const dot=sceneRef.current?.querySelector(`[data-room-dot="${index}"]`)?.getBoundingClientRect(); if(bounds && dot) setOrigin({x:((dot.left+dot.width/2-bounds.left)/bounds.width)*100,y:((dot.top+dot.height/2-bounds.top)/bounds.height)*100}); orbitPointer.current = false; orbitFocus.current = false; busy.current = true; setTarget(index); setPerson(members[index]); setActiveTab("All"); setShowTable(false); if (reducedMotion) { setPhase("room"); busy.current = false; return; } setPhase("entering"); timers.current.push(setTimeout(() => { setPhase("room"); busy.current = false; }, 1080)); }
  function returnHall() { if (busy.current || phase !== "room") return; busy.current = true; setShowAbout(false); if (reducedMotion) { setPhase("hall"); busy.current = false; return; } setPhase("leaving"); timers.current.push(setTimeout(() => { setPhase("hall"); busy.current = false; }, 850)); }
  const roomVisible = phase === "room" || phase === "leaving";
  const filtered = person.entries.filter(entry => activeTab === "All" || entry.kind === (activeTab === "Research" ? "RESEARCH" : activeTab === "Notes" ? "NOTE" : "IDEA"));
  return (
    <main className={`app phase-${phase}`} lang="ko">
      <header className="topbar"><button type="button" className="brand" onClick={() => { window.location.href = "/intro.html"; }} aria-label="BrainRoom 시작 화면으로">BrainRoom<span>.</span></button><div className="top-center">OUR TEAM STUDIO</div><div className="top-actions"><span className="preview-label"><i /> 디자인 초안</span><button ref={inviteButtonRef} type="button" className="invite-button" onClick={() => setShowInvite(true)}><Plus size={15} aria-hidden="true" /> 팀원 추가</button><span className="profile-dot" aria-hidden="true">나</span></div></header>
      <div className={`app-layout ${showTable ? "board-open" : ""}`}>
        <aside className="sidebar" aria-label="작업 공간 메뉴"><span className="side-heading">WORKSPACE · 작업 공간</span><button type="button" className={`side-link ${!roomVisible && !showTable ? "selected" : ""}`} onClick={() => { if (showTable) { setShowTable(false); boardTriggerRef.current?.focus(); } else returnHall(); }}><span className="side-icon">⌂</span> 팀 공간</button><button type="button" className={`side-link ${roomVisible ? "selected" : ""}`} onClick={() => enterRoom(3)} disabled={phase !== "hall"}><span className="side-icon">◉</span> 내 공간</button><div className="side-spacer" /><div className="side-note"><span>✳</span><p>작은 생각이<br />모이는 공간.</p></div><div className="prototype-foot">DESIGN PREVIEW · 디자인 초안</div></aside>
        <section ref={sceneRef} className="experience" aria-label="BrainRoom 팀 공간 디자인 초안" style={{"--portal-x":`${origin.x}%`,"--portal-y":`${origin.y}%`} as React.CSSProperties}>
          <div className="hall-scene" aria-hidden={roomVisible || showTable} inert={roomVisible || showTable ? true : undefined}><div className="hall-image" aria-hidden="true"><span className="ambient-dot d1" /><span className="ambient-dot d2" /><span className="ambient-dot d3" /><span className="ambient-dot d4" />{members.map((_, i) => <div key={i} className={`studio-orbit orbit-track orbit-track-${i}`} />)}</div><div className="hall-heading"><div className="eyebrow"><span className="dot-blue" /> 우리 팀의 자료를 한곳에</div><h1>우리 팀 공간<span>.</span></h1><p>팀원을 눌러 맡은 일과 공유한 자료를 확인해 보세요.</p></div>
            <div className="door-row" aria-label="팀원 공간 선택">{members.map((member, i) => <button type="button" key={member.name} className="door" onClick={() => enterRoom(i)} onPointerEnter={event => { if (event.pointerType !== "touch") orbitPointer.current = true; }} onPointerLeave={event => { if (event.pointerType !== "touch") orbitPointer.current = false; }} onFocus={() => { orbitFocus.current = true; }} onBlur={() => { orbitFocus.current = false; }} disabled={phase !== "hall"} aria-label={i === 3 ? "내 공간 들어가기, 담당 미정" : `${member.name}의 ${member.part} 공간 들어가기`}><span className="door-circle" data-room-dot={i}><span className="door-core" style={{ background: member.color }} /><ArrowUpRight size={14} /></span><span className="door-caption"><span className="door-name">{member.name}</span><span className="door-kicker">{member.part}</span></span></button>)}</div>
            <div className="table-label"><span className="table-dot" aria-hidden="true"/><span className="table-overline">함께 보는 공간</span><p>팀 공유<br/>보드<span>.</span></p><small>팀원들의 자료와 할 일</small><button ref={boardTriggerRef} type="button" onClick={() => setShowTable(true)} disabled={phase !== "hall"}>공유 보드 보기 <ArrowUpRight size={14} /></button></div><div className="hall-bottom"><span>팀원을 눌러 자료를 살펴보세요 · 이름과 담당 파트는 예시예요</span><span>01 — TEAM STUDIO</span></div>
          </div>
          <div className="room-scene" aria-hidden={!roomVisible}>
            <div className="personal-room">
              <div className="personal-topline">
                <button type="button" className="personal-back" onClick={returnHall} disabled={phase !== "room"}><ArrowLeft size={16} /> 팀 공간으로</button>
                <span>개인 공간 &nbsp; / &nbsp; 0{target + 1}</span>
              </div>
              <div className="personal-hero">
                <div className="personal-titleblock">
                  <div className="personal-eyebrow"><span style={{ background: person.color }} /> {person.part === "담당 미정" ? person.part : `${person.part} 담당`} · 예시</div>
                  <h1>{person.name === "내 공간" ? <>내 자료와<br />메모</> : <>{person.name}의 {person.part}<br />공간</>}<span>.</span></h1>
                  <p>{person.part === "기획" ? "프로젝트 목표와 회의에서 정한 내용을 확인해요." : person.part === "개발" ? "GitHub 변경사항과 쉽게 풀어쓴 개발 내용을 확인해요." : person.part === "디자인" ? "Figma 디자인을 모아 팀원들이 바로 확인해요." : "내가 공유한 자료와 메모를 볼 수 있어요."}</p>
                  <div className="personal-tags">{person.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                </div>
                <div className="personal-signature" aria-hidden="true"><div className="signature-orbit signature-orbit-a" /><div className="signature-orbit signature-orbit-b" /><span className="signature-dot signature-dot-a" /><span className="signature-dot signature-dot-b" /><span className="signature-center">{person.name === "내 공간" ? "나" : person.name.charAt(0)}</span><span className="signature-label">나만의 작은 공간</span></div>
              </div>
              {person.part === "디자인" && <section className="part-work" aria-label="디자인 작업 예시"><div className="part-heading"><div><span>디자인 · 예시</span><h2>팀이 함께 보는 디자인<span>.</span></h2></div><p>팀원들이 최신 화면을 한곳에서 살펴봐요.</p></div><button type="button" className="work-card figma-card" onClick={event => { detailTriggerRef.current = event.currentTarget; setShowDetail("figma"); }}><span className="work-card-copy"><small>FIGMA 디자인 · 예시</small><strong>우산 대여 위치 화면 디자인</strong><span>디자인 미리보기 ↗</span></span><span className="figma-mini" aria-hidden="true"><span>BrainRoom.</span><i /><i /><i /><b /></span></button><p className="sample-caption">실제 Figma 파일이 아닌 디자인 초안 예시예요.</p></section>}
              {person.part === "개발" && <section className="part-work" aria-label="개발 작업 예시"><div className="part-heading"><div><span>개발 · 예시</span><h2>무엇이 바뀌었을까요?<span>.</span></h2></div><p>개발 기록과 쉬운 설명을 나란히 볼 수 있어요.</p></div><div className="work-grid"><button type="button" className="work-card development-card" onClick={event => { detailTriggerRef.current = event.currentTarget; setShowDetail("github"); }}><small>GITHUB 변경사항 · 예시</small><strong>대여 위치 지도 화면 추가</strong><span>개발 기록 보기 ↗</span></button><button type="button" className="work-card explanation-card" onClick={event => { detailTriggerRef.current = event.currentTarget; setShowDetail("ai"); }}><small>쉬운 설명 · 예시</small><strong>우산 대여 위치 지도가 생겼어요</strong><span>쉬운 설명 보기 ↗</span></button></div><p className="sample-caption">직접 작성한 예시예요. 실제 GitHub 연동이나 AI 자동 요약은 아직 연결되지 않았어요.</p></section>}
              {person.part === "기획" && <section className="part-work" aria-label="기획 작업 예시"><div className="part-heading"><div><span>기획 · 예시</span><h2>이번 주에 정한 일<span>.</span></h2></div><p>프로젝트 목표와 회의 내용을 확인해요.</p></div><div className="plan-summary"><div><small>프로젝트 목표</small><p>학생들이 교내 우산 대여소와 반납 장소를 쉽게 찾도록 도와요.</p></div><div><small>회의에서 정한 일</small><p>우산 대여 화면 시안과 대여 위치 지도를 먼저 만들어요.</p></div><div><small>다음 회의</small><p>만든 화면을 함께 보고 수정할 점을 정해요.</p></div></div><p className="sample-caption">사용 흐름을 보여주기 위한 기획 예시예요.</p></section>}
              <section className="personal-archive" aria-labelledby="archive-title">
                <div className="archive-heading"><div><span>공유한 기록 &nbsp; / &nbsp; 예시</span><h2 id="archive-title">자료와 메모<span>.</span></h2></div><p>팀원에게 공유한 자료와<br />{' '}메모, 아이디어를 확인해요.</p></div>
                <div className="archive-controls"><span>모아둔 기록 살펴보기</span><div className="archive-tabs" aria-label="예시 기록 유형 선택">{["All", "Research", "Notes", "Ideas"].map(tab => <button key={tab} type="button" aria-pressed={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)} disabled={phase !== "room"}>{tabLabel[tab]}</button>)}</div></div>
                <div className="archive-shelf" aria-live="polite">{filtered.map((entry, i) => <article className={`archive-paper paper-${entry.kind.toLowerCase()}`} key={entry.title}><div className="paper-top"><span>{kindLabel[entry.kind]} &nbsp; / &nbsp; 0{i + 1}</span><span className="paper-mark">{entry.kind === "RESEARCH" ? <Link2 size={14} /> : entry.kind === "NOTE" ? <FileText size={14} /> : <Lightbulb size={14} />}</span></div><div className="paper-art" aria-hidden="true"><span /><span /><span /></div><div className="paper-copy"><h3>{entry.title}</h3><p>{entry.detail}</p></div><div className="paper-bottom"><span>{person.name === "내 공간" ? "나의 기록" : `${person.name}의 기록`}</span><span>✳</span></div></article>)}</div>
                <div className="archive-foot"><span><Check size={13} /> 디자인 초안에 사용된 예시 기록이에요.</span><span>작은 생각을 모아 함께 만드는 아이디어</span></div>
              </section>
            </div>
          </div>
          <div className="transition-curtain" aria-hidden="true" />
          {showDetail && roomVisible && <div className="dialog-backdrop detail-backdrop" onClick={() => { setShowDetail(null); detailTriggerRef.current?.focus(); }}><div className="table-dialog work-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={event => event.stopPropagation()}><button ref={detailCloseRef} className="close-dialog" type="button" onClick={() => { setShowDetail(null); detailTriggerRef.current?.focus(); }} aria-label="닫기">×</button>{showDetail === "figma" ? <><div className="eyebrow">FIGMA 디자인 · 예시 미리보기</div><h2 id="detail-title">우산 대여 위치 화면 디자인<span>.</span></h2><p>실제 Figma 파일이 아닌, 디자인을 살펴보는 방식의 예시예요.</p><div className="design-preview"><div className="design-top"><strong>BrainRoom.</strong><span>우산 대여 화면 · 예시</span></div><div className="design-body"><span className="design-side">대여소<br /><br />반납 장소<br /><br />내역</span><div className="design-content"><small>캠퍼스 우산 대여</small><strong>가까운 대여소 찾기</strong><span><i /><i /><i /></span></div></div></div></> : showDetail === "github" ? <><div className="eyebrow">GITHUB 변경사항 · 예시</div><h2 id="detail-title">대여 위치 지도 화면 추가<span>.</span></h2><p>아래는 GitHub 개발 기록을 보여주는 예시예요. 실제 저장소와 연결되어 있지는 않아요.</p><div className="change-example"><strong>변경 기록</strong><span>feat: add umbrella location map</span></div><div className="explanation-list"><div><strong>변경한 파일</strong><p>app/locations/page.tsx</p></div><div><strong>개발 메모</strong><p>교내 우산 대여소를 지도에서 볼 수 있는 화면을 추가했어요.</p></div></div></> : <><div className="eyebrow">쉬운 설명 · 예시</div><h2 id="detail-title">우산 대여 위치 지도가 생겼어요<span>.</span></h2><p>개발 내용을 팀원들이 이해하기 쉽게 정리한 예시예요. 실제 AI 자동 요약은 아직 연결되지 않았어요.</p><div className="change-example"><strong>한 줄로 보면</strong><span>학교 안의 우산 대여 위치를 볼 수 있는 지도가 생겼어요.</span></div><div className="explanation-list"><div><strong>무엇이 바뀌었나요?</strong><p>학생이 가까운 우산 대여소 위치를 화면에서 확인할 수 있어요.</p></div><div><strong>팀원이 확인할 점</strong><p>대여소 위치가 잘 보이고 지도에서 찾기 쉬운지 확인해 주세요.</p></div><div><strong>아직 남은 일</strong><p>실제 대여 가능 우산 수는 다음 단계에서 연결할 예정이에요.</p></div></div></>}<button type="button" className="dialog-done" onClick={() => { setShowDetail(null); detailTriggerRef.current?.focus(); }}>닫기 <ArrowRight size={15} /></button></div></div>}
          {showTable && phase === "hall" && <TeamBoard onBack={() => { setShowTable(false); requestAnimationFrame(() => boardTriggerRef.current?.focus()); }} />}
          {showInvite && <div className="dialog-backdrop invite-backdrop" onClick={() => { setShowInvite(false); inviteButtonRef.current?.focus(); }}><div className="table-dialog invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title" aria-describedby="invite-description" onClick={event => event.stopPropagation()}><button ref={closeInviteRef} className="close-dialog" type="button" onClick={() => { setShowInvite(false); inviteButtonRef.current?.focus(); }} aria-label="닫기">×</button><div className="dialog-icon"><UsersRound size={20} /></div><div className="eyebrow">함께할 팀원을 초대해요</div><h2 id="invite-title">팀원 추가<span>.</span></h2><p id="invite-description">이 화면은 디자인 초안이에요. 완성된 서비스에서는 초대 링크로 팀원을 초대할 수 있어요. 지금은 실제 링크가 생성되거나 초대가 전송되지 않아요.</p><div className="invite-example"><span>초대 링크</span><strong>초대 기능 준비 중</strong></div><button type="button" className="dialog-done" onClick={() => { setShowInvite(false); inviteButtonRef.current?.focus(); }}>확인 <ArrowRight size={15} /></button></div></div>}
          {showAbout && <div role="status" className="toast">사용 흐름을 살펴보기 위한 디자인 초안이에요.</div>}
        </section>
      </div><button className="preview-badge" type="button" onClick={() => { setShowAbout(true); timers.current.push(setTimeout(() => setShowAbout(false), 3200)); }}><Plus size={13} /> 초안 안내</button>
    </main>
  );
}
