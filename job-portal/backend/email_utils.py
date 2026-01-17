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
        print(f"Welcome email sent to {email}")
    except Exception as e:
        print(f"Failed to send email to {email}: {e}")
