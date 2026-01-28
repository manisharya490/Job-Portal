from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from pydantic import EmailStr, BaseModel
from dotenv import load_dotenv
import os

load_dotenv()

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("SMTP_USER"),
    MAIL_PASSWORD=os.getenv("SMTP_PASS"),
    MAIL_FROM=os.getenv("SMTP_FROM"),
    MAIL_PORT=int(os.getenv("SMTP_PORT", 587)),
    MAIL_SERVER=os.getenv("SMTP_HOST", "smtp.gmail.com"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

html_template = """
<!DOCTYPE html>
<html>
<body>
  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; font-family: Arial, sans-serif;">
    <h2 style="color: #3b82f6; text-align: center;">Welcome to Hired.io!</h2>
    <div style="font-size: 16px; color: #333; line-height: 1.6;">
      <p>Hi <strong>{username}</strong>,</p>
      <p>We are thrilled to have you on board! Your account has been successfully created.</p>
      <p>Whether you are here to find your dream job or hire top talent, we are here to support you every step of the way.</p>
      <p style="text-align: center; margin-top: 20px;">
        <a href="http://localhost:8000" style="display: inline-block; background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
      </p>
    </div>
    <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #888;">
      <p>&copy; 2024 Hired.io. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
"""

alert_template = """
<!DOCTYPE html>
<html>
<body>
  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; font-family: Arial, sans-serif;">
    <h2 style="color: #3b82f6; text-align: center;">New Job Alert!</h2>
    <div style="font-size: 16px; color: #333; line-height: 1.6;">
      <p>Hi there,</p>
      <p>A new job matching your interest <strong>"{keyword}"</strong> has just been posted:</p>
      <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #bae6fd;">
        <h3 style="margin: 0; color: #0284c7;">{title}</h3>
        <p style="margin: 5px 0 0; color: #555;">{company} &bull; {location}</p>
      </div>
      <p style="text-align: center; margin-top: 20px;">
        <a href="http://localhost:8000/jobs.html" style="display: inline-block; background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Job</a>
      </p>
    </div>
  </div>
</body>
</html>
"""

async def send_welcome_email(email: str, username: str):
    message = MessageSchema(
        subject="Welcome to Hired.io!",
        recipients=[email],
        body=html_template.format(username=username),
        subtype="html"
    )

    fm = FastMail(conf)
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send welcome email: {e}")

async def send_job_alert(email: str, keyword: str, job_title: str, company: str, location: str):
    message = MessageSchema(
        subject=f"New Job Alert: {job_title}",
        recipients=[email],
        body=alert_template.format(keyword=keyword, title=job_title, company=company, location=location),
        subtype="html"
    )

    fm = FastMail(conf)
    try:
        await fm.send_message(message)
        print(f"Job alert sent to {email}")
    except Exception as e:
        print(f"Failed to send alert to {email}: {e}")
