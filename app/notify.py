"""
Sending login codes by email and SMS.

  Email  any SMTP server (for example Brevo's free plan or a Gmail app
         password). Settings: SMTP_HOST, SMTP_PORT (default 587), SMTP_USER,
         SMTP_PASSWORD, SMTP_FROM.
  SMS    Africa's Talking. Settings: AT_USERNAME, AT_API_KEY and, if Africa's
         Talking has approved one, AT_SENDER_ID. AT_USERNAME=sandbox uses the
         free test sandbox (messages appear in the simulator, not on phones).

Settings come from the environment (Render, Environment); never put them in
the code or in git. Only the standard library is used: no extra packages.
"""

import json
import os
import smtplib
import ssl
import urllib.parse
import urllib.request
from email.message import EmailMessage


def _env(name, default=""):
    return os.environ.get(name, default).strip()


def email_ready():
    return bool(_env("SMTP_HOST") and _env("SMTP_FROM"))


def sms_ready():
    return bool(_env("AT_USERNAME") and _env("AT_API_KEY"))


def send_email(to, subject, body):
    message = EmailMessage()
    message["From"] = _env("SMTP_FROM")
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(_env("SMTP_HOST"), int(_env("SMTP_PORT", "587")), timeout=15) as server:
        server.starttls(context=ssl.create_default_context())

        if _env("SMTP_USER"):
            server.login(_env("SMTP_USER"), _env("SMTP_PASSWORD"))

        server.send_message(message)


def send_sms(to, text):
    """to is an international number, e.g. +254712345678."""
    username = _env("AT_USERNAME")
    host = "api.sandbox.africastalking.com" if username == "sandbox" else "api.africastalking.com"
    fields = {"username": username, "to": to, "message": text}

    if _env("AT_SENDER_ID"):
        fields["from"] = _env("AT_SENDER_ID")

    request = urllib.request.Request(
        f"https://{host}/version1/messaging",
        data=urllib.parse.urlencode(fields).encode(),
        headers={"apiKey": _env("AT_API_KEY"), "Accept": "application/json",
                 "Content-Type": "application/x-www-form-urlencoded"},
    )

    with urllib.request.urlopen(request, timeout=15) as response:
        result = json.load(response)

    recipients = result.get("SMSMessageData", {}).get("Recipients", [])

    if not recipients or recipients[0].get("status") != "Success":
        raise RuntimeError(f"Africa's Talking did not accept the message: {result.get('SMSMessageData', {}).get('Message', 'no details')}")
