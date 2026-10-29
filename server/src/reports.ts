import { db } from './db.js';
import { redis } from './redis.js';
import { deliver } from './messaging.js';
import { purgeOldLogs } from './audit.js';

const DAY = 86_400_000;
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Local date/hour/weekday of `now` in REPORT_TZ.
export function localParts(now: Date, tz = process.env.REPORT_TZ ?? 'UTC') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: WEEKDAYS[p.weekday] };
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (n: number) => `₹${Number(n).toFixed(2)}`;
// Inline styles only (email clients drop <style>); same look as the expense email in routes/notify.ts.
const table = (rows: string[][]) =>
  `<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 20px;">${rows.map((r) =>
    `<tr>${r.map((c, i) => `<td style="padding:10px 8px;border-bottom:1px solid #eee;color:#333;font-size:15px;${
      i === r.length - 1 ? 'text-align:right;font-weight:600;' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table>`;
const h3 = (t: string) => `<h3 style="color:#6200EE;font-size:16px;margin:24px 0 4px;">${t}</h3>`;
const layout = (title: string, body: string) => `<!DOCTYPE html><html><body style="margin:0;padding:20px 0;font-family:'Segoe UI',Tahoma,sans-serif;background:#f9f9f9;">
<table role="presentation" style="max-width:600px;width:100%;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#6200EE,#9c27b0);background-color:#6200EE;padding:32px 20px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;">${title}</h1></td></tr>
<tr><td style="padding:28px 24px;color:#555;font-size:15px;line-height:1.6;">${body}
<p style="text-align:center;margin-top:24px;"><a href="${process.env.WEB_URL ?? 'https://flatmate.ismailabbasi.qzz.io'}" style="background:#6200EE;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Open Flatmate</a></p></td></tr>
<tr><td style="padding:20px;text-align:center;background:#fcfcfc;border-top:1px solid #eee;color:#999;font-size:12px;">You can turn these reports off in your Flatmate profile.</td></tr>
</table></body></html>`;

// One report per opted-in user with active groups. Window ends at `now`, so a fixed clock gives fixed output.
export async function runReports(type: 'daily' | 'weekly', now: Date = new Date()): Promise<{ sent: number }> {
  const days = type === 'daily' ? 1 : 7;
  const to = now, from = new Date(now.getTime() - days * DAY), prevFrom = new Date(now.getTime() - 2 * days * DAY);
  const { rows: users } = await db.query(
    `select p.id, p.email, p.full_name, p.phone_e164 from profiles p
      where ${type === 'daily' ? 'p.report_daily' : 'p.report_weekly'}
        and exists (select 1 from group_members gm where gm.user_id = p.id)
      order by p.id`);
  let sent = 0;
  for (const u of users) {
    // User's share of expenses in their active groups, current window.
    const { rows: spend } = await db.query(
      `select g.name as grp, coalesce(c.name, 'Uncategorized') as cat, sum(s.amount) as amt
         from expense_splits s join expenses e on e.id = s.expense_id
         join group_members gm on gm.group_id = e.group_id and gm.user_id = $1
         join groups g on g.id = e.group_id left join expense_categories c on c.id = e.category_id
        where s.user_id = $1 and e.created_at >= $2 and e.created_at < $3
        group by 1, 2 order by 1, 2`, [u.id, from, to]);
    const { rows: [act] } = await db.query(
      `select (select count(*) from expenses e join group_members gm on gm.group_id = e.group_id and gm.user_id = $1
                where e.created_at >= $2 and e.created_at < $3)
            + (select count(*) from settlements s join group_members gm on gm.group_id = s.group_id and gm.user_id = $1
                where s.created_at >= $2 and s.created_at < $3) as n`, [u.id, from, to]);
    if (type === 'daily' && !act.n) continue;
    const { rows: debts } = await db.query(
      `select g.name as grp, b.balance from user_group_balances b join groups g on g.id = b.group_id
        where b.user_id = $1 and b.balance <> 0 order by g.name`, [u.id]);
    const total = spend.reduce((a, r) => a + r.amt, 0);
    const name = esc(u.full_name || u.email);
    let html = `<p>Hi ${name},</p>`;
    let subject: string;
    if (type === 'daily') {
      subject = 'Your daily expense summary';
      html += `<p>Activity in the last 24 hours: ${act.n} item(s). Your share: <b>${money(total)}</b>.</p>`;
      if (spend.length) html += table(spend.map((r) => [esc(r.grp), esc(r.cat), money(r.amt)]));
    } else {
      subject = 'Your weekly expense report';
      const { rows: [prev] } = await db.query(
        `select coalesce(sum(s.amount), 0) as amt from expense_splits s join expenses e on e.id = s.expense_id
           join group_members gm on gm.group_id = e.group_id and gm.user_id = $1
          where s.user_id = $1 and e.created_at >= $2 and e.created_at < $3`, [u.id, prevFrom, from]);
      const change = prev.amt ? `${total >= prev.amt ? '+' : ''}${(((total - prev.amt) / prev.amt) * 100).toFixed(0)}% vs previous week` : 'no spend the previous week';
      const byGroup = new Map<string, number>(), byCat = new Map<string, number>();
      for (const r of spend) {
        byGroup.set(r.grp, (byGroup.get(r.grp) ?? 0) + r.amt);
        byCat.set(r.cat, (byCat.get(r.cat) ?? 0) + r.amt);
      }
      html += `<p>Your share over the last 7 days: <b>${money(total)}</b> (${change}).</p>`;
      if (spend.length) {
        html += `${h3('By group')}${table([...byGroup].map(([k, v]) => [esc(k), money(v)]))}`;
        html += `${h3('By category')}${table([...byCat].map(([k, v]) => [esc(k), money(v)]))}`;
      }
    }
    html += debts.length
      ? `${h3('Current balances')}${table(debts.map((d) => [esc(d.grp), d.balance > 0 ? `you are owed ${money(d.balance)}` : `you owe ${money(-d.balance)}`]))}`
      : '<p>You are all settled up.</p>';
    await deliver({ userId: u.id, email: u.email, phone: u.phone_e164, kind: `${type}_report`, subject, html: layout(subject, html) });
    sent++;
  }
  return { sent };
}

// One scheduler step; returns what ran. The SET NX locks keep multiple instances and restarts from double-sending.
export async function reportTick(now: Date = new Date()): Promise<'daily' | 'weekly' | null> {
  const { date, hour, weekday } = localParts(now);
  if (hour === 0 && await redis.set(`purge:${date}`, '1', 'EX', 2 * 86_400, 'NX')) await purgeOldLogs();
  if (hour !== Number(process.env.DAILY_REPORT_HOUR ?? 21)) return null;
  if (!(await redis.set(`report:${date}`, '1', 'EX', 2 * 86_400, 'NX'))) return null;
  const type = weekday === Number(process.env.WEEKLY_REPORT_DAY ?? 5) ? 'weekly' : 'daily';
  await runReports(type, now);
  return type;
}

export function startReportScheduler(): void {
  setInterval(() => reportTick().catch((e) => console.error('report tick failed', e)), 60_000).unref();
}
