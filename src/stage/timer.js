// The service timer lives on the operator PC. Screens and phones get { timer, now } and work out the time themselves,
// correcting for a phone whose clock is a few minutes off.
export function timerMs(timer, clockOffset = 0) {
  if (!timer) return 0;
  const now = Date.now() - clockOffset;
  return (timer.base || 0) + (timer.running && timer.startedAt ? now - timer.startedAt : 0);
}

export function formatTimer(timer, clockOffset = 0) {
  const elapsed = timerMs(timer, clockOffset);
  const target = (timer?.minutes || 0) * 60000;
  const ms = target ? target - elapsed : elapsed;
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const text = `${neg ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return { text, over: target > 0 && neg, warn: target > 0 && !neg && ms <= 2 * 60000 };
}

export function clockText(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
