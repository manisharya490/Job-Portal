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
    WebSocket, 
    WebSocketDisconnect,
)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from bson import ObjectId
from datetime import datetime
import os
import shutil
import uuid

from auth import hash_password, verify_password, create_access_token, decode_token
from models import JobCreate, AlertCreate
from email_utils import send_welcome_email, send_job_alert
from chat_utils import manager
from ai_utils import calculate_match_score, extract_text_from_pdf

router = APIRouter()
security = HTTPBearer()

# Background Task
async def check_alerts(job_doc: dict, db):
    """Check for matching alerts and send emails"""
    # Simple logic: Find alerts where keyword is in job title
    # For a real system, use regex or text search index
    
    # We find all alerts and filter in python for flexibility
    async for alert in db.alerts.find():
        keyword = alert["keyword"].lower()
        if keyword in job_doc["title"].lower() or keyword in job_doc["description"].lower():
            # Trigger email
            try:
                await send_job_alert(
                    alert["email"], 
                    keyword, 
                    job_doc["title"], 
                    job_doc.get("company", "Confidential"), 
                    job_doc.get("location", "Remote")
                )
            except Exception as e:
                print(f"Error checking alert: {e}")

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
    # Validating role
    if role not in ["candidate", "recruiter", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")

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
    pending_jobs = await db.jobs.count_documents({"status": "pending"})
    apps = await db.applications.count_documents({})
    return {
        "recruiters": recruiters,
        "candidates": candidates,
        "jobs": jobs,
        "pending_jobs": pending_jobs,
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


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request, current=Depends(get_current_user)):
    if current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_db(request)
    
    try:
        uid = ObjectId(user_id)
    except:
         raise HTTPException(status_code=400, detail="Invalid ID")
         
    user = await db.users.find_one({"_id": uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # CASCADE DELETE LOGIC
    if user["role"] == "candidate":
        # Delete all applications made by candidate
        await db.applications.delete_many({"candidate": uid})
        
    elif user["role"] == "recruiter":
        # 1. Find all jobs by recruiter
        params = {"recruiter": uid}
        # Get IDs to delete related applications
        job_ids = [j["_id"] async for j in db.jobs.find(params, {"_id": 1})]
        
        if job_ids:
            # 2. Delete all applications for those jobs
            await db.applications.delete_many({"job": {"$in": job_ids}})
            # 3. Delete the jobs
            await db.jobs.delete_many({"recruiter": uid})

    # Finally delete the user
    await db.users.delete_one({"_id": uid})
    
    return {"message": f"User {user['name']} deleted successfully (Cascade)"}


@router.get("/admin/jobs")
async def admin_get_jobs(
    request: Request, 
    status: str = "pending",
    current=Depends(get_current_user)
):
    if current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_db(request)
    query = {}
    if status and status != "all":
        query["status"] = status
        
    jobs = []
    async for j in db.jobs.find(query).sort("created_at", -1):
        recruiter = await db.users.find_one({"_id": j["recruiter"]})
        jobs.append({
            "id": str(j["_id"]),
            "title": j["title"],
            "company": j.get("company", "Confidential"),
            "recruiter_name": recruiter["name"] if recruiter else "Unknown",
            "created_at": j["created_at"],
            "status": j.get("status", "pending")
        })
        
    return jobs


@router.patch("/admin/jobs/{job_id}/status")
async def admin_update_job_status(
    job_id: str,
    request: Request,
    payload: dict = Body(...),
    current=Depends(get_current_user)
):
    if current["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
        
    new_status = payload.get("status")
    if new_status not in ["approved", "rejected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    db = get_db(request)
    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"status": new_status}}
    )
    
    return {"message": f"Job {new_status}"}

# ---------- JOBS ----------

@router.get("/jobs")
async def get_jobs(
    request: Request,
    keyword: str = None,
    location: str = None,
    type: str = None,
):
    db = get_db(request)
    # Default to only showing approved jobs
    query = {"status": "approved"}
    
    if keyword:
        query["$or"] = [
            {"title": {"$regex": keyword, "$options": "i"}},
            {"company": {"$regex": keyword, "$options": "i"}},
            {"description": {"$regex": keyword, "$options": "i"}},
        ]
    
    if location:
        query["location"] = {"$regex": location, "$options": "i"}
        
    if type and type != "all":
        query["type"] = type

    jobs = []
    async for j in db.jobs.find(query).sort("created_at", -1).limit(50):
        jobs.append(
            {
                "id": str(j["_id"]),
                "title": j["title"],
                "description": j["description"],
                "company": j.get("company", "Confidential"),
                "location": j.get("location", "Remote"),
                "type": j.get("type", "full-time"),
                "status": j.get("status", "pending"),
                "created_at": j.get("created_at"),
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
        **job.model_dump(),
        "status": "pending", # Force pending status
        "recruiter": current["_id"],
        "created_at": datetime.utcnow(),
    }

    result = await db.jobs.insert_one(job_doc)
    
    # Trigger alerts
    # We pass 'db' which might be closed if request ends? 
    # Actually BackgroundTasks runs after response, but 'db' from request.app.state.db persists as long as app is running.
    # To be safe, we just await it here or pass necessary info.
    # Since send_job_alert is async, let's just await it in background or fire-and-forget.
    # Better: use background_tasks
    # background_tasks.add_task(check_alerts, job_doc, db) 
    # NOTE: passing 'db' object to background task is risky if connection is request-scoped (it is not here).
    # We'll just run it inline for simplicity or wrap it.
    
    # Running inline for this demo to ensure it works immediately
    await check_alerts(job_doc, db)

    # Convert ObjectId to string for response serialization
    job_doc["recruiter"] = str(job_doc["recruiter"])
    
    # Remove _id added by mongodb insert_one, since we return it as 'id'
    job_doc.pop("_id", None)

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

@router.post("/jobs/{job_id}/view")
async def view_job(job_id: str, request: Request):
    db = get_db(request)
    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$inc": {"views": 1}}
    )
    return {"status": "viewed"}


@router.get("/recruiter/analytics")
async def recruiter_analytics(request: Request, current=Depends(get_current_user)):
    if current["role"] != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")

    db = get_db(request)
    
    analytics = []
    async for job in db.jobs.find({"recruiter": current["_id"]}):
        app_count = await db.applications.count_documents({"job": job["_id"]})
        analytics.append({
            "title": job["title"],
            "views": job.get("views", 0),
            "applications": app_count
        })
    
    return analytics

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
        
        # Skip if candidate is deleted (orphaned application)
        if not cand:
            continue
        
        # Calculate Match Score
        score = 0
        if job and cand:
            # Get job description
            job_desc = f"{job['title']} {job['description']} {job.get('company','')}"
            
            # Get candidate text (resume or fallback)
            cand_text = ""
            if cand.get("resume") and os.path.exists(cand.get("resume")):
                # Try reading PDF
                cand_text = extract_text_from_pdf(cand["resume"])
            
            # If no text extracted (or no resume), fallback to name/role/email or nothing
            if not cand_text:
                cand_text = f"{cand['name']} {cand.get('role','')} {cand.get('username','')}"
            
            score = calculate_match_score(job_desc, cand_text)

        applications.append(
            {
                "id": str(app["_id"]),
                "job_title": job["title"] if job else "Unknown",
                "candidate_name": cand["name"] if cand else "Unknown",
                "resume": cand.get("resume") if cand else None,
                "applied_at": app["applied_at"],
                "status": app.get("status", "pending"),
                "message": app.get("message"),
                "match_score": score
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

# ---------- ALERTS ----------

@router.post("/alerts")
async def create_alert(
    request: Request,
    alert: AlertCreate,
    current=Depends(get_current_user), # Optional: allow logged out users too?
    # Let's assume users must be logged in for now, OR valid email provided.
):
    db = get_db(request)
    
    email = alert.email
    if not email:
        # Fallback to current user email
        if current and current.get("email"):
            email = current["email"]
        else:
            raise HTTPException(status_code=400, detail="Email required")

    alert_doc = {
        "user_id": current["_id"] if current else None,
        "email": email,
        "keyword": alert.keyword,
        "created_at": datetime.utcnow()
    }
    
    await db.alerts.insert_one(alert_doc)
    return {"message": f"Alert set for '{alert.keyword}'"}

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
