from __future__ import annotations
import logging
import os
import httpx

logger = logging.getLogger(__name__)

# Env-var fallbacks — used when no DB session is available or no DB value is set.
_FROM = os.getenv("EMAIL_FROM", "noreply@lanara.app")
_RESEND_KEY = os.getenv("RESEND_API_KEY")
_SMTP_HOST = os.getenv("SMTP_HOST")


async def send_magic_link(
    to_email: str,
    link: str,
    purpose: str = "login",
    db=None,
) -> None:
    resend_key, email_from = await _load_email_config(db)
    subject = "Your Lanara sign-in link" if purpose == "login" else "You've been invited to Lanara"
    html = _render_html(link, purpose)

    if resend_key:
        await _send_via_resend(to_email, subject, html, resend_key, email_from)
    elif _SMTP_HOST:
        await _send_via_smtp(to_email, subject, html, email_from)
    else:
        logger.warning("No email provider configured — magic link: %s → %s", to_email, link)


async def _load_email_config(db) -> tuple[str | None, str]:
    """Return (resend_api_key, from_address) reading DB first, env as fallback."""
    if db is None:
        return _RESEND_KEY, _FROM
    from app.core.settings_service import get_setting_any_org
    resend_key = await get_setting_any_org(db, "resend_api_key") or _RESEND_KEY
    email_from = await get_setting_any_org(db, "email_from") or _FROM
    return resend_key, email_from


async def _send_via_resend(to: str, subject: str, html: str, api_key: str, from_addr: str) -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"from": from_addr, "to": [to], "subject": subject, "html": html},
        )
        if resp.status_code not in (200, 201):
            logger.error("Resend error %s: %s", resp.status_code, resp.text)
            raise RuntimeError(f"Email delivery failed ({resp.status_code})")


async def _send_via_smtp(to: str, subject: str, html: str, from_addr: str) -> None:
    import smtplib
    import ssl
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
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
        server.sendmail(from_addr, [to], msg.as_string())


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
