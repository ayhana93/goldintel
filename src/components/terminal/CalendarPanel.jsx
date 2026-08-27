import React from "react";

const IMP = { high: "text-red-400 border-red-500/30", medium: "text-amber-400 border-amber-500/30", low: "text-slate-400 border-[#2a3348]" };

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Rendered from the UTC parts explicitly. date-fns `format` uses the browser's
// timezone, so the previous version printed local time under a "UTC" label —
// off by hours for most users, on exactly the field that must not be wrong.
function utcLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${DAY[d.getUTCDay()]} ${p(d.getUTCDate())} ${MONTH[d.getUTCMonth()]} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export default function CalendarPanel({ events }) {
  const upcoming = (events || [])
    .filter((e) => new Date(e.event_time) > new Date())
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
    .slice(0, 8);

  return (
    <div className="border border-[#1c2230] bg-[#0b0f17]">
      <div className="border-b border-[#1c2230] px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-400">
        Economic Calendar
      </div>
      {upcoming.length === 0 ? (
        <div className="px-4 py-4 text-xs text-slate-600">
          <span className="font-mono text-red-400">DATA UNAVAILABLE</span> — no upcoming events loaded. Event-risk checks are inactive until calendar data is added.
        </div>
      ) : (
        <div className="divide-y divide-[#1c2230]">
          {upcoming.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <div className="text-xs font-medium text-slate-200">{e.name}</div>
                <div className="font-mono text-[10px] text-slate-500">
                  {utcLabel(e.event_time)} UTC
                  {e.forecast && ` · fcst ${e.forecast}`}
                  {e.previous && ` · prev ${e.previous}`}
                  {e.precision === "approximate" && (
                    <span className="text-slate-600" title="The month is certain; the day follows the usual release pattern and is not a published date.">
                      {" · approx. date"}
                    </span>
                  )}
                </div>
              </div>
              <span className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase ${IMP[e.importance] || IMP.low}`}>
                {e.importance}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}