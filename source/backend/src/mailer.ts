// Outgoing email for account flows. Only the log transport exists for now: the link (which contains
// the one-time token) is written to the log. Replace with an Azure Communication Services Email
// implementation of `Mailer` when the resource is provisioned.

export interface Mailer {
  sendValidation(to: string, link: string): Promise<void>;
  sendPasswordReset(to: string, link: string): Promise<void>;
}

class LogMailer implements Mailer {
  async sendValidation(to: string, link: string): Promise<void> {
    console.log(`[mail not sent] validation for ${to}: ${link}`);
  }
  async sendPasswordReset(to: string, link: string): Promise<void> {
    console.log(`[mail not sent] password reset for ${to}: ${link}`);
  }
}

export function createMailer(): Mailer {
  return new LogMailer();
}

export function frontendLink(path: string, params: Record<string, string> = {}): string {
  const base = (process.env.FRONTEND_BASEURL ?? 'http://localhost:4200').replace(/\/+$/, '');
  const query = new URLSearchParams(params).toString();
  return `${base}${path}${query ? `?${query}` : ''}`;
}
