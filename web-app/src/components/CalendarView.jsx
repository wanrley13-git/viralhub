import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const hexToRgba = (hex, alpha) => {
  if (!hex || hex === 'none' || hex[0] !== '#') return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay();
}

export default function CalendarView({ tasks, onEditTask, onCreateTask }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const tasksByDate = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      if (!t.scheduled_date) return;
      if (!map[t.scheduled_date]) map[t.scheduled_date] = [];
      map[t.scheduled_date].push(t);
    });
    return map;
  }, [tasks]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  const cells = [];
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) cells.push(null);
  // Day cells
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      {/* Month header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h3 className="text-2xl font-extrabold text-white tracking-tight">
            {MONTH_NAMES[month]}
            <span className="text-gray-500 font-medium ml-2">{year}</span>
          </h3>
          <button
            onClick={goToday}
            className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 border border-primary/15 rounded-lg hover:bg-primary/15 transition-colors"
          >
            Hoje
          </button>
        </div>
        <div className="flex gap-1">
          <button onClick={prevMonth} className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
          <button onClick={nextMonth} className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
            <ChevronRight size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-gray-600 py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 flex-1 gap-px bg-white/[0.03] rounded-2xl overflow-hidden border border-border-subtle">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="bg-background min-h-[100px]" />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayTasks = tasksByDate[dateStr] || [];
          const isToday = dateStr === todayStr;
          const hasCards = dayTasks.length > 0;

          // Use the first card's color for the day glow
          const primaryCard = dayTasks[0];
          const cardColor = primaryCard?.card_color && primaryCard.card_color !== 'none' && primaryCard.card_color !== '#1c1c24'
            ? primaryCard.card_color : null;

          return (
            <div
              key={day}
              onClick={() => {
                if (!hasCards) onCreateTask('todo', dateStr);
              }}
              className={`bg-background min-h-[100px] p-2 flex flex-col transition-colors relative group ${
                !hasCards ? 'cursor-pointer hover:bg-white/[0.02]' : ''
              }`}
              style={cardColor ? {
                background: `linear-gradient(160deg, ${hexToRgba(cardColor, 0.12)} 0%, transparent 60%)`
              } : undefined}
            >
              {/* Accent line */}
              {cardColor && (
                <div
                  className="absolute top-0 left-2 right-2 h-[2px] rounded-full opacity-50"
                  style={{ backgroundColor: cardColor }}
                />
              )}

              {/* Day number */}
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400'
                }`}>
                  {day}
                </span>
                {dayTasks.length > 2 && (
                  <span className="text-[9px] font-mono text-gray-600">+{dayTasks.length - 2}</span>
                )}
              </div>

              {/* Cards (max 2) */}
              <div className="flex flex-col gap-1 flex-1 overflow-hidden">
                {dayTasks.slice(0, 2).map(task => {
                  const tc = task.card_color && task.card_color !== 'none' && task.card_color !== '#1c1c24' ? task.card_color : null;
                  return (
                    <button
                      key={task.id}
                      onClick={(e) => { e.stopPropagation(); onEditTask(task); }}
                      className="text-left w-full p-1.5 rounded-lg bg-surface/80 border border-border-subtle hover:border-border-hover transition-all group/card cursor-pointer overflow-hidden"
                      style={tc ? { borderColor: hexToRgba(tc, 0.2) } : undefined}
                    >
                      <div
                        className="text-[8px] font-bold uppercase tracking-wider font-mono mb-0.5 truncate"
                        style={{ color: tc ? hexToRgba(tc, 0.9) : 'rgb(156 163 175)' }}
                      >
                        {task.tag}
                      </div>
                      <div className="text-[10px] text-white/60 leading-tight line-clamp-2 font-medium">
                        {task.title}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
