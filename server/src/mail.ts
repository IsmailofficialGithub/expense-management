import nodemailer from 'nodemailer';

const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;

const transport = GMAIL_USER && GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } })
  : null;

export async function sendMail(to: string, subject: string, html: string) {
  if (!transport) {
    // shortcut: without Gmail creds the mail is only logged, set GMAIL_USER/GMAIL_APP_PASSWORD in .env for real delivery
    console.warn(`[mail disabled] to=${to} subject=${subject}\n${html}`);
    return;
  }
  await transport.sendMail({ from: `Flatmate <${GMAIL_USER}>`, to, subject, html });
}
