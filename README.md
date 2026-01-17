## 💼 Hired.io — Modern Job Portal

**Hired.io** is a lean, full-stack job platform built with **FastAPI** and **MongoDB**. It is designed for speed and clarity, featuring role-based dashboards, automated email notifications via SMTP, and a professional UI with native dark mode support.

---

### 🚀 Key Features

* **Role-Based Dashboards**: Tailored interfaces for Candidates, Recruiters, and Admins.
* **Application Tracking**: Visual status timeline for candidates to track progress from "Applied" to "Selected".
* **Email Notifications**: Integrated SMTP system for sending application updates and welcome alerts.
* **Resume Management**: PDF upload and secure retrieval system for candidate profiles.
  
**Modern UX**: Responsive design system with theme toggling (Light/Dark) and skeleton loading states.



---

### 🛠️ Tech Stack

* **Frontend**: Vanilla JS, HTML5, CSS3 (Custom Design System).
* **Backend**: Python, FastAPI, Motor (Async MongoDB).
* **Database**: MongoDB.
* **Auth**: JWT (JSON Web Tokens).

---

### ⚙️ Installation & Setup

1. **Clone the repository** and navigate to the project folder.
2. **Setup Environment Variables**: Create a `.env` file in the backend directory with the following:
```env
MONGO_URI=mongodb://localhost:27017/jobportal
JWT_SECRET=your_secret_key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

```


3. **Install Dependencies**:
```bash
pip install fastapi uvicorn motor python-dotenv

```


4. **Run the Application**:
```bash
python app.py

```


