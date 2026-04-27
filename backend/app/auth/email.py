from __future__ import annotations
import logging
import os
import httpx

logger = logging.getLogger(__name__)

_FROM = os.getenv("EMAIL_FROM", "noreply@lanara.app")
_RESEND_KEY = os.getenv("RESEND_API_KEY")
_SMTP_HOST = os.getenv("SMTP_HOST")


async def send_magic_link(to_email: str, link: str, purpose: str = "login") -> None:
    subject = "Your Lanara sign-in link" if purpose == "login" else "You've been invited to Lanara"
    html = _render_html(link, purpose)

    if _RESEND_KEY:
        await _send_via_resend(to_email, subject, html)
    elif _SMTP_HOST:
        await _send_via_smtp(to_email, subject, html)
    else:
        logger.warning("No email provider configured — magic link: %s → %s", to_email, link)


async def _send_via_resend(to: str, subject: str, html: str) -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {_RESEND_KEY}"},
            json={"from": _FROM, "to": [to], "subject": subject, "html": html},
        )
        if resp.status_code not in (200, 201):
            logger.error("Resend error %s: %s", resp.status_code, resp.text)


async def _send_via_smtp(to: str, subject: str, html: str) -> None:
    import smtplib
    import ssl
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = _FROM
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")

    ctx = ssl.create_default_context()
    with smtplib.SMTP(_SMTP_HOST, port) as server:
        server.ehlo()
        server.starttls(context=ctx)
        if user:
            server.login(user, password)
        server.sendmail(_FROM, [to], msg.as_string())


def _render_html(link: str, purpose: str) -> str:
    action = "Sign in to" if purpose == "login" else "Accept your invitation to"
    return f"""
<html><body style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
  <h2 style="color:#1a1a2e">Lanara</h2>
  <p>{action} Lanara by clicking the button below. This link expires in 15 minutes.</p>
  <a href="{link}"
     style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;
            border-radius:6px;text-decoration:none;font-weight:600">
    {action.split()[0]} Lanara
  </a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">
    If you did not request this link, you can safely ignore this email.
  </p>
</body></html>
"""
