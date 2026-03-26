import React, { useState, useEffect, useMemo } from "react";

// ── Timezone helpers ──────────────────────────────────────────────────────────

function getOffsetMinutes(tz) {
  try {
    const d = new Date();
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
    const part = f.formatToParts(d).find(p => p.type === 'timeZoneName')?.value || "";
    const m = part.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!m) return 0;
    const [_, sign, h, min] = m;
    const total = parseInt(h) * 60 + (parseInt(min) || 0);
    return sign === "+" ? total : -total;
  } catch { return 0; }
}

function fmtOffset(tz) {
  try {
    const d = new Date();
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
    return f.formatToParts(d).find(p => p.type === 'timeZoneName')?.value.replace("GMT", "UTC") || "UTC+0";
  } catch { return "UTC+0"; }
}

function sanitizeName(s) {
  return s.replace(/<[^>]*>?/gm, "").slice(0, 50);
}

function validateHashData(s) {
  if (!s || typeof s !== 'object') return null;
  if (!Array.isArray(s.members)) s.members = [];
  s.members = s.members.filter(m => m && typeof m.name === 'string').map(m => ({
    id: typeof m.id === 'string' ? m.id : uid(),
    name: sanitizeName(m.name),
    timezone: ALL_TZS.find(t => t.name === m.timezone) ? m.timezone : BROWSER_TZ
  }));
  if (s.date && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) delete s.date;
  if (typeof s.hour !== 'number' || s.hour < 0 || s.hour > 23) delete s.hour;
  return s;
}

let ALL_TZS;
try {
  const raw = Intl.supportedValuesOf("timeZone");
  ALL_TZS = raw.map(tz => ({ name: tz, offset: getOffsetMinutes(tz), label: `${fmtOffset(tz)} ${tz.replace(/_/g, " ")}` }))
    .sort((a, b) => a.offset - b.offset || a.name.localeCompare(b.name));
} catch {
  const fallback = ["UTC","America/New_York","America/Chicago","America/Denver","America/Los_Angeles","Asia/Dubai","Asia/Kolkata","Asia/Singapore","Asia/Tokyo","Australia/Sydney"];
  ALL_TZS = fallback.map(tz => ({ name: tz, offset: getOffsetMinutes(tz), label: `${fmtOffset(tz)} ${tz}` }))
    .sort((a, b) => a.offset - b.offset || a.name.localeCompare(b.name));
}

const BROWSER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } })();

function uid() { return Math.random().toString(36).slice(2, 8); }

function localTimeAt(dateObj, tz) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { 
      timeZone: tz, 
      hour: "numeric", 
      minute: "2-digit", 
      hour12: false, 
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    const parts = fmt.formatToParts(dateObj);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
    let h = parseInt(get("hour")) || 0;
    if (h === 24) h = 0;
    const min = get("minute") || "00";
    const wd = get("weekday") || "";
    const month = get("month") || "";
    const day = get("day") || "";
    return { 
      hour: h, 
      min, 
      weekday: wd, 
      date: `${month} ${day}`,
      display: `${String(h).padStart(2, "0")}:${min}` 
    };
  } catch { return { hour: 0, min: "00", weekday: "", date: "", display: "00:00" }; }
}

function hourStatus(h, start, end) {
  // Good: start to end (inclusive start, exclusive end)
  // Example: 17 to 1 (5pm to 1am)
  const isGood = end > start ? (h >= start && h < end) : (h >= start || h < end);
  if (isGood) return "good";
  
  // Okay: 2 hours before/after good
  const sOkay = (start - 2 + 24) % 24;
  const eOkay = (end + 2) % 24;
  const isOkay = eOkay > sOkay ? (h >= sOkay && h < eOkay) : (h >= sOkay || h < eOkay);
  if (isOkay) return "okay";
  
  return "bad";
}

function fmt12(h) {
  const hh = Math.floor(h);
  const mm = h % 1 === 0 ? ":00" : ":30";
  if (hh === 0) return `12${mm} am`;
  if (hh < 12) return `${hh}${mm} am`;
  if (hh === 12) return `12${mm} pm`;
  return `${hh - 12}${mm} pm`;
}

