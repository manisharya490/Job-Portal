from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    Request,
    Body,
    BackgroundTasks,
)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from bson import ObjectId
from datetime import datetime
import os
import shutil
import uuid

from auth import hash_password, verify_password, create_access_token, decode_token
from models import JobCreate
from email_utils import send_welcome_email

router = APIRouter()
security = HTTPBearer()

# ---------- Helpers ----------

def get_db(request: Request):
    return request.app.state.db


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Static admin user – not stored in DB
    if payload.get("sub") == "admin-static-id":
        return {
            "_id": "admin-static-id",
            "name": "Platform Admin",
            "username": "admin",
            "role": "admin",
            "email": None,
        }

    db = get_db(request)
    try:
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ---------- AUTH ----------

@router.post("/auth/register")
async def register(
    request: Request,
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    role: str = Form(...),
    resume: UploadFile | None = File(None),
):
    if role == "admin":
        raise HTTPException(status_code=400, detail="Admin account is managed by the system")

    db = get_db(request)

    existing_username = await db.users.find_one({"username": username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")

    existing_email = await db.users.find_one({"email": email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already in use")

    resume_path = None
    if resume and role == "candidate":
        os.makedirs("uploads/resumes", exist_ok=True)
        filename = f"{uuid.uuid4()}_{resume.filename}"
        resume_path = f"uploads/resumes/{filename}"
        with open(resume_path, "wb") as buffer:
            shutil.copyfileobj(resume.file, buffer)

    user_doc = {
        "name": name,
        "username": username,
        "email": email,
        "password": hash_password(password),
        "role": role,
        "resume": resume_path,
        "created_at": datetime.utcnow(),
    }

    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    # Send welcome email in background
    background_tasks.add_task(send_welcome_email, email, name)

    token = create_access_token({"sub": user_id, "role": role})
    return {
        "token": token,
        "user": {
            "id": user_id,
            "name": name,
            "username": username,
            "role": role,
        },
    }


@router.post("/auth/login")
async def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    db = get_db(request)

    # Hardcoded single admin
    if username == "admin" and password == "logadmin":
        token = create_access_token({"sub": "admin-static-id", "role": "admin"})
        return {
            "token": token,
            "user": {
                "id": "admin-static-id",
                "name": "Platform Admin",
                "username": "admin",
                "role": "admin",
            },
        }

    user = await db.users.find_one({"username": username})
    if not user or not verify_password(password, user["password"]):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    token = create_access_token({ "sub": str(user["_id"]), "role": user["role"] })
    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "username": user["username"],
            "role": user["role"],
        },
    }

# ---------- ADMIN ----------

@router.get("/admin/summary")
async def admin_summary(request: Request, current=Depends(get_current_user)):
    if current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_db(request)
    recruiters = await db.users.count_documents({"role": "recruiter"})
    candidates = await db.users.count_documents({"role": "candidate"})
    jobs = await db.jobs.count_documents({})
    apps = await db.applications.count_documents({})
    return {
        "recruiters": recruiters,
        "candidates": candidates,
        "jobs": jobs,
        "applications": apps,
    }


@router.get("/admin/users")
async def admin_users(request: Request, current=Depends(get_current_user)):
    if current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_db(request)

    recruiters = []
    async for u in db.users.find({"role": "recruiter"}).sort("created_at", -1).limit(20):
        recruiters.append(
            {
                "id": str(u["_id"]),
                "name": u["name"],
                "email": u["email"],
                "created_at": u["created_at"],
            }
        )

    candidates = []
    async for u in db.users.find({"role": "candidate"}).sort("created_at", -1).limit(20):
        candidates.append(
            {
                "id": str(u["_id"]),
                "name": u["name"],
                "email": u["email"],
                "created_at": u["created_at"],
            }
        )

    return {"recruiters": recruiters, "candidates": candidates}

# ---------- JOBS ----------

@router.get("/jobs")
async def get_jobs(request: Request):
    db = get_db(request)
    jobs = []
    async for j in db.jobs.find().sort("created_at", -1).limit(50):
        jobs.append(
            {
                "id": str(j["_id"]),
                "title": j["title"],
                "description": j["description"],
                "company": j.get("company", "Confidential"),
                "location": j.get("location", "Remote"),
                "type": j.get("type", "full-time"),
            }
        )
    return jobs


@router.post("/jobs")
async def create_job(
    request: Request,
    job: JobCreate,
    current=Depends(get_current_user),
):
    if current["role"] != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")

    db = get_db(request)
    job_doc = {
        **job.dict(),
        "recruiter": current["_id"],
        "created_at": datetime.utcnow(),
    }

    result = await db.jobs.insert_one(job_doc)
    return {"id": str(result.inserted_id), **job_doc}


@router.post("/jobs/{job_id}/apply")
async def apply_to_job(
    job_id: str,
    request: Request,
    current=Depends(get_current_user),
):
    if current["role"] != "candidate":
        raise HTTPException(status_code=403, detail="Candidate access required")

    db = get_db(request)
    try:
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception:
        job = None

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = await db.applications.find_one(
        {"job": ObjectId(job_id), "candidate": current["_id"]}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already applied")

    app_doc = {
        "job": ObjectId(job_id),
        "candidate": current["_id"],
        "resume": current.get("resume"),
        "status": "pending",
        "message": None,
        "applied_at": datetime.utcnow(),
    }
    await db.applications.insert_one(app_doc)
    return {"message": "Application submitted"}

# ---------- RECRUITER APPLICATIONS ----------

@router.get("/recruiter/applications")
async def recruiter_applications(request: Request, current=Depends(get_current_user)):
    if current["role"] != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")

    db = get_db(request)
    job_ids = [j["_id"] async for j in db.jobs.find({"recruiter": current["_id"]}, {"_id": 1})]

    applications = []
    async for app in db.applications.find({"job": {"$in": job_ids}}).sort(
        "applied_at", -1
    ).limit(50):
        job = await db.jobs.find_one({"_id": app["job"]})
        cand = await db.users.find_one({"_id": app["candidate"]})
        applications.append(
            {
                "id": str(app["_id"]),
                "job_title": job["title"] if job else "Unknown",
                "candidate_name": cand["name"] if cand else "Unknown",
                "resume": cand.get("resume") if cand else None,
                "applied_at": app["applied_at"],
                "status": app.get("status", "pending"),
                "message": app.get("message"),
            }
        )
    return applications

# ---------- NEW: RESUME SERVING ENDPOINT ----------
@router.get("/resumes/{resume_filename}")
async def serve_resume(resume_filename: str):
    """Serve resume files securely"""
    resume_path = f"uploads/resumes/{resume_filename}"
    if not os.path.exists(resume_path):
        raise HTTPException(status_code=404, detail="Resume not found")
    
    return FileResponse(
        resume_path,
        media_type="application/pdf",
        filename=resume_filename
    )

# ---------- UPDATE APPLICATION STATUS/MESSAGE ----------

@router.patch("/applications/{app_id}/status")
async def update_application_status(
    app_id: str,
    request: Request,
    payload: dict = Body(...),
    current=Depends(get_current_user),
):
    if current["role"] != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")

    db = get_db(request)

    try:
        app = await db.applications.find_one({"_id": ObjectId(app_id)})
    except Exception:
        app = None

    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    job = await db.jobs.find_one({"_id": app["job"]})
    if not job or job.get("recruiter") != current["_id"]:
        raise HTTPException(status_code=403, detail="Not allowed for this application")

    new_status = payload.get("status")
    message = payload.get("message")

    if new_status not in ("pending", "selected", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")

    update_doc = {"status": new_status}
    if message is not None:
        update_doc["message"] = message

    await db.applications.update_one(
        {"_id": app["_id"]},
        {"$set": update_doc},
    )

    return {"message": "Application updated"}

# ---------- CANDIDATE APPLICATIONS ----------

@router.get("/candidate/applications")
async def candidate_applications(request: Request, current=Depends(get_current_user)):
    if current["role"] != "candidate":
        raise HTTPException(status_code=403, detail="Candidate access required")

    db = get_db(request)

    applications = []
    async for app in db.applications.find({"candidate": current["_id"]}).sort(
        "applied_at", -1
    ).limit(50):
        job = await db.jobs.find_one({"_id": app["job"]})
        applications.append(
            {
                "id": str(app["_id"]),
                "job_title": job["title"] if job else "Unknown",
                "company": job.get("company", "Confidential") if job else "Unknown",
                "location": job.get("location", "Remote") if job else "Remote",
                "status": app.get("status", "pending"),
                "message": app.get("message"),
                "applied_at": app["applied_at"],
            }
        )
    return applications

# ---------- ADMIN APPLICATIONS ----------

@router.get("/admin/applications")
async def admin_applications(request: Request, current=Depends(get_current_user)):
    if current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_db(request)

    applications = []
    async for app in db.applications.find({}).sort("applied_at", -1).limit(100):
        job = await db.jobs.find_one({"_id": app["job"]})
        cand = await db.users.find_one({"_id": app["candidate"]})
        recruiter = await db.users.find_one({"_id": job["recruiter"]}) if job else None

        applications.append(
            {
                "id": str(app["_id"]),
                "job_title": job["title"] if job else "Unknown",
                "company": job.get("company", "Confidential") if job else "Unknown",
                "candidate_name": cand["name"] if cand else "Unknown",
                "candidate_email": cand.get("email") if cand else None,
                "recruiter_name": recruiter["name"] if recruiter else "Unknown",
                "status": app.get("status", "pending"),
                "message": app.get("message"),
                "applied_at": app["applied_at"],
            }
        )
    return applications
