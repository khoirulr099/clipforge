from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_clips():
    # Extend this to fetch from Supabase DB if you persist jobs
    return {"message": "Connect to your database to list saved clips"}
