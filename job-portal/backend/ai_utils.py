import re
import math
from collections import Counter

def preprocess(text):
    """Simple text preprocessing: lowercase, remove special chars."""
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s]', '', text)
    return text

def get_keywords(text):
    """Extract unique words as keywords (simplified)."""
    words = preprocess(text).split()
    # In a real app, remove stopwords here (the, a, and, etc.)
    stopwords = {"and", "the", "to", "of", "a", "in", "for", "with", "on", "as", "is", "required"}
    return [w for w in words if w not in stopwords]

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

def extract_text_from_pdf(file_path):
    """Extract text from a PDF file."""
    if not PdfReader:
        return ""
    try:
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return text
    except Exception as e:
        print(f"Error reading PDF {file_path}: {e}")
        return ""

def calculate_match_score(job_description, candidate_text):
    """
    Calculate a similarity score (0-100) between job description and resume text.
    Uses Jaccard Similarity on keywords.
    """
    job_keywords = set(get_keywords(job_description))
    resume_keywords = set(get_keywords(candidate_text))
    
    if not job_keywords:
        return 0
    
    # Calculate intersection and union
    intersection = job_keywords.intersection(resume_keywords)
    union = job_keywords.union(resume_keywords)
    
    if not union:
        return 0
        
    jaccard_index = len(intersection) / len(union)
    
    # Scale to 0-100, but boost it a bit because Jaccard is usually low for long texts
    score = min(int(jaccard_index * 500), 100) # heuristic scaling
    
    return score