const S = {
  good: { bg: "#f0fdf4", pill: "#dcfce7", text: "#15803d", border: "#bbf7d0", label: "Working hours" },
  okay: { bg: "#fffbeb", pill: "#fef3c7", text: "#a16207", border: "#fde68a", label: "Early / Late" },
  bad:  { bg: "#f9fafb", pill: "#f3f4f6", text: "#6b7280", border: "#e5e7eb", label: "Night / Off"  },
};

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [storage, setStorage] = useState(() => {
    try {
      const s = localStorage.getItem("tz-team-v2");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  const [members, setMembers] = useState(() => storage?.members || [{ id: uid(), name: "You", timezone: BROWSER_TZ }]);
  const [tab, setTab]               = useState("check");
  const [date, setDate]             = useState(() => new Date().toISOString().slice(0, 10));
  const [hour, setHour]             = useState(14);
  const [workingStart, setWorkingStart] = useState(() => storage?.workingStart ?? 17);
  const [workingEnd, setWorkingEnd]     = useState(() => storage?.workingEnd ?? 1);

  const [showAdd,  setShowAdd]      = useState(false);
  const [addName,  setAddName]      = useState("");
  const [addTz,    setAddTz]        = useState(BROWSER_TZ);
  const [tzSearch, setTzSearch]     = useState("");
  const [showDrop, setShowDrop]     = useState(false);
  const [copied,   setCopied]       = useState(false);

  useEffect(() => { 
    try { 
      localStorage.setItem("tz-team-v2", JSON.stringify({ members, workingStart, workingEnd })); 
    } catch {} 
  }, [members, workingStart, workingEnd]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    try { 
      const parsed = JSON.parse(atob(hash)); 
      const s = validateHashData(parsed);
      if (!s) return;
      if (s.members) setMembers(s.members); 
      if (s.date) setDate(s.date); 
      if (s.hour !== undefined) setHour(s.hour); 
      if (s.workingStart !== undefined) setWorkingStart(s.workingStart);
      if (s.workingEnd !== undefined) setWorkingEnd(s.workingEnd);
    } catch {}
  }, []);

  const dateObj = useMemo(() => {
    const d = new Date(`${date}T00:00:00`);
    d.setHours(Math.floor(hour), (hour % 1) * 60);
    return d;
  }, [date, hour]);

  const memberTimes = useMemo(() => members.map((m) => ({ ...m, time: localTimeAt(dateObj, m.timezone) })), [members, dateObj]);

  const grid = useMemo(() => Array.from({ length: 24 }, (_, h) => {
    const d = new Date(`${date}T${String(h).padStart(2, "0")}:00:00`);
    const times = members.map((m) => ({ ...m, time: localTimeAt(d, m.timezone) }));
    const good = times.filter((m) => hourStatus(m.time.hour, workingStart, workingEnd) === "good").length;
    const okay = times.filter((m) => hourStatus(m.time.hour, workingStart, workingEnd) === "okay").length;
    return { h, times, good, okay };
  }), [members, date, workingStart, workingEnd]);

  const filteredTzs = useMemo(() => {
    const q = tzSearch.toLowerCase();
    return (q ? ALL_TZS.filter((z) => z.label.toLowerCase().includes(q)) : ALL_TZS).slice(0, 80);
  }, [tzSearch]);

  const addMember = () => {
    const cleanName = sanitizeName(addName.trim());
    if (!cleanName) return;
    setMembers((p) => [...p, { id: uid(), name: cleanName, timezone: addTz }]);
    setAddName(""); setAddTz(BROWSER_TZ); setTzSearch(""); setShowAdd(false); setShowDrop(false);
  };

  const share = () => {
    const enc = btoa(JSON.stringify({ members, date, hour, workingStart, workingEnd }));
    navigator.clipboard.writeText(`${window.location.href.split("#")[0]}#${enc}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const bestGood = grid.filter((r) => r.good === members.length);
  const bestOkay = grid.filter((r) => r.good + r.okay === members.length && r.good < members.length);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #ffffff; color: #111827; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }
        ::-webkit-scrollbar-track { background: transparent; }
        .hov:hover { background: #f9fafb !important; }
        input[type=text], input[type=date] { background: #ffffff; border: 1px solid #d1d5db; color: #111827; border-radius: 8px; padding: 8px 12px; font-size: 13px; font-family: 'DM Sans', sans-serif; outline: none; width: 100%; }
        input[type=text]:focus, input[type=date]:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px #7c3aed22; }
        input[type=range] { accent-color: #7c3aed; width: 100%; cursor: pointer; margin: 0; }
        .cell { height: 34px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-family: 'DM Mono', monospace; font-size: 10px; cursor: pointer; transition: filter 0.1s, transform 0.1s; }
        .cell:hover { filter: brightness(0.95); transform: scaleY(1.06); z-index: 2; position: relative; }
        .pill-btn { border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-family: 'DM Mono', monospace; cursor: pointer; transition: filter 0.15s; }
        .pill-btn:hover { filter: brightness(0.95); }
        .tab { background: none; border: none; cursor: pointer; padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; font-family: 'DM Sans', sans-serif; color: #6b7280; transition: all 0.15s; }
        .tab:hover { background: #f3f4f6; color: #374151; }
        .tab.on { background: #ede9fe; color: #7c3aed; }
        .ghost-btn { background: #f3f4f6; border: 1px solid #e5e7eb; color: #4b5563; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; }
        .ghost-btn:hover { background: #e5e7eb; border-color: #d1d5db; color: #111827; }
        .primary-btn { background: #7c3aed; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: background 0.15s; }
        .primary-btn:hover { background: #6d28d9; }
        .del-btn { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 3px; border-radius: 4px; display: flex; align-items: center; transition: all 0.15s; }
        .del-btn:hover { color: #ef4444; background: #fee2e2; }
        .tz-item { padding: 8px 12px; font-size: 12px; color: #4b5563; cursor: pointer; border-radius: 4px; }
        .tz-item:hover { background: #f3f4f6; color: #111827; }
        .tz-item.sel { color: #7c3aed; font-weight: 500; }
        .score-row > div { cursor: pointer; }
        .score-row > div:hover { filter: brightness(0.95); }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#ffffff", minHeight: "100vh", color: "#111827" }}>

        {/* ── Header ── */}
        <div style={{ borderBottom: "1px solid #f3f4f6", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: "#111827", letterSpacing: "-0.5px" }}>tz</span>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: "#7c3aed" }}>meet</span>
          </div>
          <button className="ghost-btn" onClick={share} style={{ fontSize: 12 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
            {copied ? "Copied!" : "Share link"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "264px 1fr", minHeight: "calc(100vh - 56px)" }}>

          {/* ── Sidebar ── */}
          <div style={{ borderRight: "1px solid #f3f4f6", background: "#f9fafb", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>

            {/* Sidebar header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "#6b7280", textTransform: "uppercase" }}>Team members</span>
              <button className="ghost-btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setShowAdd((s) => !s)}>
                {showAdd ? "Cancel" : "+ Add"}
              </button>
            </div>

            {/* Add form */}
            {showAdd && (
              <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
                <input type="text" placeholder="Name" value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember()} autoFocus />
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search timezone…"
                    value={showDrop ? tzSearch : addTz}
                    onFocus={() => { setShowDrop(true); setTzSearch(""); }}
                    onBlur={() => setTimeout(() => setShowDrop(false), 180)}
                    onChange={(e) => setTzSearch(e.target.value)}
                  />
                  {showDrop && (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, maxHeight: 200, overflowY: "auto", zIndex: 200, boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}>
                      {filteredTzs.length === 0 && <div style={{ padding: 12, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>No results</div>}
                      {filteredTzs.map((tz) => (
                        <div key={tz.name} className={`tz-item${tz.name === addTz ? " sel" : ""}`} onMouseDown={() => { setAddTz(tz.name); setShowDrop(false); }}>
                          {tz.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="primary-btn" style={{ flex: 1 }} onClick={addMember}>Add member</button>
                </div>
              </div>
            )}

            {/* Members list */}
            {members.length === 0 && (
              <div style={{ color: "#9ca3af", fontSize: 12, textAlign: "center", padding: "32px 0" }}>No members yet</div>
            )}
            {members.map((m) => (
              <div key={m.id} className="hov" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 8, background: "#ffffff", border: "1px solid #e5e7eb", transition: "all 0.15s" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtOffset(m.timezone)} {m.timezone.replace(/_/g, " ")}</div>
                </div>
                <button className="del-btn" title="Remove" onClick={() => setMembers((p) => p.filter((x) => x.id !== m.id))}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ))}

            {/* Working Hours Settings */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Working Hours</div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4 }}>START</div>
                  <select value={workingStart} onChange={(e) => setWorkingStart(parseInt(e.target.value))} style={{ width: "100%", padding: "4px 8px", fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb", background: "#ffffff" }}>
                    {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{fmt12(i)}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4 }}>END</div>
                  <select value={workingEnd} onChange={(e) => setWorkingEnd(parseInt(e.target.value))} style={{ width: "100%", padding: "4px 8px", fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb", background: "#ffffff" }}>
                    {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{fmt12(i)}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
              {Object.values(S).map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: s.bg, border: `1px solid ${s.border}` }}/>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{s.label}</span>
                  <div style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: s.text, opacity: 0.6 }}/>
                </div>
              ))}
            </div>
          </div>

          {/* ── Main ── */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Controls bar */}
            <div style={{ borderBottom: "1px solid #f3f4f6", padding: "10px 24px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 3 }}>
                <button className={`tab${tab === "check" ? " on" : ""}`} onClick={() => setTab("check")}>Time check</button>
                <button className={`tab${tab === "overlap" ? " on" : ""}`} onClick={() => setTab("overlap")}>Find overlap</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#f3f4f6", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>GMT 0</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "baseline", gap: 6 }}>
                      {(() => {
                        const base = new Date(date + "T00:00:00");
                        const d = new Date(base.getTime());
                        d.setHours(Math.floor(hour), (hour % 1) * 60);
                        const utc = localTimeAt(d, "UTC");
                        return (
                          <>
                            {utc.display}
                            <span style={{ fontSize: 10, fontWeight: 500, color: "#6b7280", opacity: 0.8 }}>{utc.date}</span>
                          </>
                        );
                      })()}
                    </span>
                  </div>
                </div>
                {tab === "check" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, maxWidth: 320 }}>
                    <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>Your time:</span>
                    <input type="range" min={0} max={23.5} step={0.5} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#7c3aed", minWidth: 64, textAlign: "right" }}>{fmt12(hour)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

              {members.length === 0 && (
                <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", paddingTop: 80 }}>
                  Add team members from the sidebar to get started.
                </div>
              )}

              {/* ── Tab: Time check ── */}
              {tab === "check" && members.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>
                    {date} · {fmt12(hour)} your time ({BROWSER_TZ})
                  </div>
                  {memberTimes.map((m) => {
                    const st = hourStatus(m.time.hour, workingStart, workingEnd);
                    const s = S[st];
                    return (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", background: "#ffffff", border: `1px solid #e5e7eb`, borderRadius: 12, transition: "border-color 0.15s" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 3 }}>{m.name}</div>
                          <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono', monospace" }}>{fmtOffset(m.timezone)} {m.timezone.replace(/_/g, " ")}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 500, color: s.text, letterSpacing: "-0.5px", lineHeight: 1 }}>{m.time.display}</span>
                          <span style={{ fontSize: 10, color: s.text, opacity: 0.7, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2px" }}>{m.time.weekday}, {m.time.date}</span>
                        </div>
                        <div style={{ background: s.pill, color: s.text, border: `1px solid ${s.border}`, borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>
                          {s.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Tab: Find overlap ── */}
              {tab === "overlap" && members.length > 0 && (
                <div>
                  {/* Best slots */}
                  <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
                    {bestGood.length > 0 && (
                      <div style={{ background: S.good.pill, border: `1px solid ${S.good.border}`, borderRadius: 10, padding: "14px 18px" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: S.good.text, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                          Ideal — everyone in core working hours
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {bestGood.map((r) => (
                            <button key={r.h} className="pill-btn" onClick={() => { setTab("check"); setHour(r.h); }}
                              style={{ background: S.good.bg, color: S.good.text, border: `1px solid ${S.good.border}` }}>
                              {fmt12(r.h)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {bestOkay.length > 0 && (
                      <div style={{ background: S.okay.pill, border: `1px solid ${S.okay.border}`, borderRadius: 10, padding: "14px 18px" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: S.okay.text, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                          Acceptable — within reasonable hours for all
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {bestOkay.map((r) => (
                            <button key={r.h} className="pill-btn" onClick={() => { setTab("check"); setHour(r.h); }}
                              style={{ background: S.okay.bg, color: S.okay.text, border: `1px solid ${S.okay.border}` }}>
                              {fmt12(r.h)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {bestGood.length === 0 && bestOkay.length === 0 && (
                      <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 18px", fontSize: 12, color: "#9ca3af" }}>
                        No overlap found for this date. Consider a different day or rotating the meeting time.
                      </div>
                    )}
                  </div>

                  {/* 24h heatmap */}
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: 760 }}>
                      {/* Hour labels */}
                      <div style={{ display: "grid", gridTemplateColumns: "130px repeat(24, 1fr)", gap: 2, marginBottom: 6 }}>
                        <div/>
                        {Array.from({ length: 24 }, (_, h) => (
                          <div key={h} style={{ textAlign: "center", fontSize: 9, color: h === Math.floor(hour) ? "#7c3aed" : "#9ca3af", fontFamily: "'DM Mono', monospace", fontWeight: h === Math.floor(hour) ? 600 : 400 }}>
                            {h % 2 === 0 ? fmt12(h).replace(" ", "") : "·"}
                          </div>
                        ))}
                      </div>

                      {/* GMT Row */}
                      <div style={{ display: "grid", gridTemplateColumns: "130px repeat(24, 1fr)", gap: 2, marginBottom: 12, borderBottom: "1px dashed #e5e7eb", paddingBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", paddingRight: 10 }}>
                          <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>GMT 0</span>
                        </div>
                        {grid.map(({ h }) => {
                          const d = new Date(`${date}T${String(h).padStart(2, "0")}:00:00`);
                          const utc = localTimeAt(d, "UTC");
                          const isSelected = h === Math.floor(hour);
                          return (
                            <div key={h} className="cell" title={`${utc.display} (GMT 0)`}
                              onClick={() => { setHour(h); setTab("check"); }}
                              style={{ background: "#f5f3ff", color: "#7c3aed", border: `1px solid ${isSelected ? "#7c3aed" : "#ddd6fe"}`, fontWeight: 700 }}>
                              {utc.display.slice(0, 2)}
                            </div>
                          );
                        })}
                      </div>

                      {/* Member rows */}
                      {members.map((m) => (
                        <div key={m.id} style={{ display: "grid", gridTemplateColumns: "130px repeat(24, 1fr)", gap: 2, marginBottom: 2 }}>
                          <div style={{ display: "flex", alignItems: "center", paddingRight: 10 }}>
                            <span style={{ fontSize: 12, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{m.name}</span>
                          </div>
                          {grid.map(({ h, times }) => {
                            const mt = times.find((t) => t.id === m.id);
                            const st = mt ? hourStatus(mt.time.hour, workingStart, workingEnd) : "bad";
                            const s = S[st];
                            const isSelected = h === Math.floor(hour);
                            return (
                              <div key={h} className="cell" title={`${mt?.time.display} (${m.name})`}
                                onClick={() => { setHour(h); setTab("check"); }}
                                style={{ background: s.bg, color: s.text, border: `1px solid ${isSelected ? "#7c3aed" : s.border}`, outline: isSelected ? "1px solid #7c3aed44" : "none", fontWeight: isSelected ? 500 : 400 }}>
                                {mt?.time.display.slice(0, 2)}
                              </div>
                            );
                          })}
                        </div>
                      ))}

                      {/* Score row */}
                      <div className="score-row" style={{ display: "grid", gridTemplateColumns: "130px repeat(24, 1fr)", gap: 2, marginTop: 8 }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: "#6b7280" }}>score</span>
                        </div>
                        {grid.map(({ h, good, okay }) => {
                          const total = members.length;
                          const st = good === total ? "good" : good + okay === total ? "okay" : "bad";
                          const s = S[st];
                          const isSelected = h === Math.floor(hour);
                          return (
                            <div key={h} className="cell" title={`${good} ideal, ${okay} acceptable`}
                              onClick={() => { setHour(h); setTab("check"); }}
                              style={{ background: s.pill, color: s.text, border: `1px solid ${isSelected ? "#7c3aed" : s.border}`, fontSize: 9, fontWeight: 600 }}>
                              {good}/{total}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8, fontFamily: "'DM Mono', monospace" }}>
                        click any cell to preview that time
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
